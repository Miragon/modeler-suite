import * as vscode from "vscode";
import { diagramViewTypeFor } from "./diagramEditorOptions.js";
import type { WebviewCommand } from "./protocol.js";

/** New Empty and New … from Example (guide §13.5): commands, `file/newFile` and the walkthrough. */
export const NEW_DIAGRAM_COMMAND = "c4.newDiagram";
export const NEW_DIAGRAM_FROM_EXAMPLE_COMMAND = "c4.newDiagramFromExample";

/** Text and diagram side by side (guide §13.5), from the editor title of either editor. */
export const OPEN_SOURCE_COMMAND = "c4.openSource";
export const OPEN_DIAGRAM_COMMAND = "c4.openDiagram";

/** The views of the workspace in a QuickPick (SPEC 7.3). */
export const GO_TO_VIEW_COMMAND = "c4.goToView";

/** Opens every `workspace.dsl` in the C4 Modeler, written to the user settings on request only. */
export const USE_FOR_WORKSPACE_DSL_COMMAND = "c4.useForWorkspaceDsl";

/** The webview's own actions as commands; each posts its name to the focused diagram. */
export const WEBVIEW_COMMANDS: Readonly<Record<WebviewCommand, string>> = {
  fitView: "c4.fitView",
  exportPng: "c4.exportPng",
  exportSvg: "c4.exportSvg",
  parentView: "c4.parentView",
};

export const NO_DIAGRAM_MESSAGE = "Open a .c4 or .dsl file in the C4 Modeler first.";
export const NO_SOURCE_MESSAGE = "Open a .c4 or .dsl file first.";

/**
 * Editor title buttons pass the editor's resource; the Command Palette and a walkthrough link pass
 * nothing, so the command falls back to the diagram focused last or the focused text editor.
 */
export function resourceArgument(argument: unknown): vscode.Uri | undefined {
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
      if (!uri) return void vscode.window.showInformationMessage(NO_SOURCE_MESSAGE);
      return vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        diagramViewTypeFor(uri.path),
        vscode.ViewColumn.Beside,
      );
    }),
  ];
}

/**
 * The Command Palette commands run the same handlers as the webview (guide §13.5): the command
 * only forwards its name to a diagram. A title button names its own diagram, whose group need not
 * be the focused one; the Command Palette means the focused diagram. `runCommand` returns false
 * when there is none (a keybinding of the user's own can still invoke the command then).
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

/**
 * Shows a tab of one of `viewTypes` that VS Code restored after a reload and returns its document.
 * VS Code resolves a restored tab only once it is shown, so until then the provider knows no panel
 * of it. A tab in the active group comes first (the walkthrough is restored in front of it), then
 * the tab each group shows, then any other.
 */
export async function revealRestoredTab(
  viewTypes: readonly string[],
): Promise<vscode.Uri | undefined> {
  const { activeTabGroup, all } = vscode.window.tabGroups;
  const tabs = [
    ...activeTabGroup.tabs,
    ...all.flatMap((group) => (group.activeTab ? [group.activeTab] : [])),
    ...all.flatMap((group) => group.tabs),
  ];
  for (const tab of tabs) {
    const input = tab.input;
    if (input instanceof vscode.TabInputCustom && viewTypes.includes(input.viewType)) {
      await vscode.commands.executeCommand(
        "vscode.openWith",
        input.uri,
        input.viewType,
        tab.group.viewColumn,
      );
      return input.uri;
    }
  }
  return undefined;
}
