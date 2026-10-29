import * as vscode from "vscode";
import { DIAGRAM_VIEW_TYPE } from "./diagramEditorOptions.js";
import type { WebviewCommand } from "./protocol.js";

export const WEBVIEW_COMMANDS: Readonly<Record<WebviewCommand, string>> = {
  fitView: "valueChain.fitView",
  exportPng: "valueChain.exportPng",
  exportSvg: "valueChain.exportSvg",
};

export const NO_DIAGRAM_MESSAGE = "Open a value chain diagram in the diagram editor first.";

/** Text and diagram side by side (guide §13.5), from the editor title of either editor. */
export const OPEN_SOURCE_COMMAND = "valueChain.openSource";
export const OPEN_DIAGRAM_COMMAND = "valueChain.openDiagram";

/**
 * Editor title buttons pass the editor's resource; the Command Palette and a walkthrough link pass
 * nothing, so the caller falls back to the diagram focused last (Open Source to the Side), the
 * focused text editor (Open Diagram to the Side) or the focused diagram (fit and export).
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
        "vscode.openWith",
        uri,
        "default",
        vscode.ViewColumn.Beside,
      );
    }),
    vscode.commands.registerCommand(OPEN_DIAGRAM_COMMAND, (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) return undefined;
      return vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        DIAGRAM_VIEW_TYPE,
        vscode.ViewColumn.Beside,
      );
    }),
  ];
}

/**
 * Shows a tab of `viewType` that VS Code restored after a reload and returns its document. VS Code
 * resolves a restored tab only once it is shown, so until then the editor knows no panel of it. A
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
 * The Command Palette commands run the same handlers as the webview menu (guide §13.5): the
 * command only forwards its name to a diagram. A title button names its own diagram, whose group
 * need not be the focused one; the Command Palette means the focused diagram. `runCommand` returns
 * false when there is none (a keybinding of the user's own can still invoke the command then).
 */
export function registerWebviewCommands(
  runCommand: (name: WebviewCommand, uri?: vscode.Uri) => boolean,
): vscode.Disposable[] {
  return (Object.keys(WEBVIEW_COMMANDS) as WebviewCommand[]).map((name) =>
    vscode.commands.registerCommand(WEBVIEW_COMMANDS[name], (argument?: unknown) => {
      if (!runCommand(name, resourceArgument(argument))) {
        void vscode.window.showInformationMessage(NO_DIAGRAM_MESSAGE);
      }
    }),
  );
}
