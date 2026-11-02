import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Scheduler from "diagram-js/lib/features/scheduler/Scheduler";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Injector } from "didi";
import type { Box, Point } from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import type SceneLookup from "../draw/SceneLookup.js";
import { readOnlyReason } from "../inspector/fields.js";
import { isKeyOnHiddenTarget } from "../keyboard/CanvasKeys.js";
import { refusedEvent } from "../modeling/refusalLevel.js";
import type { SceneNotation } from "../scene/notation.js";
import {
  isElementShape,
  isRelationshipConnection,
  type C4Connection,
  type C4ElementShape,
} from "../scene/types.js";
import { EDIT_REFUSED_EVENT, type C4ModelingMethods, type EditRefusedEvent } from "../services.js";
import { bandAt, elementTextLayout, relationshipLabelLayout } from "../text/elementTextLayout.js";
import { lineHeightOf, type TextFont } from "../text/textMetrics.js";
import type { TextBand, TextBands } from "../text/types.js";
import {
  ELEMENT_FONTS,
  ELEMENT_GAPS,
  RELATIONSHIP_FONTS,
  RELATIONSHIP_LABEL,
} from "../text/typography.js";
import { editAtField } from "./fieldRefusal.js";
import "./labelEditing.css";

/** The fields the label editor writes (SPEC 5.5). */
export type LabelField = "name" | "description" | "technology" | "metadata";

/** A label edit open right now: the document id, the text typed so far, not yet committed. */
export interface OpenLabelEdit {
  /** The element's id, or a relationship's canvas key. */
  elementId: string;
  text: string;
  field: LabelField;
}

export type LabelTarget = C4ElementShape | C4Connection;

interface EditLock {
  isReadOnly(): boolean;
}

interface SuspendedEdit {
  readonly canvasId: string;
  readonly documentId: string;
  readonly relationship: boolean;
  readonly field: LabelField;
  readonly text: string;
}

interface FieldModel {
  readonly value: string;
  readonly editable: boolean;
}

const FIELD_CLASS = "diagram-label-editor";
const ERROR_CLASS = "c4-label-error";
const HINT_CLASS = "c4-label-hint";
/** Before the canvas's key guard (10000), which stops a key on a hidden canvas. */
const BEFORE_THE_KEY_GUARD = 20_000;
/** The textarea's own padding and 1px border, which the box over the band leaves room for. */
const PADDING = { x: 4, y: 2 };
const BORDER = 1;
/** Screen px between the field and its error message (the focus ring reaches 4px below). */
const ERROR_GAP = 8;
/** Screen px the focus ring reaches outside the field: 2px out, 3px wide in high contrast. */
const FOCUS_RING_REACH = 5;
const READ_ONLY_PLACEMENT = "C4LabelEditing#readOnlyPlacement";
/** A band too narrow to type in still gets a field this wide (screen px). */
const MINIMUM_WIDTH = 96;

const ELEMENT_ORDER: readonly LabelField[] = ["name", "technology", "metadata", "description"];
const RELATIONSHIP_ORDER: readonly LabelField[] = ["description", "technology"];

const LABELS: Readonly<Record<LabelField, string>> = {
  name: "Name",
  description: "Description",
  technology: "Technology",
  metadata: "Metadata",
};

/** Under the field while its text is longer than the canvas shows (the file keeps all of it). */
const SHORTENED_NOTE = "Shortened on the canvas. The file keeps the full text.";

function isLabelField(field: string | undefined): field is LabelField {
  return (
    field === "name" || field === "description" || field === "technology" || field === "metadata"
  );
}

/** Whether Enter commits; in a description it does too, and Shift+Enter breaks the line. */
function isMultiline(field: LabelField): boolean {
  return field === "description";
}

/** What the DSL stores: one line for a name, line breaks kept in a description. */
function normalized(text: string, field: LabelField): string {
  if (isMultiline(field)) return text.replace(/\r\n?/g, "\n").trim();
  return text.replace(/\s+/g, " ").trim();
}

function isImeCompositionKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * In-place editing of a field's band (SPEC 5.5): one textarea over the band in the band's font,
 * size and wrapping, from the same `elementTextLayout` the drawing uses. Only the user's own
 * gestures commit (Enter, Tab, leaving the field, a click or drag on the canvas), and every commit
 * is one command. What a host does never commits (contract L1, L5): an import or a view switch
 * takes the open edit down without committing and reopens it on the same id with the text typed
 * so far; when the new view does not show the element, the edit stays parked for the host's
 * `setViewState` to bring the view back. A value the DSL cannot store shows its reason under the
 * field and commits nothing; dropped by a click away, it goes to the app as `c4.edit.refused`.
 * A field that cannot be edited here names its reason at its band instead of opening. While a
 * relationship's field is open, its context pad, which lies beside the label, stays closed.
 */
export default class LabelEditing {
  static $inject = ["canvas", "eventBus", "elementRegistry", "injector"];

  private field: HTMLTextAreaElement | undefined;
  private target: LabelTarget | undefined;
  private fieldName: LabelField = "name";
  private error: HTMLElement | undefined;
  private hint: HTMLElement | undefined;
  private suspended: SuspendedEdit | undefined;
  private resumeTimer: ReturnType<typeof setTimeout> | undefined;
  private committing = false;
  private restoresPad = true;
  private errors = 0;

  constructor(
    private readonly canvas: Canvas,
    private readonly eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
    private readonly injector: Injector,
  ) {
    eventBus.on("element.dblclick", (event: { element?: unknown; originalEvent?: Event }) =>
      this.onDoubleClick(event.element, event.originalEvent),
    );
    eventBus.on(["element.mousedown", "drag.init"], () => {
      this.hideHint();
      this.forgetParked();
      this.complete({ dropRefused: true });
    });
    eventBus.on("keyboard.keydown", BEFORE_THE_KEY_GUARD, () => {
      this.hideHint();
      this.forgetParked();
      return undefined;
    });
    eventBus.on("canvas.viewbox.changed", () => {
      this.hideHint();
      this.followView();
    });
    eventBus.on("contextPad.open.allowed", () =>
      this.field && isRelationshipConnection(this.target) ? false : undefined,
    );
    // Undo, redo or another change of the model underneath the field: drop the edit instead of
    // writing it onto an element that may be gone. A commit of its own closes the field itself.
    eventBus.on("commandStack.changed", () => {
      this.hideHint();
      this.forgetParked();
      if (!this.committing) this.cancel();
    });
    // Before the canvas goes: a field still open would commit onto the destroyed diagram.
    eventBus.on("diagram.destroy", 1500, () => {
      clearTimeout(this.resumeTimer);
      this.suspended = undefined;
      this.hideHint();
      this.restoresPad = false;
      this.cancel();
    });
  }

  /**
   * Opens the editor on `field` of an element (default its name) or a relationship (default its
   * description); false when the field cannot be edited here or the canvas is locked.
   */
  activate(target: LabelTarget, field?: LabelField): boolean {
    if (this.injector.get<EditLock>("readOnly", false)?.isReadOnly()) return false;
    const chosen = field ?? (isRelationshipConnection(target) ? "description" : "name");
    const model = this.fieldModel(target, chosen);
    if (!model?.editable) return false;
    this.complete();
    if (this.field) return false;
    this.hideHint();
    const textarea = document.createElement("textarea");
    textarea.className = FIELD_CLASS;
    textarea.setAttribute("aria-label", LABELS[chosen]);
    textarea.placeholder = LABELS[chosen];
    textarea.dataset.field = chosen;
    textarea.spellcheck = false;
    textarea.rows = 1;
    textarea.value = model.value;
    textarea.addEventListener("keydown", (event) => this.onKey(event, textarea));
    textarea.addEventListener("input", () => {
      this.clearError();
      this.fitHeight();
      this.updateShortenedNote();
    });
    textarea.addEventListener("blur", () => {
      if (this.field === textarea) this.complete();
    });
    this.field = textarea;
    this.target = target;
    this.fieldName = chosen;
    if (isRelationshipConnection(target))
      this.injector.get<ContextPad>("contextPad", false)?.close();
    this.place();
    this.canvas.getContainer().append(textarea);
    this.fitHeight();
    this.updateShortenedNote();
    // A field over a band at the edge of the view would scroll the canvas's container, which
    // diagram-js does not expect, and shift the drawing under the field.
    textarea.focus({ preventScroll: true });
    textarea.select();
    return true;
  }

