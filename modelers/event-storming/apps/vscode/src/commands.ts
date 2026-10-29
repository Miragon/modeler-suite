import * as vscode from "vscode";
import type { BoardEditors } from "./boardEditor.js";
import { BOARD_VIEW_TYPE } from "./boardEditorOptions.js";
import type { WebviewCommand } from "./protocol.js";

export const WEBVIEW_COMMANDS: Readonly<Record<WebviewCommand, string>> = {
  fitView: "eventStorming.fitView",
  exportPng: "eventStorming.exportPng",
  exportSvg: "eventStorming.exportSvg",
  exportPngTransparent: "eventStorming.exportPngTransparent",
  exportJson: "eventStorming.exportJson",
};

export const NO_BOARD_MESSAGE = "Open an Event Storming board in the board editor first.";

/** Text and board side by side (guide §13.5), from the editor title of either editor. */
export const OPEN_SOURCE_COMMAND = "eventStorming.openSource";
export const OPEN_BOARD_COMMAND = "eventStorming.openBoard";

/**
 * Editor title buttons pass the editor's resource; the Command Palette and a walkthrough link pass
 * nothing, so the caller falls back to the board focused last (Open Source to the Side) or the
 * focused text editor (Open Board to the Side).
 */
function resourceArgument(argument: unknown): vscode.Uri | undefined {
  return argument instanceof vscode.Uri ? argument : undefined;
}

/**
 * Shows a tab of `viewType` that VS Code restored after a reload and returns its document. VS Code
 * resolves a restored tab only once it is shown, so until then the board editor knows no panel of
 * it. A tab in the active group comes first (the walkthrough is restored in front of it), then the
 * tab each group shows, then any other.
 */
async function revealRestoredTab(viewType: string): Promise<vscode.Uri | undefined> {
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
        "vscode.openWith",
        input.uri,
        viewType,
        tab.group.viewColumn,
      );
      return input.uri;
    }
  }
  return undefined;
}

/**
 * Shows the board Open Source to the Side means without a resource and returns its document: the
 * focused board, else the open board focused last (a link in the walkthrough takes the focus from
 * the board it means), else a board tab VS Code restored after a reload. Showing it focuses its
 * group, so the source opens beside the board, not beside the walkthrough.
 */
async function revealSourceBoard(editors: BoardEditors): Promise<vscode.Uri | undefined> {
  return editors.revealActiveDocument() ?? revealRestoredTab(BOARD_VIEW_TYPE);
}

function registerSideBySideCommands(editors: BoardEditors): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(OPEN_SOURCE_COMMAND, async (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? (await revealSourceBoard(editors));
      if (!uri) return void vscode.window.showInformationMessage(NO_BOARD_MESSAGE);
      return vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        "default",
        vscode.ViewColumn.Beside,
      );
    }),
    vscode.commands.registerCommand(OPEN_BOARD_COMMAND, (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) return undefined;
      return vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        BOARD_VIEW_TYPE,
        vscode.ViewColumn.Beside,
      );
    }),
  ];
}

/**
 * The Command Palette commands run the same handlers as the webview menu (guide §13.5): the
 * command only forwards its name to the focused board, never to one focused earlier.
 * `runCommand` returns false when no board editor is focused (a keybinding of the user's own can
 * still invoke the command then).
 */
function registerWebviewCommands(editors: BoardEditors): vscode.Disposable[] {
  return (Object.keys(WEBVIEW_COMMANDS) as WebviewCommand[]).map((name) =>
    vscode.commands.registerCommand(WEBVIEW_COMMANDS[name], () => {
      if (!editors.runCommand(name)) void vscode.window.showInformationMessage(NO_BOARD_MESSAGE);
    }),
  );
}

/** The commands of an open board: text and board side by side, fit and the exports. */
export function registerBoardCommands(editors: BoardEditors): vscode.Disposable[] {
  return [...registerSideBySideCommands(editors), ...registerWebviewCommands(editors)];
}
