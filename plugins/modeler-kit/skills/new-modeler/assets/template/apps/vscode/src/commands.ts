import * as vscode from 'vscode';

export const DIAGRAM_VIEW_TYPE = '__NOTATION__.editor';

/** New Empty and New … from Example (guide §13.5): commands, `file/newFile` and the walkthrough. */
export const NEW_DIAGRAM_COMMAND = '__NOTATION__.newDiagram';
export const NEW_DIAGRAM_FROM_EXAMPLE_COMMAND = '__NOTATION__.newDiagramFromExample';

/** Text and diagram side by side (guide §13.5), from the editor title of either editor. */
export const OPEN_SOURCE_COMMAND = '__NOTATION__.openSource';
export const OPEN_DIAGRAM_COMMAND = '__NOTATION__.openDiagram';

export const NO_DIAGRAM_MESSAGE = 'Open a __DISPLAY_NAME__ diagram first.';
export const NO_SOURCE_MESSAGE = 'Open a .__EXT__ file first.';

/**
 * Editor title buttons pass the editor's resource; the Command Palette passes nothing, so the
 * command falls back to the focused diagram or text editor.
 */
function resourceArgument(argument: unknown): vscode.Uri | undefined {
  return argument instanceof vscode.Uri ? argument : undefined;
}

export function registerSideBySideCommands(
  activeDiagramUri: () => vscode.Uri | undefined,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(OPEN_SOURCE_COMMAND, (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? activeDiagramUri();
      if (!uri) return void vscode.window.showInformationMessage(NO_DIAGRAM_MESSAGE);
      return vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        'default',
        vscode.ViewColumn.Beside,
      );
    }),
    vscode.commands.registerCommand(OPEN_DIAGRAM_COMMAND, (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) return void vscode.window.showInformationMessage(NO_SOURCE_MESSAGE);
      return vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        DIAGRAM_VIEW_TYPE,
        vscode.ViewColumn.Beside,
      );
    }),
  ];
}