  isActive(): boolean {
    return this.field !== undefined;
  }

  openEdit(): OpenLabelEdit | undefined {
    const { field, target } = this;
    if (!field || !target) return undefined;
    return { elementId: documentIdOf(target), text: field.value, field: this.fieldName };
  }

  /**
   * Writes the typed text as one command and closes the field; true once it is closed. A refused
   * value keeps the field open with its reason, unless the user went on to the canvas
   * (`dropRefused`), where the edit is dropped and the app hears why. The name of a fresh element
   * commits even unchanged: confirming the default name settles a readable identifier.
   */
  complete(options: { dropRefused?: boolean } = {}): boolean {
    const { field, target } = this;
    if (!field || !target) return true;
    if (this.elementRegistry.get(target.id) !== target) {
      this.close();
      return true;
    }
    const fieldName = this.fieldName;
    const text = normalized(field.value, fieldName);
    const model = this.fieldModel(target, fieldName);
    const confirmsFreshName =
      fieldName === "name" && isElementShape(target) && this.isFresh(target.c4.id);
    if (!model?.editable || (text === model.value && !confirmsFreshName)) {
      this.close();
      return true;
    }
    const modeling = this.injector.get<C4ModelingMethods>("modeling");
    this.committing = true;
    let refusal: string | undefined;
    let reason: EditRefusedEvent["reason"] = "verification-failed";
    try {
      const edit = editAtField(this.eventBus, () =>
        isElementShape(target)
          ? modeling.editElement(target.c4.id, { [fieldName]: text })
          : modeling.editRelationship(target.c4.key, { [fieldName]: text }),
      );
      refusal = edit.refusal;
      if (edit.outcome && !edit.outcome.ok) reason = edit.outcome.reason;
    } finally {
      this.committing = false;
    }
    if (refusal === undefined) {
      this.close();
      return true;
    }
    if (options.dropRefused) {
      this.close();
      this.eventBus.fire(EDIT_REFUSED_EVENT, refusedEvent(reason, refusal));
      return true;
    }
    this.showError(refusal);
    return false;
  }

  /** Closes the field without writing anything. */
  cancel(): void {
    this.close();
  }

  /**
   * Takes an open edit down for an import or a view switch, without committing it (L1). An edit an
   * earlier import took down and has not reopened yet stays suspended: imports that waited for
   * the user's action run back to back.
   */
  suspend(): void {
    clearTimeout(this.resumeTimer);
    const { field, target } = this;
    if (field && target) {
      this.suspended = {
        canvasId: target.id,
        documentId: documentIdOf(target),
        relationship: isRelationshipConnection(target),
        field: this.fieldName,
        text: field.value,
      };
    }
    this.hideHint();
    this.restoresPad = false;
    try {
      this.cancel();
    } finally {
      this.restoresPad = true;
    }
  }

  /**
   * Reopens a suspended edit, with its typed text, on the same id, deferred to the next task so it
   * opens in the view the host restores around the import. When the document still has the
   * element but the view does not show it, the edit stays parked until a view switch shows it
   * again (SPEC 5.5).
   */
  resumeAfterImport(): void {
    clearTimeout(this.resumeTimer);
    if (!this.suspended) return;
    this.resumeTimer = setTimeout(() => this.resume(), 0);
  }

  private resume(): void {
    const edit = this.suspended;
    if (!edit) return;
    if (this.isActive()) {
      this.suspended = undefined;
      return;
    }
    const shape = this.elementRegistry.get(edit.canvasId);
    const target = edit.relationship
      ? isRelationshipConnection(shape)
        ? shape
        : undefined
      : isElementShape(shape)
        ? shape
        : undefined;
    if (target) {
      this.suspended = undefined;
      if (this.activate(target, edit.field) && this.field) {
        this.field.value = edit.text;
        this.fitHeight();
        this.updateShortenedNote();
      }
      return;
    }
    if (!this.documentHas(edit)) this.suspended = undefined;
  }

