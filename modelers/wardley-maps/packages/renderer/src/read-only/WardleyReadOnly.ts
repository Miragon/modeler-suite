import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";

/**
 * Fired with `{ readOnly, shown, reasons }` whenever a reason of the lock comes or goes, and once
 * more when the marks of a document lock set with `delayMs` show.
 */
export const READ_ONLY_CHANGED = "wardley.readOnly.changed";

/**
 * Why the canvas is locked: `"document"` while the host cannot save the map (`setReadOnly`),
 * `"explore"` while explore mode shows the map step by step (`setExploreLock`).
 */
export type WardleyLockReason = "document" | "explore";

/** The payload of `READ_ONLY_CHANGED`. */
export interface WardleyReadOnlyChangedEvent {
  /** Whether any reason locks the canvas. */
  readOnly: boolean;
  /** Whether the palette marks the document lock (`isReadOnlyShown()`). */
  shown: boolean;
  /** Every reason that holds, in the order of `WardleyLockReason`. */
  reasons: WardleyLockReason[];
}

export interface WardleyReadOnlyOptions {
  /** How long the palette's marks of the lock wait (default 0); the lock itself holds at once. */
  delayMs?: number | undefined;
}

const LOCK_REASONS: readonly WardleyLockReason[] = ["document", "explore"];

/** On the viewer container while the document is locked: the CSS hides the editing handles. */
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
 *
 * Explore mode locks the canvas for a reason of its own (`setExploreLock`), so the host's
 * `setReadOnly(false)` on every valid import never ends it, and the end of explore mode never
 * lifts the lock of an invalid file. Only the document lock marks the palette and the container.
 */
export default class WardleyReadOnly extends RuleProvider {
  static override $inject = ["eventBus", "canvas", "injector"];

  private readonly reasons = new Set<WardleyLockReason>();
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
    // `this.reasons` is read when a rule runs; the field is not initialized yet while init() runs.
    this.addRule(EDIT_RULES, VETO_PRIORITY, () => (this.isReadOnly() ? false : undefined));
  }

  /** Whether any reason locks the canvas. */
  isReadOnly(): boolean {
    return this.reasons.size > 0;
  }

  /** Whether `reason` holds, whatever else locks the canvas. */
  isLockedBy(reason: WardleyLockReason): boolean {
    return this.reasons.has(reason);
  }

  /**
   * Whether the palette marks the document lock: from `setReadOnly(true)` on, or once its `delayMs`
   * passed. The explore lock never shows.
   */
  isReadOnlyShown(): boolean {
    return this.shown;
  }

  /**
   * The document lock. `true` locks at once and shows the palette's marks after `delayMs` (default
   * 0); a call while the delay runs keeps its timer, as typing sends one invalid import after the
   * other. `false` unlocks and takes the marks off at once; the explore lock stays.
   */
  setReadOnly(readOnly: boolean, options?: WardleyReadOnlyOptions): void {
    if (!readOnly) {
      this.stopShowTimer();
      if (!this.reasons.has("document")) return;
      this.reasons.delete("document");
      this.shown = false;
      this.outerContainer().classList.remove(LOCKED_CLASS);
      this.announce();
      return;
    }
    const locking = !this.reasons.has("document");
    if (locking) {
      this.outerContainer().classList.add(LOCKED_CLASS);
      this.addReason("document");
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

  /** The lock of explore mode, which neither marks the palette nor ends with `setReadOnly(false)`. */
  setExploreLock(locked: boolean): void {
    if (locked === this.reasons.has("explore")) return;
    if (locked) this.addReason("explore");
    else this.reasons.delete("explore");
    this.announce();
  }

  private addReason(reason: WardleyLockReason): void {
    const unlocked = !this.isReadOnly();
    this.reasons.add(reason);
    if (unlocked) this.endInteractions();
  }

  private announce(): void {
    const event: WardleyReadOnlyChangedEvent = {
      readOnly: this.isReadOnly(),
      shown: this.shown,
      reasons: LOCK_REASONS.filter((reason) => this.reasons.has(reason)),
    };
    this.bus.fire(READ_ONLY_CHANGED, event);
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
