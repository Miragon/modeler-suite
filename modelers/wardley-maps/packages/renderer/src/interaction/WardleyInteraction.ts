import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type { Injector } from "didi";
import { COMMAND_START_EVENTS } from "../live-preview/index.js";

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

/**
 * Ahead of every other listener of a drag or a command, so that what a drop or a command runs finds
 * the user's action marked.
 */
export const ACTION_MARK_PRIORITY = 100_000;

type DragContext = { prefix: string } | null;

/**
 * Whether the user holds a gesture on the canvas, the `interaction` of `@miragon/modeler-api`: a
 * diagram-js drag past its threshold (a move, resize, connect, lasso, evolve or plot-corner drag, a
 * create from the palette or the context pad, also while its preview is over the palette) or one of
 * this renderer's own drags (a label, a point of a drawing, the evolve target), from its start until
 * its drop or cancel. A tool that only waits for its next press is none, and neither is a pan.
 *
 * It also marks the user's actions, and `afterUserAction()` lets an import wait until the running
 * one has finished, so that no step of it finds the map replaced under it (#248, #285, #305, #336):
 * - a drop, from the release until the drop has ended and the follow-ups it deferred to a later task
 *   (the name editor of a create or an append with the pointer) have run;
 * - every other command, an undo or a redo, from its start until the code that ran it has returned:
 *   a create without a pointer, the context pad's append with Enter, the save of a name editor, also
 *   the one a press on the canvas makes, a delete, an undo or a redo that deselects what it removes.
 *   Such an action defers no step: the next microtask ends it;
 * - the activation of a diagram-js drag (a move, a connect or the evolve placement of the context pad
 *   past its threshold; a resize, a create from the palette, the context pad or a key, and a connect
 *   with the key A at once), from its start until diagram-js's `Dragging.move` has returned: it
 *   clears the selection after the start and goes on with the drag, so an import from the selection
 *   listener there would cancel the drag under it. The import then ends the drag, as it ends any
 *   running gesture. The next microtask ends this action too.
 */
export default class WardleyInteraction {
  static $inject = ["eventBus", "injector"];

  private gesture: object | null = null;
  private dropsRunning = 0;
  private settling: ReturnType<typeof setTimeout> | undefined;
  private handlerRunning = false;
  /** From a drag's start until the handler that started the drag has returned. */
  private handlerStartsDrag = false;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly eventBus: EventBus,
    injector: Injector,
  ) {
    const dragging = injector.get<Dragging | null>("dragging", false);
    if (dragging) this.followDragging(dragging);
    eventBus.on(COMMAND_START_EVENTS, ACTION_MARK_PRIORITY, () => this.handlerRuns());
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
    if (wasActive) return;
    // The drag's handler reads the canvas after it reported the start, as diagram-js's do.
    this.dragStartRuns();
    this.changed(true);
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
      this.endDrop(() => this.end(gesture));
    }
  }

  /**
   * Resolves once the user's running action has finished: a drop with the follow-ups it deferred to
   * a later task, and the code that ran a command or activated a drag; `undefined` while no action
   * runs.
   */
  afterUserAction(): Promise<void> | undefined {
    if (!this.actionRunning()) return undefined;
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  /**
   * Runs `teardown` (the modeler's destroy) at once, or, while a drag starts, once the handler that
   * starts it has returned. diagram-js cancels a running drag on destroy, and between the drag's
   * start and its first move it clears the selection and then reads the drag's context again: a
   * destroy from a selection listener there made `Dragging.move` throw `Cannot read properties of
   * null (reading 'cursor')` (#346). The first move, whose interaction listener may destroy as
   * well, and the rest of the handler (the palette's, which focuses the canvas after it started a
   * create) still run on the live map, which the teardown then takes down with the drag. The
   * renderer's own drags (a label, a point of a drawing, the evolve target) read the canvas after
   * they reported their start in the same way.
   */
  tearDownAfterActivation(teardown: () => void): void {
    if (this.handlerStartsDrag) queueMicrotask(teardown);
    else teardown();
  }

  private actionRunning(): boolean {
    return this.dropsRunning > 0 || this.settling !== undefined || this.handlerRunning;
  }

  private followDragging(dragging: Dragging): void {
    const current = () => dragging.context() as DragContext;
    let dropping: DragContext = null;
    let ending: DragContext = null;
    // diagram-js's Dragging.move fires the start, then clears the selection, then reads the drag's
    // context again, which a cancel from a selection listener would have emptied.
    this.eventBus.on("drag.start", ACTION_MARK_PRIORITY, () => {
      this.handlerRuns();
      this.dragStartRuns();
    });
    // diagram-js fires the first move right after a start, also the start of a create that it
    // activates at once, and never after a start a listener refused.
    this.eventBus.on("drag.move", ACTION_MARK_PRIORITY, () => {
      const context = current();
      if (!context || context === this.gesture || ARMED_TOOL_PREFIXES.has(context.prefix)) return;
      this.begin(context);
    });
    this.eventBus.on("drag.end", ACTION_MARK_PRIORITY, () => {
      const context = current();
      if (!context || context !== this.gesture) return;
      dropping = context;
      this.dropStarts();
    });
    const ended = () => {
      const context = ending;
      ending = null;
      if (!context) return;
      if (context !== dropping) {
        this.end(context);
        return;
      }
      dropping = null;
      this.endDrop(() => this.end(context));
    };
    this.eventBus.on("drag.cleanup", ACTION_MARK_PRIORITY, () => {
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
    this.eventBus.on(["drag.ended", "drag.canceled"], ACTION_MARK_PRIORITY, ended);
  }

  // A drag starts inside the handler of the user's input, which a microtask follows.
  private dragStartRuns(): void {
    if (this.handlerStartsDrag) return;
    this.handlerStartsDrag = true;
    queueMicrotask(() => {
      this.handlerStartsDrag = false;
    });
  }

  private dropStarts(): void {
    this.dropsRunning += 1;
  }

  // The handler of the user's input goes on after the command it ran (a create selects its element
  // and opens its name editor, a press that saved a name starts its drag) and after the start of the
  // drag it activated, and a microtask runs only once it returned.
  private handlerRuns(): void {
    if (this.handlerRunning) return;
    this.handlerRunning = true;
    queueMicrotask(() => {
      this.handlerRunning = false;
      this.settleWhenIdle();
    });
  }

  // A listener of the gesture's end that throws must not keep the drop marked: every later import
  // would wait for it.
  private endDrop(endGesture: () => void): void {
    try {
      endGesture();
    } finally {
      this.dropEnds();
    }
  }

  // A drop defers some of its own steps by a task (the name editor of a create opens with
  // setTimeout), so the wait ends one task later, behind them.
  private dropEnds(): void {
    this.dropsRunning -= 1;
    if (this.dropsRunning > 0) return;
    clearTimeout(this.settling);
    this.settling = setTimeout(() => {
      this.settling = undefined;
      this.settleWhenIdle();
    }, 0);
  }

  private settleWhenIdle(): void {
    if (!this.actionRunning()) this.settled();
  }

  private settled(): void {
    for (const resolve of this.waiting.splice(0)) resolve();
  }

  private changed(active: boolean): void {
    this.eventBus.fire(INTERACTION_CHANGED, { active } satisfies InteractionChangedEvent);
  }
}
