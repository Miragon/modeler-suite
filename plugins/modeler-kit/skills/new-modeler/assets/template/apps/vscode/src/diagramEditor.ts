import * as vscode from 'vscode';
import {
  IMAGE_EXPORT_KINDS,
  exportToFile,
  registerModelerEditor,
} from '@miragon/modeler-shell/vscode/extension';
import { registerSideBySideCommands, revealRestoredTab } from './commands.js';
import { DIAGNOSTIC_SOURCE, documentDiagnostics } from './diagnostics.js';
import { DIAGRAM_EDITOR_OPTIONS, DIAGRAM_VIEW_TYPE } from './diagramEditorOptions.js';
import type { WebviewToHost } from './protocol.js';

/**
 * The custom text editor on the shell's document plumbing: the document stays the source of
 * truth, so VS Code owns dirty state, saving, Git, diff and undo (guide §13.5). The shell writes the
 * webview HTML, connects the theme bridge, writes every canvas edit back as one minimal
 * WorkspaceEdit without importing its echo, answers "Insert example" and keeps the problems pill in
 * step; the modeler adds its diagnostics and its commands, and hands an export to the shell's save
 * dialog and notification.
 */
export function registerDiagramEditor(
  context: Pick<vscode.ExtensionContext, 'extensionUri'>,
): vscode.Disposable {
  const problems = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  const editors = registerModelerEditor<vscode.TextDocument, WebviewToHost>(vscode, context, {
    ...DIAGRAM_EDITOR_OPTIONS,
    diagnostics: {
      refresh: (document) => {
        const findings = documentDiagnostics(document.getText());
        problems.set(document.uri, findings);
        const errors = findings.filter(
          (finding) => finding.severity === vscode.DiagnosticSeverity.Error,
        ).length;
        return { count: findings.length, errors };
      },
      clear: (document) => problems.delete(document.uri),
    },
    onMessage: (message, editor) =>
      message.type === 'export'
        ? exportToFile(vscode, {
            kind: IMAGE_EXPORT_KINDS[message.format],
            data: message.data,
            sourceUri: editor.document.uri,
            defaultName: '__NOTATION__',
            fontFallback: message.fontFallback === true,
            platform: process.platform,
          })
        : undefined,
  });
  return vscode.Disposable.from(
    editors,
    problems,
    // The plumbing knows a diagram tab VS Code restored after a reload only once it is shown.
    ...registerSideBySideCommands(
      async () => editors.revealActiveDocument() ?? revealRestoredTab(DIAGRAM_VIEW_TYPE),
    ),
  );
}
