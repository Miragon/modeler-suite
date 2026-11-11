import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";
import { isStickyShape, type StickyShape } from "../model/di-types.js";
import type CanvasModeling from "../modeling/CanvasModeling.js";
import { FONT, STICKY_PADDING } from "../draw/styles.js";
import { isKeyOnHiddenTarget } from "../keyboard/CanvasKeys.js";

/** A label edit open right now: the element's id and the text typed so far, not yet committed. */
export interface OpenLabelEdit {
  elementId: string;
  text: string;
}

interface EditLock {
  isReadOnly(): boolean;
}

const FIELD_CLASS = "diagram-label-editor";

/**
 * In-place label editing. Only the user's own gestures commit (Enter, leaving the field, a click
 * or drag on the canvas), and every commit is one undoable command. What a host does never
 * commits (contract L1, L5): an import takes the open edit down without committing and reopens
 * it on the element with the same id (`suspend`/`resumeAfterImport`), and a view change (a host's
 * `setViewState` or fit, a scroll, a zoom) keeps it open and moves the field along.
 */
export default class LabelEditing {
  static $inject = ["canvas", "eventBus", "canvasModeling", "elementRegistry", "injector"];

  private field: HTMLTextAreaElement | undefined;
  private element: StickyShape | undefined;
  private suspended: OpenLabelEdit | undefined;
  private resumeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly canvas: Canvas,
    eventBus: EventBus,
    private readonly modeling: CanvasModeling,
    private readonly elementRegistry: ElementRegistry,
    private readonly injector: Injector,
  ) {
    eventBus.on("element.dblclick", (event: { element?: unknown }) => {
      if (isStickyShape(event.element)) this.activate(event.element);
    });
    eventBus.on(["element.mousedown", "drag.init"], () => this.complete());
    eventBus.on("canvas.viewbox.changed", () => this.followView());
    // Undo or redo changed the model underneath the field: drop the edit instead of writing it
    // onto an element that may be gone.
    eventBus.on("commandStack.changed", () => this.cancel());
    // Before the canvas goes: a field still open would commit onto the destroyed diagram.
    eventBus.on("diagram.destroy", 1500, () => {
      clearTimeout(this.resumeTimer);
      this.suspended = undefined;
      this.cancel();
    });
  }

  activate(element: StickyShape): boolean {
    if (this.injector.get<EditLock>("readOnly", false)?.isReadOnly()) return false;
    this.complete();
    const field = document.createElement("textarea");
    field.className = FIELD_CLASS;
    field.setAttribute("aria-label", "Label");
    field.value = element.sticky.text;
    field.addEventListener("keydown", (event) => {
      if (isKeyOnHiddenTarget(event)) return;
      event.stopPropagation();
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.complete();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.cancel();
        this.canvas.focus();
      }
    });
    field.addEventListener("blur", () => {
      if (this.field === field) this.complete();
    });
    field.addEventListener("input", () => this.centreText());
    this.field = field;
    this.element = element;
    this.place();
    this.canvas.getContainer().append(field);
    this.centreText();
    field.focus();
    field.select();
    return true;
  }

  isActive(): boolean {
    return this.field !== undefined;
  }

  openEdit(): OpenLabelEdit | undefined {
    return this.field && this.element
      ? { elementId: this.element.id, text: this.field.value }
      : undefined;
  }

  /** Writes the typed text as one command and closes the field. */
  complete(): void {
    const { field, element } = this;
    if (!field || !element) return;
    this.close();
    if (this.elementRegistry.get(element.id) === element) {
      this.modeling.setText(element.id, normalizedText(field.value));
    }
  }

  /** Closes the field without writing anything. */
  cancel(): void {
    this.close();
  }

  /**
   * Takes an open edit down for an import, without committing it (L1). An edit an earlier import
   * took down and has not reopened yet stays suspended: imports that waited for the user's action
   * run back to back.
   */
  suspend(): void {
    clearTimeout(this.resumeTimer);
    this.suspended = this.openEdit() ?? this.suspended;
    this.cancel();
  }

  /**
   * Reopens a suspended edit, with its typed text, on the element with the same id if the
   * imported document still has it (the contract's RECOMMENDATION). Deferred to the next task, so
   * it opens in the view the host restores around the import.
   */
  resumeAfterImport(): void {
    clearTimeout(this.resumeTimer);
    const edit = this.suspended;
    if (!edit) return;
    this.resumeTimer = setTimeout(() => {
      this.suspended = undefined;
      const element = this.elementRegistry.get(edit.elementId);
      if (this.isActive() || !isStickyShape(element) || !this.activate(element)) return;
      if (this.field) this.field.value = edit.text;
    }, 0);
  }

  private close(): void {
    const field = this.field;
    this.field = undefined;
    this.element = undefined;
    field?.remove();
  }

  private followView(): void {
    if (this.field) this.place();
  }

  /** Over the element, in screen coordinates of the current view, at the current zoom. */
  private place(): void {
    const { field, element } = this;
    if (!field || !element) return;
    const box = this.canvas.getAbsoluteBBox(element);
    const zoom = this.canvas.zoom();
    const padding = STICKY_PADDING * zoom;
    Object.assign(field.style, {
      position: "absolute",
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      fontFamily: FONT.family,
      fontSize: `${FONT.sticky * zoom}px`,
      fontWeight: "500",
      lineHeight: String(FONT.lineHeight),
      padding: `0 ${padding}px`,
    });
    this.centreText();
  }

  /**
   * The typed lines start where the drawn text starts, so nothing jumps when the field opens;
   * typing more keeps the block in the middle of the sticky.
   */
  private centreText(): void {
    const { field, element } = this;
    if (!field || !element) return;
    const drawn = this.elementRegistry.getGraphics(element)?.querySelector(".djs-visual text");
    if (drawn && field.value === element.sticky.text) {
      const zoom = this.canvas.zoom();
      const leading = ((FONT.lineHeight - 1) * FONT.sticky * zoom) / 2;
      const top = drawn.getBoundingClientRect().top - field.getBoundingClientRect().top - 1;
      field.style.paddingTop = `${Math.max(0, top - leading / 2)}px`;
      return;
    }
    const height = field.style.height;
    field.style.paddingTop = "0px";
    field.style.height = "0px";
    const content = field.scrollHeight;
    field.style.height = height;
    const free = Math.max(0, field.clientHeight - content);
    field.style.paddingTop = `${free / 2}px`;
  }
}

/** Shift+Enter keeps a line break; spaces within a line collapse. */
function normalizedText(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}
