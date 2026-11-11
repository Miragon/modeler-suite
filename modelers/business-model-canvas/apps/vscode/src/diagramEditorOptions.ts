import type { ModelerEditorOptions } from "@miragon/modeler-shell/vscode/extension";
import { THEMES } from "../../../packages/renderer/src/themes.js";

export const DIAGRAM_VIEW_TYPE = "businessModelCanvas.canvasEditor";

/**
 * The canvas editor's options that need no `vscode` runtime, so the e2e test page runs the same
 * document plumbing against the shell's VS Code stub.
 */
export const DIAGRAM_EDITOR_OPTIONS = {
  viewType: DIAGRAM_VIEW_TYPE,
  title: "Business Model Canvas",
  themes: THEMES,
} satisfies ModelerEditorOptions;
