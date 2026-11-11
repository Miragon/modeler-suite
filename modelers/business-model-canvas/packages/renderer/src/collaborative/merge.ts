import { readText, serializeText } from "@miragon/business-model-canvas-dsl";
import {
  isEmptyBlock,
  type Attribute,
  type Block,
  type BlockId,
  type CanvasDocument,
  type Note,
} from "@miragon/business-model-canvas-schema-model";
import {
  MergeConflictError,
  mergeItemsById,
  sameJsonValue,
  type ModelTextMerge,
} from "@miragon/modeler-api";

/** The last synced version, the external one and the draft, in this order. */
type Versions<T> = readonly [T, T, T];

function mapVersions<T, U>(versions: Versions<T>, change: (value: T) => U): Versions<U> {
  return [change(versions[0]), change(versions[1]), change(versions[2])];
}

/**
 * Merges three lists by `idOf`, which also names an entry in a conflict. A conflict empties the
 * result; the caller throws once every part is merged, so the error names all of them.
 */
function mergeById<T>(
  lists: Versions<readonly T[]>,
  idOf: (value: T) => string,
  conflicts: string[],
) {
  const result = mergeItemsById(...lists, { idOf });
  if (result.conflictingIds) {
    conflicts.push(...result.conflictingIds);
    return [];
  }
  return result.merged;
}

/** Notes have no ids: a note is all it says, and equal notes are told apart by their occurrence. */
function mergeNotes(lists: Versions<readonly Note[]>, owner: string, conflicts: string[]): Note[] {
  const keyed = mapVersions(lists, (notes) => {
    const seen = new Map<string, number>();
    return notes.map((note) => {
      const base = `${owner}.note:${JSON.stringify([note.text, note.attributes])}`;
      const occurrence = (seen.get(base) ?? 0) + 1;
      seen.set(base, occurrence);
      return { id: `${base}#${occurrence}`, note };
    });
  });
  return mergeById(keyed, (entry) => entry.id, conflicts).map((entry) => entry.note);
}

const idOfField = (owner: string) => (field: Attribute) => `${owner}.${field.key}`;

function mergeBlock(
  blockId: BlockId,
  versions: Versions<Block | undefined>,
  conflicts: string[],
): Block {
  const listOf = <T>(pick: (block: Block) => readonly T[]) =>
    mapVersions(versions, (block) => (block ? pick(block) : []));
  return {
    blockId,
    items: mergeById(
      listOf((block) => block.items),
      (sticky) => sticky.id,
      conflicts,
    ),
    notes: mergeNotes(
      listOf((block) => block.notes),
      blockId,
      conflicts,
    ),
    attributes: mergeById(
      listOf((block) => block.attributes),
      idOfField(blockId),
      conflicts,
    ),
  };
}

/**
 * The blocks each side has, each with its items, notes and fields merged. A block only one side
 * removed stays removed when the other side left it as it was or only emptied it; a change
 * against the removal conflicts.
 */
function mergeBlocks(sides: Versions<readonly Block[]>, conflicts: string[]): Block[] {
  const [base, external, draft] = mapVersions(
    sides,
    (blocks) => new Map(blocks.map((block) => [block.blockId, block])),
  );
  const order = mergeItemsById(
    ...mapVersions(sides, (blocks) => blocks.map(({ blockId }) => ({ id: blockId }))),
  );
  for (const [blockId, block] of base) {
    if (external.has(blockId) === draft.has(blockId)) continue;
    const kept = (external.get(blockId) ?? draft.get(blockId))!;
    if (!isEmptyBlock(kept) && !sameJsonValue(kept, block)) conflicts.push(blockId);
  }
  return (order.merged ?? []).map(({ id }) =>
    mergeBlock(id, [base.get(id), external.get(id), draft.get(id)], conflicts),
  );
}

/**
 * The blocks merge one by one, so a sticky one side moved to another block and the other removed
 * would come back in its new block: that is a change against a removal.
 */
function stickiesMovedAndRemoved(sides: Versions<CanvasDocument>): string[] {
  const [base, external, draft] = mapVersions(
    sides,
    (document) =>
      new Map(
        document.blocks.flatMap((block) =>
          block.items.map((sticky) => [sticky.id, block.blockId] as const),
        ),
      ),
  );
  return [...base].flatMap(([id, block]) => {
    const movedOnOneSide = [external.get(id), draft.get(id)].some(
      (place) => place !== undefined && place !== block,
    );
    const removedOnTheOther = !external.has(id) || !draft.has(id);
    return movedOnOneSide && removedOnTheOther ? [id] : [];
  });
}

/** A sticky each side moved to another block lands twice. */
function stickiesInTwoPlaces(blocks: readonly Block[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const sticky of blocks.flatMap((block) => block.items)) {
    if (seen.has(sticky.id)) twice.add(sticky.id);
    seen.add(sticky.id);
  }
  return [...twice];
}

function documentOf(text: string): CanvasDocument {
  try {
    return readText(text).document;
  } catch (error) {
    throw new MergeConflictError([], `the text is no business model canvas: ${String(error)}`);
  }
}

/**
 * The three-way merge of two `.bmc` texts (`ModelTextMerge` of `@miragon/modeler-api`): the
 * canvas fields key by key, its notes as they are, the blocks by their building block, a block's
 * items by id, its notes as they are and its other keys by key. Two different changes of one of
 * them, a change against its removal, and a result the canvas would reject (a sticky both sides
 * moved to different blocks) throw a
 * `MergeConflictError` that names them: a sticky by its id, a block by its field, a canvas field
 * as `canvas.<field>`, a field of a block as `<block>.<field>`, a note as `<block>.note:…` (`canvas.note:…` on the canvas) and a
 * root field by its name. The result is canonical, as `serializeText` writes it.
 */
export const mergeCanvasText: ModelTextMerge = (lastSyncedText, externalText, draftText) => {
  const sides = mapVersions([lastSyncedText, externalText, draftText], documentOf);
  const pick = <T>(value: (document: CanvasDocument) => T) => mapVersions(sides, value);
  const conflicts: string[] = [];
  const merged: CanvasDocument = {
    header: mergeById(
      pick((document) => document.header),
      idOfField("canvas"),
      conflicts,
    ),
    notes: mergeNotes(
      pick((document) => document.notes),
      "canvas",
      conflicts,
    ),
    blocks: mergeBlocks(
      pick((document) => document.blocks),
      conflicts,
    ),
    extras: mergeById(
      pick((document) => document.extras),
      (extra) => extra.key,
      conflicts,
    ),
  };
  conflicts.push(...stickiesMovedAndRemoved(sides));
  if (conflicts.length === 0) conflicts.push(...stickiesInTwoPlaces(merged.blocks));
  if (conflicts.length > 0) throw new MergeConflictError([...new Set(conflicts)]);
  return serializeText(merged);
};
