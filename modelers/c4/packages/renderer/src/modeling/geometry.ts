import { getIntersections } from "diagram-js/lib/layout/LayoutUtil";
import type { Box, Point } from "@miragon/c4-schema-model";

/** An end of a relationship: its box and, when known, the outline the drawing gives it. */
export interface DockTarget {
  readonly box: Box;
  /** An SVG path in diagram coordinates (`shapeOutline`); without one the end docks on the box. */
  readonly outline?: string | undefined;
}

const OUTLINE_CACHE_LIMIT = 4096;
const outlineDocks = new Map<string, Point | null>();

export function centreOf(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Where the line from the box's centre towards `toward` leaves the box. */
export function dockOnBox(box: Box, toward: Point): Point {
  const centre = centreOf(box);
  const dx = toward.x - centre.x;
  const dy = toward.y - centre.y;
  if (dx === 0 && dy === 0) return centre;
  const alongX = dx === 0 ? Number.POSITIVE_INFINITY : box.width / 2 / Math.abs(dx);
  const alongY = dy === 0 ? Number.POSITIVE_INFINITY : box.height / 2 / Math.abs(dy);
  const scale = Math.min(alongX, alongY);
  return { x: centre.x + dx * scale, y: centre.y + dy * scale };
}

/**
 * Where the line from the box's centre towards `toward` leaves the drawn outline for the last
 * time, so a person docks on its head when the line passes it; on the box when the outline does
 * not cross the line (the point lies inside it) or there is none.
 */
export function dockOn(end: DockTarget, toward: Point): Point {
  const { box, outline } = end;
  if (outline === undefined) return dockOnBox(box, toward);
  const centre = centreOf(box);
  if (centre.x === toward.x && centre.y === toward.y) return centre;
  const key = `${outline}|${centre.x},${centre.y}|${toward.x},${toward.y}`;
  let docked = outlineDocks.get(key);
  if (docked === undefined) {
    docked = lastCrossing(outline, centre, toward);
    if (outlineDocks.size >= OUTLINE_CACHE_LIMIT) outlineDocks.clear();
    outlineDocks.set(key, docked);
  }
  return docked ? copyPoint(docked) : dockOnBox(box, toward);
}

function lastCrossing(outline: string, from: Point, toward: Point): Point | null {
  const crossings = getIntersections(outline, `M${from.x},${from.y}L${toward.x},${toward.y}`);
  let last: { x: number; y: number; t2: number } | undefined;
  for (const crossing of crossings) {
    if (!last || crossing.t2 > last.t2) last = crossing;
  }
  return last ? { x: Math.round(last.x), y: Math.round(last.y) } : null;
}

/** Straight segments from the source's outline through the vertices to the target's outline. */
export function dockedPath(
  source: Box | DockTarget,
  target: Box | DockTarget,
  vertices: readonly Point[],
): Point[] {
  const from = dockTargetOf(source);
  const to = dockTargetOf(target);
  const first = vertices[0] ?? centreOf(to.box);
  const last = vertices.at(-1) ?? centreOf(from.box);
  return [dockOn(from, first), ...vertices.map(copyPoint), dockOn(to, last)];
}

function dockTargetOf(end: Box | DockTarget): DockTarget {
  return "box" in end ? end : { box: end };
}

export function copyPoint({ x, y }: Point): Point {
  return { x, y };
}

/**
 * The vertices outside every end's box. A vertex inside an end would run the line into that box
 * and back out, so a bendpoint drag's preview and its drop both leave it out.
 */
export function verticesOutside(vertices: readonly Point[], ends: readonly Box[]): Point[] {
  return vertices
    .filter(
      ({ x, y }) =>
        !ends.some(
          (end) => x >= end.x && x <= end.x + end.width && y >= end.y && y <= end.y + end.height,
        ),
    )
    .map(copyPoint);
}

/**
 * The vertices without the bend the layout fans a line out with (a route point the relationship
 * does not store): a bendpoint gesture keeps the points the user placed or moved, and that bend
 * never reaches the file.
 */
export function withoutFanBend(
  vertices: readonly Point[],
  relationship:
    { readonly vertices: readonly Point[]; readonly route: readonly Point[] } | undefined,
): Point[] {
  if (!relationship || relationship.vertices.length > 0) return vertices.map(copyPoint);
  return vertices
    .filter(({ x, y }) => !relationship.route.some((bend) => bend.x === x && bend.y === y))
    .map(copyPoint);
}

export function samePoints(left: readonly Point[], right: readonly Point[]): boolean {
  return (
    left.length === right.length &&
    left.every((point, index) => point.x === right[index]?.x && point.y === right[index]?.y)
  );
}

export function sameBox(element: Box, box: Box): boolean {
  return (
    element.x === box.x &&
    element.y === box.y &&
    element.width === box.width &&
    element.height === box.height
  );
}
