import { registerModelerEditor } from "@miragon/modeler-shell/vscode/extension";
import {
  createVsCodeHostStub,
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
  type StubTextDocument,
  type StubWebviewPanel,
} from "@miragon/modeler-shell/testing/vscode-stub";
import { THEMES } from "@miragon/c4-renderer/themes";
import {
  DIAGRAM_EDITOR_OPTIONS,
  DIAGRAM_VIEW_TYPE,
} from "../../apps/vscode/src/diagramEditorOptions.js";
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM } from "../../apps/vscode/src/examples.js";
import type { WebviewToHost } from "../../apps/vscode/src/protocol.js";
import { webviewFlushes, type WebviewFlushes } from "../../apps/vscode/src/saveFlush.js";

// `?doc=empty` is EMPTY_DIAGRAM, the file the "New Empty C4 Diagram" command writes, `?doc=blank`
// a file of zero bytes.
const DOCUMENTS: Record<string, string> = {
  example: EXAMPLE_DIAGRAM,
  empty: EMPTY_DIAGRAM,
  blank: "",
};
const search = new URLSearchParams(location.search);
const text = DOCUMENTS[search.get("doc") ?? "example"] ?? EXAMPLE_DIAGRAM;

// `?state=<json>`: what the webview stored before, as VS Code's getState() returns it after a
// window reload or for a tab that comes back.
const storedState = search.get("state");

/**
 * `?host`: the extension's document plumbing runs in the page as well, with the diagram editor's
 * options, against the shell's stand-in for VS Code's documents, so a test edits a document and
 * the canvas both ways. The stand-in has no save participants, so the page runs the extension's
 * own flush round trip (apps/vscode/src/saveFlush.ts) before a save, as `onWillSaveTextDocument`
 * does in VS Code; Cmd/Ctrl+S, which the webview passes on to the workbench, saves the same way.
 */
async function openInHost(): Promise<StubWebviewPanel> {
  const host = createVsCodeHostStub();
  let flushes: WebviewFlushes | undefined;
  registerModelerEditor<StubTextDocument, WebviewToHost>(
    host.vscode,
    { extensionUri: host.extensionUri },
    {
      ...DIAGRAM_EDITOR_OPTIONS,
      onMessage: (message) => {
        if (message.type === "c4.flushed") flushes?.answered(message.id);
      },
      onDidOpen: (editor) => {
        const flush = webviewFlushes(editor);
        flushes = flush;
        return { dispose: () => flush.dispose() };
      },
    },
  );
  const document = host.openTextDocument("/workspace.c4", text);
  const panel = await host.openCustomEditor(DIAGRAM_VIEW_TYPE, document, {
    deliver: (message) => window.postMessage(message, "*"),
  });
  const saves: string[] = [];
  const save = async (): Promise<void> => {
    await flushes?.request();
    host.save(document);
    saves.push(document.getText());
  };
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") void save();
  });
  window.vscodeHost = { host, document, panel, save, saves };
  return panel;
}

const panel = search.has("host") ? await openInHost() : undefined;

// The stub stands in for VS Code (default styles, <html> as renderWebviewHtml writes it, the
// body's theme classes, acquireVsCodeApi, the theme bridge) and must be in place before the
// webview runs.
installVsCodeWebviewStub({
  ...stubOptionsFromSearch(location.search),
  themes: THEMES,
  ...(storedState ? { state: JSON.parse(storedState) as unknown } : {}),
  onPostMessage: panel && ((message) => void panel.receive(message)),
});
const { webview } = await import("../../apps/vscode/src/webview/main.js");

// For the tests only: the shipped bundle publishes nothing on window.
window.shell = webview.shell;
window.modeler = webview.modeler;
window.connection = webview.connection;
void webview.ready.then(() => {
  window.webviewReady = true;
});

// Without the extension's plumbing, post the document the way it answers `ready`.
if (!panel) window.postMessage({ type: "init", text }, "*");
