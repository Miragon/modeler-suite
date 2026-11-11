import {
  blockOf,
  findSticky,
  type BlockId,
  type CanvasDocument,
  type Note,
} from "@miragon/business-model-canvas-schema-model";

/** Where a note hangs: on the whole canvas, on a block, on a sticky. */
export type NotesScope =
  { kind: "canvas" } | { kind: "block"; blockId: BlockId } | { kind: "sticky"; id: string };

export function notesOf(document: CanvasDocument, scope: NotesScope): Note[] {
  switch (scope.kind) {
    case "canvas":
      return document.notes;
    case "block":
      return blockOf(document, scope.blockId)?.notes ?? [];
    case "sticky":
      return findSticky(document, scope.id)?.sticky.notes ?? [];
  }
}

export function sameScope(a: NotesScope, b: NotesScope): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function withNotes(
  document: CanvasDocument,
  scope: NotesScope,
  notes: Note[],
): CanvasDocument {
  switch (scope.kind) {
    case "canvas":
      return { ...document, notes };
    case "block": {
      const others = document.blocks.filter((block) => block.blockId !== scope.blockId);
      const block = document.blocks.find((candidate) => candidate.blockId === scope.blockId) ?? {
        blockId: scope.blockId,
        items: [],
        notes: [],
        attributes: [],
      };
      const next = { ...block, notes };
      const empty = next.items.length === 0 && notes.length === 0 && next.attributes.length === 0;
      if (empty) return { ...document, blocks: others };
      const at = document.blocks.indexOf(block);
      const blocks = [...document.blocks];
      if (at === -1) blocks.push(next);
      else blocks[at] = next;
      return { ...document, blocks };
    }
    case "sticky":
      return {
        ...document,
        blocks: document.blocks.map((block) => ({
          ...block,
          items: block.items.map((sticky) =>
            sticky.id === scope.id ? { ...sticky, notes } : sticky,
          ),
        })),
      };
  }
}
