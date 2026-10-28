import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type ToolManager from "diagram-js/lib/features/tool-manager/ToolManager";
import type { Element } from "diagram-js/lib/model/Types";
import { toPoint } from "diagram-js/lib/util/Event";

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
  payload: { originalEvent?: Event };
}

interface ConnectInitEvent {
  context: { start: Element };
}

/**
 * Ends the user's gesture before an import replaces the shapes it works on. diagram-js keeps a drag
 * running across `diagram.clear`, and its drop would apply a command to removed shapes and throw
 * half-way. A pan and an armed palette tool are no gesture and run on.
 */
export default class VcGestures {
  static $inject = ["eventBus", "dragging", "toolManager", "elementRegistry", "canvas"];

  private dropping: DragContext | null = null;

  constructor(
    eventBus: EventBus,
    private readonly dragging: Dragging,
    toolManager: ToolManager,
    elementRegistry: ElementRegistry,
    private readonly canvas: Canvas,
  ) {
    eventBus.on("drag.end", FIRST, () => {
      this.dropping = dragging.context() as DragContext | null;
    });
    eventBus.on(["drag.ended", "drag.canceled"], FIRST, () => {
      this.dropping = null;
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
    eventBus.on("import.render.done", () => this.anchorPanToView());
  }

  /**
   * Ends a running gesture the way Escape does, without bringing back a selection of the shapes the
   * import removes. A palette tool that only waits for its next press stays armed, and a pan keeps
   * running where the user's pointer takes it. A drop that is being applied right now, a host
   * importing from its change listener, is left to finish: its command has run, the import
   * replaces its result, and a cancel would pull the drag out from under diagram-js. The drop is
   * told apart by its drag, not by a flag: a listener that throws during the drop's cleanup keeps
   * diagram-js from announcing its end, and a flag left set would stop every later import from
   * ending a gesture.
   */
  cancel(): void {
    const gesture = this.dragging.context() as DragContext | null;
    if (!gesture || gesture === this.dropping || NO_GESTURE_PREFIXES.has(gesture.prefix)) return;
    this.dragging.cancel(false);
  }

  /**
   * A pan keeps the diagram point it started on under the pointer, so its next move would put the
   * view from before an import back, undoing the import's fit. It starts again from the diagram
   * point that now lies under the pointer (diagram-js keeps that point in the drag's context).
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
