import * as vscode from "vscode";
import { registerNewDocumentCommand } from "@miragon/modeler-shell/vscode/extension";
import { DIAGRAM_VIEW_TYPE, registerDiagramEditor } from "./diagramEditor.js";
import { EMPTY_DOCUMENT, EXAMPLE_DOCUMENT } from "business-model-canvas-ide-editor/examples";

const NEW_CANVAS = {
  viewType: DIAGRAM_VIEW_TYPE,
  title: "New Business Model Canvas",
  saveLabel: "Create canvas",
  filters: { "Business Model Canvas": ["bmc"] },
  defaultFileName: "canvas.bmc",
  targetPath: (chosenPath: string) =>
    /\.bmc$/i.test(chosenPath) ? chosenPath : `${chosenPath}.bmc`,
};

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    registerDiagramEditor(context),
    registerNewDocumentCommand(vscode, "businessModelCanvas.newDiagram", {
      ...NEW_CANVAS,
      text: EMPTY_DOCUMENT,
    }),
    registerNewDocumentCommand(vscode, "businessModelCanvas.newDiagramFromExample", {
      ...NEW_CANVAS,
      text: EXAMPLE_DOCUMENT,
    }),
  );
}

export function deactivate(): void {
  /* nothing to do — all resources are tied to context.subscriptions */
}
