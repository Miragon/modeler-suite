import type { Box, LineStyle, Point } from "@miragon/c4-schema-model";
import type { SceneBoundary, SceneElement, SceneRelationship } from "../scene/types.js";
import {
  boundaryTextLayout,
  elementTextLayout,
  relationshipLabelLayout,
  selfSetTextColour,
} from "../text/elementTextLayout.js";
import { BADGE_FONT } from "../text/typography.js";
import type { TextBands } from "../text/types.js";
import { DRILL_CLASS, drillBadgeLayout } from "./drillBadge.js";
import { chevronPath, dashArray, polylinePath } from "./lines.js";
import { LUCIDE_STROKE_WIDTH, ZOOM_IN_NODES } from "./lucide.js";
import { drawnShape, outlinePath, personArms, rectanglePath, shapeParts } from "./shapes.js";
import {
  applyPaint,
  applyRole,
  paintOf,
  type FillRole,
  type Paint,
  type StrokeRole,
} from "./styles.js";
import { append, appendBand, svgElement } from "./svg.js";

/** Style widths are 1..4 modeler units (SPEC 6.4); a hand-built or foreign style stays inside. */
export function clampWidth(width: number): number {
  return Number.isFinite(width) ? Math.min(4, Math.max(1, width)) : 2;
}

/** Inner lines (a lid, a title bar) are thinner than the outline, never thicker. */
const DETAIL_WIDTH = 1.5;
const ARM_GAP = 6;

/**
 * diagram-js paints its connect and drop markers on a shape's first visual child. That child is
 * this ring around the outline, not the body, so a marker never repaints the element's fill and
 * its text keeps its contrast (guide §10.4, §10.6). Hidden until a marker shows it, so it counts
 * in no bounding box.
 */
export const FEEDBACK_CLASS = "c4-feedback";
const FEEDBACK_GAP = 4;
const FEEDBACK_WIDTH = 2;

function bandClass(band: string): string {
  return `c4-band c4-band-${band}`;
}

/**
 * An element in the coordinates of its shape (SPEC 6.2-6.5): the outline inset by half its stroke,
 * so nothing is drawn outside the box, then the details, the text stack and the drill badge.
 * Returns the body.
 */
export function drawElement(visuals: SVGElement, element: SceneElement): SVGElement {
  const { style } = element;
  const shape = drawnShape(element.shape);
  const { width, height } = element.box;
  const strokeWidth = clampWidth(style.strokeWidth);
  const inset = strokeWidth / 2;
  const parts = shapeParts(shape, {
    x: inset,
    y: inset,
    width: Math.max(0, width - strokeWidth),
    height: Math.max(0, height - strokeWidth),
  });
  const fill = paintOf(style.fill, "cd-c-fill-plot");
  const stroke = paintOf(style.stroke, "cd-c-stroke-text");
  // Lines and marks on the fill take the text's colour: on a fill the author set, the outline's
  // colour can sit too close to the fill to read (guide §3.6: lines 3:1 on what they sit on).
  const textColour = selfSetTextColour(style);
  const detail = paintOf(textColour, "cd-c-stroke-text");
  const dash = dashArray(style.border, strokeWidth, "outline");

  append(
    visuals,
    svgElement("path", {
      class: FEEDBACK_CLASS,
      d: outlinePath(shape, {
        x: -FEEDBACK_GAP,
        y: -FEEDBACK_GAP,
        width: width + 2 * FEEDBACK_GAP,
        height: height + 2 * FEEDBACK_GAP,
      }),
      fill: "none",
      stroke: "none",
      "stroke-width": FEEDBACK_WIDTH,
      display: "none",
    }),
  );
  const bodies = parts.bodies.map((d) => {
    const path = svgElement("path", {
      class: "c4-body",
      d,
      "stroke-width": strokeWidth,
      "stroke-dasharray": dash,
      "stroke-linejoin": "round",
    });
    applyPaint(path, "fill", fill);
    applyPaint(path, "stroke", stroke);
    return append(visuals, path);
  });
  for (const d of parts.details) {
    const path = svgElement("path", {
      class: "c4-detail",
      d,
      fill: "none",
      "stroke-width": Math.min(strokeWidth, DETAIL_WIDTH),
      "stroke-linecap": "round",
    });
    applyPaint(path, "stroke", detail);
    append(visuals, path);
  }
  for (const mark of parts.marks) {
    const circle = svgElement("circle", {
      class: "c4-detail",
      cx: mark.cx,
      cy: mark.cy,
      r: mark.r,
    });
    applyPaint(circle, "fill", paintOf(textColour, "cd-c-fill-text"));
    append(visuals, circle);
  }

  const layout = elementTextLayout(element);
  if (shape === "Person") drawArms(visuals, element, layout.bands, inset, detail);
  for (const band of layout.bands) {
    appendBand(visuals, band, element.box, bandClass(band.band));
  }
  drawDrillBadge(visuals, element);
  const [body] = bodies;
  if (!body) throw new Error(`The shape ${shape} has no body.`);
  return body;
}

