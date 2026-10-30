import * as vscode from "vscode";
import { registerNewDocumentCommand } from "@miragon/modeler-shell/vscode/extension";
import { CmPngEditorProvider } from "./CmPngEditorProvider.js";
import { ActivePanels, registerSideBySideCommands, registerWebviewCommands } from "./commands.js";
import { DIAGNOSTIC_COLLECTION_NAME } from "./diagnostics.js";
import { EMPTY_MAP, EXAMPLE_MAP } from "./examples.js";
import { newDiagramFromCml } from "./importCml.js";
import { registerMapEditor } from "./mapEditor.js";
import { MAP_VIEW_TYPE } from "./mapEditorOptions.js";

/** The save dialog of the commands "New Empty Diagram" and "New Diagram from Example". */
const NEW_DIAGRAM = {
  viewType: MAP_VIEW_TYPE,
  title: "New Context Maps Diagram",
  saveLabel: "Create diagram",
  filters: { "Context Maps": ["cm", "cm.json"] },
  defaultFileName: "context-map.cm",
};

/**
 * A new, embedded PNG diagram (`*.cm.png`) for the PNG editor. The file starts as a 0-byte
 * placeholder, since only the webview renders, and is "dirty" at once: a Cmd+S materializes the
 * rendered PNG with the embedded document.
 */
const NEW_PNG_DIAGRAM = {
  viewType: CmPngEditorProvider.viewType,
  text: "",
  title: "New Context Maps Diagram (embedded PNG)",
  saveLabel: "Create diagram",
  filters: { "Context Maps (PNG)": ["png"] },
  defaultFileName: "context-map.cm.png",
  // The PNG editor claims only *.cm.png.
  targetPath: (chosenPath: string) =>
    /\.cm\.png$/i.test(chosenPath) ? chosenPath : `${chosenPath.replace(/\.png$/i, "")}.cm.png`,
};

export function activate(context: vscode.ExtensionContext): void {
  const panels = new ActivePanels();
  const diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME);
  context.subscriptions.push(
    diagnostics,
    registerMapEditor(context, panels, diagnostics),
    CmPngEditorProvider.register(context, panels, diagnostics),
    ...registerWebviewCommands((name) => panels.runCommand(name)),
    ...registerSideBySideCommands(() => panels.revealTextDiagram()),
    registerNewDocumentCommand(vscode, "contextMaps.newDiagram", {
      ...NEW_DIAGRAM,
      text: EMPTY_MAP,
    }),
    registerNewDocumentCommand(vscode, "contextMaps.newFromExample", {
      ...NEW_DIAGRAM,
      text: EXAMPLE_MAP,
    }),
    registerNewDocumentCommand(vscode, "contextMaps.newPngDiagram", NEW_PNG_DIAGRAM),
    vscode.commands.registerCommand("contextMaps.newFromCml", () => newDiagramFromCml()),
  );
}

export function deactivate(): void {
  /* nothing to do — all resources are tied to context.subscriptions */
}
