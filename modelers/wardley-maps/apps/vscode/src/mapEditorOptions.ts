import type { ModelerEditorOptions } from "@miragon/modeler-shell/vscode/extension";
import { WARDLEY_THEMES } from "@miragon/wardley-renderer/themes";
import { withExampleInserted } from "./examples.js";

export const MAP_VIEW_TYPE = "wardley.mapEditor";

/**
 * The map editor's options that need no `vscode` runtime, so the e2e test page runs the same
 * document plumbing against the shell's VS Code stub.
 */
export const MAP_EDITOR_OPTIONS = {
  viewType: MAP_VIEW_TYPE,
  title: "Wardley Map",
  themes: WARDLEY_THEMES,
  insertExample: withExampleInserted,
} satisfies ModelerEditorOptions;
