import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";

/**
 * Fired with `{ readOnly, shown }` whenever the lock changes, and once more when the marks of a lock
 * set with `delayMs` show.
 */
export const READ_ONLY_CHANGED = "wardley.readOnly.changed";

export interface WardleyReadOnlyOptions {
  /** How long the palette's marks of the lock wait (default 0); the lock itself holds at once. */
  delayMs?: number | undefined;
}

/** On the viewer container while locked: the CSS hides the editing handles. */
const LOCKED_CLASS = "wardley-read-only";

/** Ahead of every rule of the notation, so nothing can allow what the lock forbids. */
const VETO_PRIORITY = 5000;

const EDIT_RULES = [
  "elements.move",
  "shape.move",
  "shape.create",
  "elements.create",
  "shape.resize",
  "shape.append",
  "shape.replace",
  "connection.start",
  "connection.create",
  "connection.reconnect",
  "connection.reconnectStart",
  "connection.reconnectEnd",
  "connection.updateWaypoints",
  "elements.delete",
];

interface Closable {
  close(): void;
}

interface Cancellable {
  cancel(): void;
}

/**
 * Locks every edit on the canvas while a host cannot save what the canvas would change: an
 * invalid file in an IDE shows the last valid map read-only until the text is valid again (guide
 * §13.5). The rules veto move, resize, create, connect and delete; the context pad, the label,
 * link and colour editors, the evolve, label and drawing handles, the map-size handles, the draw
 * tool and the edit keys ask `isReadOnly()`. Selection, zoom, pan, copy and export stay. Guide
 * §13.5 shows the lock of an invalid import only after 800ms without a valid one, so typing beside
 * the canvas does not flicker: `delayMs` holds back the palette's marks (`isReadOnlyShown()`), as
 * the shell's `setReadOnly` does.
 */
export default class WardleyReadOnly extends RuleProvider {
  static override $inject = ["eventBus", "canvas", "injector"];

  private locked = false;
  private shown = false;
  private showTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly bus: EventBus,
    private readonly canvas: Canvas,
    private readonly injector: Injector,
  ) {
    super(bus);
    bus.on("diagram.destroy", () => this.stopShowTimer());
  }

  override init(): void {
    // `this.locked` is read when a rule runs; the field is not initialized yet while init() runs.
    this.addRule(EDIT_RULES, VETO_PRIORITY, () => (this.locked ? false : undefined));
  }

  isReadOnly(): boolean {
    return this.locked;
  }

  /** Whether the palette marks the lock: from `setReadOnly(true)` on, or once its `delayMs` passed. */
  isReadOnlyShown(): boolean {
    return this.shown;
  }

  /**
   * `true` locks at once and shows the palette's marks after `delayMs` (default 0); a call while the
   * delay runs keeps its timer, as typing sends one invalid import after the other. `false` unlocks
   * and takes the marks off at once.
   */
  setReadOnly(readOnly: boolean, options?: WardleyReadOnlyOptions): void {
    if (!readOnly) {
      this.stopShowTimer();
      if (!this.locked) return;
      this.locked = false;
      this.shown = false;
      this.outerContainer().classList.remove(LOCKED_CLASS);
      this.announce();
      return;
    }
    const locking = !this.locked;
    if (locking) {
      this.locked = true;
      this.outerContainer().classList.add(LOCKED_CLASS);
      this.endInteractions();
    }
    const delayMs = options?.delayMs ?? 0;
    const shownOrWaiting = this.shown || this.showTimer !== undefined;
    if (!shownOrWaiting && delayMs > 0) {
      this.showTimer = setTimeout(() => {
        this.showTimer = undefined;
        this.shown = true;
        this.announce();
      }, delayMs);
    }
    const showsNow = !shownOrWaiting && !(delayMs > 0);
    if (showsNow) this.shown = true;
    if (locking || showsNow) this.announce();
  }

  private announce(): void {
    this.bus.fire(READ_ONLY_CHANGED, { readOnly: this.locked, shown: this.shown });
  }

  private stopShowTimer(): void {
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
  }

  /** Whatever is open or running would otherwise still change the map. */
  private endInteractions(): void {
    this.injector.get<Cancellable | null>("dragging", false)?.cancel();
    for (const name of ["contextPad", "popupMenu", "wardleyColorPicker"]) {
      this.injector.get<Closable | null>(name, false)?.close();
    }
    for (const name of ["wardleyLabelEditing", "wardleyLinkEditing", "wardleyDrawTool"]) {
      this.injector.get<Cancellable | null>(name, false)?.cancel();
    }
  }

  private outerContainer(): HTMLElement {
    const container = this.canvas.getContainer();
    return (container.closest(".wardley-container") as HTMLElement | null) ?? container;
  }
}
