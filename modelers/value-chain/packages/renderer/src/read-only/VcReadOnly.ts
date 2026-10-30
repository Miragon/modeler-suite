import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";

/**
 * Fired with `{ readOnly, shown }` whenever the lock changes, and once more when the marks of a lock
 * set with `delayMs` show.
 */
export const READ_ONLY_CHANGED_EVENT = "valueChain.readOnly.changed";

export interface VcReadOnlyOptions {
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
  "elements.align",
  "elements.distribute",
];

interface Closable {
  close(): void;
}

interface Cancellable {
  cancel(): void;
}

/**
 * Locks every edit on the canvas while the document behind it cannot be saved from the canvas
 * (an invalid file in an IDE host, guide §13.5): the rules veto move, resize, create, connect,
 * reconnect, waypoints, delete, align and distribute; paste, the label editor and the context pad
 * stay shut, and the editing keys and tools check `isReadOnly()`. Selection, lasso, hand, zoom,
 * copy and export keep working. Guide §13.5 shows the lock of an invalid import only after 800ms
 * without a valid one, so typing beside the canvas does not flicker: `delayMs` holds back the
 * palette's marks (`isReadOnlyShown()`), as the shell's `setReadOnly` does.
 */
export default class VcReadOnly extends RuleProvider {
  static override $inject = ["eventBus", "injector"];

  private readOnly = false;
  private shown = false;
  private showTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly bus: EventBus,
    private readonly injector: Injector,
  ) {
    super(bus);
    bus.on("copyPaste.pasteElements", LOCK_PRIORITY, () => (this.readOnly ? false : undefined));
    bus.on("directEditing.activate.allowed", LOCK_PRIORITY, () =>
      this.readOnly ? false : undefined,
    );
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
  setReadOnly(readOnly: boolean, options?: VcReadOnlyOptions): void {
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
    if (locking) this.interruptEdits();
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

  /** What was already under way when the lock arrived must not land on the locked canvas. */
  private interruptEdits(): void {
    const optional = <T>(name: string): T | undefined => this.injector.get<T>(name, false);
    optional<Cancellable>("directEditing")?.cancel();
    optional<Cancellable>("dragging")?.cancel();
    optional<Closable>("popupMenu")?.close();
    optional<Closable>("contextPad")?.close();
  }
}