  /** The user acted on the canvas, or the model changed: a parked edit no longer belongs. */
  private forgetParked(): void {
    if (this.field) return;
    clearTimeout(this.resumeTimer);
    this.suspended = undefined;
  }

  private documentHas(edit: SuspendedEdit): boolean {
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    return edit.relationship
      ? workspace.relationships.some((relationship) => relationship.canvasKey === edit.documentId)
      : workspace.elements.some((element) => element.id === edit.documentId);
  }

  /**
   * The band's own field, else the default (SPEC 5.5). A field that cannot be edited here names
   * its reason at its band, an implied relationship where it comes from.
   */
  private onDoubleClick(element: unknown, originalEvent: Event | undefined): void {
    if (!isElementShape(element) && !isRelationshipConnection(element)) return;
    if (this.isLocked()) return;
    const point = this.diagramPoint(originalEvent);
    const layout = this.layoutOf(element);
    const band: TextBand | undefined = point && layout ? bandAt(layout, point) : undefined;
    const pointed = isLabelField(band?.field) ? band.field : undefined;
    const field = pointed ?? (isRelationshipConnection(element) ? "description" : "name");
    if (this.fieldModel(element, field)?.editable) {
      this.activate(element, field);
      return;
    }
    const reason = this.readOnlyReasonOf(element, field);
    if (reason !== undefined) this.showReadOnly(element, field, reason);
    else if (pointed) this.activate(element);
  }

  private readOnlyReasonOf(target: LabelTarget, field: LabelField): string | undefined {
    const parse = this.injector.get<DocumentStore>("c4Document").current().parse;
    const { workspace } = parse;
    if (isElementShape(target)) {
      const element = workspace.elements.find((candidate) => candidate.id === target.c4.id);
      if (!element) return undefined;
      const fits =
        field === "technology"
          ? element.kind === "container" || element.kind === "component"
          : field === "metadata"
            ? element.kind === "custom"
            : true;
      return fits
        ? readOnlyReason(parse, element.id, field, element.fields[field], undefined)
        : undefined;
    }
    const relationship = workspace.relationships.find(
      (candidate) => candidate.canvasKey === target.c4.key,
    );
    if (!relationship) return undefined;
    if (relationship.implied) {
      const origin = workspace.relationships.find(
        (candidate) => candidate.key !== undefined && candidate.key === relationship.impliedBy,
      );
      const name = (id: string) =>
        workspace.elements.find((element) => element.id === id)?.name ?? id;
      return origin
        ? `Comes from ${name(origin.sourceId)} → ${name(origin.destinationId)}. Edit it there.`
        : "Comes from a relationship between the elements inside. Edit it there.";
    }
    if (field !== "description" && field !== "technology") return undefined;
    return readOnlyReason(
      parse,
      undefined,
      field,
      relationship.fields[field],
      relationship.bulk ? "relationship" : undefined,
    );
  }

  private isLocked(): boolean {
    return this.injector.get<EditLock>("readOnly", false)?.isReadOnly() === true;
  }

  private isFresh(id: string): boolean {
    return this.injector.get<DocumentStore>("c4Document").current().fresh.has(id);
  }

  private onKey(event: KeyboardEvent, textarea: HTMLTextAreaElement): void {
    if (isKeyOnHiddenTarget(event)) return;
    event.stopPropagation();
    if (isImeCompositionKey(event)) return;
    if (event.key === "Enter" && (!event.shiftKey || !isMultiline(this.fieldName))) {
      event.preventDefault();
      if (this.complete()) this.canvas.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.cancel();
      this.canvas.focus();
    } else if (event.key === "Tab" && this.field === textarea) {
      event.preventDefault();
      this.next(event.shiftKey ? -1 : 1);
    }
  }

  /** Tab commits and opens the next band (name, technology, description; SPEC 5.5). */
  private next(step: 1 | -1): void {
    const target = this.target;
    const current = this.fieldName;
    if (!target || !this.complete()) return;
    const order = isRelationshipConnection(target) ? RELATIONSHIP_ORDER : ELEMENT_ORDER;
    const fields = order.filter((field) => this.fieldModel(target, field)?.editable);
    const index = fields.indexOf(current);
    const following = index < 0 ? undefined : fields[index + step];
    if (following && this.elementRegistry.get(target.id) === target) {
      this.activate(target, following);
    } else {
      this.canvas.focus();
    }
  }

