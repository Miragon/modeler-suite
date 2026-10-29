import * as vscode from "vscode";
import { CmPngEditorProvider } from "./CmPngEditorProvider.js";
import { ActivePanels, registerSideBySideCommands, registerWebviewCommands } from "./commands.js";
import { DIAGNOSTIC_COLLECTION_NAME } from "./diagnostics.js";
import { EMPTY_MAP, EXAMPLE_MAP } from "./examples.js";
import { newDiagramFromCml } from "./importCml.js";
import { registerMapEditor } from "./mapEditor.js";
import { MAP_VIEW_TYPE } from "./mapEditorOptions.js";

export function activate(context: vscode.ExtensionContext): void {
  const panels = new ActivePanels();
  const diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME);
  context.subscriptions.push(
    diagnostics,
    registerMapEditor(context, panels, diagnostics),
    CmPngEditorProvider.register(context, panels, diagnostics),
    ...registerWebviewCommands((name) => panels.runCommand(name)),
    ...registerSideBySideCommands(() => panels.revealTextDiagram()),
    vscode.commands.registerCommand("contextMaps.newDiagram", () => createMap(EMPTY_MAP)),
    vscode.commands.registerCommand("contextMaps.newFromExample", () => createMap(EXAMPLE_MAP)),
    vscode.commands.registerCommand("contextMaps.newPngDiagram", () => createPngMap()),
    vscode.commands.registerCommand("contextMaps.newFromCml", () => newDiagramFromCml()),
  );
}

export function deactivate(): void {
  /* nothing to do — all resources are tied to context.subscriptions */
}

/** A real file URI rather than an untitled doc is most robust for CustomTextEditor. */
async function createMap(initial: string): Promise<void> {
  const options: vscode.SaveDialogOptions = {
    title: "New Context Maps Diagram",
    saveLabel: "Create diagram",
    filters: { "Context Maps": ["cm", "cm.json"] },
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
  return folder ? vscode.Uri.joinPath(folder.uri, "context-map.cm") : undefined;
}

/**
 * Creates a new, embedded PNG diagram (`*.cm.png`) and opens it in the PNG editor. The file starts
 * as a 0-byte placeholder (rendering only works in the webview) and is immediately "dirty": a Cmd+S
 * materializes the rendered PNG with the embedded document.
 */
async function createPngMap(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const options: vscode.SaveDialogOptions = {
    title: "New Context Maps Diagram (embedded PNG)",
    saveLabel: "Create diagram",
    filters: { "Context Maps (PNG)": ["png"] },
  };
  if (folder) options.defaultUri = vscode.Uri.joinPath(folder.uri, "context-map.cm.png");

  const chosen = await vscode.window.showSaveDialog(options);
  if (!chosen) return;

  // Ensure the editor will actually claim the file (it only binds *.cm.png).
  const target = /\.cm\.png$/i.test(chosen.path)
    ? chosen
    : chosen.with({ path: `${chosen.path.replace(/\.png$/i, "")}.cm.png` });

  await vscode.workspace.fs.writeFile(target, new Uint8Array());
  await vscode.commands.executeCommand("vscode.openWith", target, CmPngEditorProvider.viewType);
}
