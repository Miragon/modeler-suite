import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import { toPoint } from "diagram-js/lib/util/Event";

/** Ahead of every other listener of the same event. */
const FIRST = 100_000;

/** After every other listener of the same event. */
const LAST = -100_000;

const PAN_PREFIX = "hand.move";

/**
 * Fired before a command (`preExecute`; `execute` for a redo, which skips it) or an undo
 * (`revert`) changes anything, also for a command nested in another: a listener a change runs
 * inside the command, such as the selection's on a removed shape, then already finds the action.
 */
const COMMAND_STARTS = ["commandStack.preExecute", "commandStack.execute", "commandStack.revert"];

/**
 * The steps after which the handler of the user's input goes on with the diagram: diagram-js's
 * drag after its init, start, drop, cancel and cleanup, and the code that ran a command after it.
 */
const HANDLER_GOES_ON_EVENTS = [
  "drag.init",
  "drag.start",
  "drag.end",
  "drag.cancel",
  "drag.cleanup",
  ...COMMAND_STARTS,
];

/**
 * The drags that hold no element of the diagram, so they are no gesture (contract 1.5,
 * `InteractionSurface`): a palette tool that only waits for its next press (the lasso, the hand)
 * and the pan of the hand tool, which Space held or Ctrl/Cmd and a press start as well. An import
 * leaves them running: the armed tool is still armed, and the pan goes on under the pointer. The
 * palette's connect tool waits for its press as `global-connect`; the connect drag that press
 * starts is a gesture.
 */
const NO_GESTURE_PREFIXES: ReadonlySet<string> = new Set([
  "lasso.selection",
  "hand",
  PAN_PREFIX,
  "global-connect",
]);

interface Point {
  x: number;
  y: number;
}

/** The fields of diagram-js's drag context this service reads. */
interface DragContext {
  prefix: string;
  active?: boolean;
  globalStart: Point;
  localStart: Point;
  payload: { originalEvent?: Event | null };
}

export type GestureListener = (active: boolean) => void;

/**
 * The user's gestures on the canvas: whether one runs (the contract's `interaction`), ending one
 * before an import replaces the elements it holds, and the user's action an import has to wait
 * for.
 *
 * A gesture starts when its drag moves past the threshold (diagram-js activates the drag, a
 * palette create at once) and ends with its drop or its cancel, when diagram-js cleans the drag
 * up: during the drop's own command, and so in the change listener a host imports from, it still
 * runs.
 *
 * A user's action is what the diagram does for one input of the user: a drop, the start of a drag,
 * a keyboard create, a label commit, a key's command, an undo or a redo. It runs from its drop,
 * its drag's start or the start of its first command until the task that handles the input is
 * over, and longer while a step it scheduled for later holds it (`holdAction`), since the input's
 * work goes on after a listener a host imports from: the command after the selection's listener
 * (when it removes a selected shape), diagram-js's start of a drag after it cleared the selection,
 * and the handler after the command (a keyboard create selects the new node and opens its label
 * editor, a press that commits the label editor starts a drag).
 */
export default class Gestures {
  static $inject = ["eventBus", "dragging", "canvas"];

  private gesture: DragContext | null = null;
  /** The drag whose drop is being applied, from its `drag.end` until it has ended. */
  private droppingDrag: DragContext | null = null;
  private actionInTask = false;
  /** From one of `HANDLER_GOES_ON_EVENTS` until the handler of the user's input has returned. */
  private handlerGoesOn = false;
  /** The pan whose own scroll runs, while the hand tool scrolls for its `hand.move.move`. */
  private scrollingPan: DragContext | null = null;
  private readonly actionHolds = new Set<object>();
  private actionWaiters: Array<() => void> = [];
  private readonly listeners = new Set<GestureListener>();