  private fieldModel(target: LabelTarget, field: LabelField): FieldModel | undefined {
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    if (isElementShape(target)) {
      const element = workspace.elements.find((candidate) => candidate.id === target.c4.id);
      if (!element) return undefined;
      const fits =
        field === "technology"
          ? element.kind === "container" || element.kind === "component"
          : field === "metadata"
            ? element.kind === "custom"
            : true;
      return { value: element[field], editable: fits && element.fields[field].editable };
    }
    const relationship = workspace.relationships.find(
      (candidate) => candidate.canvasKey === target.c4.key,
    );
    if (!relationship || relationship.implied || relationship.bulk) return undefined;
    if (field !== "description" && field !== "technology") return undefined;
    return { value: relationship[field], editable: relationship.fields[field].editable };
  }

  private layoutOf(target: LabelTarget): TextBands | undefined {
    const lookup = this.injector.get<SceneLookup>("c4SceneLookup", false);
    if (!lookup) return undefined;
    if (isElementShape(target)) {
      const element = lookup.element(target);
      return element && elementTextLayout(element);
    }
    const relationship = lookup.relationship(target);
    return relationship && relationshipLabelLayout(relationship);
  }

  /** The band the field shows, or where it would go when it shows nothing yet. */
  private fieldBox(target: LabelTarget, field: LabelField): { box: Box; font: TextFont } {
    const layout = this.layoutOf(target);
    const bandName =
      field === "technology" || field === "metadata"
        ? isElementShape(target)
          ? "type"
          : "technology"
        : field;
    const font = this.fontOf(target, field);
    const band = layout?.bands.find((candidate) => candidate.band === bandName);
    if (band) return { box: band.box, font: band.font };
    const height = lineHeightOf(font);
    if (!layout) {
      const { x, y, width } = this.canvas.getAbsoluteBBox(target);
      const scale = this.canvas.viewbox().scale;
      const viewbox = this.canvas.viewbox();
      return {
        box: { x: viewbox.x + x / scale, y: viewbox.y + y / scale, width: width / scale, height },
        font,
      };
    }
    const { area } = layout;
    const last = layout.bands.at(-1);
    if (isRelationshipConnection(target))
      return { box: this.labelSlot(layout, field, height), font };
    const below = last ? last.box.y + last.box.height + ELEMENT_GAPS.beforeDescription : area.y;
    const y = Math.min(below, area.y + area.height - height);
    return { box: { x: area.x, y: Math.max(area.y, y), width: area.width, height }, font };
  }

  /**
   * Where a relationship's empty field goes: next to the band it has, which stays readable (the
   * description above the technology), else in the middle of the label box. Unlike an element's,
   * a label box is no bound: the field may reach past it. The field's padding, border and focus
   * ring keep clear of the band, at every zoom.
   */
  private labelSlot(layout: TextBands, field: LabelField, height: number): Box {
    const { area } = layout;
    const { gap, padding } = RELATIONSHIP_LABEL;
    const shown = layout.bands[0];
    const x = shown?.box.x ?? area.x + padding;
    const width = shown?.box.width ?? area.width - 2 * padding;
    if (!shown) return { x, y: area.y + (area.height - height) / 2, width, height };
    const clearance = gap + (PADDING.y + BORDER + FOCUS_RING_REACH) / this.canvas.viewbox().scale;
    const technology = layout.bands.find((band) => band.band === "technology");
    if (field === "description" && technology) {
      return { x, y: technology.box.y - clearance - height, width, height };
    }
    const last = layout.bands.at(-1)!;
    return { x, y: last.box.y + last.box.height + clearance, width, height };
  }

  private fontOf(target: LabelTarget, field: LabelField): TextFont {
    if (isRelationshipConnection(target)) {
      return field === "technology"
        ? RELATIONSHIP_FONTS.technology
        : RELATIONSHIP_FONTS.description;
    }
    if (field === "name") return ELEMENT_FONTS.name;
    return field === "description" ? ELEMENT_FONTS.description : ELEMENT_FONTS.type;
  }

