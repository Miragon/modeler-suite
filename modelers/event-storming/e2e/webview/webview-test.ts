import { registerModelerEditor } from "@miragon/modeler-shell/vscode/extension";
import {
  createVsCodeHostStub,
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
  type StubWebviewPanel,
} from "@miragon/modeler-shell/testing/vscode-stub";
import { BOARD_EDITOR_OPTIONS, BOARD_VIEW_TYPE } from "../../apps/vscode/src/boardEditorOptions.js";
import { EMPTY_BOARD, EXAMPLE_BOARD } from "../../apps/vscode/src/examples.js";
import { EVENT_STORMING_THEMES } from "../../packages/renderer/src/theme/themes.js";

const search = new URLSearchParams(location.search);
const BOARDS: Record<string, string> = { empty: EMPTY_BOARD, blank: "", example: EXAMPLE_BOARD };
const text = search.get("text") ?? BOARDS[search.get("board") ?? "example"] ?? EXAMPLE_BOARD;

/**
 * `?host`: the extension's document plumbing runs in the page as well, against the shell's stand-in
 * for VS Code's documents, so a test edits a document and the canvas both ways.
 */
async function openInHost(): Promise<StubWebviewPanel> {
  const host = createVsCodeHostStub();
  registerModelerEditor(host.vscode, { extensionUri: host.extensionUri }, BOARD_EDITOR_OPTIONS);
  const document = host.openTextDocument("/checkout.storm", text);
  const panel = await host.openCustomEditor(BOARD_VIEW_TYPE, document, {
    deliver: (message) => window.postMessage(message, "*"),
  });
  window.vscodeHost = { host, document, panel };
  return panel;
}

const panel = search.has("host") ? await openInHost() : undefined;

// The stub stands in for VS Code (default styles, <html> as renderWebviewHtml writes it, body
// theme classes, acquireVsCodeApi, theme bridge) and must be in place before the webview runs.
installVsCodeWebviewStub({
  ...stubOptionsFromSearch(location.search),
  themes: EVENT_STORMING_THEMES,
  onPostMessage: panel && ((message) => void panel.receive(message)),
});
const { webview } = await import("../../apps/vscode/src/webview/main.js");

// The tests drive the webview through these; the shipped bundle publishes nothing on window.
window.shell = webview.shell;
window.modeler = webview.modeler;
window.connection = webview.connection;
void webview.ready.then(() => {
  window.webviewReady = true;
});

// Without the host's plumbing, post the document the way the extension answers `ready`.
if (!panel) window.postMessage({ type: "init", text }, "*");
