import * as vscode from "vscode";
import {
  registerModelerEditor,
  type ModelerEditorRegistration,
} from "@miragon/modeler-shell/vscode/extension";
import type { ActivePanels } from "./commands.js";
import { toDiagnostics } from "./diagnostics.js";
import { exportMap } from "./exportImage.js";
import { MAP_EDITOR_OPTIONS } from "./mapEditorOptions.js";
import { mapProblems, problemCounts } from "./problems.js";
import type { WebviewToHost } from "./protocol.js";

/**
 * The custom editor for `.cm`/`.cm.json`, on the shell's document plumbing: the JSON stays the
 * document, so VS Code keeps dirty state, saving, Git, diff and undo, and every change on the
 * canvas comes back as a minimal line edit. Its panels report to `panels`, which the `.cm.png`
 * editor shares, so a command reaches the focused diagram of either editor.
 */
export function registerMapEditor(
  context: Pick<vscode.ExtensionContext, "extensionUri">,
  panels: ActivePanels,
  diagnostics: vscode.DiagnosticCollection,
): ModelerEditorRegistration<vscode.TextDocument> {
  return registerModelerEditor<vscode.TextDocument, WebviewToHost>(vscode, context, {
    ...MAP_EDITOR_OPTIONS,
    diagnostics: {
      refresh(document) {
        const text = document.getText();
        const problems = mapProblems(text);
        diagnostics.set(document.uri, toDiagnostics(text, problems));
        return problemCounts(problems);
      },
      clear: (document) => diagnostics.delete(document.uri),
    },
    onDidOpen: (editor) => panels.track(editor.panel, editor.document.uri, { text: true }),
    onMessage: (message, editor) =>
      message.type === "export" ? exportMap(editor.document.uri, message) : undefined,
  });
}
