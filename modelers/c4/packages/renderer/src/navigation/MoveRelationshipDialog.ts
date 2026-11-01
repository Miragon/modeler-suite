import {
  childElements,
  endsWithChildren,
  hiddenScopeRelationships,
  type ElementId,
  type ModelElement,
  type RelationshipEnd,
  type Workspace,
} from "@miragon/c4-schema-model";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Element } from "diagram-js/lib/model/Types";
import type { EditOutcome } from "@miragon/c4-dsl";
import { editAtField } from "../label-editing/fieldRefusal.js";
import { relationshipCanvasId } from "../reconcile/Reconciler.js";
import { elementById, eventBusOf, isLocked, membersOf, serviceOf, workspaceOf } from "./access.js";
import { focusCanvas, openModelerDialog } from "./dialog.js";
import { button, node, uniqueId } from "./dom.js";
import { reveal, select } from "./reveal.js";
import type { C4DialogModeler, DialogTarget, OpenedDialog } from "./types.js";

export const MOVE_TO_CONTAINER_TITLE = "Move to a container";
export const MOVE_TO_COMPONENT_TITLE = "Move to a component";
export const ASSIGN_LABEL = "Assign";

const GENERIC_REFUSAL = "Couldn't write this change into the DSL. Edit the text instead.";

/** What the children of an element are called, by the element's kind. */
function childWord(element: ModelElement | undefined): "container" | "component" {
  return element?.kind === "container" ? "component" : "container";
}

/** "Move to a container…" (the inspector's entry) for a relationship drawn a level up. */
export function moveEntryLabel(workspace: Workspace, ends: readonly RelationshipEnd[]): string {
  const words = new Set(ends.map(({ elementId }) => childWord(elementById(workspace, elementId))));
  return words.has("component") && !words.has("container")
    ? `${MOVE_TO_COMPONENT_TITLE}…`
    : `${MOVE_TO_CONTAINER_TITLE}…`;
}

/**
 * Without `relationshipKey`, the relationships of the current view's scope that the view can't
 * draw (the chip's); with it, that relationship's ends a level up (the inspector's entry).
 */
export interface MoveRelationshipTarget extends DialogTarget {
  readonly relationshipKey?: string | undefined;
}

function rowsOf(target: MoveRelationshipTarget): RelationshipEnd[] {
  const { modeler, relationshipKey } = target;
  const workspace = workspaceOf(modeler);
  const view = modeler.views.active();
  if (relationshipKey === undefined) {
    return hiddenScopeRelationships(workspace, view, membersOf(modeler, view));
  }
  const relationship = workspace.relationships.find(
    (candidate) => candidate.canvasKey === relationshipKey,
  );
  return relationship ? endsWithChildren(workspace, relationship, view) : [];
}

function namesOf(workspace: Workspace, ids: readonly ElementId[]): string {
  const names = ids.map((id) => elementById(workspace, id)?.name ?? id);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join("");
}

/** Why the relationships don't show a level down and what Assign does, in one or two sentences. */
function introText(
  workspace: Workspace,
  rows: readonly RelationshipEnd[],
  scoped: boolean,
): string {
  const scopes = [...new Set(rows.map(({ elementId }) => elementId))];
  const word = childWord(elementById(workspace, scopes[0] ?? ""));
  const names = namesOf(workspace, scopes);
  if (scoped) {
    return rows.length === 1
      ? `This relationship connects to ${names} itself, so this view can't tell which ${word} makes or takes the call. Assign it to a ${word} to show it here.`
      : `These relationships connect to ${names} itself, so this view can't tell which ${word} makes or takes the call. Assign each one to a ${word} to show it here.`;
  }
  return scopes.length === 1
    ? `This relationship connects to ${names} itself, so ${names}'s ${word} view can't tell which ${word} makes or takes the call and leaves it out. Assign it to a ${word} to show it there.`
    : `This relationship connects to ${names} themselves, so their ${word} views can't tell which ${word} makes or takes the call and leave it out. Assign an end to a ${word} to show it there.`;
}

function rowKey({ relationship, end }: RelationshipEnd): string {
  return `${relationship.canvasKey} ${end}`;
}

interface FocusedControl {
  readonly row: string | undefined;
  readonly control: string | undefined;
}

function focusIn(body: HTMLElement): FocusedControl | undefined {
  const active = body.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement) || !body.contains(active)) return undefined;
  return {
    row: active.closest<HTMLElement>("fieldset.c4-move-row")?.dataset.row,
    control: active.dataset.control,
  };
}

