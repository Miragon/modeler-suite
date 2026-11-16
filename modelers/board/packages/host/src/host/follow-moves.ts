/**
 * Files that move, for the nodes a host cannot reach through the board's host interface: the
 * image nodes. A model node follows by itself, through its editor's context.
 */
import type { BoardFiles } from "@miragon/board-files";
import type { BoardStore } from "@miragon/board-renderer";

/** the part of a board `followMoves` works on: `createCollaborativeModeler(...)` fits */
export interface MovedBoard {
  readonly board: { readonly store: BoardStore };
}

/**
 * Writes the new path into every image node whose file moved, as the editor of a model node
 * does for its own node (`relocate`): one change of the board per node, reported by the board's
 * `onContentChanged` and never on its history, so no undo brings the old path back. An app calls
 * it once with the board it made and the files that board's host stands on, and calls what it
 * returns before it destroys the board. Only the moves the files port tells are followed: a
 * file that moved where a board does not reach is gone for its node.
 */
export function followMoves(board: MovedBoard, files: BoardFiles): () => void {
  return files.onMoved((moves) => {
    const to = new Map(moves.map((move) => [move.from, move.to]));
    const { store } = board.board;
    // read before the first write: a file that moved to where another one was moves once
    const images = store.getSnapshot().nodes.filter((node) => node.attrs.type === "image");
    for (const { id, attrs } of images) {
      const next = attrs.file === undefined ? undefined : to.get(attrs.file);
      if (next !== undefined) store.amend((tx) => tx.update(id, { file: next }));
    }
  });
}
