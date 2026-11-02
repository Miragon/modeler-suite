import * as vscode from "vscode";
import { USE_FOR_WORKSPACE_DSL_COMMAND } from "./commands.js";
import { DIAGRAM_VIEW_TYPES, DSL_DIAGRAM_VIEW_TYPE } from "./diagramEditorOptions.js";

/** The glob of `workbench.editorAssociations`; without a slash VS Code matches the file name. */
export const WORKSPACE_DSL_PATTERN = "workspace.dsl";

export const ASSOCIATED_MESSAGE =
  "workspace.dsl files now open in the C4 Modeler. To change that, edit workbench.editorAssociations in your user settings.";
export const ALREADY_ASSOCIATED_MESSAGE =
  "workspace.dsl files already open in the C4 Modeler. To change that, edit workbench.editorAssociations in your user settings.";
export const NOT_ASSOCIATED_MESSAGE =
  "Couldn't change your user settings. Fix what VS Code reports in settings.json, then try again.";
export const OPEN_SETTINGS_ACTION = "Open Settings";

type Associations = Readonly<Record<string, string>>;

/**
 * "Use C4 Modeler for workspace.dsl" (SPEC 8.2): `.dsl` also belongs to other tools, so its editor
 * registers with priority `option` and becomes the default for `workspace.dsl` only on this
 * explicit request. It writes the user settings, not the workspace's, and keeps every other
 * association the user has there. It names the `.dsl` editor, the one Reopen Editor With… lists
 * for the file, so the list shows the C4 Modeler once.
 */
export function registerUseForWorkspaceDslCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(USE_FOR_WORKSPACE_DSL_COMMAND, async () => {
    const settings = vscode.workspace.getConfiguration("workbench");
    const user = settings.inspect<Associations>("editorAssociations")?.globalValue ?? {};
    const current = user[WORKSPACE_DSL_PATTERN];
    const already = current !== undefined && DIAGRAM_VIEW_TYPES.includes(current);
    if (!already) {
      try {
        await settings.update(
          "editorAssociations",
          { ...user, [WORKSPACE_DSL_PATTERN]: DSL_DIAGRAM_VIEW_TYPE },
          vscode.ConfigurationTarget.Global,
        );
      } catch (error) {
        console.error(error);
        const choice = await vscode.window.showErrorMessage(
          NOT_ASSOCIATED_MESSAGE,
          OPEN_SETTINGS_ACTION,
        );
        if (choice === OPEN_SETTINGS_ACTION) {
          await vscode.commands.executeCommand("workbench.action.openSettingsJson");
        }
        return;
      }
    }
    const choice = await vscode.window.showInformationMessage(
      already ? ALREADY_ASSOCIATED_MESSAGE : ASSOCIATED_MESSAGE,
      OPEN_SETTINGS_ACTION,
    );
    if (choice === OPEN_SETTINGS_ACTION) {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "workbench.editorAssociations",
      );
    }
  });
}
