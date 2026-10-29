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

/** Behind every other listener of a drag's init: the label commit at a press runs before. */
const LAST = -10_000;

/** Ahead of the host's change listener, which may import. */
const BEFORE_THE_HOST = 10_000;

interface Gesture {
  prefix: string;
  active?: boolean;
}

/** A drag and the release of the user action it keeps running until it has ended. */
interface HeldDrag {
  drag: Gesture;
  release(): void;
}

export type ActiveListener = (active: boolean) => void;

function isArmedTool(gesture: Gesture): boolean {
  return ARMED_TOOL_PREFIXES.has(gesture.prefix);
}

/**
 * A listener runs inside diagram-js's drag or inside an import's cancel: an error it throws would
 * abort that half-way, leave every import waiting for an end that never settles and keep the next
 * listener from hearing the change, so it surfaces on its own instead.
 */
function deliver(listener: ActiveListener, active: boolean): void {
  try {
    listener(active);
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}

/**
 * The user's gestures on the canvas, and the user actions an import waits for.
 *
 * A gesture is a move, connect or lasso drag past the drag threshold, or a create from the palette
 * or the context pad while its preview follows the pointer, also off the canvas. This service tells
 * whether one runs and ends one before the canvas is cleared. A palette tool that only waits for its
 * next press is no gesture, and neither is a pan of the canvas, which runs outside diagram-js's
 * dragging.
 *
 * A user action changes the map, and a host hears that change in its change listener. It runs until
 * it has finished, with the steps it deferred: a drop until its release has run every listener, a
 * press that committed a label at its start until the drag it started has ended, a step such as the
 * subdomain-type menu of an append until it has run (`holdAction`), and any other action until the
 * handler that made the change has returned. An import that waits for `whenActionEnded()` replaces
 * no element the action still works on.
 */
export default class CmGestureCancel {
  static $inject = ["eventBus", "dragging"];

  private ending: HeldDrag | null = null;
  private press: HeldDrag | null = null;
  private startingDrag: Gesture | null = null;
  private cancellingForClear = false;
  private active = false;
  private readonly activeListeners = new Set<ActiveListener>();
  private readonly runningActions = new Set<object>();
  private actionWaiters: Array<() => void> = [];

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
    eventBus.on("drag.init", FIRST, () => {
      this.startingDrag = this.runningGesture();
    });
    eventBus.on("drag.init", LAST, () => {
      this.startingDrag = null;
    });
    eventBus.on("drag.end", BEFORE_THE_DROP, () => this.startEnding());
    // Every drag ends in its cleanup: the drop, Escape, an import and an error in a listener alike.
    // It has ended once its release or key has run all its listeners, `drag.ended` and
    // `drag.canceled` included: the microtask comes after the event that ended it.
    eventBus.on("drag.cleanup", FIRST, () => {
      this.startEnding();
      const drag = this.runningGesture();
      const ending = this.ending;
      const press = this.press?.drag === drag ? this.press : null;
      if (ending || press) {
        queueMicrotask(() => {
          if (ending) this.finishEnding(ending);
          if (press) this.finishPress(press);
        });
      }
      this.startingDrag = null;
      this.setActive(false);
    });
    eventBus.on("commandStack.changed", BEFORE_THE_HOST, () => this.userActionChanged());
    // The scheduler drops its tasks on destroy: an import waiting for one rejects instead.
    eventBus.on("diagram.destroy", () => {
      this.ending = null;
      this.press = null;
      this.runningActions.clear();
      this.settleActions();
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
   * While a user action runs (a drop, an append, a create, a label commit, with the steps they
   * deferred): settles once it has finished. An import that waits for it replaces no element the
   * action still holds; `undefined` while none runs.
   */
  whenActionEnded(): Promise<void> | undefined {
    if (this.runningActions.size === 0) return undefined;
    return new Promise((resolve) => this.actionWaiters.push(resolve));
  }

  /**
   * Keeps the running user action going for a step it deferred to a later task; returns the
   * release, which ends the action once nothing else holds it.
   */
  holdAction(): () => void {
    const action = {};
    this.runningActions.add(action);
    return () => {
      if (this.runningActions.delete(action)) this.settleActions();
    };
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
    if (!gesture || gesture === this.ending?.drag || isArmedTool(gesture)) return;
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

  /**
   * A change of the user's: it belongs to the drag diagram-js starts right now when a listener of
   * the drag's init made it (the label edit a press commits), and to the handler that made it
   * otherwise. An armed palette tool's drag is no action: an import leaves the tool armed.
   */
  private userActionChanged(): void {
    const starting = this.startingDrag;
    if (starting && starting === this.runningGesture() && !isArmedTool(starting)) {
      if (this.press?.drag === starting) return;
      const replaced = this.press;
      this.press = { drag: starting, release: this.holdAction() };
      replaced?.release();
      return;
    }
    queueMicrotask(this.holdAction());
  }

  private startEnding(): void {
    const gesture = this.runningGesture();
    if (!gesture?.active || isArmedTool(gesture) || this.ending?.drag === gesture) return;
    this.ending = { drag: gesture, release: this.holdAction() };
  }

  private finishEnding(ending: HeldDrag): void {
    if (this.ending === ending) this.ending = null;
    ending.release();
  }

  private finishPress(press: HeldDrag): void {
    if (this.press === press) this.press = null;
    press.release();
  }

  private settleActions(): void {
    if (this.runningActions.size > 0) return;
    for (const resolve of this.actionWaiters.splice(0)) resolve();
  }

  private setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    for (const listener of [...this.activeListeners]) deliver(listener, active);
  }

  private runningGesture(): Gesture | null {
    return (this.dragging.context() as Gesture | null | undefined) ?? null;
  }
}
