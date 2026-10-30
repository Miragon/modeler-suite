import * as vscode from "vscode";
import { registerNewDocumentCommand } from "@miragon/modeler-shell/vscode/extension";
import { DIAGRAM_VIEW_TYPE, registerDiagramEditor } from "./diagramEditor.js";
import { EMPTY_DOCUMENT, EXAMPLE_DOCUMENT } from "./examples.js";

/** The save dialog of "New Empty Value Chain Diagram" and "… from Example". */
const NEW_DIAGRAM = {
  viewType: DIAGRAM_VIEW_TYPE,
  title: "New Value Chain Diagram",
  saveLabel: "Create diagram",
  filters: { "Value Chain Diagram": ["vc.json", "vc"] },
  defaultFileName: "value-chain.vc.json",
  // The diagram editor claims only *.vc and *.vc.json, and a save dialog may append only the last
  // extension of a filter: `chain.json` becomes `chain.vc.json`.
  targetPath: (chosenPath: string) =>
    /\.vc(\.json)?$/i.test(chosenPath)
      ? chosenPath
      : `${chosenPath.replace(/\.json$/i, "")}.vc.json`,
};

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    registerDiagramEditor(context),
    registerNewDocumentCommand(vscode, "valueChain.newDiagram", {
      ...NEW_DIAGRAM,
      text: EMPTY_DOCUMENT,
    }),
    registerNewDocumentCommand(vscode, "valueChain.newDiagramFromExample", {
      ...NEW_DIAGRAM,
      text: EXAMPLE_DOCUMENT,
    }),
  );
}

export function deactivate(): void {
  /* nothing to do — all resources are tied to context.subscriptions */
}
