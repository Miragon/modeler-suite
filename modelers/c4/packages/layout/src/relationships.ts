import type { Box, ElementId, Point } from "@miragon/c4-schema-model";
import { LABEL_SIZE } from "./autoLayout.js";
import {
  centre,
  dockOnBox,
  overlaps,
  pointAlong,
  right,
  roundHalfAwayFromZero,
} from "./geometry.js";

export interface DrawnRelationship {
  readonly key: string;
  readonly sourceId: ElementId;
  readonly destinationId: ElementId;
}

export interface RelationshipGeometry {
  readonly vertices: Map<string, readonly Point[]>;
  readonly routes: Map<string, readonly Point[]>;
  readonly labelBoxes: Map<string, Box>;
}

/** Between two labels. */
const LABEL_GAP = 8;
/**
 * The most a drawn label covers, centred on its slot: the renderer's `LABEL_REACH`, to which a
 * label's ground grows before its text is cut. The bends of a fan keep this far apart, since the
 * layout reads no text and so cannot know how far a label grows.
 */
const LABEL_REACH = { width: 240, height: 72 } as const;
/** A label slides along its line between a quarter and three quarters of the way, in twentieths. */
const SLIDE_FIRST_STEP = 5;
const SLIDE_LAST_STEP = 15;
const SLIDE_STEPS = 20;

/**
 * The user's vertices in every mode, so pinning an auto-laid-out view changes no line; dagre's bend
 * points are never used (SPEC 4.3). The routes are what the lines are drawn through: the vertices,
 * or, where a pair has several lines without vertices, one bend each that fans them out, so every
 * line and its arrowhead show. A route's bend is never stored. Each label box sits on its route,
 * halfway (a fanned line's at its bend), or as near to that as it clears the labels before it and
 * the elements that are not its ends. Nothing here reads text, so a rename or a new description
 * moves no label.
 */
export function relationshipGeometry(
  relationships: readonly DrawnRelationship[],
  boxes: ReadonlyMap<string, Box>,
  stored: ReadonlyMap<string, readonly Point[]>,
): RelationshipGeometry {
  const drawn: DrawnRelationship[] = [];
  const vertices = new Map<string, readonly Point[]>();
  for (const relationship of relationships) {
    if (vertices.has(relationship.key)) continue;
    if (!boxes.has(relationship.sourceId) || !boxes.has(relationship.destinationId)) continue;
    drawn.push(relationship);
    vertices.set(relationship.key, stored.get(relationship.key) ?? []);
  }
  const routes = fannedRoutes(drawn, boxes, vertices);
  const labelBoxes = placedLabels(drawn, boxes, vertices, routes);
  return { vertices, routes, labelBoxes };
}

/**
 * Each line of a pair with several lines and no vertices bends once, halfway across the gap, its
 * bend apart from the next one's by what keeps their labels, which sit at the bends, apart however
 * long their text: a label's reach in height and a gap where the pair runs across (the labels
 * stack), its reach in width and a gap where it runs up or down (they sit side by side). So no
 * line of the pair runs through a label of another, whichever draws on top. An odd count keeps its
 * middle line straight.
 */
function fannedRoutes(
  drawn: readonly DrawnRelationship[],
  boxes: ReadonlyMap<string, Box>,
  vertices: ReadonlyMap<string, readonly Point[]>,
): Map<string, readonly Point[]> {
  const routes = new Map<string, readonly Point[]>();
  const pairs = new Map<string, DrawnRelationship[]>();
  for (const relationship of drawn) {
    const own = vertices.get(relationship.key) ?? [];
    routes.set(relationship.key, own);
    if (own.length > 0 || relationship.sourceId === relationship.destinationId) continue;
    const pair = JSON.stringify(endsInOrder(relationship));
    const lines = pairs.get(pair);
    if (lines) lines.push(relationship);
    else pairs.set(pair, [relationship]);
  }
  for (const lines of pairs.values()) {
    const [first] = lines;
    if (!first || lines.length < 2) continue;
    const [lowId, highId] = endsInOrder(first);
    const low = boxes.get(lowId);
    const high = boxes.get(highId);
    if (!low || !high) continue;
    const from = centre(low);
    const to = centre(high);
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) continue;
    const direction = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    const normal = { x: -direction.y, y: direction.x };
    const start = dockOnBox(low, to);
    const end = dockOnBox(high, from);
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const spacing =
      Math.abs(direction.x) >= Math.abs(direction.y)
        ? (LABEL_REACH.height + LABEL_GAP) / Math.abs(direction.x)
        : (LABEL_REACH.width + LABEL_GAP) / Math.abs(direction.y);
    lines.forEach((line, index) => {
      const offset = index - (lines.length - 1) / 2;
      if (offset === 0) return;
      const bend = {
        x: roundHalfAwayFromZero(middle.x + normal.x * offset * spacing),
        y: roundHalfAwayFromZero(middle.y + normal.y * offset * spacing),
      };
      if (!contains(low, bend) && !contains(high, bend)) routes.set(line.key, [bend]);
    });
  }
  return routes;
}

