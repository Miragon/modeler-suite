import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type ToolManager from "diagram-js/lib/features/tool-manager/ToolManager";
import type { ElementLike } from "diagram-js/lib/core/Types";
import type { Element } from "diagram-js/lib/model/Types";
import { toPoint } from "diagram-js/lib/util/Event";

/** Fired with `{ active }` each time a gesture starts or ends (`VcGestures.isActive()`). */
export const GESTURE_CHANGED_EVENT = "valueChain.gesture.changed";

/** Ahead of every other listener of the same event. */
const FIRST = 100_000;

const PAN_PREFIX = "hand.move";

/**
 * The drags that are no gesture, since they hold no element of the diagram: the palette's tools
 * (lasso, hand, space, connect) while they only wait for the next press, and the pan of the hand
 * tool, which Space held or Ctrl/Cmd and a press start as well. An import leaves them running: the
 * armed tool is still armed, and the user's next press still uses it.
 */
const NO_GESTURE_PREFIXES: ReadonlySet<string> = new Set([
  "lasso.selection",
  "hand",
  PAN_PREFIX,
  "spaceTool.selection",
  "global-connect",
]);

const GLOBAL_CONNECT_TOOL = "global-connect";

interface Point {
  x: number;
  y: number;
}

interface DragContext {
  prefix: string;
  active: boolean;
  globalStart: Point;
  localStart: Point;
  payload: { originalEvent?: Event; previousSelection?: ElementLike[] };
}

interface ConnectInitEvent {
  context: { start: Element };
}

/**
 * The user's gestures on the canvas: whether one runs (contract 1.5 `interaction`), ending it
 * before an import replaces the shapes it works on, and holding back what replaces the diagram
 * while a drop is being applied. diagram-js keeps a drag running across `diagram.clear`, and its
 * drop would apply a command to removed shapes and throw half-way. A pan and an armed palette tool
 * are no gesture and run on.
 */
export default class VcGestures {
  static $inject = ["eventBus", "dragging", "toolManager", "elementRegistry", "canvas"];

