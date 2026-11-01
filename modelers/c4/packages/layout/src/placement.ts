/*
 * Placement of the elements a pinned view has no stored box for (SPEC 4.3): next to a placed
 * neighbour on the 8-unit grid, else in a row below the placed content. A place is free when the
 * box keeps its distance from every box, stays out of the frames it does not belong to, and the
 * frames it grows do not reach anything new. Among the free places, one in the clear comes first:
 * the straight lines to the placed neighbours cross no other box and no label, and no other line
 * or label runs over the box. Beside a neighbour, else the clear place nearest it (beside a
 * neighbour or a sibling, or on the grid around the neighbour), and only where none is clear the
 * first free one. A clear place whose frames keep their room from what they do not hold, and that
 * keeps a label's room from every frame it does not belong to with the labels of its lines off that
 * frame's edge, comes before one that grows a frame up to a stranger or sits close to a frame.
 */
import type { Box, ElementId, Point, Size } from "@miragon/c4-schema-model";
import { LABEL_SIZE } from "./autoLayout.js";
import type { ClusterKey, ClusterTree } from "./clusters.js";
import { deriveFrames, padded, type Frame } from "./frames.js";
import {
  bottom,
  ceilToGrid,
  centre,
  dockOnBox,
  floorToGrid,
  overlaps,
  right,
  roundToGrid,
  segmentCrossesBox,
  unionOf,
} from "./geometry.js";
import {
  dockedPath,
  labelSlotOn,
  relationshipGeometry,
  type DrawnRelationship,
} from "./relationships.js";

/** A relationship's label fits between two neighbours, with this much room on either side. */
export const LABEL_MARGIN = 16;
/** Side by side: the label lies across the gap, so the gap takes its width. */
export const HORIZONTAL_GAP = LABEL_SIZE.width + 2 * LABEL_MARGIN;
/** One above the other: the gap takes the label's height. */
export const VERTICAL_GAP = LABEL_SIZE.height + 2 * LABEL_MARGIN;
/** Half the narrower gap: a new box keeps it from every box but the neighbour it was put next to. */
const CLEARANCE = VERTICAL_GAP / 2;
const MAX_ANCHORS = 16;
const MIN_ROW_WIDTH = 4 * (240 + HORIZONTAL_GAP);
const MAX_ROW_STEPS = 10_000;
/** A line in the clear passes another box or label at least this far off, so it never grazes one. */
const LINE_CLEARANCE = 8;
/** The grid the search around a neighbour steps on: twice the layout's, so it stays cheap. */
const SEARCH_STEP = 16;
/** Rings of the search around a neighbour at most: past the content every place is farther. */
const MAX_SEARCH_RINGS = 160;
/**
 * A frame a new box grows keeps this far from what it does not hold, as the box keeps from a box:
 * a stranger on a frame's edge reads as one of its members.
 */
const FRAME_ROOM = CLEARANCE;

/**
 * A place for a box: not free or not in the clear (`taken`), in the clear with a frame it grows
 * coming within `FRAME_ROOM` of a stranger or the box too close to a frame it does not belong to
 * (`cramped`), or in the clear with room (`roomy`).
 */
type ClearPlace = "taken" | "cramped" | "roomy";

interface Candidate {
  readonly box: Box;
  readonly distance: number;
}

export interface PlacementItem {
  /** An element id, or a leaf boundary's cluster key. */
  readonly key: string;
  readonly size: Size;
  /** Taken before any slot while nothing covers it: where the item was drawn before. */
  readonly preferred?: Box | undefined;
}

export interface PlacementContext {
  readonly tree: ClusterTree;
  readonly relationships: readonly {
    readonly key?: string;
    readonly sourceId: ElementId;
    readonly destinationId: ElementId;
  }[];
  /** The stored vertices by relationship key, which the lines already drawn run through. */
  readonly vertices?: ReadonlyMap<string, readonly Point[]>;
}

/** The lines and labels drawn between the placed elements: what a place in the clear keeps off. */
interface DrawnLines {
  readonly paths: readonly (readonly Point[])[];
  readonly labels: readonly Box[];
}

