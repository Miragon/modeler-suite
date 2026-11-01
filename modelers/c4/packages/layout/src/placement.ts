/*
 * Placement of the elements a pinned view has no stored box for (SPEC 4.3): next to a placed
 * neighbour on the 8-unit grid, else in a row below the placed content. A place is free when the
 * box keeps its distance from every box, stays out of the frames it does not belong to, and the
 * frames it grows do not reach anything new.
 */
import type { Box, ElementId, Size } from "@miragon/c4-schema-model";
import { LABEL_SIZE } from "./autoLayout.js";
import type { ClusterKey, ClusterTree } from "./clusters.js";
import { deriveFrames, padded, type Frame } from "./frames.js";
import {
  bottom,
  ceilToGrid,
  centre,
  floorToGrid,
  overlaps,
  right,
  roundToGrid,
  unionOf,
} from "./geometry.js";

/** A relationship's label fits between two neighbours, with this much room on either side. */
const LABEL_MARGIN = 16;
/** Side by side: the label lies across the gap, so the gap takes its width. */
export const HORIZONTAL_GAP = LABEL_SIZE.width + 2 * LABEL_MARGIN;
/** One above the other: the gap takes the label's height. */
export const VERTICAL_GAP = LABEL_SIZE.height + 2 * LABEL_MARGIN;
/** Half the narrower gap: a new box keeps it from every box but the neighbour it was put next to. */
const CLEARANCE = VERTICAL_GAP / 2;
const MAX_ANCHORS = 16;
const MIN_ROW_WIDTH = 4 * (240 + HORIZONTAL_GAP);
const MAX_ROW_STEPS = 10_000;

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
    readonly sourceId: ElementId;
    readonly destinationId: ElementId;
  }[];
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
 * order; an item already there keeps its box.
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
        const placed = placement.besideNeighbours(item);
        if (placed) progressed = true;
        return !placed;
      });
    }
    const next = remaining.shift();
    if (next) {
      if (!placement.besideNeighbours(next) && !placement.besideSiblings(next)) {
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

  /** Inside a frame, the members it already holds are the next best neighbours. */
  besideSiblings(item: PlacementItem): boolean {
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
    return this.besideAny(item, anchors.slice(0, MAX_ANCHORS));
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
        if (this.isFree(item.key, candidate) && this.growsFramesFreely(item.key, candidate)) {
          this.put(item.key, candidate);
          return true;
        }
      }
    }
    return false;
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
    let inner = candidate;
    for (const cluster of this.context.tree.ancestors(key)) {
      const before = this.frames.get(cluster);
      const grown = padded(unionOf([before?.content, inner]) ?? inner);
      for (const [other, box] of this.boxes) {
        if (this.isInside(other, cluster)) continue;
        if (overlaps(grown, box) && !(before && overlaps(before.frame, box))) return false;
      }
      for (const [other, frame] of this.frames) {
        if (this.related(other, cluster)) continue;
        if (overlaps(grown, frame.frame) && !(before && overlaps(before.frame, frame.frame))) {
          return false;
        }
      }
      inner = grown;
    }
    return true;
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