/** Structurizr's arm lines, started below the text so they never run through a line of it. */
function drawArms(
  visuals: SVGElement,
  element: SceneElement,
  bands: TextBands["bands"],
  inset: number,
  paint: Paint<StrokeRole>,
): void {
  const { width, height } = element.box;
  const arms = personArms(width, height);
  const textBottom = Math.max(
    0,
    ...bands
      .filter((band) => band.lines.length > 0)
      .map((band) => band.box.y + band.box.height - element.box.y),
  );
  const top = Math.max(arms.top, textBottom + ARM_GAP);
  const bottom = height - inset;
  if (bottom - top < 8) return;
  for (const x of arms.xs) {
    const path = svgElement("path", {
      class: "c4-detail",
      d: polylinePath([
        { x, y: top },
        { x, y: bottom },
      ]),
      fill: "none",
      "stroke-width": 1,
    });
    applyPaint(path, "stroke", paint);
    append(visuals, path);
  }
}

/** The drill badge (SPEC 6.5): part of the shape's graphics, stripped from every export. */
function drawDrillBadge(visuals: SVGElement, element: SceneElement): void {
  const badge = drillBadgeLayout(element);
  if (!badge) return;
  const origin = element.box;
  const group = append(visuals, svgElement("g", { class: DRILL_CLASS }));
  const chip = svgElement("rect", {
    x: badge.box.x - origin.x,
    y: badge.box.y - origin.y,
    width: badge.box.width,
    height: badge.box.height,
    rx: 4,
    "stroke-width": 1,
  });
  applyRole(chip, "cd-c-fill-flaeche-hoch");
  applyRole(chip, "cd-c-stroke-linie");
  append(group, chip);
  const scale = badge.icon.width / 24;
  const icon = append(
    group,
    svgElement("g", {
      transform: `translate(${badge.icon.x - origin.x} ${badge.icon.y - origin.y}) scale(${scale})`,
    }),
  );
  for (const [tag, attributes] of ZOOM_IN_NODES) {
    const node = svgElement(tag as "circle" | "line", {
      ...attributes,
      fill: "none",
      "stroke-width": LUCIDE_STROKE_WIDTH,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    applyRole(node, "cd-c-stroke-text");
    append(icon, node);
  }
  if (badge.count) {
    const count = svgElement("text", {
      x: badge.count.x - origin.x,
      y: badge.count.y - origin.y,
      "font-family": BADGE_FONT.family,
      "font-size": BADGE_FONT.size,
      "font-weight": BADGE_FONT.weight,
      "text-anchor": "start",
      "dominant-baseline": "central",
      "text-rendering": "geometricPrecision",
    });
    applyRole(count, "cd-c-fill-text");
    count.textContent = badge.count.text;
    append(group, count);
  }
}

/**
 * A boundary (SPEC 6.5): no fill unless a style sets one, a dashed outline in the contour role,
 * the caption at the bottom left.
 */
export function drawBoundary(visuals: SVGElement, boundary: SceneBoundary): SVGElement {
  const { style } = boundary;
  const { width, height } = boundary.box;
  const strokeWidth = clampWidth(style.strokeWidth);
  const inset = strokeWidth / 2;
  const frame = svgElement("path", {
    class: "c4-frame",
    d: rectanglePath(inset, inset, width - strokeWidth, height - strokeWidth, 6),
    "stroke-width": strokeWidth,
    "stroke-dasharray": dashArray(style.border, strokeWidth, "outline"),
  });
  if (style.fill === undefined) frame.setAttribute("fill", "none");
  else applyPaint(frame, "fill", { colour: style.fill });
  applyPaint(frame, "stroke", paintOf(style.stroke, "cd-c-stroke-kontur"));
  append(visuals, frame);
  for (const band of boundaryTextLayout(boundary).bands) {
    appendBand(visuals, band, boundary.box, bandClass(band.band));
  }
  return frame;
}

/** The line and the open chevron at its destination. */
function drawLine(
  visuals: SVGElement,
  waypoints: readonly Point[],
  thickness: number,
  lineStyle: LineStyle,
  stroke: Paint<StrokeRole>,
): SVGElement {
  const line = svgElement("path", {
    class: "c4-line",
    d: polylinePath(waypoints),
    fill: "none",
    "stroke-width": thickness,
    "stroke-dasharray": dashArray(lineStyle, thickness, "relationship"),
    "stroke-linejoin": "round",
  });
  applyPaint(line, "stroke", stroke);
  append(visuals, line);
  const chevron = chevronPath(waypoints);
  if (chevron) {
    const arrow = svgElement("path", {
      class: "c4-arrow",
      d: chevron,
      fill: "none",
      "stroke-width": thickness,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    applyPaint(arrow, "stroke", stroke);
    append(visuals, arrow);
  }
  return line;
}

/**
 * A relationship (SPEC 6.5) through the connection's docked waypoints: the line, the open
 * chevron at the destination, and the label in the label box on a ground of what lies behind it
 * (guide §10.1, Label-Halo), the canvas's ground unless the renderer names another.
 */
export function drawRelationship(
  visuals: SVGElement,
  relationship: SceneRelationship | undefined,
  waypoints: readonly Point[],
  labelGround: Paint<FillRole> = { role: "cd-c-fill-grund" },
): SVGElement {
  const style = relationship?.style;
  const thickness = clampWidth(style?.thickness ?? 1.5);
  const line = drawLine(
    visuals,
    waypoints,
    thickness,
    style?.line ?? "dashed",
    paintOf(style?.stroke, "cd-c-stroke-kontur"),
  );
  if (relationship) {
    const label = relationshipLabelLayout(relationship);
    if (label.backing) {
      const ground = svgElement("rect", {
        class: "c4-label-ground",
        x: label.backing.x,
        y: label.backing.y,
        width: label.backing.width,
        height: label.backing.height,
        rx: 2,
      });
      applyPaint(ground, "fill", labelGround);
      append(visuals, ground);
    }
    for (const band of label.bands) {
      appendBand(visuals, band, { x: 0, y: 0 }, bandClass(band.band));
    }
  }
  return line;
}

/**
 * What a connect and a bendpoint drag draw while they run: a relationship's dashed line and
 * chevron in the interaction blue (guide §10.1), without a label, since the edit writes none.
 */
export function drawRelationshipPreview(
  visuals: SVGElement,
  waypoints: readonly Point[],
): SVGElement {
  return drawLine(visuals, waypoints, 1.5, "dashed", { role: "cd-c-stroke-interaktion" });
}

/** A shape the scene does not know (yet): its box in the default look. */
export function drawPlaceholder(visuals: SVGElement, box: Box): SVGElement {
  const rect = svgElement("path", {
    class: "c4-body",
    d: rectanglePath(1, 1, Math.max(0, box.width - 2), Math.max(0, box.height - 2), 2),
    "stroke-width": 2,
  });
  applyRole(rect, "cd-c-fill-plot");
  applyRole(rect, "cd-c-stroke-text");
  return append(visuals, rect);
}

/** The drawn outline of an element in diagram coordinates, for cropping connections (SPEC 5.7). */
export function shapeOutline(element: SceneElement): string {
  return outlinePath(drawnShape(element.shape), element.box);
}
