import * as vscode from "vscode";
import { registerNewDocumentCommand } from "@miragon/modeler-shell/vscode/extension";
import { NEW_DIAGRAM_COMMAND, NEW_DIAGRAM_FROM_EXAMPLE_COMMAND } from "./commands.js";
import { registerUseForWorkspaceDslCommand } from "./defaultEditor.js";
import { C4Diagnostics } from "./diagnostics.js";
import { registerDiagramEditor } from "./diagramEditor.js";
import { DIAGRAM_VIEW_TYPE } from "./diagramEditorOptions.js";
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM } from "./examples.js";
import { registerLanguageCorrection } from "./likeC4.js";

/** The save dialog of New Empty C4 Diagram and New C4 Diagram from Example (guide §13.5). */
const NEW_DIAGRAM = {
  viewType: DIAGRAM_VIEW_TYPE,
  title: "New C4 Diagram",
  saveLabel: "Create diagram",
  filters: { "Structurizr DSL": ["c4", "dsl"] },
  defaultFileName: "workspace.c4",
  // A save dialog that appends no extension (Linux) would leave a file no C4 editor claims.
  targetPath: (chosenPath: string) =>
    /\.(?:c4|dsl)$/i.test(chosenPath) ? chosenPath : `${chosenPath}.c4`,
};

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new C4Diagnostics();
  context.subscriptions.push(
    diagnostics,
    registerDiagramEditor(context, diagnostics),
    registerNewDocumentCommand(vscode, NEW_DIAGRAM_COMMAND, {
      ...NEW_DIAGRAM,
      text: EMPTY_DIAGRAM,
    }),
    registerNewDocumentCommand(vscode, NEW_DIAGRAM_FROM_EXAMPLE_COMMAND, {
      ...NEW_DIAGRAM,
      text: EXAMPLE_DIAGRAM,
    }),
    registerUseForWorkspaceDslCommand(),
    registerLanguageCorrection(),
  );
}

export function deactivate(): void {
  // Everything is tied to context.subscriptions.
}
