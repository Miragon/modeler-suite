import * as vscode from "vscode";
import { MAP_VIEW_TYPE, registerMapEditor } from "./mapEditor.js";
import { WardleyDiagnostics } from "./diagnostics.js";
import { registerEditorCommands } from "./commands.js";
import { EMPTY_MAP, EXAMPLE_MAP } from "./examples.js";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new WardleyDiagnostics();
  const editors = registerMapEditor(context, diagnostics);
  context.subscriptions.push(
    diagnostics,
    editors,
    ...registerEditorCommands(editors),
    vscode.commands.registerCommand("wardley.newMap", () => createMap(EMPTY_MAP)),
    vscode.commands.registerCommand("wardley.newMapFromExample", () => createMap(EXAMPLE_MAP)),
  );
}

export function deactivate(): void {
  /* nothing to do — all resources are tied to context.subscriptions */
}

/** A real file URI rather than an untitled doc is most robust for CustomTextEditor. */
async function createMap(initial: string): Promise<void> {
  const options: vscode.SaveDialogOptions = {
    title: "New Wardley Map",
    saveLabel: "Create map",
    filters: { "Wardley Map": ["wmap", "owm"] },
  };
  const defaultUri = defaultMapUri();
  if (defaultUri) options.defaultUri = defaultUri;

  const target = await vscode.window.showSaveDialog(options);
  if (!target) return;

  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(initial));
  await vscode.commands.executeCommand("vscode.openWith", target, MAP_VIEW_TYPE);
}

function defaultMapUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, "wardley-map.wmap") : undefined;
}
