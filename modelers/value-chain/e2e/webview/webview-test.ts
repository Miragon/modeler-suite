import { registerModelerEditor } from "@miragon/modeler-shell/vscode/extension";
import {
  createVsCodeHostStub,
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
  type StubWebviewPanel,
} from "@miragon/modeler-shell/testing/vscode-stub";
import { EMPTY_DOCUMENT, EXAMPLE_DOCUMENT } from "../../apps/vscode/src/examples.js";
import {
  DIAGRAM_EDITOR_OPTIONS,
  DIAGRAM_VIEW_TYPE,
} from "../../apps/vscode/src/diagramEditorOptions.js";
import { VALUE_CHAIN_THEMES } from "../../packages/renderer/src/appearance/themes.js";

const DOCUMENTS: Record<string, string> = {
  example: EXAMPLE_DOCUMENT,
  empty: EMPTY_DOCUMENT,
  blank: "",
  invalid: '{ "schemaVersion": 1, "meta": ',
};
const search = new URLSearchParams(location.search);
const text = DOCUMENTS[search.get("diagram") ?? "example"] ?? EXAMPLE_DOCUMENT;

/**
 * `?host`: the extension's document plumbing runs in the page as well, against the shell's stand-in
 * for VS Code's documents, so a test edits a document and the canvas both ways.
 */
async function openInHost(): Promise<StubWebviewPanel> {
  const host = createVsCodeHostStub();
  registerModelerEditor(host.vscode, { extensionUri: host.extensionUri }, DIAGRAM_EDITOR_OPTIONS);
  const document = host.openTextDocument("/porter.vc.json", text);
  const panel = await host.openCustomEditor(DIAGRAM_VIEW_TYPE, document, {
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
  themes: VALUE_CHAIN_THEMES,
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
