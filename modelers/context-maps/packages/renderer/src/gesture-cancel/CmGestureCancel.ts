import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";

/**
 * The drag of a palette tool that only waits for the user's next press: no gesture yet. It holds
 * no element of the map, so an import leaves the tool armed.
 */
const ARMED_TOOL_PREFIXES: ReadonlySet<string> = new Set(["lasso.selection"]);

/** Ahead of every listener of the drop: one of them runs the command a host may import from. */
const BEFORE_THE_DROP = 10_000;

/**
 * Ahead of every other listener of a drag's start, move and cleanup and of a command's start, so
 * that they see the new state.
 */
const FIRST = 10_000;

/** Behind every other listener of a drag's move. */
const LAST = -10_000;

/**
 * Fired before a command or a redo (`execute`) and an undo (`revert`) change the map, so before a
 * listener inside it (the selection's, as diagram-js deselects what it removes) hears anything.
 * Emptying the history on an import fires neither.
 */
const COMMAND_STARTS = ["commandStack.execute", "commandStack.revert"];

interface Gesture {
  prefix: string;
  active?: boolean;
}

/** A gesture whose drop or cancel runs, and the release of the user action it keeps running. */
interface Ending {
  gesture: Gesture;
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
 * A user action changes the map or starts a drag, and a host hears it in a listener: its change
 * listener, or its selection listener inside a delete, an undo or a redo, or at a drag's start. It
 * runs until it has finished, with the steps it deferred: a drop until its release has run every
 * listener, a step such as the subdomain-type menu of an append until it has run (`holdAction`),
 * any other command, undo or redo from its start until the handler that ran it has returned, and a
 * drag's activation inside diagram-js's `Dragging.move` until every `drag.move` listener of its
 * first move has run (the notation's `<prefix>.move` listeners follow, and no host listener fires
 * from them). An import that waits for `whenActionEnded()` runs a microtask after the action and
 * replaces no element the action still works on. The drag that a press starts after it committed a
 * label, and the drag whose activation the import waited for, are gestures, not part of the
 * action: the import ends them, as an accepted import ends every running gesture.
 */
export default class CmGestureCancel {
  static $inject = ["eventBus", "dragging"];

  private ending: Ending | null = null;
  private cancellingForClear = false;
  private active = false;
  private readonly activeListeners = new Set<ActiveListener>();
  private readonly runningActions = new Set<object>();
  private actionWaiters: Array<() => void> = [];
  private endActivation: () => void = () => undefined;
  /** From a drag's `drag.start` until the handler that activated the drag has returned. */
  private handlerActivatesDrag = false;

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
      const ending = this.ending;
      if (ending) queueMicrotask(() => this.finishEnding(ending));
      this.setActive(false);
    });
    // A command, an undo or a redo runs inside the handler of the user's action, which goes on
    // after it: it selects the appended context, opens the name editor, lets a press start its
    // drag. A listener inside the command, the selection's, hears it before the command has
    // finished. The action has finished once that handler has returned.
    eventBus.on(COMMAND_STARTS, FIRST, () => queueMicrotask(this.holdAction()));
    // diagram-js activates a drag inside `Dragging.move`: it fires the start, deselects, which a
    // host may import from, then fires the first move, whose listener above tells the host that a
    // gesture runs, and reads the drag's state throughout: an import inside that would end the
    // drag under it. The hold ends once every `drag.move` listener of that first move has run, at
    // the latest once the handler that moved the pointer has returned. diagram-js then still fires
    // `<prefix>.move` (`shape.move.move`, `create.move`), from which no host listener fires. An
    // import that waited for the hold runs a microtask later, after `move` has returned, and ends
    // the drag like every running gesture.
    eventBus.on("drag.start", FIRST, () => {
      this.endActivation = this.holdAction();
      queueMicrotask(this.endActivation);
      this.noteDragActivation();
    });
    eventBus.on("drag.move", LAST, () => this.endActivation());
    // The scheduler drops its tasks on destroy: an import waiting for one rejects instead.
    eventBus.on("diagram.destroy", () => {
      this.ending = null;
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
   * While a user action runs (a drop, an append, a create, a label commit, a delete, an undo, a
   * redo, a drag's activation, with the steps they deferred): settles once it has finished. An
   * import that waits for it replaces no element the action still holds; `undefined` while none
   * runs.
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
   * Runs `teardown` (the modeler's destroy) at once, or, while diagram-js activates a drag, once
   * the handler that activates it has returned. diagram-js cancels a running drag on destroy, and
   * between the drag's start and its first move it deselects and then reads the drag's context
   * again: a destroy from a selection listener there made `Dragging.move` throw `Cannot read
   * properties of null (reading 'cursor')`. The first move, whose interaction listener may destroy
   * as well, and the rest of the handler (a palette entry's, a context pad entry's) still run on
   * the live map, which the teardown then takes down with the drag.
   */
  tearDownAfterActivation(teardown: () => void): void {
    if (this.handlerActivatesDrag) queueMicrotask(teardown);
    else teardown();
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

  /** diagram-js activates a drag inside the handler of the user's input, which a microtask follows. */
  private noteDragActivation(): void {
    if (this.handlerActivatesDrag) return;
    this.handlerActivatesDrag = true;
    queueMicrotask(() => {
      this.handlerActivatesDrag = false;
    });
  }

  private startEnding(): void {
    const gesture = this.runningGesture();
    if (!gesture?.active || isArmedTool(gesture) || this.ending?.gesture === gesture) return;
    this.ending = { gesture, release: this.holdAction() };
  }

  private finishEnding(ending: Ending): void {
    if (this.ending === ending) this.ending = null;
    ending.release();
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
