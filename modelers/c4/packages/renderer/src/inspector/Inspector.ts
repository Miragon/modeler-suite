import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import type { EditOutcome } from "@miragon/c4-dsl";
import type {
  ElementId,
  FieldName,
  ModelElement,
  Relationship,
  Workspace,
} from "@miragon/c4-schema-model";
import { padIcon } from "../context-pad/icons.js";
import { editAtField } from "../label-editing/fieldRefusal.js";
import {
  DOCUMENT_EVENTS,
  isLocked,
  kindWord,
  membersOf,
  parseOf,
  serviceOf,
} from "../navigation/access.js";
import type C4Dialogs from "../navigation/C4Dialogs.js";
import {
  button,
  destructiveGhostButton,
  node,
  textField,
  valueRow,
  type TextField,
} from "../navigation/dom.js";
import type { C4DialogModeler } from "../navigation/types.js";
import { boundaryCanvasId, relationshipCanvasId } from "../reconcile/Reconciler.js";
import {
  isBoundaryShape,
  isElementShape,
  isRelationshipConnection,
  type C4BoundaryShape,
  type C4Connection,
  type C4ElementShape,
} from "../scene/types.js";
import { definitionLine, readOnlyReason, tagsOf, tagsText } from "./fields.js";
import "./inspector.css";
import { selectionKeeper, type SelectionKeeper } from "./keepSelectionVisible.js";

/** The shell's `InspectorHandle` satisfies it. */
export interface InspectorSlot {
  readonly element: HTMLElement;
  isOpen(): boolean;
  open(): void;
  close(): void;
}

export interface InspectorHandle {
  /** Shows the values but disables every control that changes them, while the host can't save. */
  setReadOnly(readOnly: boolean): void;
  /** Commits a field still being typed in (the VS Code save flush); true when one was. */
  commitDraft(): boolean;
  destroy(): void;
}

export interface InspectorOptions {
  /** VS Code: "Defined on line N" reveals the text. Without it, the line is not offered. */
  onRevealSource?(line: number): void;
}

type Target =
  | { readonly kind: "element"; readonly shape: C4ElementShape | C4BoundaryShape }
  | { readonly kind: "relationship"; readonly connection: C4Connection }
  | {
      readonly kind: "several";
      readonly ids: readonly ElementId[];
      readonly relationships: readonly string[];
      readonly count: number;
    };

interface FieldSpec {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly multiline?: boolean;
  readonly reason?: string | undefined;
  commit(value: string): EditOutcome | undefined;
}

interface FieldControl {
  spec: FieldSpec;
  readonly field: TextField;
  committed: string;
}

interface Shown {
  readonly token: string;
  readonly signature: string;
  readonly title: HTMLElement;
  /** What stands above the fields (a relationship's ends, a boundary's note). */
  readonly before: HTMLElement;
  readonly controls: FieldControl[];
  readonly dynamic: HTMLElement;
}

const KIND_WORDS_FOR_CHILD = { softwareSystem: "container", container: "component" } as const;

/** One token per selected shape object, which an identifier rename keeps (SPEC 1.5). */
const tokens = new WeakMap<object, number>();
let tokenCount = 0;

function tokenOf(element: object): string {
  let token = tokens.get(element);
  if (token === undefined) {
    tokenCount += 1;
    token = tokenCount;
    tokens.set(element, token);
  }
  return String(token);
}

function normalized(spec: FieldSpec, value: string): string {
  return spec.name === "tags" ? tagsText(tagsOf(value)) : value.trim();
}

function isImeCompositionKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

/**
 * The inspector's content in the host's panel (SPEC 5.6, guide §5.11), plain DOM: it opens the
 * panel on a selection with something to edit and closes it otherwise. Every field commits on
 * blur or Enter as one command; Escape reverts a draft, an Escape no field used closes the panel
 * and hands the focus to the canvas. A refused value shows at its field.
 */
