import { METHOD_ORDER, type BlockId } from "./blocks.js";
import { type Attribute, type Block, type CanvasDocument, type Sticky } from "./types.js";

export function stickiesOf(block: Block | undefined): Sticky[] {
  return block?.items ?? [];
}

/** A block with nothing in it: no sticky, no note and no field of its own. */
export function isEmptyBlock(block: Block): boolean {
  return block.items.length === 0 && block.notes.length === 0 && block.attributes.length === 0;
}

export function blockOf(document: CanvasDocument, blockId: BlockId): Block | undefined {
  return document.blocks.find((block) => block.blockId === blockId);
}

export function allStickies(document: CanvasDocument): Sticky[] {
  return document.blocks.flatMap(stickiesOf);
}

export interface PlacedSticky {
  blockId: BlockId;
  index: number;
  sticky: Sticky;
}

export function findSticky(document: CanvasDocument, id: string): PlacedSticky | undefined {
  for (const block of document.blocks) {
    const index = block.items.findIndex((sticky) => sticky.id === id);
    if (index >= 0) return { blockId: block.blockId, index, sticky: block.items[index]! };
  }
  return undefined;
}

function emptyBlock(blockId: BlockId): Block {
  return { blockId, items: [], notes: [], attributes: [] };
}

export function createEmptyDocument(title?: string): CanvasDocument {
  const header: Attribute[] = title === undefined ? [] : [{ key: "title", value: title }];
  return { header, notes: [], blocks: [], extras: [] };
}

export function titleOf(document: CanvasDocument): string | undefined {
  const value = document.header.find((field) => field.key === "title")?.value;
  return typeof value === "string" ? value : undefined;
}

/** Sets the title in place, or after the canvas's other fields; a blank title removes it. */
export function withTitle(document: CanvasDocument, title: string): CanvasDocument {
  const trimmed = title.trim();
  const others = document.header.filter((field) => field.key !== "title");
  if (trimmed === "") return { ...document, header: others };
  if (others.length === document.header.length) {
    return { ...document, header: [...document.header, { key: "title", value: trimmed }] };
  }
  return {
    ...document,
    header: document.header.map((field) =>
      field.key === "title" ? { ...field, value: trimmed } : field,
    ),
  };
}

/** A block the file does not have yet goes to its place in the method's order. */
export function withBlock(document: CanvasDocument, blockId: BlockId): CanvasDocument {
  if (blockOf(document, blockId)) return document;
  const rank = METHOD_ORDER.indexOf(blockId);
  const laterIndex = document.blocks.findIndex(
    (block) => METHOD_ORDER.indexOf(block.blockId) > rank,
  );
  const blocks = [...document.blocks];
  blocks.splice(laterIndex >= 0 ? laterIndex : blocks.length, 0, emptyBlock(blockId));
  return { ...document, blocks };
}

function mapItems(
  document: CanvasDocument,
  blockId: BlockId,
  change: (items: Sticky[]) => Sticky[],
): CanvasDocument {
  const withTarget = withBlock(document, blockId);
  return {
    ...withTarget,
    blocks: withTarget.blocks.map((block) =>
      block.blockId === blockId ? { ...block, items: change(block.items) } : block,
    ),
  };
}

export function removeSticky(document: CanvasDocument, id: string): CanvasDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) =>
      block.items.some((sticky) => sticky.id === id)
        ? { ...block, items: block.items.filter((sticky) => sticky.id !== id) }
        : block,
    ),
  };
}

/** Puts the sticky before the block's `index`-th sticky, or after its last one. */
export function insertSticky(
  document: CanvasDocument,
  blockId: BlockId,
  index: number,
  sticky: Sticky,
): CanvasDocument {
  return mapItems(document, blockId, (items) => {
    const next = [...items];
    next.splice(Math.min(Math.max(0, index), items.length), 0, sticky);
    return next;
  });
}

export function moveSticky(
  document: CanvasDocument,
  id: string,
  blockId: BlockId,
  index: number,
): CanvasDocument {
  const placed = findSticky(document, id);
  if (!placed) return document;
  return insertSticky(removeSticky(document, id), blockId, index, placed.sticky);
}

export function updateSticky(
  document: CanvasDocument,
  id: string,
  change: (sticky: Sticky) => Sticky,
): CanvasDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) => ({
      ...block,
      items: block.items.map((sticky) => (sticky.id === id ? change(sticky) : sticky)),
    })),
  };
}
