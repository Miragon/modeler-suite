import type { Box, Point, Size } from "@miragon/c4-schema-model";

export interface FreeSpotQuery {
  /** Where the element would go on an empty canvas: the centre of the free area. */
  readonly centre: Point;
  readonly size: Size;
  /** The visible free area: a spot is looked for here first. */
  readonly area: Box;
  /** What the element must keep `gap` away from. */
  readonly obstacles: readonly Box[];
  readonly gap: number;
  /** The distance between two candidate centres. */
  readonly step: number;
  /** A further check of a spot clear of the obstacles (a frame it would grow over a stranger). */
  readonly accepts?: (box: Box) => boolean;
  /**
   * Where to look once the visible area has no spot clear by a gap: around the content, out of
   * sight, so the caller pans to it rather than land the element on another one.
   */
  readonly beyond?: { readonly area: Box; readonly step: number };
}

export function boxAround(centre: Point, size: Size): Box {
  return {
    x: centre.x - size.width / 2,
    y: centre.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

/** The area the box, widened by the gap, shares with the obstacle; 0 when they only touch. */
function overlapArea(box: Box, obstacle: Box, gap: number): number {
  const width =
    Math.min(box.x + box.width + gap, obstacle.x + obstacle.width) -
    Math.max(box.x - gap, obstacle.x);
  const height =
    Math.min(box.y + box.height + gap, obstacle.y + obstacle.height) -
    Math.max(box.y - gap, obstacle.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** Inside the area on each axis it can hold the box on; elsewhere its centre inside the area. */
function insideArea(box: Box, area: Box): boolean {
  const insideOn = (start: number, length: number, areaStart: number, areaLength: number) =>
    areaLength >= length
      ? start >= areaStart && start + length <= areaStart + areaLength
      : start + length / 2 >= areaStart && start + length / 2 <= areaStart + areaLength;
  return (
    insideOn(box.x, box.width, area.x, area.width) &&
    insideOn(box.y, box.height, area.y, area.height)
  );
}

/**
 * Where a keyboard create puts an element of `size` (guide §5.5): the centre of the free area,
 * else 24 units further down and right while the spot is taken, as long as that stays visible,
 * else the visible spot nearest the centre. A spot is taken when the box, widened by the gap,
 * overlaps an obstacle, so a new element never lands on or against another one, a label or a
 * frame it does not belong to. Where only a narrower gap leaves a spot, it takes that. With a
 * `beyond` area, a view crowded where it is zoomed in gets the clear spot nearest the centre out
 * of sight before a spot that touches something; only on a canvas with no clear spot at all does
 * the element land in view, where it covers the least.
 */
export function findFreeSpot(query: FreeSpotQuery): Point {
  const gaps = [...new Set([query.gap, query.gap / 2])];
  const wider = query.beyond && {
    ...query,
    area: query.beyond.area,
    step: query.beyond.step,
  };
  for (const gap of gaps) {
    const spot = clearSpot(query, gap);
    if (spot) return spot;
  }
  for (const gap of wider ? gaps : []) {
    const spot = clearSpot(wider as FreeSpotQuery, gap, false);
    if (spot) return spot;
  }
  const touching = clearSpot(query, 0) ?? (wider && clearSpot(wider, 0, false));
  if (touching) return touching;
  return leastCoveredInArea(query, (point) => coveredArea(query, point, 0));
}

/**
 * How far to pan so `box` shows inside `area`: nothing while it does, else so far that it sits in
 * the area's middle, clear of the edges where the host's chrome may open (a side inspector).
 */
export function panToShow(area: Box, box: Box): Point {
  const shown =
    box.x >= area.x &&
    box.y >= area.y &&
    box.x + box.width <= area.x + area.width &&
    box.y + box.height <= area.y + area.height;
  if (shown) return { x: 0, y: 0 };
  return {
    x: box.x + box.width / 2 - (area.x + area.width / 2),
    y: box.y + box.height / 2 - (area.y + area.height / 2),
  };
}

function coveredArea(query: FreeSpotQuery, point: Point, gap: number): number {
  const box = boxAround(point, query.size);
  return query.obstacles.reduce((sum, obstacle) => sum + overlapArea(box, obstacle, gap), 0);
}

function clearSpot(query: FreeSpotQuery, gap: number, diagonalFirst = true): Point | undefined {
  const { centre, size, area, step } = query;
  const free = (point: Point): boolean =>
    coveredArea(query, point, gap) === 0 && (query.accepts?.(boxAround(point, size)) ?? true);
  const diagonal = (index: number): Point => ({
    x: centre.x + index * step,
    y: centre.y + index * step,
  });
  for (
    let index = 0;
    diagonalFirst && insideArea(boxAround(diagonal(index), size), area);
    index += 1
  ) {
    if (free(diagonal(index))) return diagonal(index);
  }
  return nearestInArea(query, free);
}

/** The lattice point inside the area whose box covers the least, nearest the centre among equals. */
function leastCoveredInArea(query: FreeSpotQuery, covered: (point: Point) => number): Point {
  const { centre, size, area, step } = query;
  let best = { point: { x: centre.x, y: centre.y }, cover: covered(centre), distance: 0 };
  const reach = Math.ceil(Math.max(area.width, area.height) / step) + 1;
  for (let ring = 1; ring <= reach; ring += 1) {
    for (const [dx, dy] of ringOffsets(ring)) {
      const point = { x: centre.x + dx * step, y: centre.y + dy * step };
      if (!insideArea(boxAround(point, size), area)) continue;
      const cover = covered(point);
      const distance = Math.hypot(dx, dy) * step;
      if (cover < best.cover || (cover === best.cover && distance < best.distance)) {
        best = { point, cover, distance };
      }
    }
  }
  return best.point;
}

/**
 * The free lattice point nearest the centre inside the area, ring by ring: a ring's points are all
 * at least its radius away, so the search ends at the first ring beyond the best spot found. Ties
 * go down and right, the direction the diagonal steps in.
 */
function nearestInArea(query: FreeSpotQuery, free: (point: Point) => boolean): Point | undefined {
  const { centre, size, area, step } = query;
  const reach = Math.ceil(Math.max(area.width, area.height) / step) + 1;
  let best: { point: Point; distance: number } | undefined;
  for (let ring = 1; ring <= reach; ring += 1) {
    if (best && ring * step > best.distance) break;
    for (const [dx, dy] of ringOffsets(ring)) {
      const point = { x: centre.x + dx * step, y: centre.y + dy * step };
      const distance = Math.hypot(dx, dy) * step;
      if (best && distance >= best.distance) continue;
      if (!insideArea(boxAround(point, size), area) || !free(point)) continue;
      best = { point, distance };
    }
  }
  return best?.point;
}

/** The lattice offsets at Chebyshev distance `ring`, nearest first, down and right before up and left. */
function ringOffsets(ring: number): Array<readonly [number, number]> {
  const offsets: Array<readonly [number, number]> = [];
  for (let dx = -ring; dx <= ring; dx += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) offsets.push([dx, dy]);
    }
  }
  return offsets.sort(
    ([ax, ay], [bx, by]) => Math.hypot(ax, ay) - Math.hypot(bx, by) || by + bx - (ay + ax),
  );
}
