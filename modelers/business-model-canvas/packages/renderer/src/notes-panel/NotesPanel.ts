import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { BLOCK_TITLES, findSticky, type Note } from "@miragon/business-model-canvas-schema-model";
import { element } from "../dialogs/form.js";
import { CHROME_ICON, lucideIcon } from "../draw/lucide.js";
import { isStickyShape } from "../model/di-types.js";
import type CanvasModeling from "../modeling/CanvasModeling.js";
import type ReadOnly from "../read-only/ReadOnly.js";
import { READ_ONLY_CHANGED_EVENT } from "../read-only/index.js";
import { notesOf, sameScope, type NotesScope } from "./notesScope.js";
import { NOTE_DOT } from "./glyph.js";

interface ServiceSource {
  get<T>(name: string, strict?: boolean): T;
}

/** The shell's inspector slot, typed structurally. */
export interface InspectorSlot {
  readonly element: HTMLElement;
  isOpen(): boolean;
  open(): void;
  close(): void;
}

export interface NotesPanel {
  /** Opens the panel on the notes of one place, with a new note to write when `addNote`. */
  show(scope: NotesScope | undefined, addNote: boolean): void;
  toggle(): void;
  isOpen(): boolean;
  /** The place the panel shows, while it is open. */
  activeScope(): NotesScope | undefined;
  onChange(listener: () => void): void;
}

/** A note being written: kept until it has a text or is discarded, never dropped by a stray click. */
interface Draft {
  scope: NotesScope;
  text: string;
}

interface RenderOptions {
  /** Puts the cursor into the note being written, starting one if there is none. */
  focusDraft?: boolean;
  /** The control that had the focus before the panel was drawn again. */
  focusKey?: string | undefined;
}

function iconButton(icon: "trash" | "x", label: string): HTMLButtonElement {
  const button = element("button", "bmc-dialog-icon-button");
  button.type = "button";
  button.innerHTML = lucideIcon(icon, CHROME_ICON);
  button.setAttribute("aria-label", label);
  button.title = label;
  return button;
}

function noteText(value: string): HTMLTextAreaElement {
  const text = element("textarea", "bmc-panel-text");
  text.rows = 1;
  text.value = value;
  text.placeholder = "Write a note";
  text.setAttribute("aria-label", "Note");
  const grow = () => {
    text.style.height = "auto";
    text.style.height = `${text.scrollHeight}px`;
  };
  text.addEventListener("input", grow);
  requestAnimationFrame(grow);
  return text;
}

function keyOf(target: EventTarget | null): string | undefined {
  return target instanceof HTMLElement ? target.dataset.key : undefined;
}

/**
 * The notes of one place in the shell's inspector: the whole canvas, a block or a sticky. No
 * Apply: a text is written when the field is left or on Enter, each change one undo
 * step. A text cleared and left goes back to what it was; only the bin removes a note.
 */
class NotesPanelView implements NotesPanel {
  private readonly modeling: CanvasModeling;
  private readonly selection: Selection;
  private readonly canvas: Canvas;
  private readonly readOnly: ReadOnly | undefined;
  private scope: NotesScope = { kind: "canvas" };
  private draft: Draft | undefined;
  private writing = false;
  private stale = false;
  private readonly listeners: (() => void)[] = [];

  constructor(
    private readonly slot: InspectorSlot,
    diagram: ServiceSource,
  ) {
    this.modeling = diagram.get<CanvasModeling>("canvasModeling");
    this.selection = diagram.get<Selection>("selection");
    this.canvas = diagram.get<Canvas>("canvas");
    this.readOnly = diagram.get<ReadOnly | undefined>("readOnly", false);
    const eventBus = diagram.get<EventBus>("eventBus");
    eventBus.on(["commandStack.changed", READ_ONLY_CHANGED_EVENT], () => this.documentChanged());
    eventBus.on("selection.changed", (event: { newSelection: unknown[] }) =>
      this.follow(event.newSelection),
    );
    // A change from outside while a field had the focus shows once the focus leaves the panel.
    slot.element.addEventListener("focusout", (event) => {
      const next = event.relatedTarget;
      if (!this.stale || (next instanceof Node && slot.element.contains(next))) return;
      this.stale = false;
      this.render();
    });
  }

