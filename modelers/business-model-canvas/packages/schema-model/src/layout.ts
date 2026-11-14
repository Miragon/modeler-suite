import type { BlockId } from "./blocks.js";
import { blockOf, stickiesOf } from "./document.js";
import type { CanvasDocument } from "./types.js";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const STICKY_SIZE = { width: 152, height: 92 } as const;
export const STICKY_GAP = 12;
/** The block's surface sits 6 inside its cell (the gap between blocks), its stickies 12 further in. */
export const BLOCK_PADDING = 18;
export const BLOCK_HEADING_HEIGHT = 44;
const HEADER_BAND_HEIGHT = 56;
const FOOTER_HEIGHT = 40;

const COLUMN_STICKIES = 2;
const COLUMN_WIDTH = COLUMN_STICKIES * STICKY_SIZE.width + STICKY_GAP + 2 * BLOCK_PADDING;
const CANVAS_WIDTH = 5 * COLUMN_WIDTH;
const HALF_WIDTH = CANVAS_WIDTH / 2;
/** Room for two rows of stickies in every block before it grows: enough for most canvases. */
const TWO_ROWS = BLOCK_HEADING_HEIGHT + 2 * (STICKY_SIZE.height + STICKY_GAP) + BLOCK_PADDING;

export interface BlockLayout {
  blockId: BlockId;
  rect: Rect;
  columns: number;
  /** The top left corner of the first sticky. */
  stickyOrigin: Point;
}

export interface CanvasLayout {
  bounds: Rect;
  /** The five blocks of the top row, without header and bottom row. */
  topRow: Rect;
  header: Rect;
  footer: Rect;
  blocks: BlockLayout[];
  stickies: Map<string, Rect>;
}

type Column =
  { kind: "full"; blockId: BlockId } | { kind: "stacked"; upper: BlockId; lower: BlockId };

const TOP_COLUMNS: readonly Column[] = [
  { kind: "full", blockId: "key-partners" },
  { kind: "stacked", upper: "key-activities", lower: "key-resources" },
  { kind: "full", blockId: "value-propositions" },
  { kind: "stacked", upper: "customer-relationships", lower: "channels" },
  { kind: "full", blockId: "customer-segments" },
];

const BOTTOM_BLOCKS: readonly BlockId[] = ["cost-structure", "revenue-streams"];

function columnsFor(width: number): number {
  return Math.max(
    1,
    Math.floor((width - 2 * BLOCK_PADDING + STICKY_GAP) / (STICKY_SIZE.width + STICKY_GAP)),
  );
}

function neededHeight(document: CanvasDocument, blockId: BlockId, width: number): number {
  const rows = Math.ceil(stickiesOf(blockOf(document, blockId)).length / columnsFor(width));
  return BLOCK_HEADING_HEIGHT + rows * (STICKY_SIZE.height + STICKY_GAP) + BLOCK_PADDING;
}

export function stickyRectAt(block: BlockLayout, index: number): Rect {
  const column = index % block.columns;
  const row = Math.floor(index / block.columns);
  return {
    x: block.stickyOrigin.x + column * (STICKY_SIZE.width + STICKY_GAP),
    y: block.stickyOrigin.y + row * (STICKY_SIZE.height + STICKY_GAP),
    width: STICKY_SIZE.width,
    height: STICKY_SIZE.height,
  };
}

/** Stickies fill a block from the top left under its heading, as on the poster. */
function stickyOrigin(rect: Rect): Point {
  return { x: rect.x + BLOCK_PADDING, y: rect.y + BLOCK_HEADING_HEIGHT };
}

function blockLayout(blockId: BlockId, rect: Rect): BlockLayout {
  const columns = columnsFor(rect.width);
  return {
    blockId,
    rect,
    columns,
    stickyOrigin: stickyOrigin(rect),
  };
}

/**
 * Where everything sits: the blocks in the proportions of the canvas, stickies flowing in file
 * order. A block that overflows grows its whole row, and both halves of a stacked column grow
 * together, so the grid stays aligned.
 */