  private diagramPoint(event: Event | undefined): Point | undefined {
    if (!(event instanceof MouseEvent)) return undefined;
    const bounds = this.canvas.getContainer().getBoundingClientRect();
    const { x, y, scale } = this.canvas.viewbox();
    return {
      x: x + (event.clientX - bounds.left) / scale,
      y: y + (event.clientY - bounds.top) / scale,
    };
  }

  private close(): void {
    const { field, target } = this;
    this.field = undefined;
    this.target = undefined;
    this.clearError();
    this.hideHint();
    field?.remove();
    if (field && isRelationshipConnection(target) && this.restoresPad) this.reopenPad();
  }

  /** The pad a relationship's field kept closed, back on what is still selected. */
  private reopenPad(): void {
    const pad = this.injector.get<ContextPad>("contextPad", false);
    const selected = this.injector.get<Selection>("selection", false)?.get() ?? [];
    const [only] = selected;
    if (!pad || pad.isOpen() || !only) return;
    if (selected.some((element) => this.elementRegistry.get(element.id) !== element)) return;
    pad.open(selected.length > 1 ? selected : only);
  }

  private followView(): void {
    if (this.field) this.place();
  }

  /** Over the band, in screen coordinates of the current view, at the current zoom. */
  private place(): void {
    const { field, target } = this;
    if (!field || !target) return;
    const { box, font } = this.fieldBox(target, this.fieldName);
    const viewbox = this.canvas.viewbox();
    const { scale } = viewbox;
    const inset = { x: PADDING.x + BORDER, y: PADDING.y + BORDER };
    const width = Math.max(box.width * scale + 2 * inset.x, MINIMUM_WIDTH);
    const centreX = (box.x + box.width / 2 - viewbox.x) * scale;
    Object.assign(field.style, {
      position: "absolute",
      left: `${centreX - width / 2}px`,
      top: `${(box.y - viewbox.y) * scale - inset.y}px`,
      width: `${width}px`,
      minHeight: `${box.height * scale + 2 * inset.y}px`,
      padding: `${PADDING.y}px ${PADDING.x}px`,
      fontFamily: font.family,
      fontSize: `${font.size * scale}px`,
      fontWeight: String(font.weight),
      lineHeight: String(font.lineHeight),
    });
    this.fitHeight();
    this.placeError();
  }