  show(scope: NotesScope | undefined, addNote: boolean): void {
    const [selected, ...more] = this.selection.get();
    this.scope =
      scope ??
      (isStickyShape(selected) && more.length === 0
        ? { kind: "sticky", id: selected.id }
        : { kind: "canvas" });
    if (this.draft && !sameScope(this.draft.scope, this.scope)) this.draft = undefined;
    this.slot.open();
    this.render({ focusDraft: addNote });
    this.changed();
  }

  toggle(): void {
    if (this.slot.isOpen()) this.hide();
    else this.show(undefined, false);
  }

  isOpen(): boolean {
    return this.slot.isOpen();
  }

  activeScope(): NotesScope | undefined {
    return this.slot.isOpen() ? this.scope : undefined;
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  private changed(): void {
    this.listeners.forEach((listener) => listener());
  }

  private hide(): void {
    this.slot.close();
    this.draft = undefined;
    this.changed();
  }

  private locked(): boolean {
    return this.readOnly?.isReadOnly() ?? false;
  }

  private documentChanged(): void {
    if (!this.slot.isOpen() || this.writing) return;
    if (this.slot.element.contains(document.activeElement)) this.stale = true;
    else this.render();
  }

  /** The panel follows the one selected sticky, unless a note is half written. */
  private follow(selected: unknown[]): void {
    if (!this.slot.isOpen() || this.draft?.text.trim()) return;
    const [sticky, ...more] = selected;
    if (!isStickyShape(sticky) || more.length > 0) return;
    const next: NotesScope = { kind: "sticky", id: sticky.id };
    if (sameScope(next, this.scope)) return;
    this.scope = next;
    this.draft = undefined;
    this.render();
    this.changed();
  }

  private titleOf(place: NotesScope): string {
    if (place.kind === "canvas") return "Whole canvas";
    if (place.kind === "block") return BLOCK_TITLES[place.blockId];
    const found = findSticky(this.modeling.document(), place.id);
    return found ? `Sticky: ${found.sticky.text}` : "Sticky";
  }

  private current(): Note[] {
    return [...notesOf(this.modeling.document(), this.scope)];
  }

  private write(notes: Note[]): void {
    this.writing = true;
    try {
      this.modeling.setNotes(this.scope, notes);
    } finally {
      this.writing = false;
    }
    this.changed();
  }

  private render({ focusDraft = false, focusKey }: RenderOptions = {}): void {
    const locked = this.locked();
    if (this.scope.kind === "sticky" && !findSticky(this.modeling.document(), this.scope.id)) {
      this.scope = { kind: "canvas" };
    }
    if (locked) this.draft = undefined;
    else if (focusDraft) this.draft ??= { scope: this.scope, text: "" };
    const body = this.slot.element;
    body.replaceChildren();
    body.classList.add("bmc-notes-panel");
    body.append(this.head());
    const { list, draftText } = this.list(locked);
    body.append(list);
    if (!locked) body.append(this.addButton());
    const target = focusDraft
      ? draftText
      : focusKey
        ? body.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)
        : null;
    if (!target) return;
    // At once, so typing right after the click lands in the field, and once more after the frame
    // for a host that moves the focus on the click itself.
    target.focus();
    requestAnimationFrame(() => {
      if (document.activeElement !== target && target.isConnected) target.focus();
    });
  }

  private head(): HTMLElement {
    const head = element("div", "bmc-panel-head");
    const close = iconButton("x", "Close notes");
    close.addEventListener("click", () => {
      this.hide();
      this.canvas.focus();
    });
    const titles = element("div", "bmc-panel-titles");
    titles.append(
      element("h2", "bmc-panel-title", "Notes"),
      element("p", "bmc-panel-place", this.titleOf(this.scope)),
    );
    head.append(titles, close);
    return head;
  }