function sameControl(content: HTMLElement, focused: FocusedControl): HTMLElement | undefined {
  if (focused.control === undefined) return undefined;
  const scope =
    focused.row === undefined
      ? content
      : [...content.querySelectorAll<HTMLElement>("fieldset.c4-move-row")].find(
          (fieldset) => fieldset.dataset.row === focused.row,
        );
  return (
    [...(scope?.querySelectorAll<HTMLElement>("[data-control]") ?? [])].find(
      (control) => control.dataset.control === focused.control,
    ) ?? undefined
  );
}

/** The canvas key a relationship has after an edit, following the outcome's renames. */
function keyAfter(outcome: Extract<EditOutcome, { ok: true }>, key: string): string {
  let current = key;
  for (const change of outcome.idChanges) {
    if (change.kind === "relationship" && change.from === current) current = change.to;
  }
  return current;
}

interface RowContext {
  readonly target: MoveRelationshipTarget;
  readonly dialog: OpenedDialog;
  readonly workspace: Workspace;
  readonly locked: boolean;
  /** The child chosen per row, kept across redraws. */
  readonly chosen: Map<string, ElementId>;
}

interface DrawnRow {
  readonly root: HTMLElement;
  readonly focusable: HTMLElement;
}

/**
 * The dialog of the hidden relationships' chip and of "Move to a container…" (SPEC 4.1): why a
 * relationship on a software system (or a container) itself does not show a level down, and per
 * relationship a choice of the child its end moves to. Assign is one command; the dialog then
 * closes and the canvas selects what the view draws of the moved relationship and reveals it with
 * the other end. It follows the document while open and keeps the choices made.
 */
export function showMoveRelationshipDialog(target: MoveRelationshipTarget): OpenedDialog {
  const { modeler } = target;
  const scoped = target.relationshipKey === undefined;
  const firstEnd = rowsOf(target)[0]?.elementId ?? modeler.views.active().scopeId ?? "";
  const title =
    childWord(elementById(workspaceOf(modeler), firstEnd)) === "component"
      ? MOVE_TO_COMPONENT_TITLE
      : MOVE_TO_CONTAINER_TITLE;
  const chosen = new Map<string, ElementId>();
  return openModelerDialog(target, {
    title,
    className: "c4-move-relationship-dialog",
    follows: true,
    render: (body, dialog) => {
      const owner = body.ownerDocument;
      const focused = focusIn(body);
      const workspace = workspaceOf(modeler);
      const rows = rowsOf(target);
      const context: RowContext = { target, dialog, workspace, locked: isLocked(modeler), chosen };
      const content = node(owner, "div", "c4-dialog");
      const intro =
        rows.length === 0
          ? scoped
            ? "This view shows every relationship of its scope now."
            : "This relationship has no end left to move to a container or component."
          : introText(workspace, rows, scoped);
      content.append(node(owner, "p", "c4-dialog-text", intro));
      const drawn = rows.map((row) => rowView(owner, context, row));
      if (drawn.length > 0) {
        content.append(node(owner, "div", "c4-move-rows", ...drawn.map(({ root }) => root)));
      }
      const done = button(owner, "Done", "secondary", () => dialog.close());
      done.dataset.control = "done";
      content.append(node(owner, "div", "c4-dialog-footer", done));
      body.replaceChildren(content);
      const firstStop = drawn[0]?.focusable ?? done;
      firstStop.autofocus = true;
      // A redraw replaces the focused control: the same one of the same row takes the focus.
      if (focused !== undefined) (sameControl(content, focused) ?? firstStop).focus();
    },
  });
}

