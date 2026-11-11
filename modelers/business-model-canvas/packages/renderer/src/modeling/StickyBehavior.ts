import CommandInterceptor from "diagram-js/lib/command/CommandInterceptor";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import { isStickyShape, type StickyShape } from "../model/di-types.js";
import type CanvasModeling from "./CanvasModeling.js";
import type { StickySlot } from "./CanvasModeling.js";

interface MoveContext {
  shapes: Element[];
  newParent?: Element;
}

interface CreateContext {
  shape?: Shape;
  parent?: Element;
  hints?: { slot?: StickySlot };
}

/** Ahead of diagram-js's Move and Create, which take the drop target from the hover. */
const BEFORE_MOVE_AND_CREATE = 1500;

interface HoverEvent {
  hover?: Element;
  hoverGfx?: SVGElement;
}

const centre = (shape: Shape) => ({ x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 });

/**
 * Turns diagram-js's own commands into document updates, in the same command: a move or a create
 * lands in the block and slot under the sticky's centre and the block reflows, a delete leaves
 * the document. Stickies always hang on the root, whatever the pointer hovered at the drop.
 */
export default class StickyBehavior extends CommandInterceptor {
  static override $inject = ["eventBus", "canvas", "canvasModeling"];

  constructor(eventBus: EventBus, canvas: Canvas, modeling: CanvasModeling) {
    super(eventBus);
    const root = () => canvas.getRootElement() as Element;

    // A sticky under the pointer is no parent: the drop goes to the root, without a drop tint.
    eventBus.on(
      ["shape.move.hover", "create.hover"],
      BEFORE_MOVE_AND_CREATE,
      (event: HoverEvent) => {
        if (!isStickyShape(event.hover)) return;
        event.hover = root();
        event.hoverGfx = canvas.getGraphics(root().id);
      },
    );

    this.preExecute("elements.move", (event: { context: MoveContext }) => {
      if (event.context.shapes.some(isStickyShape)) event.context.newParent = root();
    });
    this.preExecute(["elements.create", "shape.create"], (event: { context: CreateContext }) => {
      event.context.parent = root();
    });
    this.postExecuted("elements.move", (event: { context: MoveContext }) => {
      const stickies = event.context.shapes.filter(isStickyShape) as StickyShape[];
      const [first] = stickies;
      if (first)
        modeling.placeStickies(
          stickies.map((sticky) => sticky.id),
          centre(first),
        );
    });
    this.postExecuted("shape.create", (event: { context: CreateContext }) => {
      const { shape } = event.context;
      if (isStickyShape(shape))
        modeling.addSticky(shape, event.context.hints?.slot ?? centre(shape));
    });
    this.postExecuted("shape.delete", (event: { context: { shape: Element } }) => {
      if (isStickyShape(event.context.shape)) modeling.removeSticky(event.context.shape.id);
    });
  }
}
