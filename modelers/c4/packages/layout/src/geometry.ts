import type { Box, Point } from "@miragon/c4-schema-model";

export const GRID = 8;

/** Positions in the file are integers rounded half away from zero (SPEC 3.6). */
export function roundHalfAwayFromZero(value: number): number {
  return positiveZero(Math.sign(value) * Math.round(Math.abs(value)));
}

export function roundToGrid(value: number): number {
  return positiveZero(roundHalfAwayFromZero(value / GRID) * GRID);
}

export function ceilToGrid(value: number): number {
  return positiveZero(Math.ceil(value / GRID) * GRID);
}

export function floorToGrid(value: number): number {
  return positiveZero(Math.floor(value / GRID) * GRID);
}

/** `-0` would survive into the boxes and make two equal geometries compare unequal under `Object.is`. */
function positiveZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function right(box: Box): number {
  return box.x + box.width;
}

export function bottom(box: Box): number {
  return box.y + box.height;
}

export function centre(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Touching edges do not overlap; `clearance` widens `first` on every side before the test. */
export function overlaps(first: Box, second: Box, clearance = 0): boolean {
  return (
    first.x - clearance < right(second) &&
    second.x < right(first) + clearance &&
    first.y - clearance < bottom(second) &&
    second.y < bottom(first) + clearance
  );
}

export function unionOf(boxes: Iterable<Box | undefined>): Box | undefined {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let farRight = Number.NEGATIVE_INFINITY;
  let farBottom = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    if (!box) continue;
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    farRight = Math.max(farRight, right(box));
    farBottom = Math.max(farBottom, bottom(box));
  }
  if (left === Number.POSITIVE_INFINITY) return undefined;
  return { x: left, y: top, width: farRight - left, height: farBottom - top };
}

export function translated(box: Box, dx: number, dy: number): Box {
  return { x: box.x + dx, y: box.y + dy, width: box.width, height: box.height };
}

/** Where the line from the box centre toward `target` leaves the box; the centre when `target` lies inside. */
export function dockOnBox(box: Box, target: Point): Point {
  const middle = centre(box);
  const dx = target.x - middle.x;
  const dy = target.y - middle.y;
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : box.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : box.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  if (!(scale < 1)) return middle;
  return { x: middle.x + dx * scale, y: middle.y + dy * scale };
}

/**
 * Whether the segment from `from` to `to` runs through `box` widened by `clearance` on every side;
 * a segment that only touches the widened box's edge does not.
 */
export function segmentCrossesBox(from: Point, to: Point, box: Box, clearance = 0): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let enter = 0;
  let leave = 1;
  const sides: readonly (readonly [number, number])[] = [
    [-dx, from.x - (box.x - clearance)],
    [dx, right(box) + clearance - from.x],
    [-dy, from.y - (box.y - clearance)],
    [dy, bottom(box) + clearance - from.y],
  ];
  for (const [direction, room] of sides) {
    if (direction === 0) {
      if (room <= 0) return false;
      continue;
    }
    const at = room / direction;
    if (direction < 0) enter = Math.max(enter, at);
    else leave = Math.min(leave, at);
    if (enter >= leave) return false;
  }
  return true;
}

export function pointAlong(points: readonly Point[], fraction: number): Point {
  const first = points[0];
  if (!first) return { x: 0, y: 0 };
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    total += distance(points[index - 1] ?? first, points[index] ?? first);
  }
  let remaining = total * fraction;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1] ?? first;
    const to = points[index] ?? first;
    const length = distance(from, to);
    if (length > 0 && remaining <= length) {
      const ratio = remaining / length;
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    }
    remaining -= length;
  }
  return points[points.length - 1] ?? first;
}

function distance(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
