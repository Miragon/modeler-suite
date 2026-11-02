import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { EditOutcome } from "@miragon/c4-dsl";
import type { ElementId, ModelElement, Workspace } from "@miragon/c4-schema-model";
import { editAtField } from "../label-editing/fieldRefusal.js";
import { relationshipCanvasId } from "../reconcile/Reconciler.js";
import { elementById, eventBusOf, isLocked, membersOf, serviceOf, workspaceOf } from "./access.js";
import { focusCanvas, openModelerDialog } from "./dialog.js";
import { button, node, textField, uniqueId, valueRow } from "./dom.js";
import type { DialogTarget, OpenedDialog } from "./types.js";

export const ADD_RELATIONSHIP_TITLE = "Add relationship";

const GENERIC_REFUSAL = "Couldn't write this relationship into the DSL. Edit the text instead.";

function isAncestor(workspace: Workspace, ancestorId: ElementId, id: ElementId): boolean {
  for (
    let current = elementById(workspace, id)?.parentId;
    current !== undefined;
    current = elementById(workspace, current)?.parentId
  ) {
    if (current === ancestorId) return true;
  }
  return false;
}

/**
 * The elements of the current view a relationship from `sourceId` may go to, in document order:
 * never the source itself, and never its parent or child, which Structurizr refuses.
 */
export function relationshipDestinations(
  target: Pick<DialogTarget, "modeler">,
  sourceId: ElementId,
): ModelElement[] {
  const { modeler } = target;
  const workspace = workspaceOf(modeler);
  const members = new Set(membersOf(modeler, modeler.views.active()).elements);
  return workspace.elements.filter(
    (element) =>
      members.has(element.id) &&
      element.id !== sourceId &&
      !isAncestor(workspace, element.id, sourceId) &&
      !isAncestor(workspace, sourceId, element.id),
  );
}

function optionLabel(workspace: Workspace, element: ModelElement): string {
  const parent =
    element.parentId === undefined ? undefined : elementById(workspace, element.parentId);
  return parent ? `${element.name} (${parent.name})` : element.name;
}

/** A backslash or `${…}` is what the DSL can't store (`unrepresentable`), so the refusal is there. */
function looksUnrepresentable(value: string): boolean {
  return value.includes("\\") || value.includes("${");
}

/**
 * Where the relationship starts: `sourceId` fixes it (the inspector's element); without it the
 * dialog offers the view's elements, starting on `from`, and the destination starts on `to`
 * (the Model menu's entry, from the selection).
 */
export interface AddRelationshipTarget extends DialogTarget {
  readonly sourceId?: ElementId | undefined;
  readonly from?: ElementId | undefined;
  readonly to?: ElementId | undefined;
}

function elementOptions(
  owner: Document,
  workspace: Workspace,
  elements: readonly ModelElement[],
): HTMLOptionElement[] {
  return elements.map((element) => {
    const option = node(owner, "option", "", optionLabel(workspace, element));
    option.value = element.id;
    return option;
  });
}

interface SourceField {
  readonly root: HTMLElement;
  /** Absent where the source is fixed. */
  readonly select: HTMLSelectElement | undefined;
  readonly initial: ElementId | undefined;
}

/** The source as a value (`sourceId`), or a choice among the view's elements starting on `from`. */
function sourceField(owner: Document, target: AddRelationshipTarget): SourceField {
  const { modeler, sourceId, from } = target;
  const workspace = workspaceOf(modeler);
  if (sourceId !== undefined) {
    const name = elementById(workspace, sourceId)?.name ?? sourceId;
    return { root: valueRow(owner, "From", name), select: undefined, initial: sourceId };
  }
  const members = new Set(membersOf(modeler, modeler.views.active()).elements);
  const sources = workspace.elements.filter((element) => members.has(element.id));
  const initial = sources.some((element) => element.id === from) ? from : sources[0]?.id;
  const select = node(owner, "select", "c4-field-control");
  select.dataset.field = "source";
  select.autofocus = true;
  select.append(...elementOptions(owner, workspace, sources));
  if (initial !== undefined) select.value = initial;
  select.disabled = sources.length === 0;
  const root = node(owner, "label", "c4-field", node(owner, "span", "c4-field-label", "From"));
  root.append(select);
  return { root, select, initial };
}

/**
 * "Add relationship…" from the inspector or the Model menu: the keyboard's way to draw a
 * relationship. The destination is one of the view's other elements; the description and the
 * technology are written with it, as one command. The new relationship ends up selected.
 */
