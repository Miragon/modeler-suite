import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Injector } from 'didi';
import { isNodeShape, type NodeShape } from '../model/di-types.js';
import type DomainModeling from '../modeling/DomainModeling.js';
import { FONT } from '../draw/styles.js';

/** A label edit open right now: the element's id and the text typed so far, not yet committed. */
export interface OpenLabelEdit {
  elementId: string;
  text: string;
}

interface EditLock {
  isReadOnly(): boolean;
}

const FIELD_CLASS = 'diagram-label-editor';

/**
 * In-place label editing. Only the user's own gestures commit (Enter, leaving the field, a click
 * or drag on the canvas), and every commit is one undoable command. What a host does never
 * commits (contract L1, L5): an import takes the open edit down without committing and reopens
 * it on the element with the same id (`suspend`/`resumeAfterImport`), and a view change (a host's
 * `setViewState` or fit, a scroll, a zoom) keeps it open and moves the field along.
 */
export default class LabelEditing {
  static $inject = ['canvas', 'eventBus', 'domainModeling', 'elementRegistry', 'injector'];

  private field: HTMLTextAreaElement | undefined;
  private element: NodeShape | undefined;
  private suspended: OpenLabelEdit | undefined;
  private resumeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly canvas: Canvas,
    eventBus: EventBus,
    private readonly modeling: DomainModeling,
    private readonly elementRegistry: ElementRegistry,
    private readonly injector: Injector,
  ) {
    eventBus.on('element.dblclick', (event: { element?: unknown }) => {
      if (isNodeShape(event.element)) this.activate(event.element);
    });
    eventBus.on(['element.mousedown', 'drag.init'], () => this.complete());
    eventBus.on('canvas.viewbox.changed', () => this.followView());
    // Undo or redo changed the model underneath the field: drop the edit instead of writing it
    // onto an element that may be gone.
    eventBus.on('commandStack.changed', () => this.cancel());
    // Before the canvas goes: a field still open would commit onto the destroyed diagram.
    eventBus.on('diagram.destroy', 1500, () => {
      clearTimeout(this.resumeTimer);
      this.suspended = undefined;
      this.cancel();
    });
  }

  activate(element: NodeShape): boolean {
    if (this.injector.get<EditLock>('readOnly', false)?.isReadOnly()) return false;
    this.complete();
    const field = document.createElement('textarea');
    field.className = FIELD_CLASS;
    field.setAttribute('aria-label', 'Label');
    field.value = element.elementLabel;
    field.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.complete();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.cancel();
        this.canvas.focus();
      }
    });
    field.addEventListener('blur', () => {
      if (this.field === field) this.complete();
    });
    this.field = field;
    this.element = element;
    this.place();
    this.canvas.getContainer().append(field);
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
    const text = field.value.replace(/\s+/g, ' ').trim();
    if (this.elementRegistry.get(element.id) === element) this.modeling.updateLabel(element, text);
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
      if (this.isActive() || !isNodeShape(element) || !this.activate(element)) return;
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
    Object.assign(field.style, {
      position: 'absolute',
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      fontFamily: FONT.family,
      fontSize: `${FONT.size * zoom}px`,
      lineHeight: String(FONT.lineHeight),
    });
  }
}
