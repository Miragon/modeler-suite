import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";

/** Ahead of every other listener of the same event. */
const FIRST = 100_000;

/** Behind every other listener of the same event, so that it sees what they asked for. */
const LAST = -100_000;

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
 * A user action runs while the user's handler that changed the board has not returned yet (a
 * command reported on `commandStack.changed`: a keyboard create, a label commit, also one a press
 * makes), during a drop (from diagram-js's `drag.end` until `drag.ended` or `drag.canceled`, a
 * drawing's point drop while its command applies), and for as long as a step it scheduled holds
 * it (`holdAction`: the kind chooser or the label editor that opens after an append). An import
 * called meanwhile, from a host's change listener, waits for `actionEnded()`, so no step of the
 * action finds the board replaced (#248, #305).
 *
 * A drag runs its `drag.init` before diagram-js activates it. An import or a clear called from a
 * listener of that init (a host that imports from the change listener of the label editor that
 * commits there) asks for `refuseStart()`, and the drag ends before it activates.
 */
export default class EventStormingGestures {
  static $inject = ["eventBus", "dragging"];

  private readonly listeners = new Set<GestureListener>();
  private reported = false;
  private diagramGesture: DragContext | null = null;
  private readonly ownGestures = new Set<object>();
  private droppingDrag: DragContext | null = null;
  private readonly actionHolds = new Set<object>();
  private actionWaiters: (() => void)[] = [];
  private startingDrag: DragContext | null = null;
  private startRefused = false;

  constructor(
    eventBus: EventBus,
    private readonly dragging: Dragging,
  ) {
    // The first move of a drag comes right after diagram-js activated it, so a start that a
    // listener refused never counts.
    eventBus.on("drag.move", FIRST, () => {
      const context = this.dragContext();
      if (!context?.active || ARMED_TOOL_PREFIXES.has(context.prefix)) return;
      if (this.diagramGesture === context) return;
      this.diagramGesture = context;
      this.update();
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

    eventBus.on("drag.end", FIRST, () => {
      const dropping = this.dragContext();
      this.droppingDrag = dropping;
      // The drop runs within the release's task; a listener that throws keeps its end unannounced.
      setTimeout(() => {
        if (this.droppingDrag === dropping) this.endDiagramDrop();
      }, 0);
    });
    eventBus.on(["drag.ended", "drag.canceled"], FIRST, () => this.endDiagramDrop());

    // The handler that ran the command goes on after it (a keyboard create selects its sticky and
    // opens the editor, a press that committed a label starts its drag), and a microtask runs only
    // once that handler has returned.
    eventBus.on("commandStack.changed", FIRST, () => queueMicrotask(this.holdAction()));

    // An import waiting for the action then finds the viewer destroyed and rejects.
    eventBus.on("diagram.destroy", () => {
      this.droppingDrag = null;
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
    for (const listener of [...this.listeners]) listener(active);
  }
}
