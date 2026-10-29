import { registerModelerEditor } from "@miragon/modeler-shell/vscode/extension";
import {
  createVsCodeHostStub,
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
  type StubWebviewPanel,
} from "@miragon/modeler-shell/testing/vscode-stub";
import { EMPTY_MAP, EXAMPLE_MAP } from "../../apps/vscode/src/examples.js";
import { MAP_EDITOR_OPTIONS, MAP_VIEW_TYPE } from "../../apps/vscode/src/mapEditorOptions.js";
import { mapProblems, problemCounts } from "../../apps/vscode/src/problems.js";
import { WEBVIEW_THEMES } from "../../apps/vscode/src/themes.js";

const MAPS: Record<string, string> = { empty: EMPTY_MAP, blank: "", example: EXAMPLE_MAP };
const search = new URLSearchParams(location.search);
const text = MAPS[search.get("map") ?? "example"] ?? EXAMPLE_MAP;

/**
 * `?host`: the extension's document plumbing runs in the page as well, against the shell's stand-in
 * for VS Code's documents, so a test edits a document and the canvas both ways. The pill counts the
 * extension's problems; the Problems view itself is VS Code's.
 */
async function openInHost(): Promise<StubWebviewPanel> {
  const host = createVsCodeHostStub();
  registerModelerEditor(
    host.vscode,
    { extensionUri: host.extensionUri },
    {
      ...MAP_EDITOR_OPTIONS,
      diagnostics: { refresh: (document) => problemCounts(mapProblems(document.getText())) },
    },
  );
  const document = host.openTextDocument("/conference.cm", text);
  const panel = await host.openCustomEditor(MAP_VIEW_TYPE, document, {
    deliver: (message) => window.postMessage(message, "*"),
  });
  window.vscodeHost = { host, document, panel };
  return panel;
}

const panel = search.has("host") ? await openInHost() : undefined;

// The stub stands in for VS Code (default styles, <html> as renderWebviewHtml writes it, body
// theme classes, acquireVsCodeApi, theme bridge) and must be in place before the webview runs.
// `legend=open` is the webview state VS Code restores after the user left the legend open.
installVsCodeWebviewStub({
  ...stubOptionsFromSearch(location.search),
  themes: WEBVIEW_THEMES,
  ...(search.get("legend") === "open" ? { state: { modelerShell: { legendOpen: true } } } : {}),
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
