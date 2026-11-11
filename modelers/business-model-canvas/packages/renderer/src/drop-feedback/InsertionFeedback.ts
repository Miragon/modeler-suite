import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import {
  attr as svgAttr,
  append as svgAppend,
  clear as svgClear,
  create as svgCreate,
} from "tiny-svg";
import { STICKY_GAP, stickyRectAt, type Point } from "@miragon/business-model-canvas-schema-model";
import { COLORS } from "../draw/styles.js";
import { NO_DOCUMENT, documentOf } from "../io/documentOf.js";
import { isStickyShape } from "../model/di-types.js";
import { placementAt } from "../modeling/placement.js";

const FEEDBACK_LAYER = "bmc-drop-feedback";
const ABOVE_ELEMENTS = 100;
const LINE_WIDTH = 3;

interface MoveEvent {
  dx: number;
  dy: number;
  context: { shapes?: Element[]; shape?: Shape };
}

interface CreateEvent {
  x: number;
  y: number;
  context: { shape?: Shape };
}

/** While a sticky is dragged: the block it would land in, and a line where it would go. */
export default class InsertionFeedback {
  static $inject = ["eventBus", "canvas", "elementRegistry"];

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
  ) {
    eventBus.on("shape.move.move", (event: MoveEvent) => {
      const stickies = (event.context.shapes ?? []).filter(isStickyShape);
      const [first] = stickies;
      if (!first) return;
      this.show(
        stickies.map((sticky) => sticky.id),
        {
          x: first.x + first.width / 2 + event.dx,
          y: first.y + first.height / 2 + event.dy,
        },
      );
    });
    eventBus.on("create.move", (event: CreateEvent) => {
      if (isStickyShape(event.context.shape)) this.show([], { x: event.x, y: event.y });
    });
    eventBus.on(
      ["shape.move.cleanup", "create.cleanup", "diagram.clear", "import.render.start"],
      () => this.clear(),
    );
  }

  private show(placedIds: string[], point: Point): void {
    const document = documentOf(this.elementRegistry) ?? NO_DOCUMENT;
    const { block, slot: index } = placementAt(document, placedIds, point);
    const layer = this.layer();
    svgClear(layer);
    svgAppend(
      layer,
      svgAttr(svgCreate("rect"), {
        ...block.rect,
        fill: "none",
        stroke: COLORS.accent,
        "stroke-width": 2,
        "stroke-dasharray": "6 4",
      }),
    );
    const slot = stickyRectAt(block, index);
    const x = slot.x - STICKY_GAP / 2;
    svgAppend(
      layer,
      svgAttr(svgCreate("line"), {
        x1: x,
        y1: slot.y,
        x2: x,
        y2: slot.y + slot.height,
        stroke: COLORS.accent,
        "stroke-width": LINE_WIDTH,
        "stroke-linecap": "round",
      }),
    );
  }

  private clear(): void {
    svgClear(this.layer());
  }

  private layer(): SVGElement {
    return this.canvas.getLayer(FEEDBACK_LAYER, ABOVE_ELEMENTS);
  }
}