/** One relationship end: its ends and values, the child to move it to, and Assign. */
function rowView(owner: Document, context: RowContext, row: RelationshipEnd): DrawnRow {
  const { workspace, locked } = context;
  const { relationship, elementId } = row;
  const name = (id: ElementId) => elementById(workspace, id)?.name ?? id;
  const fieldset = node(owner, "fieldset", "c4-move-row");
  fieldset.disabled = locked;
  fieldset.dataset.row = rowKey(row);
  const details = [
    relationship.description === "" ? "No description" : relationship.description,
    ...(relationship.technology === "" ? [] : [`[${relationship.technology}]`]),
  ].join(" ");
  fieldset.append(
    node(
      owner,
      "legend",
      "c4-move-title",
      `${name(relationship.sourceId)} → ${name(relationship.destinationId)}`,
    ),
    node(owner, "p", "c4-dialog-note c4-move-details", details),
  );
  const children = childElements(workspace, elementId);
  const word = childWord(elementById(workspace, elementId));
  const controls = node(owner, "div", "c4-move-controls");
  fieldset.append(controls);
  const assign = button(owner, ASSIGN_LABEL, "secondary", () => undefined);
  assign.dataset.control = "assign";
  if (children.length === 0) {
    const where =
      context.target.modeler.views.active().scopeId === elementId ? "" : ` in its ${word} view`;
    const note = `${name(elementId)} has no ${word}s yet. Add one from the palette${where} first.`;
    assign.disabled = true;
    controls.append(node(owner, "p", "c4-field-note", note), assign);
    return { root: fieldset, focusable: assign };
  }
  const select = node(owner, "select", "c4-field-control");
  select.dataset.control = "child";
  for (const child of children) {
    const option = node(owner, "option", "", child.name);
    option.value = child.id;
    select.append(option);
  }
  const remembered = context.chosen.get(rowKey(row));
  if (remembered !== undefined && children.some((child) => child.id === remembered)) {
    select.value = remembered;
  }
  const label = `${word === "component" ? "Component" : "Container"} of ${name(elementId)}`;
  controls.append(
    node(owner, "label", "c4-field", node(owner, "span", "c4-field-label", label), select),
    assign,
  );
  const error = rowError(owner, fieldset, select);
  select.addEventListener("change", () => {
    context.chosen.set(rowKey(row), select.value);
    error.clear();
  });
  assign.addEventListener("click", () => {
    if (locked || select.value === "") return;
    error.clear();
    if (!assignEnd(context, row, select.value, error.show)) select.focus();
  });
  return { root: fieldset, focusable: select };
}

/** The guide's field error (§8) under a row: `aria-invalid` and a message the select names. */
function rowError(owner: Document, fieldset: HTMLElement, select: HTMLSelectElement) {
  let error: HTMLElement | undefined;
  return {
    clear(): void {
      error?.remove();
      error = undefined;
      select.removeAttribute("aria-invalid");
      select.removeAttribute("aria-describedby");
    },
    show(message: string): void {
      if (!error) {
        error = node(owner, "p", "c4-field-error");
        error.id = uniqueId("c4-move-error");
        error.setAttribute("role", "alert");
        fieldset.append(error);
      }
      error.textContent = message;
      select.setAttribute("aria-invalid", "true");
      select.setAttribute("aria-describedby", error.id);
    },
  };
}

/**
 * Selects the moved relationship as the view draws it (itself, else the implied one in its place),
 * so the inspector shows it and its fields stay a click away, and reveals it with the other end,
 * which the move may just have brought into the view. The selection first: it opens the inspector,
 * whose panel the area the reveal scrolls into then leaves out.
 */
function selectMoved(
  modeler: C4DialogModeler,
  outcome: Extract<EditOutcome, { ok: true }>,
  key: string,
  otherId: ElementId,
): void {
  const registry = serviceOf<ElementRegistry>(modeler, "elementRegistry");
  if (registry === undefined) return;
  const moved = keyAfter(outcome, key);
  const drawn = [
    moved,
    ...outcome.document.workspace.relationships
      .filter((candidate) => candidate.implied && candidate.impliedBy === moved)
      .map((candidate) => candidate.canvasKey),
  ].find((canvasKey) => registry.get(relationshipCanvasId(canvasKey)) !== undefined);
  const selected = select(modeler.diagram, [
    drawn === undefined ? otherId : relationshipCanvasId(drawn),
  ]);
  const other = registry.get(otherId) as Element | undefined;
  reveal(
    modeler.diagram,
    other === undefined || selected.includes(other) ? selected : [...selected, other],
  );
}

/**
 * Moves the row's end to `to` as one command; a refusal stays at the row. Then the dialog closes,
 * as a modal one locks the canvas, and the canvas selects the moved relationship and reveals it
 * with the other end.
 */
function assignEnd(
  context: RowContext,
  row: RelationshipEnd,
  to: ElementId,
  showError: (message: string) => void,
): boolean {
  const { target, dialog } = context;
  const { modeler } = target;
  const { relationship, end, otherId } = row;
  const { outcome, refusal } = editAtField(eventBusOf(modeler), () =>
    modeler.c4.moveRelationshipEnd(relationship.canvasKey, end, to),
  );
  if (refusal !== undefined || !outcome?.ok) {
    showError(refusal ?? GENERIC_REFUSAL);
    return false;
  }
  dialog.close();
  focusCanvas(target);
  selectMoved(modeler, outcome, relationship.canvasKey, otherId);
  return true;
}
