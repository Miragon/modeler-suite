import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";

/** Ahead of every other listener of the same event. */
const FIRST = 100_000;

/** Behind every other listener of the same event, so that it sees what they asked for. */
const LAST = -100_000;

/**
 * `execute` comes before each command and each redo changes the board, nested commands included,
 * `revert` before each undo, `changed` once the outermost of them has run.
 */
const COMMAND_EVENTS = ["commandStack.execute", "commandStack.revert", "commandStack.changed"];

/**
 * The steps after which the handler of the user's input goes on with the board: diagram-js's drag
 * after its init, start, drop, cancel and cleanup, and the code that ran a command after it.
 */
const HANDLER_GOES_ON_EVENTS = [
  "drag.init",
  "drag.start",
  "drag.end",
  "drag.cancel",
  "drag.cleanup",
  ...COMMAND_EVENTS,
];

/**
 * The drags of a palette tool that only waits for its next press: they hold no element of the
 * board, so they are no gesture, and an import leaves the tool armed.
 */
export const ARMED_TOOL_PREFIXES: ReadonlySet<string> = new Set(["lasso.selection"]);

export interface DragContext {
  prefix: string;
  active?: boolean;
}

export type GestureListener = (active: boolean) => void;

/**
 * What the user holds on the canvas, and the action that changes the board (modeler-api 1.5).
 *
 * A gesture runs from the moment diagram-js activates a drag (a move, resize, connect or lasso
 * past the threshold, or at once for a create, an append, a paste and the connect of the context
 * pad, also while its preview is still off the canvas) until it has ended or was cancelled, and
 * while a drawing's point drag moves. A palette tool that only waits for its next press is no
 * gesture, and neither is a pan: diagram-js's `MoveCanvas` pans outside the dragging service.
 *
 * A user action runs from the start of a command (`commandStack.execute`, or `revert` for an
 * undo: a keyboard create, a label commit, also one a press makes, a delete, an undo, a redo)
 * until the handler that ran it has returned, while diagram-js activates a drag (from its
 * `drag.start` until `Dragging.move` has returned), during a drop (from diagram-js's `drag.end`
 * until `drag.ended` or `drag.canceled`, a drawing's point drop while its command applies), and
 * for as long as a step it scheduled holds it (`holdAction`: the kind chooser or the label editor
 * that opens after an append). An import called meanwhile, from a host's change or selection
 * listener, waits for `actionEnded()`, so no step of the action finds the board replaced (#248,
 * #305, #336).
 *
 * A drag runs its `drag.init` before diagram-js activates it. An import or a clear called from a
 * listener of that init (a host that imports from the change listener of the label editor that
 * commits there) asks for `refuseStart()`, and the drag ends before it activates. One called while
 * the drag activates (from a selection listener: the activation clears the selection) asks for
 * `endOnceActivated()`, and the drag ends as cancelled at the activation's last step, its first
 * move.
 */
export default class EventStormingGestures {
  static $inject = ["eventBus", "dragging"];

  private readonly listeners = new Set<GestureListener>();
  private reported = false;
  private diagramGesture: DragContext | null = null;
  private readonly ownGestures = new Set<object>();
  private droppingDrag: DragContext | null = null;
  private readonly actionHolds = new Set<object>();
  private commandHold: (() => void) | undefined;
  private actionWaiters: (() => void)[] = [];
  private startingDrag: DragContext | null = null;
  private startRefused = false;
  private activatingDrag: DragContext | null = null;
  private activationEndAsked = false;
  /** From one of `HANDLER_GOES_ON_EVENTS` or a gesture's start or end until its handler returned. */
  private handlerGoesOn = false;

