import type { ModelerEditorOptions } from "@miragon/modeler-shell/vscode/extension";
import { withExampleInserted } from "./examples.js";
import { TEAM_TOPOLOGIES_THEMES } from "../../../packages/renderer/src/theme/themes.js";

export const DIAGRAM_VIEW_TYPE = "teamTopologies.editor";

/**
 * The diagram editor's options that need no `vscode` runtime, so the e2e test page runs the same
 * document plumbing against the shell's VS Code stub.
 */
export const DIAGRAM_EDITOR_OPTIONS = {
  viewType: DIAGRAM_VIEW_TYPE,
  title: "Team Topologies Diagram",
  themes: TEAM_TOPOLOGIES_THEMES,
  insertExample: withExampleInserted,
} satisfies ModelerEditorOptions;
