import { registerModelerEditor } from "@miragon/modeler-shell/vscode/extension";
import {
  createVsCodeHostStub,
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
  type StubWebviewPanel,
} from "@miragon/modeler-shell/testing/vscode-stub";
import {
  DIAGRAM_EDITOR_OPTIONS,
  DIAGRAM_VIEW_TYPE,
} from "../../apps/vscode/src/diagramEditorOptions.js";
import { EMPTY_MAP, EXAMPLE_MAP } from "../../apps/vscode/src/examples.js";
import { documentProblems } from "../../apps/vscode/src/problems.js";
import { TEAM_TOPOLOGIES_THEMES } from "../../packages/renderer/src/theme/themes.js";

const search = new URLSearchParams(location.search);
const DOCUMENTS: Record<string, string> = { empty: EMPTY_MAP, example: EXAMPLE_MAP, blank: "" };
const text = DOCUMENTS[search.get("doc") ?? "example"] ?? EXAMPLE_MAP;

// A state the webview stored before (e.g. the legend state of an older version), as VS Code's
// getState() would return it after a window reload.
const storedState = search.get("state");

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
      ...DIAGRAM_EDITOR_OPTIONS,
      diagnostics: {
        refresh: (document) => {
          const problems = documentProblems(document.getText());
          return {
            count: problems.length,
            errors: problems.filter((problem) => problem.severity === "error").length,
          };
        },
      },
    },
  );
  const document = host.openTextDocument("/online-shop.tt", text);
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
  themes: TEAM_TOPOLOGIES_THEMES,
  ...(storedState ? { state: JSON.parse(storedState) as unknown } : {}),
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
