/**
 * One open document of the web app: its editor, its files, and what stays true of it. The
 * files a board reaches are fixed when the board is made, so every document gets an editor of
 * its own, mounted through `mountBoardEditor` as in VS Code. Two kinds: the example, a
 * repository in memory whose changes are kept in the browser, and a board that was made new or
 * opened from a file, with no repository behind it.
 */
import { connectBackend, createMemoryBackend, type BoardFiles } from "@miragon/board-files";
import type { ToastHandle } from "@miragon/modeler-shell";
import { mountBoardEditor, type BoardEditor, type KeptState } from "board-ide-editor";
import { SUITE_EDITORS } from "board-suite-editors";
import { BOARD_SUFFIX, holdsNothing } from "./board-file.js";
import { EXAMPLE } from "./example.js";
import { keeping } from "./keeping.js";
import { noRepository } from "./no-repository.js";
import { REACH } from "./reach.js";
import { picturesOf, type AppStorage, type OpenStorage } from "./storage.js";
import { webEditorHost, type WebColumn } from "./web-host.js";

export const RESET_LABEL = "Reset the example";
const EXAMPLE_NAME = `example${BOARD_SUFFIX}`;
const MISSING = "A picture of this board is missing: this browser did not keep it.";
const UNREADABLE = "The board kept in this browser could not be read. This is the example.";
// The host package's own line sends a person to the file's editor, and this page has none.
const INVALID = `This file cannot be shown as it is. “${RESET_LABEL}” restores it, and undoes every other change.`;

export interface Session {
  readonly kind: "example" | "board";
  /** the board file's name: the one it was opened from, none for a board that was made new */
  readonly name: string | undefined;
  readonly editor: BoardEditor;
  readonly files: BoardFiles;
  /** what stays true of this document until it changes: the line of the status box */
  state(): string | undefined;
  /** an offer to take the last replacement back; the first change of the board withdraws it */
  offer(toast: ToastHandle): void;
}

/** What a session asks of the page it is mounted in. */
export interface SessionPage {
  readonly root: HTMLElement;
  readonly kept: AppStorage;
  readonly opened: OpenStorage;
  /** where the editor of the open document keeps its view: with the board, in the browser */
  readonly state: KeptState;
  /** the answer of a save: the page says once, and for good, that the browser refused one */
  saved(taken: boolean): void;
  /** the status box follows the open session's state */
  say(): void;
  /** the shell's web column for a document of this kind */
  column(kind: Session["kind"], startScreen: boolean): WebColumn;
}

/** A board text with the name of the file it came from, if it came from one. */
export interface BoardDocument {
  readonly name?: string | undefined;
  readonly text: string;
}

function offers(): Pick<Session, "offer"> & { withdraw(): void } {
  let shown: ToastHandle | undefined;
  const withdraw = (): void => {
    shown?.dismiss();
    shown = undefined;
  };
  return {
    offer(toast) {
      withdraw();
      shown = toast;
    },
    withdraw,
  };
}

/** A board without an element is not worth a reload: the next start shows the start screen. */
export const keepBoard = (opened: OpenStorage, document: BoardDocument): boolean =>
  holdsNothing(document.text) ? opened.forget() : opened.keep({ kind: "board", ...document });

export async function mountExample(page: SessionPage): Promise<Session> {
  const { kept, saved } = page;
  const board = kept.board();
  const pictures = picturesOf(board);
  // Before the files are read: a picture no node shows any more is not a file of the repository
  // again, and its name is free.
  if (pictures !== undefined) kept.forgetPictures(pictures);
  const repository = kept.files();
  // A picture the browser had no room for was drawn until the page went. Its node is on the
  // kept board, and without a word it would be a hole nobody can explain.
  let missing = [...(pictures ?? [])].some((path) => !Object.hasOwn(repository, path));
  let unreadable = false;
  const files = connectBackend(keeping(createMemoryBackend(repository), kept, saved), REACH);
  const { offer, withdraw } = offers();
  const host = webEditorHost(
    {
      text: board,
      // A text another program left under the board's key. The example takes its place on the
      // canvas; the kept text stays until the first gesture on the board replaces it.
      fallback: EXAMPLE.board,
      refused: () => void (unreadable = true),
      changed(text) {
        withdraw();
        saved(kept.keepBoard(text));
        unreadable = false;
        // the line goes with the node it is about
        if (missing) {
          missing = [...(picturesOf(text) ?? [])].some((path) => !files.paths().includes(path));
        }
        page.say();
      },
    },
    page.column("example", false),
    page.state,
  );
  const editor = await mountBoardEditor(host, {
    root: page.root,
    files,
    editors: SUITE_EDITORS,
    containHistoryKeys: false,
    invalidText: INVALID,
    fileKeys: true,
    // a browser hands the page every dropped file; a board without a repository keeps none
    pictures: "drop",
  });
  return {
    kind: "example",
    name: EXAMPLE_NAME,
    editor,
    files,
    state: () => (unreadable ? UNREADABLE : missing ? MISSING : undefined),
    offer,
  };
}

export async function mountBoard(
  page: SessionPage,
  document: BoardDocument,
  startScreen: boolean,
): Promise<Session> {
  const { name } = document;
  const files = connectBackend(noRepository(), REACH);
  const { offer, withdraw } = offers();
  const host = webEditorHost(
    {
      text: document.text,
      changed(text) {
        withdraw();
        page.saved(keepBoard(page.opened, { name, text }));
        page.say();
      },
    },
    page.column("board", startScreen),
    page.state,
  );
  const editor = await mountBoardEditor(host, {
    root: page.root,
    files,
    editors: SUITE_EDITORS,
    containHistoryKeys: false,
    fileKeys: true,
  });
  return { kind: "board", name, editor, files, state: () => undefined, offer };
}
