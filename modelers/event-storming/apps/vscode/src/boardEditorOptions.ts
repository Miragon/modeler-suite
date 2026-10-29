import type { ModelerEditorOptions } from "@miragon/modeler-shell/vscode/extension";
import { withExampleInserted } from "./examples.js";
// The renderer's DOM-free module, not its entry: the extension host bundle runs in Node.
import { EVENT_STORMING_THEMES } from "../../../packages/renderer/src/theme/themes.js";

export const BOARD_VIEW_TYPE = "eventStorming.boardEditor";

/**
 * The board editor's options that need no `vscode` runtime, so the e2e test page runs the same
 * document plumbing against the shell's VS Code stub.
 */
export const BOARD_EDITOR_OPTIONS = {
  viewType: BOARD_VIEW_TYPE,
  title: "Event Storming Board",
  themes: EVENT_STORMING_THEMES,
  insertExample: withExampleInserted,
} satisfies ModelerEditorOptions;