  constructor(
    eventBus: EventBus,
    private readonly dragging: Dragging,
  ) {
    // The first move of a drag comes right after diagram-js activated it, so a start that a
    // listener refused never counts. It is the last step of the activation: a drag whose end was
    // asked meanwhile ends here, and its move reaches no listener, since a clear may have removed
    // the shapes it holds.
    eventBus.on("drag.move", FIRST, () => {
      const context = this.dragContext();
      if (context && context === this.activatingDrag && this.finishActivation()) {
        this.dragging.cancel(false);
        return false;
      }
      if (!context?.active || ARMED_TOOL_PREFIXES.has(context.prefix)) return undefined;
      if (this.diagramGesture === context) return undefined;
      this.diagramGesture = context;
      this.update();
      return undefined;
    });
    eventBus.on(["drag.ended", "drag.canceled"], FIRST, () => this.endDiagramGesture());
    // A listener that throws during the cleanup keeps diagram-js from announcing the end.
    eventBus.on("drag.cleanup", FIRST, () => {
      const ending = this.dragContext();
      setTimeout(() => {
        if (ending && this.diagramGesture === ending) this.endDiagramGesture();
      }, 0);
    });

    eventBus.on("drag.init", FIRST, () => {
      this.startingDrag = this.dragContext();
      this.startRefused = false;
    });
    // Refused here, diagram-js ends the drag before it activates, so nothing of it runs on the
    // shapes the import removed.
    eventBus.on("drag.init", LAST, () => {
      const refused = this.startRefused && this.dragContext() === this.startingDrag;
      this.startingDrag = null;
      this.startRefused = false;
      return refused ? false : undefined;
    });

    // diagram-js clears the selection while it activates a drag, then reads the drag's context
    // again: a drag ended from a selection listener there makes `Dragging.move` throw.
    eventBus.on("drag.start", FIRST, () => this.holdActivation());
    eventBus.on(HANDLER_GOES_ON_EVENTS, FIRST, () => this.noteHandlerGoesOn());

    eventBus.on("drag.end", FIRST, () => {
      const dropping = this.dragContext();
      this.droppingDrag = dropping;
      // The drop runs within the release's task; a listener that throws keeps its end unannounced.
      setTimeout(() => {
        if (this.droppingDrag === dropping) this.endDiagramDrop();
      }, 0);
    });
    eventBus.on(["drag.ended", "drag.canceled"], FIRST, () => this.endDiagramDrop());

    // A listener inside the command (a selection listener on the removal of a delete or an undo)
    // runs before the command has finished, and the handler that ran the command goes on after it
    // (a keyboard create selects its sticky and opens the editor, a press that committed a label
    // starts its drag). A microtask runs only once that handler has returned.
    eventBus.on(COMMAND_EVENTS, FIRST, () => this.holdCommand());

    // An import waiting for the action then finds the viewer destroyed and rejects.
    eventBus.on("diagram.destroy", () => {
      this.droppingDrag = null;
      this.activatingDrag = null;
      this.activationEndAsked = false;
      this.commandHold = undefined;
      this.actionHolds.clear();
      this.settleAction();
    });
  }

  /** Whether the user holds a gesture right now. */
  isActive(): boolean {
    return this.reported;
  }

