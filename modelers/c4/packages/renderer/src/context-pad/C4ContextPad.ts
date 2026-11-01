import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import ContextPad, { type ContextPadTarget } from "diagram-js/lib/features/context-pad/ContextPad";
import type Scheduler from "diagram-js/lib/features/scheduler/Scheduler";
import type { Shape } from "diagram-js/lib/model/Types";
import type { Box, Point } from "@miragon/c4-schema-model";
import type SceneLookup from "../draw/SceneLookup.js";
import { isRelationshipConnection, type C4Connection } from "../scene/types.js";
import { relationshipLabelLayout } from "../text/elementTextLayout.js";

/** diagram-js's gap between a shape and its pad, in diagram units. */
const PAD_MARGIN = 8;

/** Container pixels, as diagram-js places the pad. */
interface Position {
  readonly left: number;
  readonly top: number;
}

interface Rect extends Position {
  readonly width: number;
  readonly height: number;
}

interface StockContextPad {
  _getPosition(target: ContextPadTarget): Position;
  _current?: { readonly html: HTMLElement } | null;
}

const stock = ContextPad.prototype as unknown as StockContextPad;

/**
 * diagram-js's context pad, except where a relationship's opens (SPEC 5.3): diagram-js puts it at
 * the last waypoint, on the target's outline, where it covers the element the line ends at. Here
 * it opens next to the label, or the middle of a line without one, on the first side or corner
 * that covers neither end.
 */
export default class C4ContextPad extends ContextPad {
  static override $inject = ["canvas", "elementRegistry", "eventBus", "scheduler", "c4SceneLookup"];

  private readonly diagramCanvas: Canvas;
  private readonly lookup: SceneLookup;

  constructor(
    canvas: Canvas,
    elementRegistry: ElementRegistry,
    eventBus: EventBus,
    scheduler: Scheduler,
    lookup: SceneLookup,
  ) {
    super(canvas, elementRegistry, eventBus, scheduler);
    this.diagramCanvas = canvas;
    this.lookup = lookup;
  }

  _getPosition(target: ContextPadTarget): Position {
    if (Array.isArray(target) || !isRelationshipConnection(target)) {
      return stock._getPosition.call(this, target);
    }
    return this.relationshipPosition(target);
  }

  private relationshipPosition(connection: C4Connection): Position {
    const { x, y, scale } = this.diagramCanvas.viewbox();
    const onScreen = (box: Box): Rect => ({
      left: (box.x - x) * scale,
      top: (box.y - y) * scale,
      width: box.width * scale,
      height: box.height * scale,
    });
    const anchor = onScreen(this.anchorOf(connection));
    const ends = [connection.source, connection.target]
      .filter((end): end is Shape => end !== undefined && "width" in end)
      .map(onScreen);
    const html = (this as unknown as StockContextPad)._current?.html;
    const { width, height } = html?.getBoundingClientRect() ?? { width: 0, height: 0 };
    const margin = PAD_MARGIN * scale;
    const middle = { left: anchor.left + anchor.width / 2, top: anchor.top + anchor.height / 2 };
    const right = anchor.left + anchor.width + margin;
    const left = anchor.left - margin - width;
    const below = anchor.top + anchor.height + margin;
    const above = anchor.top - margin - height;
    const centredLeft = middle.left - width / 2;
    const centredTop = middle.top - height / 2;
    // The corners come last: between two diagonally close ends every side reaches one of
    // them, while the corner that points away from both stays clear.
    const places: readonly (readonly [number, number])[] = [
      [right, centredTop],
      [left, centredTop],
      [centredLeft, below],
      [centredLeft, above],
      [right, below],
      [left, below],
      [right, above],
      [left, above],
    ];
    const sides = places.map(([sideLeft, sideTop]): Rect => ({
      left: sideLeft,
      top: sideTop,
      width,
      height,
    }));
    const covered = (side: Rect) => ends.reduce((sum, end) => sum + overlapArea(side, end), 0);
    const clear = sides.find((side) => covered(side) === 0);
    const chosen =
      clear ?? sides.reduce((best, side) => (covered(side) < covered(best) ? side : best));
    return { left: chosen.left, top: chosen.top };
  }

  /** The label's drawn ground, else the middle of the line, in diagram units. */
  private anchorOf(connection: C4Connection): Box {
    const relationship = this.lookup.relationship(connection);
    const ground = relationship && relationshipLabelLayout(relationship).backing;
    if (ground) return ground;
    const { x, y } = halfwayAlong(connection.waypoints);
    return { x, y, width: 0, height: 0 };
  }
}

function overlapArea(first: Rect, second: Rect): number {
  const width =
    Math.min(first.left + first.width, second.left + second.width) -
    Math.max(first.left, second.left);
  const height =
    Math.min(first.top + first.height, second.top + second.height) -
    Math.max(first.top, second.top);
  return width > 0 && height > 0 ? width * height : 0;
}

function halfwayAlong(points: readonly Point[]): Point {
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of lengths.entries()) {
    const from = points[index]!;
    const to = points[index + 1]!;
    if (length > 0 && remaining <= length) {
      const ratio = remaining / length;
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    }
    remaining -= length;
  }
  return points[0] ?? { x: 0, y: 0 };
}
