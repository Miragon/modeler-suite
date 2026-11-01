import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { ConnectionLike, ElementLike, ShapeLike } from "diagram-js/lib/model/Types";
import { c4ReferenceOf } from "../scene/types.js";
import {
  drawBoundary,
  drawElement,
  drawPlaceholder,
  drawRelationship,
  shapeOutline,
} from "./drawItems.js";
import { polylinePath } from "./lines.js";
import type SceneLookup from "./SceneLookup.js";
import { rectanglePath } from "./shapes.js";
import { clearChildren } from "./svg.js";

/** Above diagram-js's default renderer (1000). */
const RENDER_PRIORITY = 1500;

/**
 * Draws every element that carries a C4 reference from the current scene (SPEC 6): element shapes
 * and previews, boundaries and relationships. The group frames and the title are no diagram-js
 * elements; `C4Layers` draws them.
 */
export default class C4Renderer extends BaseRenderer {
  static $inject = ["eventBus", "c4SceneLookup"];

  constructor(
    eventBus: EventBus,
    private readonly lookup: SceneLookup,
  ) {
    super(eventBus, RENDER_PRIORITY);
  }

  override canRender(element: ElementLike): boolean {
    return c4ReferenceOf(element) !== undefined;
  }

  override drawShape(visuals: SVGElement, shape: ShapeLike): SVGElement {
    clearChildren(visuals);
    if (c4ReferenceOf(shape)?.role === "boundary") {
      const boundary = this.lookup.boundary(shape);
      return boundary ? drawBoundary(visuals, boundary) : drawPlaceholder(visuals, shape);
    }
    const element = this.lookup.element(shape);
    return element ? drawElement(visuals, element) : drawPlaceholder(visuals, shape);
  }

  override drawConnection(visuals: SVGElement, connection: ConnectionLike): SVGElement {
    clearChildren(visuals);
    return drawRelationship(
      visuals,
      this.lookup.relationship(connection),
      connection.waypoints ?? [],
    );
  }

  /** The drawn outline, where connections dock (SPEC 5.7). */
  override getShapePath(shape: ShapeLike): string {
    const element =
      c4ReferenceOf(shape)?.role === "boundary" ? undefined : this.lookup.element(shape);
    if (element) return shapeOutline(element);
    return rectanglePath(shape.x, shape.y, shape.width, shape.height);
  }

  override getConnectionPath(connection: ConnectionLike): string {
    return polylinePath(connection.waypoints ?? []);
  }
}