/** The ends of a pair in one order whichever way a line runs, so A -> B and B -> A share a fan. */
function endsInOrder(relationship: DrawnRelationship): [ElementId, ElementId] {
  const { sourceId, destinationId } = relationship;
  return sourceId < destinationId ? [sourceId, destinationId] : [destinationId, sourceId];
}

function placedLabels(
  drawn: readonly DrawnRelationship[],
  boxes: ReadonlyMap<string, Box>,
  vertices: ReadonlyMap<string, readonly Point[]>,
  routes: ReadonlyMap<string, readonly Point[]>,
): Map<string, Box> {
  const labelBoxes = new Map<string, Box>();
  for (const relationship of drawn) {
    const source = boxes.get(relationship.sourceId);
    const destination = boxes.get(relationship.destinationId);
    if (!source || !destination) continue;
    const route = routes.get(relationship.key) ?? [];
    if (relationship.sourceId === relationship.destinationId && route.length === 0) {
      labelBoxes.set(
        relationship.key,
        labelBoxAt({ x: right(source) + LABEL_SIZE.width / 2, y: centre(source).y }),
      );
      continue;
    }
    const strangers = [...boxes]
      .filter(([id]) => id !== relationship.sourceId && id !== relationship.destinationId)
      .map(([, box]) => box);
    const path = dockedPath(source, destination, route);
    // The fan keeps its bends apart, not the halfway points of its lines: those drift towards
    // each other where a diagonal pair's two segments differ in length.
    const fanned = route.length > 0 && (vertices.get(relationship.key) ?? []).length === 0;
    const anchor = fanned ? fractionAt(path, 1) : 0.5;
    labelBoxes.set(relationship.key, slidLabel(path, anchor, [...labelBoxes.values()], strangers));
  }
  return labelBoxes;
}

/** The points a line is drawn through: from the source's outline, along its route, to the destination's. */
export function dockedPath(source: Box, destination: Box, route: readonly Point[]): Point[] {
  const first = route[0] ?? centre(destination);
  const last = route[route.length - 1] ?? centre(source);
  return [dockOnBox(source, first), ...route, dockOnBox(destination, last)];
}

/** Where the label of a line without a fan sits: halfway, or slid as `relationshipGeometry` slides it. */
export function labelSlotOn(
  path: readonly Point[],
  labels: readonly Box[],
  strangers: readonly Box[],
): Box {
  return slidLabel(path, 0.5, labels, strangers);
}

/** How far along `path` its point at `index` lies, as a fraction of the whole length. */
function fractionAt(path: readonly Point[], index: number): number {
  let before = 0;
  let total = 0;
  for (let at = 1; at < path.length; at++) {
    const from = path[at - 1];
    const to = path[at];
    if (!from || !to) continue;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    total += length;
    if (at <= index) before += length;
  }
  return total === 0 ? 0.5 : before / total;
}

/**
 * The first spot along the route, nearest `anchor` first, where the label clears the labels
 * placed before it by a gap and every stranger; where none does, the spot that covers least.
 */
function slidLabel(
  path: readonly Point[],
  anchor: number,
  labels: readonly Box[],
  strangers: readonly Box[],
): Box {
  const spots = new Set<number>([anchor]);
  for (let step = SLIDE_FIRST_STEP; step <= SLIDE_LAST_STEP; step++) spots.add(step / SLIDE_STEPS);
  const ordered = [...spots].sort(
    (left, right) => Math.abs(left - anchor) - Math.abs(right - anchor) || left - right,
  );
  let best: Box | undefined;
  let bestCover = Number.POSITIVE_INFINITY;
  for (const spot of ordered) {
    const box = labelBoxAt(pointAlong(path, spot));
    const cover = coverOf(box, labels, LABEL_GAP / 2) + coverOf(box, strangers, 0);
    if (cover === 0) return box;
    if (cover < bestCover) {
      best = box;
      bestCover = cover;
    }
  }
  return best ?? labelBoxAt(pointAlong(path, anchor));
}

/** The area of `box`, grown by `clearance`, that the others cover. */
function coverOf(box: Box, others: readonly Box[], clearance: number): number {
  let cover = 0;
  for (const other of others) {
    if (!overlaps(box, other, clearance)) continue;
    const width =
      Math.min(box.x + box.width + clearance, other.x + other.width) -
      Math.max(box.x - clearance, other.x);
    const height =
      Math.min(box.y + box.height + clearance, other.y + other.height) -
      Math.max(box.y - clearance, other.y);
    cover += Math.max(width, 0) * Math.max(height, 0);
  }
  return cover;
}

function contains(box: Box, point: Point): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

function labelBoxAt(anchor: Point): Box {
  return {
    x: roundHalfAwayFromZero(anchor.x - LABEL_SIZE.width / 2),
    y: roundHalfAwayFromZero(anchor.y - LABEL_SIZE.height / 2),
    width: LABEL_SIZE.width,
    height: LABEL_SIZE.height,
  };
}
