import type { ModelerEditorOptions } from "@miragon/modeler-shell/vscode/extension";
import { VALUE_CHAIN_THEMES } from "../../../packages/renderer/src/appearance/themes.js";
import { withExampleInserted } from "./examples.js";

export const DIAGRAM_VIEW_TYPE = "valueChain.diagramEditor";

/**
 * The diagram editor's options that need no `vscode` runtime, so the e2e test page runs the same
 * document plumbing against the shell's VS Code stub.
 */
export const DIAGRAM_EDITOR_OPTIONS = {
  viewType: DIAGRAM_VIEW_TYPE,
  title: "Value Chain Diagram",
  themes: VALUE_CHAIN_THEMES,
  insertExample: withExampleInserted,
} satisfies ModelerEditorOptions;
