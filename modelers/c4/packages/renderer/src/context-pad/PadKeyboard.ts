import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type {
  default as ContextPad,
  ContextPadTarget,
} from "diagram-js/lib/features/context-pad/ContextPad";
import { isKeyOnHiddenTarget } from "../keyboard/CanvasKeys.js";
import { isRelationshipConnection } from "../scene/types.js";
import { PAD_FOCUS_DROPPED_EVENT, type PadFocusDroppedEvent } from "./C4ContextPad.js";

/** The action every entry declares for Enter and Space (`C4ContextPadProvider`). */
export const KEYBOARD_ACTION = "keyboard";

const ENTRY_SELECTOR = ".entry[data-action]";
const PREVIOUS_KEYS = new Set(["ArrowUp", "ArrowLeft"]);
const NEXT_KEYS = new Set(["ArrowDown", "ArrowRight"]);

interface PadCreated {
  readonly target: ContextPadTarget;
  readonly pad: HTMLElement;
}

interface PadOpened {
  readonly current: { readonly html: HTMLElement };
}

/**
 * The context pad by keyboard (guide §5.5's toolbar, Wardley Maps' pad): a toolbar with one tab
 * stop right after the canvas, its entries buttons named by their titles. The arrows move the focus
 * through every entry, across the separators, and wrap; Home and End jump; Enter and Space run the
 * entry's keyboard action; Escape gives the focus back to the canvas and keeps the selection. A
 * pad built anew under a focused entry (an undo, a host's import) focuses the same entry again, or
 * the canvas when the new pad has none.
 */
export default class PadKeyboard {
  static $inject = ["eventBus", "contextPad", "canvas"];

  private dropped: string | undefined;

  constructor(
    eventBus: EventBus,
    private readonly contextPad: ContextPad,
    private readonly canvas: Canvas,
  ) {
    eventBus.on("contextPad.create", (event: PadCreated) => this.decoratePad(event));
    eventBus.on("contextPad.open", (event: PadOpened) => this.decorateEntries(event.current.html));
    eventBus.on(PAD_FOCUS_DROPPED_EVENT, (event: PadFocusDroppedEvent) => this.remember(event));
  }

  private decoratePad({ target, pad }: PadCreated): void {
    pad.setAttribute("role", "toolbar");
    pad.setAttribute("aria-label", toolbarName(target));
    pad.addEventListener("keydown", (event) => this.onKey(event, pad));
  }

  /** diagram-js places the pad a task later; `C4ContextPad` then says whether it runs as a row. */
  private decorateEntries(pad: HTMLElement): void {
    if (!pad.hasAttribute("aria-orientation")) pad.setAttribute("aria-orientation", "vertical");
    const entries = entriesOf(pad);
    for (const entry of entries) {
      entry.setAttribute("role", "button");
      entry.setAttribute("aria-label", entry.title);
      entry.tabIndex = -1;
    }
    const dropped = this.dropped;
    this.dropped = undefined;
    const regained = dropped && entries.find((entry) => entry.dataset.action === dropped);
    const stop = regained || entries[0];
    if (stop) stop.tabIndex = 0;
    if (regained) regained.focus({ preventScroll: true });
    else if (dropped) this.canvas.focus();
  }

  /** The pad that replaces the closed one opens in the same task, if at all. */
  private remember({ action }: PadFocusDroppedEvent): void {
    this.dropped = action;
    queueMicrotask(() => {
      if (this.dropped !== action) return;
      this.dropped = undefined;
      const focused = this.canvas.getContainer().ownerDocument.activeElement;
      if (focused === null || focused.localName === "body") this.canvas.focus();
    });
  }

  private onKey(event: KeyboardEvent, pad: HTMLElement): void {
    if (event.altKey || event.ctrlKey || event.metaKey || isKeyOnHiddenTarget(event)) return;
    const entry = (event.target as Element | null)?.closest?.<HTMLElement>(ENTRY_SELECTOR);
    if (!entry || !pad.contains(entry)) return;
    const entries = entriesOf(pad);
    const index = entries.indexOf(entry);
    const next = this.entryFor(event.key, entries, index);
    if (next) {
      this.stop(event);
      for (const candidate of entries) candidate.tabIndex = candidate === next ? 0 : -1;
      next.focus({ preventScroll: true });
    } else if (event.key === "Escape" || event.key === "Esc") {
      this.stop(event);
      this.canvas.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      this.stop(event);
      if (!event.repeat) this.run(entry, event);
    }
  }

  private entryFor(
    key: string,
    entries: readonly HTMLElement[],
    index: number,
  ): HTMLElement | undefined {
    if (PREVIOUS_KEYS.has(key)) return entries[(index - 1 + entries.length) % entries.length];
    if (NEXT_KEYS.has(key)) return entries[(index + 1) % entries.length];
    if (key === "Home") return entries[0];
    if (key === "End") return entries.at(-1);
    return undefined;
  }

  /**
   * An action that took its entry away (a removal, a delete without confirmation) leaves the focus
   * on `<body>`, where no canvas key acts.
   */
  private run(entry: HTMLElement, event: KeyboardEvent): void {
    const action = entry.dataset.action;
    if (!action) return;
    this.contextPad.triggerEntry(action, KEYBOARD_ACTION, event);
    const focused = this.canvas.getContainer().ownerDocument.activeElement;
    if (focused === null || focused.localName === "body") this.canvas.focus();
  }

  /** Stopped here: no listener further up acts on these keys too. */
  private stop(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }
}

function entriesOf(pad: HTMLElement): HTMLElement[] {
  return [...pad.querySelectorAll<HTMLElement>(ENTRY_SELECTOR)];
}

function toolbarName(target: ContextPadTarget): string {
  if (Array.isArray(target)) return "Selection actions";
  return isRelationshipConnection(target) ? "Relationship actions" : "Element actions";
}
