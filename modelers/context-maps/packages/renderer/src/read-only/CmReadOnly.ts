import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import type EventBus from "diagram-js/lib/core/EventBus";

/**
 * Fired with `{ readOnly, shown }` whenever the lock changes, and once more when the marks of a lock
 * set with `delayMs` show.
 */
export const READ_ONLY_CHANGED_EVENT = "cm.readOnly.changed";

export interface CmReadOnlyOptions {
  /** How long the palette's marks of the lock wait (default 0); the lock itself holds at once. */
  delayMs?: number | undefined;
}

/** Above every edit rule of the renderer and diagram-js, so the lock wins. */
const LOCK_PRIORITY = 5000;

const EDIT_RULES = [
  "elements.move",
  "shape.move",
  "shape.resize",
  "shape.create",
  "elements.create",
  "shape.append",
  "connection.start",
  "connection.create",
  "connection.reconnect",
  "connection.updateWaypoints",
  "elements.delete",
];

/**
 * Locks every edit on the canvas while the document behind it cannot be saved from the canvas
 * (an invalid file in an IDE host, guide §13.5): no move, create, connect or delete through the
 * rules, and the keyboard, context pad, connect handles and label editor consult `isReadOnly()`.
 * Selection, zoom, pan and export stay. Guide §13.5 shows the lock of an invalid import only after
 * 800ms without a valid one, so typing beside the canvas does not flicker: `delayMs` holds back the
 * palette's marks (`isReadOnlyShown()`), as the shell's `setReadOnly` does.
 */
export default class CmReadOnly extends RuleProvider {
  static override $inject = ["eventBus"];

  private readOnly = false;
  private shown = false;
  private showTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly bus: EventBus) {
    super(bus);
    bus.on("diagram.destroy", () => this.stopShowTimer());
  }

  override init(): void {
    this.addRule(EDIT_RULES, LOCK_PRIORITY, () => (this.readOnly ? false : undefined));
  }

  isReadOnly(): boolean {
    return this.readOnly;
  }

  /** Whether the palette marks the lock: from `setReadOnly(true)` on, or once its `delayMs` passed. */
  isReadOnlyShown(): boolean {
    return this.shown;
  }

  /**
   * `true` locks at once and shows the palette's marks after `delayMs` (default 0); a call while the
   * lock holds keeps it as it is, so the timer of the first of the invalid imports that typing sends
   * one after the other runs on. `false` unlocks and takes the marks off at once.
   */
  setReadOnly(readOnly: boolean, options?: CmReadOnlyOptions): void {
    if (!readOnly) {
      this.stopShowTimer();
      if (!this.readOnly) return;
      this.readOnly = false;
      this.shown = false;
      this.announce();
      return;
    }
    if (this.readOnly) return;
    this.readOnly = true;
    const delayMs = options?.delayMs ?? 0;
    if (delayMs > 0) {
      this.showTimer = setTimeout(() => {
        this.showTimer = undefined;
        this.shown = true;
        this.announce();
      }, delayMs);
    } else {
      this.shown = true;
    }
    this.announce();
  }

  private announce(): void {
    this.bus.fire(READ_ONLY_CHANGED_EVENT, { readOnly: this.readOnly, shown: this.shown });
  }

  private stopShowTimer(): void {
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
  }
}