  /** The field grows with its text instead of scrolling it out of sight. */
  private fitHeight(): void {
    const field = this.field;
    if (!field?.isConnected) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + 2 * BORDER}px`;
    this.placeError();
  }

  /**
   * The note under the field while the canvas would cut its text short. The error, when there is
   * one, says more and takes the place.
   */
  private updateShortenedNote(): void {
    const { field, target } = this;
    if (!field || !target) return;
    const text = normalized(field.value, this.fieldName);
    if (this.error || !this.wouldBeShortened(target, this.fieldName, text)) {
      this.hideHint();
      return;
    }
    const hint = this.showHint(SHORTENED_NOTE);
    field.setAttribute("aria-describedby", hint.id);
    this.placeError();
  }

  /** Whether the drawing would end `text` in an ellipsis, by the layout the drawing uses. */
  private wouldBeShortened(target: LabelTarget, field: LabelField, text: string): boolean {
    const lookup = this.injector.get<SceneLookup>("c4SceneLookup", false);
    if (!lookup || text === "") return false;
    if (isRelationshipConnection(target)) {
      const relationship = lookup.relationship(target);
      if (!relationship || (field !== "description" && field !== "technology")) return false;
      const layout = relationshipLabelLayout({ ...relationship, [field]: text });
      return layout.bands.some((band) => band.field === field && band.truncated);
    }
    const element = lookup.element(target);
    if (!element) return false;
    if (field === "name" || field === "description") {
      const layout = elementTextLayout({ ...element, [field]: text });
      return layout.bands.some((band) => band.band === field && band.truncated);
    }
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    const model = workspace.elements.find((candidate) => candidate.id === element.id);
    const notation = this.injector.get<SceneNotation>("c4Notation", false);
    if (!model || !notation) return false;
    const typeLine = notation.typeLine({ ...model, [field]: text }, workspace.terminology);
    const layout = elementTextLayout({ ...element, typeLine });
    return layout.bands.some((band) => band.band === "type" && band.truncated);
  }

  /** A field that cannot be edited here: its reason, at its band, until the next action. */
  private showReadOnly(target: LabelTarget, field: LabelField, reason: string): void {
    const { box } = this.fieldBox(target, field);
    const hint = this.showHint(reason);
    hint.classList.add("c4-label-hint--alone");
    this.placeReadOnly(hint, box);
    // The double-click's second press may just have opened the pad, which diagram-js positions
    // in a task of its own.
    this.injector.get<Scheduler>("scheduler", false)?.schedule(() => {
      if (this.hint === hint) this.placeReadOnly(hint, box);
    }, READ_ONLY_PLACEMENT);
  }

  /**
   * Under the band, leaving the open pad free, whose entries are what the user can still do:
   * above the band instead, else moved aside under it.
   */
  private placeReadOnly(hint: HTMLElement, box: Box): void {
    const { x, y, scale } = this.canvas.viewbox();
    const centre = (box.x + box.width / 2 - x) * scale;
    const below = (box.y + box.height - y) * scale + ERROR_GAP;
    const placeAt = (left: number, top: number) =>
      Object.assign(hint.style, { position: "absolute", left: `${left}px`, top: `${top}px` });
    placeAt(centre, below);
    const pad = this.canvas.getContainer().querySelector(".djs-context-pad.open");
    const entries = pad?.getBoundingClientRect();
    if (!entries || !overlaps(hint.getBoundingClientRect(), entries)) return;
    placeAt(centre, (box.y - y) * scale - ERROR_GAP - hint.offsetHeight);
    if (!overlaps(hint.getBoundingClientRect(), entries)) return;
    placeAt(centre, below);
    const note = hint.getBoundingClientRect();
    const padOnTheRight = entries.left + entries.width / 2 >= note.left + note.width / 2;
    const shift = padOnTheRight
      ? entries.left - ERROR_GAP - note.right
      : entries.right + ERROR_GAP - note.left;
    placeAt(centre + shift, below);
  }

  private showHint(message: string): HTMLElement {
    if (!this.hint) {
      this.errors += 1;
      const hint = document.createElement("div");
      hint.className = HINT_CLASS;
      hint.id = `c4-label-hint-${this.errors}`;
      hint.setAttribute("role", "status");
      this.canvas.getContainer().append(hint);
      this.hint = hint;
    }
    if (this.hint.textContent !== message) this.hint.textContent = message;
    return this.hint;
  }

  private hideHint(): void {
    const hint = this.hint;
    if (!hint) return;
    this.hint = undefined;
    hint.remove();
    if (this.field?.getAttribute("aria-describedby") === hint.id) {
      this.field.removeAttribute("aria-describedby");
    }
  }

  private showError(message: string): void {
    const field = this.field;
    if (!field) return;
    this.hideHint();
    if (!this.error) {
      this.errors += 1;
      const error = document.createElement("div");
      error.className = ERROR_CLASS;
      error.id = `c4-label-error-${this.errors}`;
      error.setAttribute("role", "alert");
      this.canvas.getContainer().append(error);
      this.error = error;
    }
    this.error.textContent = message;
    field.setAttribute("aria-invalid", "true");
    field.setAttribute("aria-describedby", this.error.id);
    this.placeError();
  }

  private clearError(): void {
    this.error?.remove();
    this.error = undefined;
    this.field?.removeAttribute("aria-invalid");
    this.field?.removeAttribute("aria-describedby");
  }

  /** The error, else the note, under the field. */
  private placeError(): void {
    const field = this.field;
    const message = this.error ?? this.hint;
    if (!field || !message) return;
    Object.assign(message.style, {
      position: "absolute",
      left: field.style.left,
      top: `${field.offsetTop + field.offsetHeight + ERROR_GAP}px`,
      maxWidth: `${Math.max(field.offsetWidth, 240)}px`,
    });
  }
}

/** The element's id, or the relationship's canvas key. */
function documentIdOf(target: LabelTarget): string {
  return isElementShape(target) ? target.c4.id : target.c4.key;
}