  constructor(
    eventBus: EventBus,
    private readonly dragging: Dragging,
    private readonly canvas: Canvas,
  ) {
    // Registered first, so it runs ahead of the cleanup's listener below, which tells the host
    // that the gesture ended.
    eventBus.on(HANDLER_GOES_ON_EVENTS, FIRST, () => this.noticeHandlerGoesOn());
    // The first `drag.move` comes right after diagram-js activated the drag, once no start
    // listener refused it (a refused start never sets the drag active).
    eventBus.on("drag.move", FIRST, () => this.noticeStart());
    eventBus.on("drag.end", FIRST, () => this.noticeDrop());
    // diagram-js's `Dragging.move` clears the selection right after this event and then sets the
    // drag's cursor: an import from a host's selection listener there would end the drag under
    // it, and the cursor's read throws on the ended drag. First, so a start listener finds the
    // action as well.
    eventBus.on("drag.start", FIRST, () => this.noticeAction());
    // First, so the action counts before any listener inside the command (a host's selection
    // listener on a delete, an undo or a redo) or its change listener imports.
    eventBus.on(COMMAND_STARTS, FIRST, () => this.noticeAction());
    // First, so a cleanup listener that throws cannot keep the gesture running.
    eventBus.on("drag.cleanup", FIRST, () => this.noticeEnd());
    eventBus.on(["drag.ended", "drag.canceled"], FIRST, () => {
      this.droppingDrag = null;
    });
    // Fired at once after each change, since the canvas runs without `deferUpdate`: the import's
    // fit, a host's `setViewState` after it and a fit of the shell each move the view under a pan.
    eventBus.on("canvas.viewbox.changed", () => {
      if (this.dragging.context() !== this.scrollingPan) this.anchorPanToView();
    });
    // The hand tool scrolls by the distance from the pan's start point, which diagram-js rounds to
    // whole diagram units: moved after each of these scrolls, the start point would add the
    // rounding up, and at a zoom above 200 % a slow pointer would not pan at all. The scroll is
    // told apart by its drag, not by a flag: a listener that throws during it ends the pan before
    // the last listener runs, and a flag left set would keep the next pan from re-anchoring.
    eventBus.on(`${PAN_PREFIX}.move`, FIRST, () => {
      this.scrollingPan = this.dragging.context() as DragContext | null;
    });
    eventBus.on(`${PAN_PREFIX}.move`, LAST, () => {
      this.scrollingPan = null;
    });
    // Before diagram-js cancels a running drag on destroy: nothing is called after it, and a step
    // that never runs on the destroyed diagram holds no import.
    eventBus.on("diagram.destroy", FIRST, () => {
      this.listeners.clear();
      this.actionHolds.clear();
      this.settleAction();
    });
  }

  /** Whether a gesture runs: from its start until its drop or cancel. */
  isActive(): boolean {
    return this.gesture !== null;
  }

