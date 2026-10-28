import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";

/**
 * The drag of a palette tool that only waits for the user's next press: no gesture yet. It holds
 * no element of the map, so an import leaves the tool armed.
 */
const ARMED_TOOL_PREFIXES: ReadonlySet<string> = new Set(["lasso.selection"]);

/** Ahead of every listener of the drop: one of them runs the command a host may import from. */
const BEFORE_THE_DROP = 10_000;

/** Ahead of every other listener of a drag's move and cleanup, so that they see the new state. */
const FIRST = 10_000;

interface Gesture {
  prefix: string;
  active?: boolean;
}

/** A gesture whose drop or cancel runs, and the promise that settles once it has ended. */
interface Ending {
  gesture: Gesture;
  ended: Promise<void>;
  finish(): void;
}

export type ActiveListener = (active: boolean) => void;

function isArmedTool(gesture: Gesture): boolean {
  return ARMED_TOOL_PREFIXES.has(gesture.prefix);
}

function endingOf(gesture: Gesture): Ending {
  let finish = (): void => undefined;
  const ended = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { gesture, ended, finish };
}

/**
 * The user's gestures on the canvas: a move, connect or lasso drag past the drag threshold, and a
 * create from the palette or the context pad while its preview follows the pointer, also off the
 * canvas. It tells whether one runs, ends one before the canvas is cleared, and tells an import to
 * wait while one ends. A palette tool that only waits for its next press is no gesture, and neither
 * is a pan of the canvas, which runs outside diagram-js's dragging.
 */
export default class CmGestureCancel {
  static $inject = ["eventBus", "dragging"];

  private ending: Ending | null = null;
  private cancellingForClear = false;
  private active = false;
  private readonly activeListeners = new Set<ActiveListener>();

  constructor(
    eventBus: EventBus,
    private readonly dragging: Dragging,
  ) {
    // diagram-js activates a drag in its first move past the threshold, or at once for a create
    // from the palette, and fires that move in the same call.
    eventBus.on("drag.move", FIRST, () => {
      const gesture = this.runningGesture();
      if (gesture?.active && !isArmedTool(gesture)) this.setActive(true);
    });
    eventBus.on("drag.end", BEFORE_THE_DROP, () => this.startEnding());
    // Every drag ends in its cleanup: the drop, Escape, an import and an error in a listener alike.
    // It has ended once its release or key has run all its listeners, `drag.ended` and
    // `drag.canceled` included: the microtask comes after the event that ended it.
    eventBus.on("drag.cleanup", FIRST, () => {
      this.startEnding();
      this.setActive(false);
      const ending = this.ending;
      if (ending) queueMicrotask(() => this.finishEnding(ending));
    });
  }

  /** True from a gesture's start until its drop or cancel. */
  isActive(): boolean {
    return this.active;
  }

  /** Called with the new value each time `isActive()` changes; returns the unsubscribe. */
  onActiveChange(listener: ActiveListener): () => void {
    this.activeListeners.add(listener);
    return () => this.activeListeners.delete(listener);
  }

  /**
   * While a gesture ends (its drop, with the command a host imports from, or its cancel): settles
   * once it has ended and every listener of the event that ended it has run. An import that waits
   * for it replaces no element a listener of the drop still holds, also not one a listener defers
   * to later (the type menu after an append).
   */
  whenGestureEnded(): Promise<void> | undefined {
    return this.ending?.ended;
  }

  /**
   * Cancels the running gesture (a move, connect or lasso drag, a create from the palette or the
   * context pad) and a press that has not reached the drag threshold yet, the way Escape does,
   * before an import or `clear()` empties the canvas, without restoring the selection: it holds
   * the elements that go. A palette tool that only waits for its next press is no gesture and stays
   * armed; the press that starts its drag starts one. A gesture that is ending is left alone: a
   * drop's command has applied, and diagram-js throws when a drag is cancelled from inside its own
   * end or cleanup.
   */
  cancelForClear(): void {
    const gesture = this.runningGesture();
    if (!gesture || gesture === this.ending?.gesture || isArmedTool(gesture)) return;
    this.cancellingForClear = true;
    try {
      this.dragging.cancel(false);
    } finally {
      this.cancellingForClear = false;
    }
  }

  /** True while a clear cancels a gesture: its cleanup must not select what the clear removes. */
  isCancellingForClear(): boolean {
    return this.cancellingForClear;
  }

  private startEnding(): void {
    const gesture = this.runningGesture();
    if (!gesture?.active || isArmedTool(gesture) || this.ending?.gesture === gesture) return;
    this.ending = endingOf(gesture);
  }

  private finishEnding(ending: Ending): void {
    if (this.ending === ending) this.ending = null;
    ending.finish();
  }

  private setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    for (const listener of [...this.activeListeners]) listener(active);
  }

  private runningGesture(): Gesture | null {
    return (this.dragging.context() as Gesture | null | undefined) ?? null;
  }
}
