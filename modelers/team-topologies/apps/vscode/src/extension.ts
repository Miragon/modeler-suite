import * as vscode from "vscode";
import { registerNewDocumentCommand } from "@miragon/modeler-shell/vscode/extension";
import { PNG_VIEW_TYPE, registerSideBySideCommands, registerWebviewCommands } from "./commands.js";
import { DIAGNOSTIC_COLLECTION_NAME } from "./diagnostics.js";
import { registerDiagramEditor } from "./diagramEditor.js";
import { DIAGRAM_VIEW_TYPE } from "./diagramEditorOptions.js";
import { DiagramPanels } from "./diagramPanels.js";
import { EMPTY_MAP, EXAMPLE_MAP } from "./examples.js";
import { TtPngEditorProvider } from "./TtPngEditorProvider.js";

const NEW_DIAGRAM = {
  viewType: DIAGRAM_VIEW_TYPE,
  title: "New Team Topologies Diagram",
  saveLabel: "Create diagram",
  filters: { "Team Topologies": ["tt", "ttm.json"] },
  defaultFileName: "team-topology.tt",
};

/**
 * A new, embedded PNG diagram (`*.tt.png`) for the PNG editor. The file starts as a 0-byte
 * placeholder, since only the webview renders, and is "dirty" at once: a Cmd+S materializes the
 * rendered PNG with the embedded document.
 */
const NEW_PNG_DIAGRAM = {
  viewType: PNG_VIEW_TYPE,
  text: "",
  title: "New Team Topologies Diagram (embedded PNG)",
  saveLabel: "Create diagram",
  filters: { "Team Topologies (PNG)": ["png"] },
  defaultFileName: "team-topology.tt.png",
  // The PNG editor claims only *.tt.png and *.ttm.png.
  targetPath: (chosenPath: string) =>
    /\.(tt|ttm)\.png$/i.test(chosenPath)
      ? chosenPath
      : `${chosenPath.replace(/\.png$/i, "")}.tt.png`,
};

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME);
  const textDiagrams = registerDiagramEditor(context, diagnostics);
  const panels = new DiagramPanels(context.extensionUri, textDiagrams);
  context.subscriptions.push(
    diagnostics,
    textDiagrams,
    TtPngEditorProvider.register(panels, diagnostics),
    ...registerWebviewCommands((name) => panels.runCommand(name)),
    ...registerSideBySideCommands(() => panels.revealTextDiagram()),
    registerNewDocumentCommand(vscode, "teamTopologies.newDiagram", {
      ...NEW_DIAGRAM,
      text: EMPTY_MAP,
    }),
    registerNewDocumentCommand(vscode, "teamTopologies.newFromExample", {
      ...NEW_DIAGRAM,
      text: EXAMPLE_MAP,
    }),
    registerNewDocumentCommand(vscode, "teamTopologies.newPngDiagram", NEW_PNG_DIAGRAM),
  );
}

export function deactivate(): void {
  /* nothing to do — all resources are tied to context.subscriptions */
}
