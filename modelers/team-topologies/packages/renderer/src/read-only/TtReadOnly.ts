/**
 * Locks every edit on the canvas while the document behind it cannot be saved from the canvas (an
 * invalid file in an IDE host, guide §13.5): otherwise a change on the canvas would overwrite the
 * text the user is fixing. The rules veto move, resize, create, connect and delete; the keyboard,
 * the context pad and the label editor ask `isReadOnly()`, because rules alone do not stop a
 * context pad from opening or a double-click from opening the label editor. Selection, zoom, pan,
 * copy and export stay. Guide §13.5 shows the lock of an invalid import only after 800ms without a
 * valid one, so typing beside the canvas does not flicker: `delayMs` holds back the palette's marks
 * (`isReadOnlyShown()`), as the shell's `setReadOnly` does.
 */

import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import type EventBus from "diagram-js/lib/core/EventBus";

/**
 * Fired with `{ readOnly, shown }` whenever the lock changes, and once more when the marks of a lock
 * set with `delayMs` show.
 */
export const READ_ONLY_CHANGED_EVENT = "tt.readOnly.changed";

export interface TtReadOnlyOptions {
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

export default class TtReadOnly extends RuleProvider {
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
   * delay runs keeps its timer, as typing sends one invalid import after the other. `false` unlocks
   * and takes the marks off at once.
   */
  setReadOnly(readOnly: boolean, options?: TtReadOnlyOptions): void {
    if (!readOnly) {
      this.stopShowTimer();
      if (!this.readOnly) return;
      this.readOnly = false;
      this.shown = false;
      this.announce();
      return;
    }
    const locking = !this.readOnly;
    this.readOnly = true;
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
    this.bus.fire(READ_ONLY_CHANGED_EVENT, { readOnly: this.readOnly, shown: this.shown });
  }

  private stopShowTimer(): void {
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
  }
}
