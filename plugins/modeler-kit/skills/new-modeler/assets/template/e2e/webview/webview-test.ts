import { registerModelerEditor } from '@miragon/modeler-shell/vscode/extension';
import {
  createVsCodeHostStub,
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
  type StubWebviewPanel,
} from '@miragon/modeler-shell/testing/vscode-stub';
import { THEMES } from '@miragon/__NOTATION__-renderer/themes';
import {
  DIAGRAM_EDITOR_OPTIONS,
  DIAGRAM_VIEW_TYPE,
} from '../../apps/vscode/src/diagramEditorOptions.js';
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM } from '../../apps/vscode/src/examples.js';

// `?doc=empty` is EMPTY_DIAGRAM, the file the "New Empty Diagram" command writes, `?doc=blank` a
// file of zero bytes.
const DOCUMENTS: Record<string, string> = {
  example: EXAMPLE_DIAGRAM,
  empty: EMPTY_DIAGRAM,
  blank: '',
};
const search = new URLSearchParams(location.search);
const text = DOCUMENTS[search.get('doc') ?? 'example'] ?? EXAMPLE_DIAGRAM;

/**
 * `?host`: the extension's document plumbing runs in the page as well, with the diagram editor's
 * options, against the shell's stand-in for VS Code's documents, so a test edits a document and
 * the canvas both ways.
 */
async function openInHost(): Promise<StubWebviewPanel> {
  const host = createVsCodeHostStub();
  registerModelerEditor(host.vscode, { extensionUri: host.extensionUri }, DIAGRAM_EDITOR_OPTIONS);
  const document = host.openTextDocument('/order-fulfilment.__EXT__', text);
  const panel = await host.openCustomEditor(DIAGRAM_VIEW_TYPE, document, {
    deliver: (message) => window.postMessage(message, '*'),
  });
  window.vscodeHost = { host, document, panel };
  return panel;
}

const panel = search.has('host') ? await openInHost() : undefined;

// The stub stands in for VS Code (default styles, <html> as renderWebviewHtml writes it, the
// body's theme classes, acquireVsCodeApi, the theme bridge) and must be in place before the
// webview runs.
installVsCodeWebviewStub({
  ...stubOptionsFromSearch(location.search),
  themes: THEMES,
  onPostMessage: panel && ((message) => void panel.receive(message)),
});
const { webview } = await import('../../apps/vscode/src/webview/main.js');

// For the tests only: the shipped bundle publishes nothing on window.
window.shell = webview.shell;
window.modeler = webview.modeler;
window.connection = webview.connection;
void webview.ready.then(() => {
  window.webviewReady = true;
});

// Without the extension's plumbing, post the document the way it answers `ready`.
if (!panel) window.postMessage({ type: 'init', text }, '*');
