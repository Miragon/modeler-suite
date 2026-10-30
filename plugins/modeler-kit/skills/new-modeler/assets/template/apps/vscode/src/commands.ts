import * as vscode from 'vscode';
import { DIAGRAM_VIEW_TYPE } from './diagramEditorOptions.js';

/** New Empty and New … from Example (guide §13.5): commands, `file/newFile` and the walkthrough. */
export const NEW_DIAGRAM_COMMAND = '__NOTATION__.newDiagram';
export const NEW_DIAGRAM_FROM_EXAMPLE_COMMAND = '__NOTATION__.newDiagramFromExample';

/** Text and diagram side by side (guide §13.5), from the editor title of either editor. */
export const OPEN_SOURCE_COMMAND = '__NOTATION__.openSource';
export const OPEN_DIAGRAM_COMMAND = '__NOTATION__.openDiagram';

export const NO_DIAGRAM_MESSAGE = 'Open a diagram in the __DISPLAY_NAME__ editor first.';
export const NO_SOURCE_MESSAGE = 'Open a .__EXT__ file first.';

/**
 * Editor title buttons pass the editor's resource; the Command Palette and a walkthrough link pass
 * nothing, so the command falls back to the diagram focused last or the focused text editor.
 */
function resourceArgument(argument: unknown): vscode.Uri | undefined {
  return argument instanceof vscode.Uri ? argument : undefined;
}

export function registerSideBySideCommands(
  revealSourceDiagram: () => Promise<vscode.Uri | undefined>,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(OPEN_SOURCE_COMMAND, async (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? (await revealSourceDiagram());
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

/**
 * Shows a tab of `viewType` that VS Code restored after a reload and returns its document. VS Code
 * resolves a restored tab only once it is shown, so until then the provider knows no panel of it. A
 * tab in the active group comes first (the walkthrough is restored in front of it), then the tab
 * each group shows, then any other.
 */
export async function revealRestoredTab(viewType: string): Promise<vscode.Uri | undefined> {
  const { activeTabGroup, all } = vscode.window.tabGroups;
  const tabs = [
    ...activeTabGroup.tabs,
    ...all.flatMap((group) => (group.activeTab ? [group.activeTab] : [])),
    ...all.flatMap((group) => group.tabs),
  ];
  for (const tab of tabs) {
    const input = tab.input;
    if (input instanceof vscode.TabInputCustom && input.viewType === viewType) {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        input.uri,
        viewType,
        tab.group.viewColumn,
      );
      return input.uri;
    }
  }
  return undefined;
}