export function layoutCanvas(document: CanvasDocument): CanvasLayout {
  const topHeight = Math.max(
    2 * TWO_ROWS,
    ...TOP_COLUMNS.map((column) =>
      column.kind === "full"
        ? neededHeight(document, column.blockId, COLUMN_WIDTH)
        : 2 *
          Math.max(
            neededHeight(document, column.upper, COLUMN_WIDTH),
            neededHeight(document, column.lower, COLUMN_WIDTH),
          ),
    ),
  );
  const bottomHeight = Math.max(
    TWO_ROWS,
    ...BOTTOM_BLOCKS.map((blockId) => neededHeight(document, blockId, HALF_WIDTH)),
  );
  const top = HEADER_BAND_HEIGHT;
  const bottom = top + topHeight;
  const footerTop = bottom + bottomHeight;

  const blocks: BlockLayout[] = [];
  TOP_COLUMNS.forEach((column, index) => {
    const x = index * COLUMN_WIDTH;
    if (column.kind === "full") {
      blocks.push(
        blockLayout(column.blockId, {
          x,
          y: top,
          width: COLUMN_WIDTH,
          height: topHeight,
        }),
      );
      return;
    }
    const half = topHeight / 2;
    blocks.push(
      blockLayout(column.upper, { x, y: top, width: COLUMN_WIDTH, height: half }),
      blockLayout(column.lower, { x, y: top + half, width: COLUMN_WIDTH, height: half }),
    );
  });
  BOTTOM_BLOCKS.forEach((blockId, index) => {
    blocks.push(
      blockLayout(blockId, {
        x: index * HALF_WIDTH,
        y: bottom,
        width: HALF_WIDTH,
        height: bottomHeight,
      }),
    );
  });

  const stickies = new Map<string, Rect>();
  for (const block of blocks) {
    stickiesOf(blockOf(document, block.blockId)).forEach((sticky, index) => {
      stickies.set(sticky.id, stickyRectAt(block, index));
    });
  }

  return {
    bounds: { x: 0, y: 0, width: CANVAS_WIDTH, height: footerTop + FOOTER_HEIGHT },
    topRow: { x: 0, y: top, width: CANVAS_WIDTH, height: topHeight },
    header: { x: 0, y: 0, width: CANVAS_WIDTH, height: HEADER_BAND_HEIGHT },
    footer: { x: 0, y: footerTop, width: CANVAS_WIDTH, height: FOOTER_HEIGHT },
    blocks,
    stickies,
  };
}

function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

/** The block under the point, or the nearest one for a point outside the canvas. */
export function blockAt(layout: CanvasLayout, point: Point): BlockLayout {
  let nearest = layout.blocks[0]!;
  let nearestDistance = Infinity;
  for (const block of layout.blocks) {
    const distance = distanceToRect(point, block.rect);
    if (distance < nearestDistance) {
      nearest = block;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** The index a sticky dropped at `point` takes among the block's `count` stickies. */
export function slotAt(block: BlockLayout, point: Point, count: number): number {
  const pitchX = STICKY_SIZE.width + STICKY_GAP;
  const pitchY = STICKY_SIZE.height + STICKY_GAP;
  const row = Math.max(0, Math.floor((point.y - block.stickyOrigin.y + STICKY_GAP / 2) / pitchY));
  const offsetX = (point.x - block.stickyOrigin.x) / pitchX;
  const column = Math.min(block.columns, Math.max(0, Math.round(offsetX)));
  return Math.min(count, row * block.columns + column);
}

export type Direction = "up" | "down" | "left" | "right";

/**
 * The block next to `from` as the canvas shows it, seen from `point` on it: left and right in the
 * band of the point's height, up and down in the band of its width.
 */
export function neighbourBlock(
  layout: CanvasLayout,
  from: BlockId,
  point: Point,
  direction: Direction,
): BlockLayout | undefined {
  const origin = layout.blocks.find((block) => block.blockId === from);
  if (!origin) return undefined;
  const horizontal = direction === "left" || direction === "right";
  const inBand = ({ rect }: BlockLayout) =>
    horizontal
      ? rect.y <= point.y && point.y <= rect.y + rect.height
      : rect.x <= point.x && point.x <= rect.x + rect.width;
  const gap = ({ rect }: BlockLayout) => {
    if (direction === "left") return origin.rect.x - (rect.x + rect.width);
    if (direction === "right") return rect.x - (origin.rect.x + origin.rect.width);
    if (direction === "up") return origin.rect.y - (rect.y + rect.height);
    return rect.y - (origin.rect.y + origin.rect.height);
  };
  return layout.blocks
    .filter((block) => block.blockId !== from && inBand(block) && gap(block) >= 0)
    .sort((first, second) => gap(first) - gap(second))[0];
}
