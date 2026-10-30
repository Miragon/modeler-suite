import * as vscode from 'vscode';
import { NEW_DIAGRAM_COMMAND, NEW_DIAGRAM_FROM_EXAMPLE_COMMAND } from './commands.js';
import { registerDiagramEditor } from './diagramEditor.js';
import { DIAGRAM_VIEW_TYPE } from './diagramEditorOptions.js';
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM } from './examples.js';

/** The save dialog's file type: a computed key, so the name may hold a space. */
const FILE_TYPE = '__DISPLAY_NAME__';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    registerDiagramEditor(context),
    vscode.commands.registerCommand(NEW_DIAGRAM_COMMAND, () => createDiagram(EMPTY_DIAGRAM)),
    vscode.commands.registerCommand(NEW_DIAGRAM_FROM_EXAMPLE_COMMAND, () =>
      createDiagram(EXAMPLE_DIAGRAM),
    ),
  );
}

export function deactivate(): void {
  // Everything is tied to context.subscriptions.
}

/** A real file, not an untitled document: a custom text editor is most robust on a file URI. */
async function createDiagram(initial: string): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const target = await vscode.window.showSaveDialog({
    title: 'New __DISPLAY_NAME__ Diagram',
    saveLabel: 'Create diagram',
    filters: { [FILE_TYPE]: ['__EXT__'] },
    ...(folder ? { defaultUri: vscode.Uri.joinPath(folder.uri, 'untitled.__EXT__') } : {}),
  });
  if (!target) return;
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(initial));
  await vscode.commands.executeCommand('vscode.openWith', target, DIAGRAM_VIEW_TYPE);
}
