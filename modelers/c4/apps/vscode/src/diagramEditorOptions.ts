import type { ModelerEditorOptions } from "@miragon/modeler-shell/vscode/extension";
import { THEMES } from "@miragon/c4-renderer/themes";
import { withExampleInserted } from "./examples.js";

/** The editor of `.c4` files, which open in it by default. */
export const DIAGRAM_VIEW_TYPE = "c4.editor";

/**
 * The editor of `.dsl` files, which open in it only when asked (SPEC 8.2): VS Code gives an editor
 * one priority for all of its file patterns, so `.dsl` needs an editor of its own.
 */
export const DSL_DIAGRAM_VIEW_TYPE = "c4.dslEditor";

export const DIAGRAM_VIEW_TYPES: readonly string[] = [DIAGRAM_VIEW_TYPE, DSL_DIAGRAM_VIEW_TYPE];

/**
 * The editor whose file pattern matches `path`, so Reopen Editor With… lists one C4 Modeler for
 * the file the diagram shows.
 */
export function diagramViewTypeFor(path: string): string {
  return /\.c4$/i.test(path) ? DIAGRAM_VIEW_TYPE : DSL_DIAGRAM_VIEW_TYPE;
}

/**
 * The diagram editor's options that need no `vscode` at runtime, so the e2e test page registers
 * the same document plumbing against the shell's stand-in for VS Code.
 */
export const DIAGRAM_EDITOR_OPTIONS = {
  viewType: DIAGRAM_VIEW_TYPE,
  title: "C4 Modeler",
  themes: THEMES,
  insertExample: withExampleInserted,
} satisfies ModelerEditorOptions;
