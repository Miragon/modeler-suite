import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import {
  BLOCK_IDS,
  blockOf,
  layoutCanvas,
  neighbourBlock,
  stickyRectAt,
  findSticky,
  insertSticky,
  moveSticky,
  removeSticky,
  stickiesOf,
  updateSticky,
  titleOf,
  withTitle,
  columnsOf,
  withColumns,
  type StickyColumns,
  type BlockId,
  type CanvasDocument,
  type Direction,
  type Point,
  type Note,
  type Sticky,
} from "@miragon/business-model-canvas-schema-model";
import { NO_DOCUMENT, documentOf } from "../io/documentOf.js";
import type { StickyShape } from "../model/di-types.js";
import { placementAt } from "./placement.js";
import { withNotes, type NotesScope } from "../notes-panel/notesScope.js";
import UpdateDocumentHandler from "./UpdateDocumentHandler.js";

export const UPDATE_DOCUMENT = "canvas.updateDocument";

/** A place in a block, for a sticky that goes there whatever the pointer hovers. */
export interface StickySlot {
  blockId: BlockId;
  index: number;
}

export type MoveDirection = Direction;

/** The notation's edits: each one document update through the command stack, so undoable (L3). */
export default class CanvasModeling {
  static $inject = ["commandStack", "elementRegistry"];

  constructor(
    private readonly commandStack: CommandStack,
    private readonly elementRegistry: ElementRegistry,
  ) {
    commandStack.registerHandler(UPDATE_DOCUMENT, UpdateDocumentHandler);
  }

  document(): CanvasDocument {
    return documentOf(this.elementRegistry) ?? NO_DOCUMENT;
  }

  updateDocument(next: CanvasDocument): void {
    if (next === this.document()) return;
    this.commandStack.execute(UPDATE_DOCUMENT, { document: next });
  }

  /** A sticky the canvas created: into the slot, or the block under the point. */
  addSticky(shape: StickyShape, at: Point | StickySlot): void {
    const document = this.document();
    const { blockId, index } = "blockId" in at ? at : placementAt(document, [shape.id], at);
    const sticky: Sticky = { ...shape.sticky, id: shape.id };
    this.updateDocument(insertSticky(document, blockId, index, sticky));
  }

  /** The dropped stickies, in the canvas's order, into the slot under `point`. */
  placeStickies(ids: readonly string[], point: Point): void {
    const document = this.document();
    const inCanvasOrder = [...ids].sort(
      (first, second) => this.canvasOrder(document, first) - this.canvasOrder(document, second),
    );
    const { blockId, index } = placementAt(document, inCanvasOrder, point);
    const stickies = inCanvasOrder.flatMap((id) => findSticky(document, id)?.sticky ?? []);
    const next = stickies.reduce(
      (current, sticky, offset) => insertSticky(current, blockId, index + offset, sticky),
      inCanvasOrder.reduce(removeSticky, document),
    );
    this.updateDocument(next);
  }

  removeSticky(id: string): void {
    if (!findSticky(this.document(), id)) return;
    this.updateDocument(removeSticky(this.document(), id));
  }

  setText(id: string, text: string): void {
    const placed = findSticky(this.document(), id);
    if (!placed || placed.sticky.text === text) return;
    this.updateDocument(updateSticky(this.document(), id, (sticky) => ({ ...sticky, text })));
  }

  /** The sticky's tape: a palette name or a colour of the person's own, none when undefined. */
  setColor(id: string, color: string | undefined): void {
    const placed = findSticky(this.document(), id);
    if (!placed || placed.sticky.color === color) return;
    this.updateDocument(updateSticky(this.document(), id, (sticky) => ({ ...sticky, color })));
  }

  /**
   * Alt+arrow, as the canvas shows the blocks: up and down within the block and, at its edge, into
   * the block above or below; left and right to the end of the block beside it.
   */
  moveByKey(id: string, direction: MoveDirection): void {
    const document = this.document();
    const placed = findSticky(document, id);
    if (!placed) return;
    const count = stickiesOf(blockOf(document, placed.blockId)).length;
    const index = placed.index + (direction === "up" ? -1 : 1);
    if ((direction === "up" || direction === "down") && index >= 0 && index < count) {
      this.updateDocument(moveSticky(document, id, placed.blockId, index));
      return;
    }
    const layout = layoutCanvas(document);
    const block = layout.blocks.find((candidate) => candidate.blockId === placed.blockId);
    if (!block) return;
    const rect = stickyRectAt(block, placed.index);
    const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const target = neighbourBlock(layout, placed.blockId, centre, direction);
    if (!target) return;
    const targetIndex = direction === "down" ? 0 : Number.MAX_SAFE_INTEGER;
    this.updateDocument(moveSticky(document, id, target.blockId, targetIndex));
  }

  title(): string | undefined {
    return titleOf(this.document());
  }

  stickyColumns(): StickyColumns {
    return columnsOf(this.document());
  }

  setStickyColumns(columns: StickyColumns): void {
    if (columns !== this.stickyColumns()) {
      this.updateDocument(withColumns(this.document(), columns));
    }
  }

  /** A blank title removes the field. */
  setTitle(title: string): void {
    const next = withTitle(this.document(), title);
    if (titleOf(next) !== this.title()) this.updateDocument(next);
  }

  /** The notes of one place, in one undo step. */
  setNotes(scope: NotesScope, notes: Note[]): void {
    const before = this.document();
    const next = withNotes(before, scope, notes);
    if (JSON.stringify(next) !== JSON.stringify(before)) this.updateDocument(next);
  }

  /** Block by block in the canvas's order, then by the sticky's place in its block. */
  private canvasOrder(document: CanvasDocument, id: string): number {
    const placed = findSticky(document, id);
    return placed ? BLOCK_IDS.indexOf(placed.blockId) * 10_000 + placed.index : 0;
  }
}