export function showAddRelationshipDialog(target: AddRelationshipTarget): OpenedDialog {
  const { modeler } = target;
  return openModelerDialog(target, {
    title: ADD_RELATIONSHIP_TITLE,
    className: "c4-add-relationship-dialog",
    render: (body, dialog) => {
      const owner = body.ownerDocument;
      const workspace = workspaceOf(modeler);
      const source = sourceField(owner, target);
      let sourceId = source.initial;
      const locked = isLocked(modeler);
      const form = node(owner, "form", "c4-dialog");
      const fields = node(owner, "fieldset", "c4-form");
      fields.disabled = locked;

      const destinationField = node(
        owner,
        "label",
        "c4-field",
        node(owner, "span", "c4-field-label", "To"),
      );
      const destination = node(owner, "select", "c4-field-control");
      destination.dataset.field = "destination";
      destination.autofocus = source.select === undefined;
      destinationField.append(destination);
      const noDestination = node(
        owner,
        "span",
        "c4-field-note",
        "No other element in this view to connect to.",
      );
      let destinationError: HTMLElement | undefined;
      const clearDestinationError = () => {
        destinationError?.remove();
        destinationError = undefined;
        destination.removeAttribute("aria-invalid");
        destination.removeAttribute("aria-describedby");
      };
      const showDestinationError = (message: string) => {
        if (!destinationError) {
          destinationError = node(owner, "span", "c4-field-error");
          destinationError.id = uniqueId("c4-field-error");
          destinationError.setAttribute("role", "alert");
          destinationField.append(destinationError);
        }
        destinationError.textContent = message;
        destination.setAttribute("aria-invalid", "true");
        destination.setAttribute("aria-describedby", destinationError.id);
      };
      destination.addEventListener("change", clearDestinationError);

      const description = textField(owner, {
        label: "Description",
        value: "",
        name: "description",
      });
      const technology = textField(owner, { label: "Technology", value: "", name: "technology" });
      for (const field of [description, technology]) {
        field.control.addEventListener("input", () => field.clearError());
      }
      fields.append(source.root, destinationField, description.root, technology.root);

      const cancel = button(owner, "Cancel", "secondary", () => dialog.close());
      const add = button(owner, ADD_RELATIONSHIP_TITLE, "primary", () => undefined);
      add.type = "submit";

      /** The destinations follow the source; a destination chosen before stays while it can. */
      const fillDestinations = (preferred: string | undefined) => {
        const destinations =
          sourceId === undefined ? [] : relationshipDestinations(target, sourceId);
        destination.replaceChildren(...elementOptions(owner, workspace, destinations));
        if (destinations.some((element) => element.id === preferred)) {
          destination.value = preferred ?? "";
        }
        destination.disabled = destinations.length === 0;
        if (destinations.length === 0) destinationField.append(noDestination);
        else noDestination.remove();
        add.disabled = locked || destinations.length === 0;
      };
      fillDestinations(target.to);
      source.select?.addEventListener("change", (event) => {
        sourceId = (event.currentTarget as HTMLSelectElement).value || undefined;
        clearDestinationError();
        fillDestinations(destination.value);
      });

      form.append(fields, node(owner, "div", "c4-dialog-footer", cancel, add));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const from = sourceId;
        if (add.disabled || from === undefined || destination.value === "") return;
        clearDestinationError();
        description.clearError();
        technology.clearError();
        const values = {
          description: description.control.value.trim(),
          technology: technology.control.value.trim(),
        };
        const { outcome, refusal } = editAtField(eventBusOf(modeler), () =>
          modeler.c4.createRelationship(from, destination.value, values),
        );
        if (refusal !== undefined || !outcome?.ok) {
          showRefusal(refusal ?? GENERIC_REFUSAL, outcome);
          return;
        }
        dialog.close();
        selectCreated(outcome.created.relationships[0]);
        focusCanvas(target);
      });

      function showRefusal(message: string, outcome: EditOutcome | undefined): void {
        const reason = outcome && !outcome.ok ? outcome.reason : undefined;
        if (reason === "relationship-exists") {
          description.showError(message);
          description.control.focus();
        } else if (reason === "unrepresentable-value") {
          const at =
            looksUnrepresentable(technology.control.value) &&
            !looksUnrepresentable(description.control.value)
              ? technology
              : description;
          at.showError(message);
          at.control.focus();
        } else {
          showDestinationError(message);
          destination.focus();
        }
      }

      body.replaceChildren(form);
    },
  });

  function selectCreated(key: string | undefined): void {
    if (key === undefined) return;
    const shape = modeler.diagram
      .get<ElementRegistry>("elementRegistry")
      .get(relationshipCanvasId(key));
    if (shape) serviceOf<Selection>(modeler, "selection")?.select(shape);
  }
}
