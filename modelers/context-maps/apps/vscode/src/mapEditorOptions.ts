import type { ModelerEditorOptions } from "@miragon/modeler-shell/vscode/extension";
import { withExampleInserted } from "./examples.js";
import { WEBVIEW_THEMES } from "./themes.js";

export const MAP_VIEW_TYPE = "contextMaps.editor";

/** The `<title>` of the webview document, the same in the `.cm` and the `.cm.png` editor. */
export const WEBVIEW_TITLE = "Context Maps Diagram";

/**
 * The map editor's options that need no `vscode` runtime, so the e2e test page runs the same
 * document plumbing against the shell's VS Code stub.
 */
export const MAP_EDITOR_OPTIONS = {
  viewType: MAP_VIEW_TYPE,
  title: WEBVIEW_TITLE,
  themes: WEBVIEW_THEMES,
  insertExample: withExampleInserted,
} satisfies ModelerEditorOptions;
