import * as vscode from "vscode";
import { DIAGRAM_VIEW_TYPE } from "./diagramEditorOptions.js";
import type { WebviewCommand } from "./protocol.js";

export const PNG_VIEW_TYPE = "teamTopologies.pngEditor";

/** The Command Palette commands that run the same handlers as the webview menu (guide §13.5). */
export const WEBVIEW_COMMANDS: Readonly<Record<WebviewCommand, string>> = {
  fitView: "teamTopologies.fitView",
  exportPng: "teamTopologies.exportPng",
  exportSvg: "teamTopologies.exportSvg",
};

/** Text and diagram side by side (guide §13.5), from the editor title of either editor. */
export const OPEN_SOURCE_COMMAND = "teamTopologies.openSource";
export const OPEN_DIAGRAM_COMMAND = "teamTopologies.openDiagram";

export const NO_DIAGRAM_MESSAGE = "Open a Team Topologies diagram in the diagram editor first.";

/**
 * Editor title buttons pass the editor's resource; the Command Palette and a walkthrough link pass
 * nothing, so the caller falls back to the text diagram focused last (Open Source to the Side) or
 * the focused text editor (Open Diagram to the Side).
 */
function resourceArgument(argument: unknown): vscode.Uri | undefined {
  return argument instanceof vscode.Uri ? argument : undefined;
}

export function registerSideBySideCommands(
  revealTextDiagram: () => Promise<vscode.Uri | undefined>,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(OPEN_SOURCE_COMMAND, async (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? (await revealTextDiagram());
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
 * The command only forwards its name to the focused diagram, which runs the same handler as its
 * menu entry. `runCommand` returns false when no diagram editor is focused.
 */
export function registerWebviewCommands(
  runCommand: (name: WebviewCommand) => boolean,
): vscode.Disposable[] {
  return (Object.keys(WEBVIEW_COMMANDS) as WebviewCommand[]).map((name) =>
    vscode.commands.registerCommand(WEBVIEW_COMMANDS[name], () => {
      if (!runCommand(name)) void vscode.window.showInformationMessage(NO_DIAGRAM_MESSAGE);
    }),
  );
}
