/**
 * Where the webview test page keeps the stub's webview state for its tab, so that a reload of
 * the page finds it as a reloaded webview finds its state in VS Code. In a module of its own:
 * the page writes it and a spec reads and seeds it, and the page's own module runs the webview.
 */
export const WEBVIEW_STATE_KEY = "board-webview-test:state";
