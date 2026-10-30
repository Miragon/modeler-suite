import type { ModelerEditorOptions } from '@miragon/modeler-shell/vscode/extension';
import { THEMES } from '@miragon/__NOTATION__-renderer/themes';
import { withExampleInserted } from './examples.js';

export const DIAGRAM_VIEW_TYPE = '__NOTATION__.editor';

/**
 * The diagram editor's options that need no `vscode` at runtime, so the e2e test page registers
 * the same document plumbing against the shell's stand-in for VS Code.
 */
export const DIAGRAM_EDITOR_OPTIONS = {
  viewType: DIAGRAM_VIEW_TYPE,
  title: '__DISPLAY_NAME__',
  themes: THEMES,
  insertExample: withExampleInserted,
} satisfies ModelerEditorOptions;
