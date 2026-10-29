import {
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
} from '@miragon/modeler-shell/testing/vscode-stub';
import { THEMES } from '@miragon/__NOTATION__-renderer/themes';
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM } from '../../apps/vscode/src/examples.js';

// The stub stands in for VS Code (default styles, <html> as renderWebviewHtml writes it, the
// body's theme classes, acquireVsCodeApi, the theme bridge) and must be in place before the
// webview runs.
installVsCodeWebviewStub({ ...stubOptionsFromSearch(location.search), themes: THEMES });
const { webview } = await import('../../apps/vscode/src/webview/main.js');

// For the tests only: the shipped bundle publishes nothing on window.
window.shell = webview.shell;
window.modeler = webview.modeler;
window.connection = webview.connection;
void webview.ready.then(() => {
  window.webviewReady = true;
});

// There is no extension host: post the document the way the extension would. `?doc=empty` is
// EMPTY_DIAGRAM, the file the "New Empty Diagram" command writes, `?doc=blank` a file of zero
// bytes.
const DOCUMENTS: Record<string, string> = {
  example: EXAMPLE_DIAGRAM,
  empty: EMPTY_DIAGRAM,
  blank: '',
};
const documentKey = new URLSearchParams(location.search).get('doc') ?? 'example';
window.postMessage({ type: 'init', text: DOCUMENTS[documentKey] ?? EXAMPLE_DIAGRAM }, '*');