  private list(locked: boolean): { list: HTMLElement; draftText: HTMLTextAreaElement | undefined } {
    const list = element("div", "bmc-panel-list");
    const notes = notesOf(this.modeling.document(), this.scope);
    notes.forEach((note, index) =>
      list.append(locked ? this.readRow(note) : this.savedRow(index, note)),
    );
    let draftText: HTMLTextAreaElement | undefined;
    if (this.draft && sameScope(this.draft.scope, this.scope)) {
      const { row, text } = this.draftRow(this.draft);
      list.append(row);
      draftText = text;
    }
    if (notes.length === 0 && !draftText) {
      const place = this.scope.kind === "sticky" ? "this sticky" : this.titleOf(this.scope);
      list.append(
        element("p", "bmc-panel-empty", locked ? "No notes here." : `No notes on ${place} yet.`),
      );
    }
    return { list, draftText };
  }

  private addButton(): HTMLButtonElement {
    const add = element("button", "bmc-dialog-button bmc-panel-add");
    add.type = "button";
    add.dataset.variant = "secondary";
    add.dataset.key = "add";
    add.innerHTML = `${lucideIcon("plus", CHROME_ICON)}<span>Add note</span>`;
    add.addEventListener("click", () => this.render({ focusDraft: true }));
    return add;
  }

  private readRow(note: Note): HTMLElement {
    const row = element("div", "bmc-panel-note");
    row.insertAdjacentHTML("beforeend", NOTE_DOT);
    row.append(element("div", "bmc-panel-note-read", note.text));
    return row;
  }

  private savedRow(index: number, note: Note): HTMLElement {
    const row = element("div", "bmc-panel-note");
    const remove = iconButton("trash", "Delete note");
    const text = noteText(note.text);
    remove.dataset.key = `remove-${index}`;
    text.dataset.key = `text-${index}`;
    text.addEventListener("blur", () => this.commitText(index, text));
    text.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        text.blur();
      } else if (event.key === "Escape") {
        event.stopPropagation();
        text.value = this.current()[index]?.text ?? text.value;
        text.blur();
      }
    });
    remove.addEventListener("click", () => {
      this.write(this.current().filter((_, at) => at !== index));
      this.render({ focusKey: "add" });
    });
    row.insertAdjacentHTML("beforeend", NOTE_DOT);
    row.append(text, remove);
    return row;
  }

  private commitText(index: number, text: HTMLTextAreaElement): void {
    const notes = this.current();
    const before = notes[index];
    if (!before) return;
    const written = text.value.trim();
    if (written === "") {
      text.value = before.text;
      return;
    }
    if (before.text === written) return;
    notes[index] = { ...before, text: written };
    this.write(notes);
  }

  private draftRow(open: Draft): { row: HTMLElement; text: HTMLTextAreaElement } {
    const row = element("div", "bmc-panel-note bmc-panel-note-draft");
    const remove = iconButton("trash", "Discard note");
    const text = noteText(open.text);
    text.addEventListener("input", () => (open.text = text.value));
    text.addEventListener("blur", (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && row.contains(next)) return;
      if (this.saveDraft(open)) this.render({ focusKey: keyOf(next) });
    });
    text.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (this.saveDraft(open)) this.render({ focusDraft: true });
      } else if (event.key === "Escape") {
        event.stopPropagation();
        this.draft = undefined;
        this.render({ focusKey: "add" });
      }
    });
    remove.addEventListener("click", () => {
      this.draft = undefined;
      this.render({ focusKey: "add" });
    });
    row.insertAdjacentHTML("beforeend", NOTE_DOT);
    row.append(text, remove);
    return { row, text };
  }

  /** Writes the note being written, once it has a text; an empty one stays open. */
  private saveDraft(open: Draft): boolean {
    const written = open.text.trim();
    if (written === "" || this.draft !== open) return false;
    this.draft = undefined;
    this.write([...this.current(), { text: written, attributes: [] }]);
    return true;
  }
}

export function mountNotesPanel(slot: InspectorSlot, diagram: ServiceSource): NotesPanel {
  return new NotesPanelView(slot, diagram);
}