  /** Called with the new value each time `isActive()` changes; returns the unsubscribe. */
  onChange(listener: GestureListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Ends a running gesture the way Escape does, for an import that is about to replace the
   * elements it holds: diagram-js keeps a drag running across a cleared canvas, and its release
   * would apply a command to removed shapes and throw half-way. A press that has not reached the
   * drag threshold yet ends too. The selection is not restored, since it holds those elements as
   * well. A drag that is no gesture runs on, and so does a drop being applied: its command has
   * run, and a cancel from inside it would pull the drag out from under diagram-js's own end.
   */
  cancel(): void {
    const context = this.dragging.context() as DragContext | null;
    if (!context || NO_GESTURE_PREFIXES.has(context.prefix) || this.dropping(context)) return;
    this.dragging.cancel(false);
  }

  /**
   * While a user's action is being applied, a promise that resolves once it has ended; otherwise
   * `undefined`. An import waits for it, so nothing the action still does finds the elements it
   * works on replaced: diagram-js's own `SelectionBehavior` throws on a moved shape the import
   * removed, a keyboard create would open its label editor on a removed node, a label commit at a
   * press would leave diagram-js to start its drag on one, and a drag's start would go on with a
   * drag the import ended. It resolves once the task of the user's input is over and no step the
   * action scheduled holds it any longer; the import then ends a drag that started, as it ends
   * any gesture.
   */
  actionEnded(): Promise<void> | undefined {
    if (!this.actionRunning()) return undefined;
    return new Promise((resolve) => this.actionWaiters.push(resolve));
  }

  /** Whether a user's action is being applied, without waiting for its end. */
  isActionRunning(): boolean {
    return this.actionRunning();
  }

  /**
   * Keeps the user's action running for a step it scheduled for later (a popup or a label editor
   * that opens after an append), so an import waits until that step has run; returns the release.
   * The step releases it in a `finally` once it has run, when the popup or the editor has opened,
   * never for as long as that stays open: a host waits for no popup, and a hold never released
   * keeps every later import waiting. A step that does not run (the user ended the action first)
   * releases it all the same.
   */
  holdAction(): () => void {
    const hold = {};
    this.actionHolds.add(hold);
    return () => {
      if (this.actionHolds.delete(hold)) this.settleAction();
    };
  }

  /**
   * Runs `teardown` (the modeler's destroy) at once, or, while the handler of the user's input goes
   * on with the diagram, once that handler has returned. A host may destroy the modeler from any
   * listener, and these handlers read the canvas after one: diagram-js's `Dragging.move` clears
   * the selection after a drag's start and reads the drag again, a drop's command runs inside
   * `Dragging.end`, whose `SelectionBehavior` then selects the new node and whose cleanup reads
   * the canvas, the cleanup's listener above tells the host that the gesture ended before
   * diagram-js has let go of the drag, and a keyboard create selects its node and opens its label
   * editor. The teardown fires `diagram.destroy`, on which diagram-js cancels a running drag (a
   * second time, from inside its own cleanup) and the canvas drops its root. The rest of the
   * handler runs on the live diagram, which the teardown then takes down, together with a drag
   * that still runs.
   */
  tearDownAfterHandler(teardown: () => void): void {
    if (this.handlerGoesOn) queueMicrotask(teardown);
    else teardown();
  }

  /**
   * Told apart by its drag, not by a flag: a drop whose cleanup throws keeps diagram-js from
   * announcing its end, and a flag left set would keep every later import from ending a gesture.
   */
  private dropping(context: DragContext): boolean {
    return this.droppingDrag === context && this.dragging.context() === context;
  }

  private actionRunning(): boolean {
    return this.actionInTask || this.actionHolds.size > 0;
  }

  private noticeStart(): void {
    const context = this.dragging.context() as DragContext | null;
    if (this.gesture || !context?.active || NO_GESTURE_PREFIXES.has(context.prefix)) return;
    this.gesture = context;
    this.notify(true);
  }

  private noticeDrop(): void {
    this.droppingDrag = this.dragging.context() as DragContext | null;
    this.noticeAction();
  }

  /**
   * The rest of the task belongs to the action. diagram-js applies a drop, starts a drag (in
   * `Dragging.move`), and runs the command of a click or a key inside the handler of the user's
   * input, so a microtask queued now runs once that handler has returned. Ended there, not by a
   * listener of a later event, which a listener that throws before it would keep from running.
   */
  private noticeAction(): void {
    if (this.actionInTask) return;
    this.actionInTask = true;
    queueMicrotask(() => {
      this.actionInTask = false;
      this.settleAction();
    });
  }

  /** A microtask runs only once the handler of the user's input has returned. */
  private noticeHandlerGoesOn(): void {
    if (this.handlerGoesOn) return;
    this.handlerGoesOn = true;
    queueMicrotask(() => {
      this.handlerGoesOn = false;
    });
  }

  private settleAction(): void {
    if (this.actionRunning()) return;
    for (const resolve of this.actionWaiters.splice(0)) resolve();
  }

  private noticeEnd(): void {
    if (!this.gesture) return;
    this.gesture = null;
    this.notify(false);
  }

  /**
   * A listener that throws is reported, never left to break the drag it runs inside. One that an
   * earlier listener unsubscribed during the same delivery is skipped.
   */
  private notify(active: boolean): void {
    for (const listener of [...this.listeners]) {
      if (!this.listeners.has(listener)) continue;
      try {
        listener(active);
      } catch (error) {
        reportError(error);
      }
    }
  }

  /**
   * A pan keeps the diagram point it started on under the pointer. After a view change the pan did
   * not make, its next move would put the view from before back, undoing the fit of an import or
   * the view a host restores after it (L5). So it starts again from the diagram point that now lies
   * under the pointer (diagram-js keeps that point in the drag's context).
   */
  private anchorPanToView(): void {
    const pan = this.dragging.context() as DragContext | null;
    if (pan?.prefix !== PAN_PREFIX) return;
    const lastMove = pan.active ? pan.payload.originalEvent : undefined;
    const pointer: Point = (lastMove && toPoint(lastMove)) || pan.globalStart;
    const viewbox = this.canvas.viewbox();
    const container = this.canvas.getContainer().getBoundingClientRect();
    pan.localStart = {
      x: viewbox.x + (pointer.x - container.left) / viewbox.scale,
      y: viewbox.y + (pointer.y - container.top) / viewbox.scale,
    };
  }
}
