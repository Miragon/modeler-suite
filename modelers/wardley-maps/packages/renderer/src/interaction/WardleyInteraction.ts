import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type { Injector } from "didi";

/** Fired as `{ active }` each time a gesture starts or ends (`InteractionChangedEvent`). */
export const INTERACTION_CHANGED = "wardley.interaction.changed";

export interface InteractionChangedEvent {
  active: boolean;
}

/**
 * The drags of a palette tool that only waits for its next press (the lasso from the palette or
 * `L`): no gesture yet. They hold no element of the map, so an import leaves such a tool armed, and
 * the user's next press still draws a lasso instead of panning or moving the element under the
 * pointer.
 */
export const ARMED_TOOL_PREFIXES: ReadonlySet<string> = new Set(["lasso.selection"]);

/** Ahead of every other listener of a drag, so that what a drop runs finds the drop marked. */
export const DROP_MARK_PRIORITY = 100_000;

type DragContext = { prefix: string } | null;

/**
 * Whether the user holds a gesture on the canvas, the `interaction` of `@miragon/modeler-api`: a
 * diagram-js drag past its threshold (a move, resize, connect, lasso, evolve or plot-corner drag, a
 * create from the palette or the context pad, also while its preview is over the palette) or one of
 * this renderer's own drags (a label, a point of a drawing, the evolve target), from its start until
 * its drop or cancel. A tool that only waits for its next press is none, and neither is a pan.
 *
 * It also marks the drops, from the release until the drop has ended and the follow-ups it deferred
 * to a later task (the name editor of a create) have run: `afterDrop()` lets an import wait for that,
 * so that no listener of the drop finds the map replaced under it.
 */
export default class WardleyInteraction {
  static $inject = ["eventBus", "injector"];

  private gesture: object | null = null;
  private dropsRunning = 0;
  private settling: ReturnType<typeof setTimeout> | undefined;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly eventBus: EventBus,
    injector: Injector,
  ) {
    const dragging = injector.get<Dragging | null>("dragging", false);
    if (dragging) this.followDragging(dragging);
    eventBus.on("diagram.destroy", () => {
      clearTimeout(this.settling);
      this.settling = undefined;
      this.settled();
    });
  }

  /** True from a gesture's start until its drop or cancel. */
  isActive(): boolean {
    return this.gesture !== null;
  }

  /** One of the renderer's own drags passed its threshold. */
  begin(gesture: object): void {
    const wasActive = this.gesture !== null;
    this.gesture = gesture;
    if (!wasActive) this.changed(true);
  }

  /** The gesture ended without a drop: Escape, or its element was removed. */
  end(gesture: object): void {
    if (this.gesture !== gesture) return;
    this.gesture = null;
    this.changed(false);
  }

  /** The gesture's release: runs its drop, then ends it. */
  drop(gesture: object, run: () => void): void {
    this.dropStarts();
    try {
      run();
    } finally {
      this.end(gesture);
      this.dropEnds();
    }
  }

  /**
   * Resolves once the running drop has ended and the follow-ups it deferred to a later task have
   * run; `undefined` while no drop runs.
   */
  afterDrop(): Promise<void> | undefined {
    if (this.dropsRunning === 0 && this.settling === undefined) return undefined;
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private followDragging(dragging: Dragging): void {
    const current = () => dragging.context() as DragContext;
    let dropping: DragContext = null;
    let ending: DragContext = null;
    // diagram-js fires the first move right after a start, also the start of a create that it
    // activates at once, and never after a start a listener refused.
    this.eventBus.on("drag.move", DROP_MARK_PRIORITY, () => {
      const context = current();
      if (!context || context === this.gesture || ARMED_TOOL_PREFIXES.has(context.prefix)) return;
      this.begin(context);
    });
    this.eventBus.on("drag.end", DROP_MARK_PRIORITY, () => {
      const context = current();
      if (!context || context !== this.gesture) return;
      dropping = context;
      this.dropStarts();
    });
    const ended = () => {
      const context = ending;
      ending = null;
      if (context) this.end(context);
      if (context && context === dropping) {
        dropping = null;
        this.dropEnds();
      }
    };
    this.eventBus.on("drag.cleanup", DROP_MARK_PRIORITY, () => {
      const context = current();
      ending = context;
      // A cleanup listener that throws keeps diagram-js from firing the drag's end, and every
      // later import would wait for this drop.
      queueMicrotask(() => {
        if (ending === context) ended();
      });
    });
    // After the cleanup, once diagram-js has let go of the drag: a listener that imports from here
    // finds no drag left to cancel.
    this.eventBus.on(["drag.ended", "drag.canceled"], DROP_MARK_PRIORITY, ended);
  }

  private dropStarts(): void {
    this.dropsRunning += 1;
  }

  // A drop defers some of its own steps by a task (the name editor of a create opens with
  // setTimeout), so the wait ends one task later, behind them.
  private dropEnds(): void {
    this.dropsRunning -= 1;
    if (this.dropsRunning > 0) return;
    clearTimeout(this.settling);
    this.settling = setTimeout(() => {
      this.settling = undefined;
      if (this.dropsRunning === 0) this.settled();
    }, 0);
  }

  private settled(): void {
    for (const resolve of this.waiting.splice(0)) resolve();
  }

  private changed(active: boolean): void {
    this.eventBus.fire(INTERACTION_CHANGED, { active } satisfies InteractionChangedEvent);
  }
}
