/**
 * The documents the pages of the open boards wrote into and VS Code has not saved since: what
 * "save the models with the board" saves. One for the whole extension, kept by the names VS Code
 * has for a document and for the board whose page wrote into it. So it outlives a board's
 * editor: a board that is closed and opened again, or renamed, for which VS Code builds a new
 * editor, still saves the models it made unsaved. It does not outlive the extension host: after
 * a reloaded window an unsaved model is the board's again once it was edited on the board again.
 *
 * A document is a board's from a write of its page until the document is clean, however it got
 * there: saved, reverted, or taken back to the saved text by an undo. What changes it after
 * that is somebody else's change. VS Code says that a document is clean with a change event
 * whose document is not dirty, and it says the same of the old document of a file a person
 * renames, right before it closes that document and opens an unsaved one at the new name (seen
 * in VS Code 1.146 and 1.96). The rename event comes last, so a clean document is remembered
 * for a moment: the rename that names it finds it, and gives it to the unsaved document there.
 */
import type { DisposableLike, TextDocumentLike } from "@miragon/modeler-shell/vscode/extension";

import type { BoardUriLike, BoardVsCodeLike, SavableDocumentLike } from "./vscode-like.js";

type WrittenVsCodeLike<Uri extends BoardUriLike> = {
  readonly workspace: Pick<
    BoardVsCodeLike<Uri>["workspace"],
    "textDocuments" | "onDidChangeTextDocument" | "onDidRenameFiles"
  >;
};

/** how long a document that turned clean is remembered for the rename event that may name it */
export const CLEAN_MEMORY_MS = 5_000;

export interface WrittenDocuments {
  /** a write of the page of the board file `board` landed in this document */
  wrote(board: BoardUriLike, document: TextDocumentLike): void;
  /** the documents the pages of the board file `board` wrote that are open and unsaved now */
  unsaved(board: BoardUriLike): SavableDocumentLike[];
  dispose(): void;
}

/** one written document */
interface Written {
  /** the board files whose pages wrote into it, by name */
  boards: Set<string>;
  /**
   * The timer that forgets the document, running from the moment VS Code said it is clean. A
   * document with one is unsaved again only through a change that is not the board's, and is
   * forgotten when VS Code says so.
   */
  forget: ReturnType<typeof setTimeout> | undefined;
}

/** the name of a document after a rename of it, or of a folder above it; the same name otherwise */
function renamed(name: string, from: string, to: string): string {
  if (name === from) return to;
  return name.startsWith(`${from}/`) ? to + name.slice(from.length) : name;
}

/** whether VS Code calls the document unsaved; undefined for an object that does not say */
const dirtyOf = (document: TextDocumentLike): boolean | undefined =>
  (document as Partial<SavableDocumentLike>).isDirty;

export function createWrittenDocuments<Uri extends BoardUriLike>(
  vscode: WrittenVsCodeLike<Uri>,
): WrittenDocuments {
  const written = new Map<string, Written>();
  const forget = (name: string): void => {
    clearTimeout(written.get(name)?.forget);
    written.delete(name);
  };
  /** a file or a folder has another name: the documents and the boards at or below it follow */
  const rename = (from: string, to: string): void => {
    for (const [name, entry] of [...written]) {
      entry.boards = new Set([...entry.boards].map((board) => renamed(board, from, to)));
      const next = renamed(name, from, to);
      if (next === name) continue;
      forget(name);
      // VS Code moved the unsaved text to a document of the new name; a clean one has none
      const moved = vscode.workspace.textDocuments.find(
        (document) => document.uri.toString() === next,
      );
      if (moved?.isDirty) written.set(next, { boards: entry.boards, forget: undefined });
    }
  };
  const subscriptions: DisposableLike[] = [
    // A save is told here as well, whoever made it, the person in its own tab or auto save: the
    // document is clean, what the page wrote is in the file, and a later change is not the
    // board's.
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
      const name = document.uri.toString();
      const entry = written.get(name);
      const dirty = dirtyOf(document);
      if (!entry || dirty === undefined) return;
      if (!dirty) {
        entry.forget ??= setTimeout(() => written.delete(name), CLEAN_MEMORY_MS);
        return;
      }
      // unsaved again under the same name: it was clean in between, and this change is another one
      if (entry.forget !== undefined) forget(name);
    }),
    vscode.workspace.onDidRenameFiles(({ files }) => {
      for (const { oldUri, newUri } of files) rename(oldUri.toString(), newUri.toString());
    }),
  ];
  return {
    wrote(board, document) {
      const name = document.uri.toString();
      const entry = written.get(name);
      // No entry for a document that was clean since: VS Code said that it is unsaved again
      // before it answered the edit, and that took the entry away.
      if (entry) entry.boards.add(board.toString());
      else written.set(name, { boards: new Set([board.toString()]), forget: undefined });
    },
    unsaved(board) {
      const name = board.toString();
      return vscode.workspace.textDocuments.filter(
        (document) =>
          document.isDirty && written.get(document.uri.toString())?.boards.has(name) === true,
      );
    },
    dispose() {
      for (const subscription of subscriptions.splice(0)) subscription.dispose();
      for (const name of [...written.keys()]) forget(name);
    },
  };
}
