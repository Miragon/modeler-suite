// "@miragon/modeler-shell/testing/webview-bundle": a modeler's production webview bundle under the
// webview CSP, for the kit's `csp` case (Node, next to Playwright).
export type {
  WebviewBundleOptions,
  WebviewBundlePage,
  WebviewBundleRoute,
} from "./testing/webview-bundle.js";
export { WEBVIEW_BUNDLE_ORIGIN, openWebviewBundle } from "./testing/webview-bundle.js";
