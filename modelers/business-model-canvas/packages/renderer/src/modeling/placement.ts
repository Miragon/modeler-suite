import {
  blockAt,
  blockOf,
  findSticky,
  layoutCanvas,
  removeSticky,
  slotAt,
  stickiesOf,
  type BlockId,
  type BlockLayout,
  type CanvasDocument,
  type Point,
} from "@miragon/business-model-canvas-schema-model";

export interface Placement {
  blockId: BlockId;
  /** Among the block's stickies without the ones being placed. */
  index: number;
  /** The slot as the canvas shows the block, with the stickies being placed still in it. */
  slot: number;
  block: BlockLayout;
}

/**
 * Where stickies dropped at `point` land: the block under it (or the nearest) as the canvas shows
 * it while they are still in place, so a row that shrinks without them moves no block under the
 * pointer, and the slot among the block's other stickies.
 */
export function placementAt(
  document: CanvasDocument,
  placedIds: readonly string[],
  point: Point,
): Placement {
  const rest = placedIds.reduce(removeSticky, document);
  const block = blockAt(layoutCanvas(document), point);
  const slot = slotAt(block, point, stickiesOf(blockOf(document, block.blockId)).length);
  const placedBefore = placedIds.filter((id) => {
    const placed = findSticky(document, id);
    return placed?.blockId === block.blockId && placed.index < slot;
  }).length;
  const count = stickiesOf(blockOf(rest, block.blockId)).length;
  return { blockId: block.blockId, index: Math.min(count, slot - placedBefore), slot, block };
}