  /** Called with the new value each time `isActive()` changes; returns the unsubscribe. */
  onChange(listener: GestureListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A gesture of the renderer's own, outside diagram-js's dragging; returns its end. */
  beginGesture(): () => void {
    const gesture = {};
    this.ownGestures.add(gesture);
    this.update();
    return () => {
      if (this.ownGestures.delete(gesture)) this.update();
    };
  }

  /** Whether `context` is the drag diagram-js initializes right now, inside its `drag.init`. */
  isStarting(context: unknown): boolean {
    return context !== null && context === this.startingDrag;
  }

  /** Ends the drag diagram-js initializes right now at the end of its `drag.init`. */
  refuseStart(): void {
    if (this.startingDrag) this.startRefused = true;
  }

  /** Whether `context` is the drag diagram-js activates right now, inside its `Dragging.move`. */
  isActivating(context: unknown): boolean {
    return context !== null && context === this.activatingDrag;
  }

  /** Ends the drag diagram-js activates right now, as cancelled, once its activation has run. */
  endOnceActivated(): void {
    if (this.activatingDrag) this.activationEndAsked = true;
  }

  /**
   * Runs `teardown` (the modeler's destroy) at once, or, while the handler of the user's input goes
   * on with the board, once that handler has returned. A host may destroy the modeler from any
   * listener, and these handlers read the canvas after one: diagram-js's `Dragging.move` clears
   * the selection after a drag's start and reads the drag again (#346), a drop's command runs
   * inside `Dragging.end`, whose `SelectionBehavior` then selects the new sticky and whose cleanup
   * reads the canvas, a cancel cleans the drag up after the listeners of its `drag.cleanup` (#380),
   * and a keyboard create selects its sticky and opens its editor (#373). A drawing's point drag
   * reads the canvas after it reported its start or end in the same way. The rest of the handler
   * runs on the live board, which the teardown then takes down, together with a drag that still
   * runs.
   */
  tearDownAfterHandler(teardown: () => void): void {
    if (this.handlerGoesOn) queueMicrotask(teardown);
    else teardown();
  }

  /** Whether `context` is the drag whose drop runs right now. */
  isDropping(context: unknown): boolean {
    return context !== null && context === this.droppingDrag;
  }

  /**
   * Keeps the user's action running for a step it scheduled to run later (after diagram-js ended
   * its drop, say); returns the release, which ends the action once nothing else holds it.
   */
  holdAction(): () => void {
    const hold = {};
    this.actionHolds.add(hold);
    return () => {
      if (this.actionHolds.delete(hold)) this.settleAction();
    };
  }

  /** Settles once the running user action has ended; `undefined` while none runs. */
  actionEnded(): Promise<void> | undefined {
    if (!this.droppingDrag && this.actionHolds.size === 0) return undefined;
    return new Promise((resolve) => this.actionWaiters.push(resolve));
  }

  /** A microtask runs only once `Dragging.move`, which activated the drag, has returned. */
  private holdActivation(): void {
    const activating = this.dragContext();
    if (!activating || ARMED_TOOL_PREFIXES.has(activating.prefix)) return;
    const release = this.holdAction();
    this.activatingDrag = activating;
    this.activationEndAsked = false;
    queueMicrotask(() => {
      // An activation that fired no move (a listener refused the start or threw) is one whose drag
      // diagram-js has ended already, so only the activation is left to forget.
      if (this.activatingDrag === activating) this.finishActivation();
      release();
    });
  }

  /** A microtask runs only once the handler of the user's input has returned. */
  private noteHandlerGoesOn(): void {
    if (this.handlerGoesOn) return;
    this.handlerGoesOn = true;
    queueMicrotask(() => {
      this.handlerGoesOn = false;
    });
  }

  /** Whether an end was asked during the activation that finishes now. */
  private finishActivation(): boolean {
    const endAsked = this.activationEndAsked;
    this.activatingDrag = null;
    this.activationEndAsked = false;
    return endAsked;
  }

  private holdCommand(): void {
    if (this.commandHold) return;
    const release = this.holdAction();
    this.commandHold = release;
    queueMicrotask(() => {
      if (this.commandHold === release) this.commandHold = undefined;
      release();
    });
  }

  private dragContext(): DragContext | null {
    return (this.dragging.context() as DragContext | null) ?? null;
  }

  private endDiagramGesture(): void {
    if (!this.diagramGesture) return;
    this.diagramGesture = null;
    this.update();
  }

  private endDiagramDrop(): void {
    if (!this.droppingDrag) return;
    this.droppingDrag = null;
    this.settleAction();
  }

  private settleAction(): void {
    if (this.droppingDrag || this.actionHolds.size > 0) return;
    for (const resolve of this.actionWaiters.splice(0)) resolve();
  }

  private update(): void {
    const active = this.diagramGesture !== null || this.ownGestures.size > 0;
    if (active === this.reported) return;
    this.reported = active;
    // A drawing's point drag goes on with the canvas after it reported its start or end, as
    // diagram-js's drags do.
    this.noteHandlerGoesOn();
    for (const listener of [...this.listeners]) {
      if (this.listeners.has(listener)) listener(active);
    }
  }
}