class Inspector implements InspectorHandle {
  private readonly eventBus: EventBus;
  private readonly keeper: SelectionKeeper;
  private shown: Shown | undefined;
  private readOnly = false;
  private destroyed = false;
  private readonly render = () => this.update();

  constructor(
    private readonly slot: InspectorSlot,
    private readonly modeler: C4DialogModeler,
    private readonly options: InspectorOptions,
  ) {
    this.eventBus = modeler.diagram.get<EventBus>("eventBus");
    this.keeper = selectionKeeper(
      this.canvas(),
      slot.element,
      () => !!serviceOf<Dragging>(modeler, "dragging")?.context(),
    );
    this.eventBus.on(["selection.changed", ...DOCUMENT_EVENTS], this.render);
    this.eventBus.on("diagram.destroy", () => this.destroy());
    slot.element.addEventListener("keydown", this.onPanelKey);
    this.update();
  }

  setReadOnly(readOnly: boolean): void {
    if (this.destroyed || readOnly === this.readOnly) return;
    this.readOnly = readOnly;
    this.update();
  }

  commitDraft(): boolean {
    if (this.destroyed || !this.shown) return false;
    const active = this.slot.element.ownerDocument.activeElement;
    const control = this.shown.controls.find((candidate) => candidate.field.control === active);
    if (!control || normalized(control.spec, control.field.control.value) === control.committed) {
      return false;
    }
    this.commit(control);
    return true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.eventBus.off(["selection.changed", ...DOCUMENT_EVENTS], this.render);
    this.slot.element.removeEventListener("keydown", this.onPanelKey);
    this.keeper.destroy();
    this.slot.element.replaceChildren();
    this.shown = undefined;
  }

