/**
 * The web app of the board: the board inside the suite's shell, in its web column. One document
 * is open at a time: the example, a repository in memory with the seven modelers of the suite as
 * the editors of its model nodes, or a board that was made new or opened from a file, which has
 * no repository behind it. There is no disk behind the page. What is open, and what a person
 * changed of the example, is kept in the browser's storage, and a board leaves as a download.
 */
// The sheets by name and in this order: the shell, the board, the base the renderer sheets
// share (once, with the preview rule), then the rules that make one picture of the shell and
// the board. A renderer's own sheet follows when its notation loads.
import "@miragon/modeler-shell/shell.css";
import "@miragon/board-renderer/assets/board.css";
import "board-suite-editors/base";
import "board-ide-editor/app.css";
import { commandKeyLabel, defaultMessages, detectPlatform } from "@miragon/modeler-shell";
import type { BoardEditor } from "board-ide-editor";
import { createActions, type Actions } from "./actions.js";
import { APP_NAME, webColumn } from "./column.js";
import { EXAMPLE } from "./example.js";
import { connectPage, type PageInput } from "./page.js";
import { mountBoard, mountExample, type Session, type SessionPage } from "./session.js";
import {
  createAppStorage,
  createOpenStorage,
  type KeyValueStore,
  type OpenDocument,
} from "./storage.js";

export interface AppOptions {
  /** where the open document and the example's changes are kept: the browser's local storage */
  storage: KeyValueStore;
  /** the query of the page's address: `?reset` brings the example back before the app starts */
  search?: string | undefined;
  /** the Miragon mark of the start screen: the URL of the file in the page's public folder */
  komet: string;
}

export interface App {
  /** settles once the document the page started with is on the canvas */
  readonly ready: Promise<void>;
  /** the editor of the open document: another one after New, Open, Show example and a reset */
  editor(): BoardEditor;
  /** what is open: the example's repository, or a board with none behind it */
  shown(): Session["kind"];
  /** settles once everything a person asked of the page so far is done */
  settled(): Promise<void>;
  /** ends the editor and closes its files; the element and the page are left as they were */
  destroy(): Promise<void>;
}

const NOT_KEPT = "This browser did not keep all of your changes: its storage is blocked or full.";

export function startApp(root: HTMLElement, options: AppOptions): App {
  const page = root.ownerDocument;
  const titleBefore = page.title;
  const platform = detectPlatform(navigator);
  const keys = {
    openKey: commandKeyLabel("O", platform, defaultMessages.keyNames),
    saveKey: commandKeyLabel("S", platform, defaultMessages.keyNames),
  };

  let current: Session | undefined;
  let ended = false;
  // Once the browser refused a save the page says so and goes on saying it: what was not kept
  // is not there after a reload, whatever a later save does.
  let refused = false;
  const say = (): void => {
    if (!current) return;
    const text = refused ? NOT_KEPT : current.state();
    current.editor.shell.setStatus(text === undefined ? null : { severity: "warning", text });
  };
  const saved = (taken: boolean): void => {
    if (taken || refused) return;
    refused = true;
    say();
  };

  // One thing at a time: a document is closed, with what its editors still write, before the
  // next one is mounted into the same element.
  let queue: Promise<void> = Promise.resolve();
  const run = (task: () => Promise<void>): Promise<void> => {
    queue = queue
      .then(() => (ended ? undefined : task()))
      .catch((error: unknown) => console.error("[board-app]", error));
    return queue;
  };

  const focusBoard = (): void =>
    root.querySelector<HTMLElement>(".react-flow__pane")?.focus({ preventScroll: true });

  const sessionPage: SessionPage = {
    root,
    kept: createAppStorage(options.storage, EXAMPLE),
    opened: createOpenStorage(options.storage),
    saved,
    say,
    column: (kind, startScreen) =>
      webColumn(
        kind,
        startScreen,
        { komet: options.komet, ...keys },
        {
          // The card went, and with it the button that had the focus: the board takes the keys.
          startBoard: focusBoard,
          newBoard: () => void run(actions.newBoard),
          pickFile: () => input.pickFile(),
          showExample: () => void run(actions.showExample),
          resetExample: () => void run(actions.resetExample),
          download: () => actions.download(),
        },
      ),
  };

  async function close(): Promise<void> {
    const session = current;
    current = undefined;
    if (!session) return;
    await session.editor.destroy();
    // An editor may write while it goes (a label that commits on the blur): that write is kept
    // before the files end.
    await session.files.settled().catch(() => undefined);
    session.files.dispose();
  }

  /** The element that had the focus went with the editor before: the new board takes the keys. */
  async function takeFocus(session: Session): Promise<void> {
    await session.editor.modeler.board.mounted;
    if (current === session && (page.activeElement ?? page.body) === page.body) focusBoard();
  }

  async function show(next: OpenDocument, startScreen = false): Promise<Session> {
    await close();
    const session =
      next.kind === "example"
        ? await mountExample(sessionPage)
        : await mountBoard(sessionPage, next, startScreen);
    await session.editor.ready;
    current = session;
    page.title = session.name === undefined ? APP_NAME : `${session.name} · ${APP_NAME}`;
    say();
    if (!startScreen) void takeFocus(session);
    return session;
  }

  const actions: Actions = createActions(
    { current: () => current, close, show },
    { page, kept: sessionPage.kept, opened: sessionPage.opened, saved, run },
  );
  const input: PageInput = connectPage(root, {
    openFile: (file) => void run(() => actions.openFile(file)),
    download: () => actions.download(),
    canDownload: () => current !== undefined && !current.editor.shell.isEmptyStateShown(),
    modelPickerUsed: () => actions.modelPickerUsed(),
  });
  const ready = run(() => actions.start(options.search ?? ""));

  const open = (): Session => {
    if (!current) throw new Error("board-webapp: no document is open at this moment");
    return current;
  };
  let ending: Promise<void> | undefined;
  return {
    ready,
    editor: () => open().editor,
    shown: () => open().kind,
    settled: () => queue,
    destroy() {
      ending ??= (async () => {
        ended = true;
        // what a person asked for last ends first: it would mount into an element that went
        await queue;
        await close();
        input.dispose();
        page.title = titleBefore;
      })();
      return ending;
    },
  };
}
