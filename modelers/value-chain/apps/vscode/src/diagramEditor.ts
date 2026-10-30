import * as vscode from "vscode";
import {
  IMAGE_EXPORT_KINDS,
  exportToFile,
  registerModelerEditor,
} from "@miragon/modeler-shell/vscode/extension";
import {
  registerSideBySideCommands,
  registerWebviewCommands,
  revealRestoredTab,
} from "./commands.js";
import { DIAGNOSTIC_COLLECTION_NAME, documentDiagnostics } from "./diagnostics.js";
import { DIAGRAM_EDITOR_OPTIONS, DIAGRAM_VIEW_TYPE } from "./diagramEditorOptions.js";
import type { WebviewToHost } from "./protocol.js";

export { DIAGRAM_VIEW_TYPE } from "./diagramEditorOptions.js";

/**
 * The custom editor for `*.vc` / `*.vc.json` on the shell's document plumbing, with its Problems
 * view entries and its commands. The canonical JSON stays the document, so VS Code keeps dirty
 * state, saving, Git, diff and undo, and every change on the canvas comes back as a minimal line
 * edit, so a text editor beside the diagram keeps its cursor.
 */
export function registerDiagramEditor(
  context: Pick<vscode.ExtensionContext, "extensionUri">,
): vscode.Disposable {
  const problems = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME);
  const editors = registerModelerEditor<vscode.TextDocument, WebviewToHost>(vscode, context, {
    ...DIAGRAM_EDITOR_OPTIONS,
    diagnostics: {
      refresh: (document) => {
        const diagnostics = documentDiagnostics(document.getText());
        problems.set(document.uri, diagnostics);
        // Every finding is an error: each one keeps the file from opening on the canvas.
        return { count: diagnostics.length, errors: diagnostics.length };
      },
      clear: (document) => problems.delete(document.uri),
    },
    onMessage: (message, editor) =>
      message.type === "export"
        ? exportToFile(vscode, {
            kind: IMAGE_EXPORT_KINDS[message.format],
            data: message.data,
            sourceUri: editor.document.uri,
            // `chain.vc.json` and `chain.vc` suggest `chain.svg`.
            sourceExtension: /(\.vc)?\.[^./]+$/i,
            defaultName: "value-chain",
            fontFallback: message.fontFallback === true,
            platform: process.platform,
          })
        : undefined,
  });
  return vscode.Disposable.from(
    editors,
    problems,
    ...registerWebviewCommands((name, uri) => editors.runCommand(name, uri)),
    ...registerSideBySideCommands(
      async () => editors.revealActiveDocument() ?? revealRestoredTab(DIAGRAM_VIEW_TYPE),
    ),
  );
}
