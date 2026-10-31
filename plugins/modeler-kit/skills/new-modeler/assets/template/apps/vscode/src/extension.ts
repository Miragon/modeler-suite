import * as vscode from 'vscode';
import { registerNewDocumentCommand } from '@miragon/modeler-shell/vscode/extension';
import { NEW_DIAGRAM_COMMAND, NEW_DIAGRAM_FROM_EXAMPLE_COMMAND } from './commands.js';
import { registerDiagramEditor } from './diagramEditor.js';
import { DIAGRAM_VIEW_TYPE } from './diagramEditorOptions.js';
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM } from './examples.js';

/** The save dialog's file type: a computed key, so the name may hold a space. */
const FILE_TYPE = '__DISPLAY_NAME__';

/** The save dialog of New Empty Diagram and New Diagram from Example (guide §13.5). */
const NEW_DIAGRAM = {
  viewType: DIAGRAM_VIEW_TYPE,
  title: 'New __DISPLAY_NAME__ Diagram',
  saveLabel: 'Create diagram',
  filters: { [FILE_TYPE]: ['__EXT__'] },
  defaultFileName: 'untitled.__EXT__',
};

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    registerDiagramEditor(context),
    registerNewDocumentCommand(vscode, NEW_DIAGRAM_COMMAND, {
      ...NEW_DIAGRAM,
      text: EMPTY_DIAGRAM,
    }),
    registerNewDocumentCommand(vscode, NEW_DIAGRAM_FROM_EXAMPLE_COMMAND, {
      ...NEW_DIAGRAM,
      text: EXAMPLE_DIAGRAM,
    }),
  );
}

export function deactivate(): void {
  // Everything is tied to context.subscriptions.
}
