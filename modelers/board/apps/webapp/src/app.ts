/**
 * The web app of the board: the example repository in memory, shown by the board with the seven
 * modelers of the suite as the editors of its model nodes. There is no disk behind it; the board
 * and the files a person changed are kept in the browser's storage.
 */
// The sheets by name and in this order: the board's own, then the base the renderer sheets share,
// once, with the preview rule. A renderer's sheet follows when its notation loads.
import "@miragon/board-renderer/assets/board.css";
import "board-suite-editors/base";
import "./page.css";
import { connectBackend, createMemoryBackend } from "@miragon/board-files";
import { createFilesHost } from "@miragon/board-host";
import { createCollaborativeModeler, type CollaborativeBoard } from "@miragon/board-renderer";
import { SUITE_EDITORS } from "board-suite-editors";
import { EXAMPLE } from "./example.js";
import { keeping } from "./keeping.js";
import { REACH } from "./reach.js";
import { createAppStorage, picturesOf, resetRequested, type KeyValueStore } from "./storage.js";

export interface AppOptions {
  /** where the board and the changed files are kept: the browser's local storage */
  storage: KeyValueStore;
  /** the query of the page's address: `?reset` forgets what is kept before the app starts */
  search?: string | undefined;
}

export interface App {
  readonly modeler: CollaborativeBoard;
  /** settles once the board's text is on the canvas; the models load after it */
  readonly ready: Promise<void>;
  /** ends the board and closes its files; the element is left as it was given */
  destroy(): void;
}

const KEPT = "The example repository is kept in this browser.";
const NOT_KEPT = "This browser did not keep all of your changes: its storage is blocked or full.";
const MISSING = "A picture of this board is missing: this browser did not keep it.";
const UNREADABLE = "The board kept in this browser could not be read. This is the example.";
// The host package's own line sends a person to the file's editor, and this page has none.
const INVALID =
  "This file cannot be shown as it is. “Reset the example” restores it, and undoes every other change.";

interface Page {
  /** the element the board is attached to */
  readonly board: HTMLElement;
  /** the line under the board; a warning stands out */
  say(text: string, warning: boolean): void;
  remove(): void;
}

function buildPage(root: HTMLElement): Page {
  const board = document.createElement("div");
  board.className = "board-page__board";
  const note = document.createElement("footer");
  note.className = "board-page__note";
  const kept = document.createElement("span");
  kept.className = "board-page__kept";
  kept.setAttribute("role", "status");
  const reset = document.createElement("a");
  reset.href = "?reset";
  reset.textContent = "Reset the example";
  note.append(kept, reset);
  root.classList.add("board-page");
  root.append(board, note);
  return {
    board,
    say(text, warning) {
      kept.textContent = text;
      note.dataset.warning = String(warning);
    },
    remove() {
      board.remove();
      note.remove();
      root.classList.remove("board-page");
    },
  };
}

export function startApp(root: HTMLElement, options: AppOptions): App {
  const kept = createAppStorage(options.storage, EXAMPLE);
  if (resetRequested(options.search ?? "")) kept.reset();

  const board = kept.board();
  const pictures = picturesOf(board);
  // Before the files are read: a picture no node shows any more is not a file of the repository
  // again, and its name is free.
  if (pictures !== undefined) kept.forgetPictures(pictures);
  const repository = kept.files();
  // A picture the browser had no room for was drawn until the page went. Its node is on the
  // kept board, and without a word it would be a hole nobody can explain.
  let missing = [...(pictures ?? [])].some((path) => !Object.hasOwn(repository, path));

  const page = buildPage(root);
  page.say(missing ? MISSING : KEPT, missing);
  // Once the browser refused a save the page says so and goes on saying it: what was not kept
  // is not there after a reload, whatever a later save does.
  let refused = false;
  const saved = (taken: boolean): void => {
    if (taken || refused) return;
    refused = true;
    page.say(NOT_KEPT, true);
  };

  const files = connectBackend(keeping(createMemoryBackend(repository), kept, saved), REACH);
  const host = createFilesHost({ files, editors: SUITE_EDITORS, invalidText: INVALID });
  const modeler = createCollaborativeModeler({ host });
  modeler.onContentChanged(() => {
    const text = modeler.exportText();
    saved(kept.keepBoard(text));
    if (!missing || refused) return;
    // the line goes with the node it is about
    missing = [...(picturesOf(text) ?? [])].some((path) => !files.paths().includes(path));
    if (!missing) page.say(KEPT, false);
  });
  modeler.attachTo(page.board);

  const shown = modeler.importText(board).catch((error: unknown) => {
    if (board === EXAMPLE.board) throw error;
    // A text another program left under the board's key. The example takes its place on the
    // canvas; the kept text stays until the first gesture on the board replaces it.
    page.say(UNREADABLE, true);
    return modeler.importText(EXAMPLE.board);
  });

  return {
    modeler,
    ready: shown.then(() => undefined),
    destroy() {
      modeler.destroy();
      host.dispose();
      files.dispose();
      page.remove();
    },
  };
}
