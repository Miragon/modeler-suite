import * as vscode from "vscode";
import { registerNewDocumentCommand } from "@miragon/modeler-shell/vscode/extension";
import { MAP_VIEW_TYPE, registerMapEditor } from "./mapEditor.js";
import { WardleyDiagnostics } from "./diagnostics.js";
import { registerEditorCommands } from "./commands.js";
import { EMPTY_MAP, EXAMPLE_MAP } from "./examples.js";

const NEW_MAP = {
  viewType: MAP_VIEW_TYPE,
  title: "New Wardley Map",
  saveLabel: "Create map",
  filters: { "Wardley Map": ["wmap", "owm"] },
  defaultFileName: "wardley-map.wmap",
};

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new WardleyDiagnostics();
  const editors = registerMapEditor(context, diagnostics);
  context.subscriptions.push(
    diagnostics,
    editors,
    ...registerEditorCommands(editors),
    registerNewDocumentCommand(vscode, "wardley.newMap", { ...NEW_MAP, text: EMPTY_MAP }),
    registerNewDocumentCommand(vscode, "wardley.newMapFromExample", {
      ...NEW_MAP,
      text: EXAMPLE_MAP,
    }),
  );
}

export function deactivate(): void {
  /* nothing to do — all resources are tied to context.subscriptions */
}
