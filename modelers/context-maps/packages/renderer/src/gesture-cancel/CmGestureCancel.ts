import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";

/**
 * The drag of a palette tool that only waits for the user's next press: no gesture yet. It holds
 * no element of the map, so an import leaves the tool armed.
 */
const ARMED_TOOL_PREFIXES: ReadonlySet<string> = new Set(["lasso.selection"]);

/** Ahead of every listener of the drop: one of them runs the command a host may import from. */
const BEFORE_THE_DROP = 10_000;

interface Gesture {
  prefix: string;
}

/**
 * Ends the gesture an import would leave running. diagram-js keeps a drag across
 * `diagram.clear()`, and its release after the import would apply a command to elements the
 * import removed: `moveShape` throws half-way, a create lands on the new map.
 */
export default class CmGestureCancel {
  static $inject = ["eventBus", "dragging"];

  private droppingGesture: Gesture | null = null;
  private cancellingForImport = false;

  constructor(
    eventBus: EventBus,
    private readonly dragging: Dragging,
  ) {
    eventBus.on("drag.end", BEFORE_THE_DROP, () => {
      this.droppingGesture = this.runningGesture();
    });
    eventBus.on("drag.ended", () => {
      this.droppingGesture = null;
    });
  }

  /**
   * Cancels the running gesture (a move, connect or lasso drag, a create from the palette or the
   * context pad) and a press that has not reached the drag threshold yet, the way Escape does,
   * without restoring the selection: it holds the elements the import removes. A palette tool that
   * only waits for its next press is no gesture and stays armed; the press that starts its drag
   * starts one. A gesture whose drop is running is left alone: its command has applied, the host
   * imports from its change listener, and diagram-js's drop throws when its own drag is cancelled
   * from inside it.
   */
  cancelForImport(): void {
    const gesture = this.runningGesture();
    if (!gesture || gesture === this.droppingGesture) return;
    if (ARMED_TOOL_PREFIXES.has(gesture.prefix)) return;
    this.cancellingForImport = true;
    try {
      this.dragging.cancel(false);
    } finally {
      this.cancellingForImport = false;
    }
  }

  /** True while an import cancels a gesture: its cleanup must not select what the import removes. */
  isCancellingForImport(): boolean {
    return this.cancellingForImport;
  }

  private runningGesture(): Gesture | null {
    return (this.dragging.context() as Gesture | null | undefined) ?? null;
  }
}