  private readonly onPanelKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || isImeCompositionKey(event)) return;
    event.preventDefault();
    this.closeAndFocusCanvas();
  };

  private closeAndFocusCanvas(): void {
    serviceOf<Selection>(this.modeler, "selection")?.select(null);
    this.canvas().focus();
  }

  private canvas(): Canvas {
    return this.modeler.diagram.get<Canvas>("canvas");
  }

  private target(): Target | undefined {
    const selected = serviceOf<Selection>(this.modeler, "selection")?.get() ?? [];
    const [only, ...more] = selected;
    if (only && more.length === 0) {
      if (isElementShape(only) || isBoundaryShape(only)) return { kind: "element", shape: only };
      if (isRelationshipConnection(only)) return { kind: "relationship", connection: only };
      return undefined;
    }
    const ids = selected.filter(isElementShape).map((shape) => shape.c4.id);
    const relationships = selected.filter(isRelationshipConnection).map(({ c4 }) => c4.key);
    const count = ids.length + relationships.length;
    return count > 1 ? { kind: "several", ids, relationships, count } : undefined;
  }

  private update(): void {
    if (this.destroyed) return;
    const target = this.target();
    const owner = this.slot.element.ownerDocument;
    const hadFocus = this.slot.element.contains(owner.activeElement);
    const content = target && this.build(target);
    if (!target || !content) {
      this.shown = undefined;
      this.keeper.forget();
      this.slot.element.replaceChildren();
      this.slot.close();
      if (hadFocus && owner.hasFocus()) this.canvas().focus();
      return;
    }
    const token = this.tokenOf(target);
    const reuse = this.shown?.token === token && this.shown.signature === content.signature;
    if (reuse && this.shown) {
      this.shown.title.textContent = content.title;
      this.shown.before.replaceChildren(...content.before);
      this.refreshValues(this.shown, content.specs);
      this.replaceDynamic(this.shown, content.dynamic);
      return;
    }
    const focusedField =
      hadFocus && owner.activeElement instanceof HTMLElement
        ? owner.activeElement.dataset.field
        : undefined;
    const isNew = this.shown?.token !== token;
    const root = node(owner, "div", "c4-inspector c4-form");
    const title = node(owner, "h2", "c4-inspector-title", content.title);
    const fields = node(owner, "fieldset", "c4-form c4-inspector-fields");
    fields.disabled = this.readOnly || isLocked(this.modeler);
    const controls = content.specs.map((spec) => this.control(owner, spec));
    const before = node(owner, "div", "c4-inspector-before", ...content.before);
    fields.append(before, ...controls.map(({ field }) => field.root));
    const dynamic = node(owner, "div", "c4-inspector-dynamic");
    dynamic.append(...content.dynamic);
    root.append(this.header(owner, title), fields, dynamic);
    this.slot.element.replaceChildren(root);
    this.shown = { token, signature: content.signature, title, before, controls, dynamic };
    this.slot.open();
    if (focusedField !== undefined) {
      root.querySelector<HTMLElement>(`[data-field="${CSS.escape(focusedField)}"]`)?.focus();
    }
    if (isNew && target.kind !== "several") {
      const selected = serviceOf<Selection>(this.modeler, "selection")?.get() ?? [];
      this.keeper.keepVisible(selected as Element[]);
    }
  }

  private tokenOf(target: Target): string {
    if (target.kind === "element") return `element:${tokenOf(target.shape)}`;
    if (target.kind === "relationship") return `relationship:${tokenOf(target.connection)}`;
    return `several:${[...target.ids, ...target.relationships].join(" ")}`;
  }

  private refreshValues(shown: Shown, specs: readonly FieldSpec[]): void {
    const owner = this.slot.element.ownerDocument;
    shown.controls.forEach((control, index) => {
      const spec = specs[index];
      if (!spec) return;
      const fresh = normalized(spec, spec.value);
      const clean = normalized(control.spec, control.field.control.value) === control.committed;
      if (clean && owner.activeElement !== control.field.control) {
        control.field.control.value = spec.value;
      }
      control.spec = spec;
      control.committed = fresh;
    });
  }

  private replaceDynamic(shown: Shown, parts: readonly HTMLElement[]): void {
    const owner = this.slot.element.ownerDocument;
    const active = owner.activeElement;
    const key =
      active instanceof HTMLElement && shown.dynamic.contains(active)
        ? active.dataset.focusKey
        : undefined;
    shown.dynamic.replaceChildren(...parts);
    if (key !== undefined) {
      shown.dynamic.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)?.focus();
    }
  }

  private header(owner: Document, title: HTMLElement): HTMLElement {
    const close = node(owner, "button", "c4-inspector-close");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.setAttribute("aria-keyshortcuts", "Escape");
    close.innerHTML = padIcon("x");
    close.addEventListener("click", () => this.closeAndFocusCanvas());
    return node(owner, "div", "c4-inspector-head", title, close);
  }

  private control(owner: Document, spec: FieldSpec): FieldControl {
    const field = textField(owner, {
      label: spec.label,
      value: spec.value,
      name: spec.name,
      ...(spec.multiline ? { multiline: true } : {}),
      readOnlyReason: spec.reason,
    });
    const control: FieldControl = { spec, field, committed: normalized(spec, spec.value) };
    const input = field.control;
    input.addEventListener("input", () => field.clearError());
    input.addEventListener("blur", () => this.commit(control));
    input.addEventListener("keydown", (keydown: Event) => {
      const event = keydown as KeyboardEvent;
      if (isImeCompositionKey(event)) return;
      if (event.key === "Escape") {
        const invalid = input.getAttribute("aria-invalid") === "true";
        if (normalized(control.spec, input.value) === control.committed && !invalid) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        input.value = control.spec.value;
        field.clearError();
      } else if (event.key === "Enter" && input instanceof HTMLInputElement) {
        event.preventDefault();
        // The canvas keys act only while the canvas has the focus (TT's afterEnter).
        if (this.commit(control)) this.canvas().focus();
      }
    });
    return control;
  }

  /** True when nothing is left to write. */
  private commit(control: FieldControl): boolean {
    if (this.destroyed || this.readOnly) return false;
    const input = control.field.control;
    if (input.readOnly || input.disabled) return true;
    const value = input.value;
    if (normalized(control.spec, value) === control.committed) return true;
    const { outcome, refusal } = editAtField(this.eventBus, () => control.spec.commit(value));
    if (refusal !== undefined || (outcome && !outcome.ok)) {
      control.field.showError(
        refusal ?? "Couldn't write this change into the DSL. Edit the text instead.",
      );
      return false;
    }
    return true;
  }

  private build(target: Target) {
    const parse = parseOf(this.modeler);
    const { workspace } = parse;
    if (target.kind === "several") return this.buildSeveral(target);
    if (target.kind === "relationship") {
      const relationship = workspace.relationships.find(
        (candidate) => candidate.canvasKey === target.connection.c4.key,
      );
      return relationship && this.buildRelationship(workspace, relationship);
    }
    const element = workspace.elements.find((candidate) => candidate.id === target.shape.c4.id);
    return element && this.buildElement(workspace, element, isBoundaryShape(target.shape));
  }

  private signatureOf(kind: string, specs: readonly FieldSpec[], extra: unknown = null): string {
    return JSON.stringify([
      kind,
      this.readOnly,
      isLocked(this.modeler),
      specs.map((spec) => [spec.name, spec.reason ?? null]),
      extra,
    ]);
  }

  private buildElement(workspace: Workspace, element: ModelElement, boundary: boolean) {
    const owner = this.slot.element.ownerDocument;
    const parse = parseOf(this.modeler);
    const { c4 } = this.modeler;
    const id = element.id;
    const reason = (field: FieldName) =>
      readOnlyReason(parse, id, field, element.fields[field], undefined);
    const specs: FieldSpec[] = [
      {
        name: "name",
        label: "Name",
        value: element.name,
        reason: reason("name"),
        commit: (value) => c4.editElement(id, { name: value.trim() }),
      },
    ];
    if (element.kind === "container" || element.kind === "component") {
      specs.push({
        name: "technology",
        label: "Technology",
        value: element.technology,
        reason: reason("technology"),
        commit: (value) => c4.editElement(id, { technology: value.trim() }),
      });
    }
    if (element.kind === "custom") {
      specs.push({
        name: "metadata",
        label: "Metadata",
        value: element.metadata,
        reason: reason("metadata"),
        commit: (value) => c4.editElement(id, { metadata: value.trim() }),
      });
    }
    specs.push(
      {
        name: "description",
        label: "Description",
        value: element.description,
        multiline: true,
        reason: reason("description"),
        commit: (value) => c4.editElement(id, { description: value.trim() }),
      },
      {
        name: "tags",
        label: "Tags",
        value: tagsText(element.ownTags),
        reason: reason("tags"),
        commit: (value) => c4.editElement(id, { tags: tagsOf(value) }),
      },
      {
        name: "url",
        label: "URL",
        value: element.url ?? "",
        reason: reason("url"),
        commit: (value) => c4.editElement(id, { url: value.trim() === "" ? null : value.trim() }),
      },
      {
        name: "identifier",
        label: "Identifier",
        value: element.identifier ?? element.id,
        commit: (value) => c4.renameIdentifier(id, value.trim()),
      },
    );
    const dynamic = [this.inViews(owner, workspace, element), ...this.sourceLine(owner, id)];
    dynamic.push(this.actions(owner, boundary ? [] : [id], [], true, [id]));
    // A component view frames its scope container and, around it, the container's system.
    const frame =
      this.modeler.views.active().scopeId === id
        ? "The frame of this view."
        : "A frame in this view, around the frame of its scope.";
    const before = boundary ? [node(owner, "p", "c4-field-note", frame)] : [];
    return {
      title: kindWord(workspace, element),
      before,
      specs,
      dynamic,
      signature: this.signatureOf(`element:${element.kind}:${String(boundary)}`, specs),
    };
  }

  private buildRelationship(workspace: Workspace, relationship: Relationship) {
    const owner = this.slot.element.ownerDocument;
    const name = (id: ElementId) =>
      workspace.elements.find((element) => element.id === id)?.name ?? id;
    const ends = valueRow(
      owner,
      "From → To",
      `${name(relationship.sourceId)} → ${name(relationship.destinationId)}`,
    );
    if (relationship.implied) {
      return this.buildImplied(owner, workspace, relationship, ends);
    }
    const parse = parseOf(this.modeler);
    const { c4 } = this.modeler;
    const key = relationship.canvasKey;
    const bulk = relationship.bulk ? ("relationship" as const) : undefined;
    const reason = (field: "description" | "technology" | "tags" | "url") =>
      readOnlyReason(parse, undefined, field, relationship.fields[field], bulk);
    const specs: FieldSpec[] = [
      {
        name: "description",
        label: "Description",
        value: relationship.description,
        reason: reason("description"),
        commit: (value) => c4.editRelationship(key, { description: value.trim() }),
      },
      {
        name: "technology",
        label: "Technology",
        value: relationship.technology,
        reason: reason("technology"),
        commit: (value) => c4.editRelationship(key, { technology: value.trim() }),
      },
      {
        name: "tags",
        label: "Tags",
        value: tagsText(relationship.tags.filter((tag) => tag !== "Relationship")),
        reason: reason("tags"),
        commit: (value) => c4.editRelationship(key, { tags: tagsOf(value) }),
      },
      {
        name: "url",
        label: "URL",
        value: relationship.url ?? "",
        reason: reason("url"),
        commit: (value) =>
          c4.editRelationship(key, { url: value.trim() === "" ? null : value.trim() }),
      },
    ];
    return {
      title: "Relationship",
      before: [ends],
      specs,
      dynamic: [this.actions(owner, [], [key], true, [])],
      signature: this.signatureOf("relationship", specs),
    };
  }

  /** An implied relationship is never written: it says where it comes from (SPEC 5.6). */
  private buildImplied(
    owner: Document,
    workspace: Workspace,
    relationship: Relationship,
    ends: HTMLElement,
  ) {
    const origin = workspace.relationships.find(
      (candidate) => candidate.key !== undefined && candidate.key === relationship.impliedBy,
    );
    const name = (id: ElementId) =>
      workspace.elements.find((element) => element.id === id)?.name ?? id;
    const parts: HTMLElement[] = [];
    if (origin) {
      parts.push(
        node(
          owner,
          "p",
          "c4-field-note",
          `Implied by ${name(origin.sourceId)} → ${name(origin.destinationId)}.`,
        ),
      );
      const registry = this.modeler.diagram.get<ElementRegistry>("elementRegistry");
      const shown = registry.get(relationshipCanvasId(origin.canvasKey));
      if (shown) {
        const select = button(owner, "Select it", "secondary", () =>
          serviceOf<Selection>(this.modeler, "selection")?.select(shown),
        );
        select.dataset.focusKey = "select-origin";
        parts.push(select);
      }
    }
    parts.push(this.actions(owner, [], [relationship.canvasKey], false, []));
    return {
      title: "Implied relationship",
      before: [ends],
      specs: [],
      dynamic: parts,
      signature: this.signatureOf("implied", [], relationship.canvasKey),
    };
  }

  private buildSeveral(target: Extract<Target, { kind: "several" }>) {
    const owner = this.slot.element.ownerDocument;
    const { workspace } = parseOf(this.modeler);
    const explicit = target.relationships.filter(
      (key) =>
        !workspace.relationships.find((relationship) => relationship.canvasKey === key)?.implied,
    );
    return {
      title: `${target.count} items selected`,
      before: [],
      specs: [],
      dynamic: [
        this.actions(
          owner,
          target.ids,
          target.relationships,
          target.ids.length > 0 || explicit.length > 0,
          target.ids,
          explicit,
        ),
      ],
      signature: this.signatureOf("several", []),
    };
  }

  /** "Remove from view" and "Delete from model…", locked like the fields. */
  private actions(
    owner: Document,
    removeIds: readonly ElementId[],
    removeRelationships: readonly string[],
    deletable: boolean,
    deleteIds: readonly ElementId[],
    deleteRelationships: readonly string[] = removeRelationships,
  ): HTMLElement {
    const locked = this.readOnly || isLocked(this.modeler) || !this.modeler.views.active().editable;
    const actions = node(owner, "div", "c4-inspector-actions");
    if (removeIds.length > 0 || removeRelationships.length > 0) {
      const remove = button(owner, "Remove from view", "secondary", () => {
        this.modeler.c4.removeFromView(removeIds, removeRelationships);
        this.canvas().focus();
      });
      remove.dataset.focusKey = "remove-from-view";
      remove.disabled = locked;
      actions.append(remove);
    }
    if (deletable) {
      const remove = destructiveGhostButton(owner, "Delete from model…", () =>
        serviceOf<C4Dialogs>(this.modeler, "c4Dialogs")?.deleteFromModel({
          ids: deleteIds,
          relationships: deleteRelationships,
        }),
      );
      remove.dataset.focusKey = "delete-from-model";
      remove.disabled = locked;
      actions.append(remove);
    }
    return actions;
  }

  /** The written views that show the element, and the view one level deeper (SPEC 5.6). */
  private inViews(owner: Document, workspace: Workspace, element: ModelElement): HTMLElement {
    const { views } = this.modeler;
    const active = views.active();
    const section = node(owner, "div", "c4-field c4-inspector-views");
    section.append(node(owner, "span", "c4-field-label", "In views"));
    const list = node(owner, "div", "c4-inspector-view-list");
    const catalog = views.catalog();
    for (const entry of catalog.list()) {
      if (entry.state !== "written" || !entry.editable) continue;
      const members = membersOf(this.modeler, entry);
      const shows =
        members.elements.includes(element.id) ||
        members.boundaries.some((boundary) => boundary.elementId === element.id);
      if (!shows) continue;
      list.append(
        this.viewButton(owner, entry.key, entry.title, element.id, entry.key === active.key),
      );
    }
    const child = catalog.childOf(element.id);
    const childWord =
      element.kind === "softwareSystem" || element.kind === "container"
        ? KIND_WORDS_FOR_CHILD[element.kind]
        : undefined;
    if (child && childWord) {
      list.append(this.viewButton(owner, child.key, `Open ${childWord} view`, element.id, false));
    }
    if (list.childElementCount === 0) {
      list.append(node(owner, "span", "c4-field-note", "No view in the file shows it yet."));
    }
    section.append(list);
    return section;
  }

  private viewButton(
    owner: Document,
    key: string,
    label: string,
    elementId: ElementId,
    current: boolean,
  ): HTMLButtonElement {
    const open = button(owner, label, "ghost", () => {
      if (!current) this.modeler.views.open(key, { cause: "user" });
      this.reselect(elementId);
    });
    open.classList.add("c4-inspector-view");
    open.dataset.view = key;
    open.dataset.focusKey = `view:${key}:${label}`;
    if (current) open.setAttribute("aria-current", "true");
    return open;
  }

  /** The element stays selected in the view it opened, as its frame where it scopes it. */
  private reselect(id: ElementId): void {
    const registry = this.modeler.diagram.get<ElementRegistry>("elementRegistry");
    const shape = registry.get(id) ?? registry.get(boundaryCanvasId(id));
    if (shape) serviceOf<Selection>(this.modeler, "selection")?.select(shape);
  }

  private sourceLine(owner: Document, id: ElementId): HTMLElement[] {
    const reveal = this.options.onRevealSource;
    if (!reveal) return [];
    const line = definitionLine(parseOf(this.modeler), id);
    if (line === undefined) return [];
    const link = button(owner, `Defined on line ${line}`, "ghost", () => reveal(line));
    link.classList.add("c4-inspector-source");
    link.dataset.focusKey = "source-line";
    return [link];
  }
}

/** Mounts the inspector into a host's panel (the shell's `inspector` slot). */
export function mountInspector(
  slot: InspectorSlot,
  modeler: C4DialogModeler,
  options: InspectorOptions = {},
): InspectorHandle {
  return new Inspector(slot, modeler, options);
}