/** What one item's search for a place in the clear tests every candidate against. */
interface Surroundings {
  readonly key: string;
  readonly neighbours: readonly Box[];
  /** The other elements, nearest the first neighbour first: a line meets those first. */
  readonly others: readonly Box[];
  /** Every box and every frame the item does not belong to, which it keeps its clearance from. */
  readonly obstacles: readonly Box[];
  /** The frames the item does not belong to. */
  readonly foreignFrames: readonly Box[];
}

interface Row {
  readonly left: number;
  readonly limit: number;
  y: number;
  cursor: number;
  height: number;
}

/**
 * Puts a box for every item into `boxes`: first each preferred box nothing covers, then the rest in
 * order; an item already there keeps its box. A slot beside a neighbour in the clear, its frames
 * keeping their room, is taken at once; an item without one waits its turn, then takes the clear
 * place nearest its neighbour, else the first free slot as before.
 */
export function placeItems(
  boxes: Map<string, Box>,
  items: readonly PlacementItem[],
  context: PlacementContext,
): void {
  const placement = new Placement(boxes, context);
  let remaining = items
    .filter(
      (item, index) =>
        !boxes.has(item.key) && items.findIndex((other) => other.key === item.key) === index,
    )
    .filter((item) => !placement.atPreferred(item));
  while (remaining.length > 0) {
    let progressed = true;
    while (progressed) {
      progressed = false;
      remaining = remaining.filter((item) => {
        const placed = placement.besideNeighboursInTheClear(item);
        if (placed) progressed = true;
        return !placed;
      });
    }
    const next = remaining.shift();
    if (next) {
      if (
        !placement.nearNeighboursInTheClear(next) &&
        !placement.besideNeighbours(next) &&
        !placement.besideSiblings(next)
      ) {
        placement.inRow(next);
      }
    }
  }
}

class Placement {
  private readonly emptyAtStart: boolean;
  private readonly adjacent = new Map<string, string[]>();
  private frames: Map<ClusterKey, Frame>;
  private row: Row | undefined;
  private drawn: DrawnLines | undefined;

  constructor(
    private readonly boxes: Map<string, Box>,
    private readonly context: PlacementContext,
  ) {
    this.emptyAtStart = boxes.size === 0;
    this.frames = deriveFrames(context.tree, boxes);
    for (const { sourceId, destinationId } of context.relationships) {
      if (sourceId === destinationId) continue;
      this.adjacent.set(sourceId, [...(this.adjacent.get(sourceId) ?? []), destinationId]);
      this.adjacent.set(destinationId, [...(this.adjacent.get(destinationId) ?? []), sourceId]);
    }
  }

  /** No clearance: the item already stood there, so keeping it there moves nothing. */
  atPreferred(item: PlacementItem): boolean {
    const preferred = item.preferred;
    if (!preferred) return false;
    const box = { x: preferred.x, y: preferred.y, ...item.size };
    if (!this.isClear(item.key, box, 0) || !this.growsFramesFreely(item.key, box)) return false;
    this.put(item.key, box);
    return true;
  }

  besideNeighbours(item: PlacementItem): boolean {
    return this.besideAny(item, this.neighbours(item.key));
  }

