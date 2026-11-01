import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { ConnectionLike, ElementLike, ShapeLike } from "diagram-js/lib/model/Types";
import type { Box, Point } from "@miragon/c4-schema-model";
import { c4ReferenceOf, isRelationshipPreview, type SceneRelationship } from "../scene/types.js";
import { contrastRatio } from "./colour.js";
import {
  drawBoundary,
  drawElement,
  drawPlaceholder,
  drawRelationship,
  drawRelationshipPreview,
  shapeOutline,
} from "./drawItems.js";
import { polylinePath } from "./lines.js";
import type SceneLookup from "./SceneLookup.js";
import { rectanglePath } from "./shapes.js";
import { paintValue, ROLE_LIGHT, type FillRole, type Paint } from "./styles.js";
import { clearChildren } from "./svg.js";

/** Above diagram-js's default renderer (1000). */
const RENDER_PRIORITY = 1500;
const TEXT_CONTRAST = 4.5;

function contains(box: Box, point: Point): boolean {
  return (
    point.x >= box.x &&
    point.y >= box.y &&
    point.x <= box.x + box.width &&
    point.y <= box.y + box.height
  );
}

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
    if (isRelationshipPreview(connection)) {
      return drawRelationshipPreview(visuals, connection.waypoints ?? []);
    }
    const relationship = this.lookup.relationship(connection);
    return drawRelationship(
      visuals,
      relationship,
      connection.waypoints ?? [],
      relationship && this.labelGround(relationship),
    );
  }

  /**
   * What lies behind the label (guide §10.1, Label-Halo): the innermost filled boundary under it,
   * else the canvas's ground. The plot white where the label's text would lose 4.5:1 there, since
   * the style resolver tunes a self-set text colour on white.
   */
  private labelGround(relationship: SceneRelationship): Paint<FillRole> {
    const centre = {
      x: relationship.labelBox.x + relationship.labelBox.width / 2,
      y: relationship.labelBox.y + relationship.labelBox.height / 2,
    };
    const filled = (this.lookup.scene()?.boundaries ?? [])
      .filter((boundary) => boundary.style.fill !== undefined && contains(boundary.box, centre))
      .sort((left, right) => right.depth - left.depth)[0];
    const behind: Paint<FillRole> =
      filled?.style.fill === undefined
        ? { role: "cd-c-fill-grund" }
        : { colour: filled.style.fill };
    const texts =
      relationship.style.text === undefined
        ? [ROLE_LIGHT["cd-c-fill-text"].value, ROLE_LIGHT["cd-c-fill-text-leise"].value]
        : [relationship.style.text];
    const readable = texts.every(
      (text) => (contrastRatio(text, paintValue(behind)) ?? 0) >= TEXT_CONTRAST,
    );
    return readable ? behind : { role: "cd-c-fill-plot" };
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