  private dropping: DragContext | null = null;
  private gesture: DragContext | null = null;
  private readonly afterDropQueue: (() => void)[] = [];
  private flushQueued = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly dragging: Dragging,
    toolManager: ToolManager,
    private readonly elementRegistry: ElementRegistry,
    private readonly canvas: Canvas,
  ) {
    // diagram-js fires the first move of a drag right after the drag has started, and only then:
    // a start that a listener refuses never shows as a gesture. A host that destroys the modeler
    // from its interaction listener ends the drag there, and diagram-js would go on moving it on a
    // torn-down canvas.
    eventBus.on("drag.move", FIRST, () => {
      const drag = this.context();
      this.noteDrag();
      if (this.context() === drag) return undefined;
      return false;
    });
    eventBus.on("drag.end", FIRST, () => {
      this.dropping = this.context();
    });
    eventBus.on(["drag.ended", "drag.canceled"], FIRST, () => {
      this.dropping = null;
      this.endGesture();
      if (this.afterDropQueue.length > 0) this.queueFlush();
    });
    // A listener that throws during the cleanup keeps diagram-js from announcing the end of the
    // drag, which is gone all the same.
    eventBus.on("drag.cleanup", FIRST, () => {
      const cleaned = this.context();
      queueMicrotask(() => {
        if (this.gesture === cleaned && this.context() !== cleaned) this.endGesture();
      });
    });
    // The connect tool the palette armed starts its connect from the shape it was pressed on, once
    // the pointer leaves that shape: an import may have removed the shape by then, also one that
    // came while the armed tool rested on it. Refused at init, the connect ends before it shows
    // anything; it then never ends or cancels, so the tool, which waits for that, is put down here.
    eventBus.on("connect.init", FIRST, (event: ConnectInitEvent) => {
      const { start } = event.context;
      if (elementRegistry.get(start.id) === start) return undefined;
      if (toolManager.isActive(GLOBAL_CONNECT_TOOL)) toolManager.setActive(null);
      return false;
    });
    eventBus.on("import.render.done", () => {
      this.anchorPanToView();
      this.holdImportedSelection();
    });
  }

  /**
   * Whether the user holds a gesture: from the start of a drag that works on the diagram (a move,
   * resize, connect, bendpoint, lasso or space drag, a create or append from the palette or the
   * context pad, also while its preview is off the canvas) until its drop or cancel. A press inside
   * the drag threshold, an armed palette tool and a pan are none.
   */
  isActive(): boolean {
    return this.gesture !== null;
  }

  /** Whether a drop is being applied right now: between its release and the end of its drag. */
  isDropping(): boolean {
    return this.dropping !== null && this.context() === this.dropping;
  }

  /**
   * Runs `work` at once, or after the drop being applied right now has ended, so that nothing the
   * drop still runs (its own listeners, the label editor a dragged append opens) meets a replaced
   * diagram. Work held back runs in the order it came, and later work waits behind it. Only a drop
   * is held back: a click append or a keyboard create is no drop, and work arriving from its change
   * runs at once (#285).
   */
  afterDrop(work: () => void): void {
    if (this.afterDropQueue.length === 0 && !this.isDropping()) {
      work();
      return;
    }
    this.afterDropQueue.push(work);
    this.queueFlush();
  }

  /**
   * Ends a running gesture the way Escape does, without bringing back a selection of the shapes the
   * import removes. A palette tool that only waits for its next press stays armed, and a pan keeps
   * running where the user's pointer takes it. A drop that is being applied right now is left to
   * finish: a cancel would pull the drag out from under diagram-js. The drop is told apart by its
   * drag, not by a flag: a listener that throws during the drop's cleanup keeps diagram-js from
   * announcing its end, and a flag left set would stop every later import from ending a gesture.
   */
  cancel(): void {
    const gesture = this.context();
    if (!gesture || gesture === this.dropping || NO_GESTURE_PREFIXES.has(gesture.prefix)) return;
    this.dragging.cancel(false);
  }

  private context(): DragContext | null {
    return this.dragging.context() as DragContext | null;
  }

  private noteDrag(): void {
    const drag = this.context();
    if (drag === this.gesture) return;
    this.endGesture();
    if (!drag?.active || NO_GESTURE_PREFIXES.has(drag.prefix)) return;
    this.gesture = drag;
    this.eventBus.fire(GESTURE_CHANGED_EVENT, { active: true });
  }

  private endGesture(): void {
    if (!this.gesture) return;
    this.gesture = null;
    this.eventBus.fire(GESTURE_CHANGED_EVENT, { active: false });
  }

  /**
   * A drop runs synchronously inside the release, so a microtask queued during it runs once the
   * drop, its end and the tool it re-arms are through.
   */
  private queueFlush(): void {
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      this.flushAfterDrop();
    });
  }

  private flushAfterDrop(): void {
    while (this.afterDropQueue.length > 0 && !this.isDropping()) {
      const work = this.afterDropQueue.shift();
      try {
        work?.();
      } catch (error) {
        reportError(error);
      }
    }
  }

  /**
   * A pan keeps the diagram point it started on under the pointer, so its next move would put the
   * view from before an import back, undoing the import's fit. It starts again from the diagram
   * point that now lies under the pointer (diagram-js keeps that point in the drag's context).
   */
  private anchorPanToView(): void {
    const pan = this.context();
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

  /**
   * A drag that runs on across an import, a pan or an armed palette tool, brings back the selection
   * from before it started when it ends. The import drew new elements under the same ids and the
   * selection refuses the removed ones, so the drag holds the imported elements instead; one the
   * import removed is no longer held.
   */
  private holdImportedSelection(): void {
    const drag = this.dragging.context() as DragContext | null;
    const held = drag?.payload.previousSelection;
    if (!drag || !held) return;
    drag.payload.previousSelection = held
      .map((element) => this.elementRegistry.get(element.id))
      .filter((element): element is ElementLike => element !== undefined);
  }
}
