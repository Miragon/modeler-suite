import {
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
} from "@miragon/modeler-shell/testing/vscode-stub";
import { EMPTY_MAP, EXAMPLE_MAP } from "../../apps/vscode/src/examples.js";
import { WEBVIEW_THEMES } from "../../apps/vscode/src/themes.js";

const search = new URLSearchParams(location.search);

// The stub stands in for VS Code (default styles, <html> as renderWebviewHtml writes it, body
// theme classes, acquireVsCodeApi, theme bridge) and must be in place before the webview runs.
// `legend=open` is the webview state VS Code restores after the user left the legend open.
installVsCodeWebviewStub({
  ...stubOptionsFromSearch(location.search),
  themes: WEBVIEW_THEMES,
  ...(search.get("legend") === "open" ? { state: { modelerShell: { legendOpen: true } } } : {}),
});
const { webview } = await import("../../apps/vscode/src/webview/main.js");

// The tests drive the webview through these; the shipped bundle publishes nothing on window.
window.shell = webview.shell;
window.modeler = webview.modeler;
window.connection = webview.connection;
void webview.ready.then(() => {
  window.webviewReady = true;
});

const MAPS: Record<string, string> = { empty: EMPTY_MAP, blank: "", example: EXAMPLE_MAP };
window.postMessage(
  { type: "init", text: MAPS[search.get("map") ?? "example"] ?? EXAMPLE_MAP },
  "*",
);