  besideNeighboursInTheClear(item: PlacementItem): boolean {
    const surroundings = this.surroundings(item.key);
    if (!surroundings) return false;
    for (const anchor of surroundings.neighbours) {
      for (const candidate of slotsBeside(anchor, item.size)) {
        if (this.placeInTheClear(candidate, surroundings) === "roomy") {
          this.put(item.key, candidate);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * The place in the clear nearest the first placed neighbour, where a label still fits between
   * the box and each neighbour: a slot beside a neighbour or a sibling, or a spot on the grid
   * around the neighbour, ring by ring. The nearest roomy place wins, so the search ends at the
   * first ring beyond it; without one, the nearest cramped place.
   */
  nearNeighboursInTheClear(item: PlacementItem): boolean {
    const surroundings = this.surroundings(item.key);
    const anchor = surroundings?.neighbours[0];
    if (!surroundings || !anchor) return false;
    const middle = centre(anchor);
    let roomy: Candidate | undefined;
    let cramped: Candidate | undefined;
    const consider = (box: Box): void => {
      const distance = distanceBetween(centre(box), middle);
      if (roomy && distance >= roomy.distance) return;
      if (!roomForLabels(box, surroundings.neighbours)) return;
      const place = this.placeInTheClear(box, surroundings);
      if (place === "roomy") roomy = { box, distance };
      if (place !== "taken" && (!cramped || distance < cramped.distance)) {
        cramped = { box, distance };
      }
    };
    for (const slotAnchor of [...surroundings.neighbours, ...this.siblingAnchors(item)]) {
      for (const slot of slotsBeside(slotAnchor, item.size)) consider(slot);
    }
    const start = {
      x: roundToGrid(middle.x - item.size.width / 2),
      y: roundToGrid(middle.y - item.size.height / 2),
    };
    const window = this.searchWindow(item.size);
    const rings = window ? ringsToCover(start, item.size, window) : 0;
    for (let ring = 1; window && ring <= rings; ring++) {
      if (roomy && ring * SEARCH_STEP > roomy.distance) break;
      for (const [column, row] of ringOffsets(ring)) {
        const box = {
          x: start.x + column * SEARCH_STEP,
          y: start.y + row * SEARCH_STEP,
          ...item.size,
        };
        if (within(box, window)) consider(box);
      }
    }
    const best = roomy ?? cramped;
    if (!best) return false;
    this.put(item.key, best.box);
    return true;
  }

  /** Inside a frame, the members it already holds are the next best neighbours. */
  besideSiblings(item: PlacementItem): boolean {
    return this.besideAny(item, this.siblingAnchors(item));
  }

  private siblingAnchors(item: PlacementItem): Box[] {
    const anchors: Box[] = [];
    for (const key of this.context.tree.ancestors(item.key)) {
      const cluster = this.context.tree.clusters.get(key);
      if (!cluster) continue;
      const boxes = [
        ...[...cluster.members, ...cluster.elements].map((id) => this.boxes.get(id)),
        ...cluster.children.map((child) => this.frames.get(child)?.frame),
      ];
      for (const box of boxes) {
        if (box && !anchors.includes(box)) anchors.push(box);
      }
    }
    return anchors.slice(0, MAX_ANCHORS);
  }

  inRow(item: PlacementItem): void {
    const row = this.row ?? this.startRow();
    this.row = row;
    for (let step = 0; step < MAX_ROW_STEPS; step++) {
      if (row.cursor > row.left && row.cursor + item.size.width > row.left + row.limit) {
        row.y = ceilToGrid(row.y + row.height + VERTICAL_GAP);
        row.cursor = row.left;
        row.height = 0;
      }
      const candidate = { x: row.cursor, y: row.y, ...item.size };
      row.cursor = ceilToGrid(row.cursor + item.size.width + HORIZONTAL_GAP);
      if (this.isFree(item.key, candidate)) {
        row.height = Math.max(row.height, item.size.height);
        this.put(item.key, candidate);
        return;
      }
    }
    const content = this.content();
    this.put(item.key, {
      x: content ? floorToGrid(content.x) : 0,
      y: content ? ceilToGrid(bottom(content) + VERTICAL_GAP) : 0,
      ...item.size,
    });
  }

  private besideAny(item: PlacementItem, anchors: readonly Box[]): boolean {
    for (const anchor of anchors) {
      for (const candidate of slotsBeside(anchor, item.size)) {
        if (this.fits(item.key, candidate)) {
          this.put(item.key, candidate);
          return true;
        }
      }
    }
    return false;
  }

  private fits(key: string, candidate: Box): boolean {
    return this.isFree(key, candidate) && this.growsFramesFreely(key, candidate);
  }

  /** `isFree`, the lines, then the frames, the dearest test, for one item's surroundings. */
  private placeInTheClear(candidate: Box, surroundings: Surroundings): ClearPlace {
    if (!this.emptyAtStart && candidate.x === 0 && candidate.y === 0) return "taken";
    for (const obstacle of surroundings.obstacles) {
      if (overlaps(candidate, obstacle, CLEARANCE)) return "taken";
    }
    if (!this.inTheClear(candidate, surroundings.neighbours, surroundings.others)) return "taken";
    const growth = this.frameGrowth(surroundings.key, candidate);
    if (growth !== "roomy") return growth;
    return this.roomFromForeignFrames(candidate, surroundings) ? "roomy" : "cramped";
  }

  /**
   * Outside a frame it does not belong to, the box keeps a label's room from it, as from a
   * neighbour, and the label of each of its lines lies off the frame's edge: a stranger close to a
   * frame reads as one of its members, and a label across the edge as neither inside nor out.
   */
  private roomFromForeignFrames(candidate: Box, surroundings: Surroundings): boolean {
    const frames = surroundings.foreignFrames;
    if (frames.length === 0) return true;
    if (!roomForLabels(candidate, frames)) return false;
    const labels = this.drawnLines().labels;
    for (const neighbour of surroundings.neighbours) {
      const strangers = surroundings.others.filter((other) => other !== neighbour);
      const path = dockedPath(neighbour, candidate, []);
      const label = labelSlotOn(path, labels, strangers);
      if (frames.some((frame) => acrossEdge(label, frame))) return false;
    }
    return true;
  }

  /** Undefined for an item without a placed neighbour: it has no line to keep clear. */
  private surroundings(key: string): Surroundings | undefined {
    const neighbours = this.neighbours(key);
    const [anchor] = neighbours;
    if (!anchor) return undefined;
    const middle = centre(anchor);
    const others = this.elementBoxes(key)
      .map((box) => ({ box, distance: distanceBetween(centre(box), middle) }))
      .sort((first, second) => first.distance - second.distance)
      .map(({ box }) => box);
    const own = new Set(this.context.tree.ancestors(key));
    const foreignFrames: Box[] = [];
    for (const [cluster, frame] of this.frames) {
      if (cluster === key || own.has(cluster) || this.lists(cluster, key)) continue;
      foreignFrames.push(frame.frame);
    }
    const obstacles = [...this.boxes.values(), ...foreignFrames];
    return { key, neighbours, others, obstacles, foreignFrames };
  }

  /**
   * The lines from the box to its placed neighbours cross no other element and no label, and no
   * line or label already drawn runs over the box: a line through a stranger reads as its own.
   */
  private inTheClear(candidate: Box, neighbours: readonly Box[], others: readonly Box[]): boolean {
    const drawn = this.drawnLines();
    for (const neighbour of neighbours) {
      const from = dockOnBox(neighbour, centre(candidate));
      const to = dockOnBox(candidate, centre(neighbour));
      for (const other of others) {
        if (other === neighbour) continue;
        if (segmentCrossesBox(from, to, other, LINE_CLEARANCE)) return false;
      }
      for (const label of drawn.labels) {
        if (segmentCrossesBox(from, to, label, LINE_CLEARANCE)) return false;
      }
    }
    for (const label of drawn.labels) {
      if (overlaps(candidate, label, LINE_CLEARANCE)) return false;
    }
    for (const path of drawn.paths) {
      for (let index = 1; index < path.length; index++) {
        const from = path[index - 1];
        const to = path[index];
        if (from && to && segmentCrossesBox(from, to, candidate, LINE_CLEARANCE)) return false;
      }
    }
    return true;
  }

  private elementBoxes(except?: string): Box[] {
    const boxes: Box[] = [];
    for (const [key, box] of this.boxes) {
      if (key !== except && !this.context.tree.clusters.has(key)) boxes.push(box);
    }
    return boxes;
  }

  private drawnLines(): DrawnLines {
    if (this.drawn) return this.drawn;
    const elements = new Map<string, Box>();
    for (const [key, box] of this.boxes) {
      if (!this.context.tree.clusters.has(key)) elements.set(key, box);
    }
    const relationships: DrawnRelationship[] = this.context.relationships.map(
      (relationship, index) => ({
        key: relationship.key ?? `${index}`,
        sourceId: relationship.sourceId,
        destinationId: relationship.destinationId,
      }),
    );
    const { routes, labelBoxes } = relationshipGeometry(
      relationships,
      elements,
      this.context.vertices ?? new Map(),
    );
    const paths: Point[][] = [];
    for (const relationship of relationships) {
      const route = routes.get(relationship.key);
      const source = elements.get(relationship.sourceId);
      const destination = elements.get(relationship.destinationId);
      if (!route || !source || !destination || source === destination) continue;
      paths.push(dockedPath(source, destination, route));
    }
    this.drawn = { paths, labels: [...labelBoxes.values()] };
    return this.drawn;
  }

  /**
   * The content and room for the item and two gaps on every side: a line from a frame's member to
   * a place outside the frame crosses the frame's padding before its label clears the edge, and
   * farther out every place is farther.
   */
  private searchWindow(size: Size): Box | undefined {
    const content = this.content();
    if (!content) return undefined;
    const across = size.width + 2 * HORIZONTAL_GAP;
    const along = size.height + 2 * VERTICAL_GAP;
    return {
      x: content.x - across,
      y: content.y - along,
      width: content.width + 2 * across,
      height: content.height + 2 * along,
    };
  }

  private neighbours(key: string): Box[] {
    const anchors: Box[] = [];
    for (const other of this.adjacent.get(key) ?? []) {
      const box = this.boxes.get(other);
      if (box && !anchors.includes(box)) anchors.push(box);
      if (anchors.length === MAX_ANCHORS) break;
    }
    return anchors;
  }

  private isFree(key: string, candidate: Box): boolean {
    if (!this.emptyAtStart && candidate.x === 0 && candidate.y === 0) return false;
    return this.isClear(key, candidate, CLEARANCE);
  }

  private isClear(key: string, candidate: Box, clearance: number): boolean {
    for (const box of this.boxes.values()) {
      if (overlaps(candidate, box, clearance)) return false;
    }
    const own = new Set(this.context.tree.ancestors(key));
    for (const [cluster, frame] of this.frames) {
      if (cluster === key || own.has(cluster) || this.lists(cluster, key)) continue;
      if (overlaps(candidate, frame.frame, clearance)) return false;
    }
    return true;
  }

  /** The frames around the item grow with it; they may not reach a box or a frame they did not reach before. */
  private growsFramesFreely(key: string, candidate: Box): boolean {
    return this.frameGrowth(key, candidate) !== "taken";
  }

  /**
   * How the frames around the item grow with it: over a box or a frame they did not reach before
   * (`taken`), within `FRAME_ROOM` of one they did not come that close to (`cramped`), or `roomy`.
   */
  private frameGrowth(key: string, candidate: Box): ClearPlace {
    let growth: ClearPlace = "roomy";
    let inner = candidate;
    for (const cluster of this.context.tree.ancestors(key)) {
      const before = this.frames.get(cluster);
      const grown = padded(unionOf([before?.content, inner]) ?? inner);
      const reaches = (box: Box, room: number): boolean =>
        overlaps(grown, box, room) && !(before && overlaps(before.frame, box, room));
      for (const [other, box] of this.boxes) {
        if (this.isInside(other, cluster)) continue;
        if (reaches(box, 0)) return "taken";
        if (growth === "roomy" && reaches(box, FRAME_ROOM)) growth = "cramped";
      }
      for (const [other, frame] of this.frames) {
        if (this.related(other, cluster)) continue;
        if (reaches(frame.frame, 0)) return "taken";
        if (growth === "roomy" && reaches(frame.frame, FRAME_ROOM)) growth = "cramped";
      }
      inner = grown;
    }
    return growth;
  }

  private isInside(key: string, cluster: ClusterKey): boolean {
    return (
      key === cluster ||
      this.lists(cluster, key) ||
      this.context.tree.ancestors(key).includes(cluster)
    );
  }

  private related(first: ClusterKey, second: ClusterKey): boolean {
    return (
      first === second ||
      this.context.tree.ancestors(first).includes(second) ||
      this.context.tree.ancestors(second).includes(first)
    );
  }

  private lists(cluster: ClusterKey, key: string): boolean {
    return this.context.tree.clusters.get(cluster)?.members.includes(key) === true;
  }

  private put(key: string, box: Box): void {
    this.boxes.set(key, box);
    this.frames = deriveFrames(this.context.tree, this.boxes);
    this.drawn = undefined;
  }

  private content(): Box | undefined {
    return unionOf([
      ...this.boxes.values(),
      ...[...this.frames.values()].map((frame) => frame.frame),
    ]);
  }

  private startRow(): Row {
    const content = this.content();
    if (!content) return { left: 0, limit: MIN_ROW_WIDTH, y: 0, cursor: 0, height: 0 };
    const left = floorToGrid(content.x);
    return {
      left,
      limit: Math.max(MIN_ROW_WIDTH, right(content) - left),
      y: ceilToGrid(bottom(content) + VERTICAL_GAP),
      cursor: left,
      height: 0,
    };
  }
}

function ringsToCover(start: Point, size: Size, window: Box): number {
  const reach = Math.max(
    start.x - window.x,
    right(window) - (start.x + size.width),
    start.y - window.y,
    bottom(window) - (start.y + size.height),
  );
  return Math.min(MAX_SEARCH_RINGS, Math.max(0, Math.ceil(reach / SEARCH_STEP)));
}

function within(box: Box, window: Box): boolean {
  return (
    box.x >= window.x &&
    box.y >= window.y &&
    right(box) <= right(window) &&
    bottom(box) <= bottom(window)
  );
}

/** Each neighbour keeps a label's room from the box, across the gap or above and below it. */
function roomForLabels(box: Box, neighbours: readonly Box[]): boolean {
  return neighbours.every((neighbour) => {
    const across = Math.max(neighbour.x - right(box), box.x - right(neighbour));
    const along = Math.max(neighbour.y - bottom(box), box.y - bottom(neighbour));
    return across >= HORIZONTAL_GAP || along >= VERTICAL_GAP;
  });
}

/** The label comes within `LABEL_MARGIN` of the frame's edge, from outside or from inside. */
function acrossEdge(label: Box, frame: Box): boolean {
  if (!overlaps(label, frame, LABEL_MARGIN)) return false;
  return !(
    label.x >= frame.x + LABEL_MARGIN &&
    label.y >= frame.y + LABEL_MARGIN &&
    right(label) <= right(frame) - LABEL_MARGIN &&
    bottom(label) <= bottom(frame) - LABEL_MARGIN
  );
}

function distanceBetween(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

const RING_OFFSETS: (readonly (readonly [number, number])[])[] = [];

/**
 * The grid offsets at Chebyshev distance `ring`, nearest first, then right, below, left and above
 * among equals, so the search is deterministic; computed once per ring.
 */
function ringOffsets(ring: number): readonly (readonly [number, number])[] {
  const known = RING_OFFSETS[ring];
  if (known) return known;
  const offsets: { offset: readonly [number, number]; length: number; turn: number }[] = [];
  for (let column = -ring; column <= ring; column++) {
    for (let row = -ring; row <= ring; row++) {
      if (Math.max(Math.abs(column), Math.abs(row)) !== ring) continue;
      const angle = Math.atan2(row, column);
      offsets.push({
        offset: [column, row],
        length: Math.hypot(column, row),
        turn: angle < 0 ? angle + 2 * Math.PI : angle,
      });
    }
  }
  const ordered = offsets
    .sort((first, second) => first.length - second.length || first.turn - second.turn)
    .map(({ offset }) => offset);
  RING_OFFSETS[ring] = ordered;
  return ordered;
}

function slotsBeside(anchor: Box, size: Size): Box[] {
  const middle = centre(anchor);
  const alignedX = roundToGrid(middle.x - size.width / 2);
  const alignedY = roundToGrid(middle.y - size.height / 2);
  return [
    { x: ceilToGrid(right(anchor) + HORIZONTAL_GAP), y: alignedY, ...size },
    { x: alignedX, y: ceilToGrid(bottom(anchor) + VERTICAL_GAP), ...size },
    { x: floorToGrid(anchor.x - HORIZONTAL_GAP - size.width), y: alignedY, ...size },
    { x: alignedX, y: floorToGrid(anchor.y - VERTICAL_GAP - size.height), ...size },
  ];
}
