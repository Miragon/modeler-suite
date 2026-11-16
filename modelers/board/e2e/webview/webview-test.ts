import { createMemoryBackend, type FilesBackend } from "@miragon/board-files";
import { registerModelerEditor } from "@miragon/modeler-shell/vscode/extension";
import {
  createVsCodeHostStub,
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
  type StubbedVsCodeApi,
  type StubWebviewPanel,
} from "@miragon/modeler-shell/testing/vscode-stub";
import { BOARD_VIEW_TYPE, boardEditorOptions } from "../../apps/vscode/src/boardEditorOptions.js";
import { boardProblem } from "../../apps/vscode/src/problems.js";
import { EXAMPLE } from "../../apps/webapp/src/example.js";
import { WEBVIEW_STATE_KEY } from "./kept-state.js";

/**
 * The extension's webview as a page: `apps/vscode/src/webview/main.ts` inside the shell's VS
 * Code stub. The repository is the example folder, the one the web app shows.
 */

/** the board file's path in the repository */
const BOARD_FILE = "example.board";

const BOARDS: Record<string, string> = {
  example: EXAMPLE.board,
  // a file somebody just created
  empty: "",
};
const search = new URLSearchParams(location.search);
const text = BOARDS[search.get("board") ?? "example"] ?? EXAMPLE.board;
const options = boardEditorOptions(() => undefined);

/**
 * `?host`: the extension's plumbing runs in the page as well, the editor's own options against
 * the shell's stand-in for VS Code's documents and a repository in memory. So a test changes the
 * board file's document and the files of the repository from both sides.
 */
async function openInHost(): Promise<StubWebviewPanel> {
  const host = createVsCodeHostStub();
  // The board file is a file of its repository like any other. The page never asks the files
  // for it: its text is VS Code's document, below.
  const backend = createMemoryBackend({ ...EXAMPLE.files, [BOARD_FILE]: text });
  // VS Code has editors to show a file in, and a repository in memory has none: the page's
  // stand-in writes down which file it was asked to show.
  const shown: string[] = [];
  const showing: FilesBackend = {
    ...backend,
    showFile: (path) => {
      shown.push(path);
      return Promise.resolve();
    },
  };
  registerModelerEditor(
    host.vscode,
    { extensionUri: host.extensionUri },
    {
      ...boardEditorOptions(() => showing),
      // The extension keeps an entry in VS Code's Problems view and hands the shell its count
      // for the page's pill. The view is VS Code's: the page counts the same problem.
      diagnostics: {
        refresh(opened) {
          const problems = boardProblem(opened.getText()) ? 1 : 0;
          return { count: problems, errors: problems };
        },
      },
    },
  );
  const document = host.openTextDocument(`/repository/${BOARD_FILE}`, text);
  // What the extension posts is on its way for a while in VS Code. A test holds it there, so
  // that a person's next gesture is made before the webview heard.
  let waiting: unknown[] | undefined;
  const panel = await host.openCustomEditor(BOARD_VIEW_TYPE, document, {
    deliver(message) {
      if (waiting) waiting.push(message);
      else window.postMessage(message, "*");
    },
  });
  const deliveries = {
    hold(): void {
      waiting ??= [];
    },
    release(): void {
      const held = waiting ?? [];
      waiting = undefined;
      for (const message of held) window.postMessage(message, "*");
    },
  };
  window.vscodeHost = { host, document, panel, backend, shown, deliveries };
  return panel;
}

const panel = search.has("host") ? await openInHost() : undefined;

// `?root=none`: a page whose HTML lacks the element the editor mounts into.
const rootless = search.get("root") === "none";
if (rootless) document.getElementById("app")?.remove();

/**
 * VS Code keeps what a webview handed to `setState` for as long as its editor lives, and hands
 * it to the next page of that editor: after Reload Webviews, and in a window it restores. The
 * stub keeps it for one page. A reload of this page is a reload of the webview, so the page
 * keeps the state for the tab itself, as text, since VS Code keeps JSON.
 */
function keptState(): unknown {
  const kept = sessionStorage.getItem(WEBVIEW_STATE_KEY);
  return kept === null ? undefined : (JSON.parse(kept) as unknown);
}

// The stub stands in for VS Code (default styles, <html> as renderWebviewHtml writes it, body
// theme classes, acquireVsCodeApi, theme bridge) and must be in place before the webview runs.
installVsCodeWebviewStub({
  ...stubOptionsFromSearch(location.search),
  themes: options.themes,
  state: keptState(),
  onPostMessage: panel && ((message) => void panel.receive(message)),
});
const acquire = window.acquireVsCodeApi;
if (!acquire) throw new Error("the VS Code stub is not installed");
window.webviewStateWrites = [];
window.acquireVsCodeApi = (): StubbedVsCodeApi => {
  const api = acquire();
  return {
    ...api,
    setState(state) {
      api.setState(state);
      const text = JSON.stringify(state);
      sessionStorage.setItem(WEBVIEW_STATE_KEY, text);
      window.webviewStateWrites?.push(JSON.parse(text) as unknown);
    },
  };
};
const { webview } = await import("../../apps/vscode/src/webview/main.js");

// The tests drive the webview through these; the shipped bundle publishes nothing on window.
window.webview = webview;
// A mount that fails stops this page with its error, but for the page that asked for it: its
// test reads the failure from `webview.mounted`.
const editor = await webview.mounted.catch((error: unknown) => {
  if (!rootless) throw error;
  return undefined;
});
if (editor) {
  window.editor = editor;
  void editor.ready.then(() => {
    window.webviewReady = true;
  });
}

// Without the host's plumbing the page posts the document the way the extension answers
// `ready`, and nothing answers for the files: the board's models wait.
if (!panel) window.postMessage({ type: "init", text }, "*");
