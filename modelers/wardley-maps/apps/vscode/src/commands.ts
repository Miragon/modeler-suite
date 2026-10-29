import * as vscode from "vscode";
import { MAP_VIEW_TYPE, type MapEditors } from "./mapEditor.js";
import { WEBVIEW_COMMANDS, type WebviewCommand } from "./protocol.js";

/** The command ids `registerEditorCommands` contributes (besides the webview actions). */
export const SHOW_SOURCE_COMMAND = "wardley.showSource";
export const SHOW_DIAGRAM_COMMAND = "wardley.showDiagram";

export const NO_DIAGRAM_MESSAGE = "Open a Wardley map in the diagram editor first.";

/**
 * Editor title buttons pass the editor's resource; the Command Palette and a walkthrough link pass
 * nothing, so fall back to the map focused last (Open Source to the Side) or the focused text editor
 * (Open Diagram to the Side). Fit and the exports need the focused map.
 */
function resourceArgument(argument: unknown): vscode.Uri | undefined {
  return argument instanceof vscode.Uri ? argument : undefined;
}

/**
 * Shows the map Open Source to the Side means without a resource and returns its document: the
 * focused map, else the open map focused last (a link in the walkthrough takes the focus from the
 * map it means), else a map tab VS Code restored after a reload. Showing it focuses its group, so
 * the source opens beside the map, not beside the walkthrough.
 */
async function revealSourceMap(editors: MapEditors): Promise<vscode.Uri | undefined> {
  return editors.revealActiveDocument() ?? revealRestoredMapTab();
}

/**
 * Shows a map tab VS Code restored after a reload and returns its document. VS Code resolves a
 * restored tab only once it is shown, so until then the map editor knows no panel of it. A tab in
 * the active group comes first (the walkthrough is restored in front of it), then the tab each
 * group shows, then any other.
 */
async function revealRestoredMapTab(): Promise<vscode.Uri | undefined> {
  const { activeTabGroup, all } = vscode.window.tabGroups;
  const tabs = [
    ...activeTabGroup.tabs,
    ...all.flatMap((group) => (group.activeTab ? [group.activeTab] : [])),
    ...all.flatMap((group) => group.tabs),
  ];
  for (const tab of tabs) {
    const input = tab.input;
    if (input instanceof vscode.TabInputCustom && input.viewType === MAP_VIEW_TYPE) {
      await vscode.commands.executeCommand(
        "vscode.openWith",
        input.uri,
        MAP_VIEW_TYPE,
        tab.group.viewColumn,
      );
      return input.uri;
    }
  }
  return undefined;
}

/** Commands for an open map: text/diagram toggle, fit and image export. */
export function registerEditorCommands(editors: MapEditors): vscode.Disposable[] {
  const showSource = vscode.commands.registerCommand(
    SHOW_SOURCE_COMMAND,
    async (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? (await revealSourceMap(editors));
      if (!uri) return void vscode.window.showInformationMessage(NO_DIAGRAM_MESSAGE);
      return vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        "default",
        vscode.ViewColumn.Beside,
      );
    },
  );

  const showDiagram = vscode.commands.registerCommand(
    SHOW_DIAGRAM_COMMAND,
    (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) return undefined;
      return vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        MAP_VIEW_TYPE,
        vscode.ViewColumn.Beside,
      );
    },
  );

  const diagramActions = (Object.keys(WEBVIEW_COMMANDS) as WebviewCommand[]).map((name) =>
    vscode.commands.registerCommand(WEBVIEW_COMMANDS[name], (argument?: unknown) => {
      if (!editors.runCommand(name, resourceArgument(argument))) {
        void vscode.window.showInformationMessage(NO_DIAGRAM_MESSAGE);
      }
    }),
  );

  return [showSource, showDiagram, ...diagramActions];
}
