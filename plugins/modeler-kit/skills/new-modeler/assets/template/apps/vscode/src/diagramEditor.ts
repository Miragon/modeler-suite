import * as vscode from 'vscode';
import { registerModelerEditor, revealFileLabel } from '@miragon/modeler-shell/vscode/extension';
import { registerSideBySideCommands, revealRestoredTab } from './commands.js';
import { DIAGNOSTIC_SOURCE, documentDiagnostics } from './diagnostics.js';
import { DIAGRAM_EDITOR_OPTIONS, DIAGRAM_VIEW_TYPE } from './diagramEditorOptions.js';
import type { ExportFormat, WebviewToHost } from './protocol.js';

/**
 * The custom text editor on the shell's document plumbing: the document stays the source of
 * truth, so VS Code owns dirty state, saving, Git, diff and undo (guide §13.5). The shell writes the
 * webview HTML, connects the theme bridge, writes every canvas edit back as one minimal
 * WorkspaceEdit without importing its echo, answers "Insert example" and keeps the problems pill in
 * step; the modeler adds its diagnostics, the export and its commands.
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
        ? exportToFile(editor.document.uri, message.format, message.data, message.fontFallback)
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

/** Save dialog next to the document, then a notification instead of a toast (guide §13.5). */
async function exportToFile(
  source: vscode.Uri,
  format: ExportFormat,
  data: string,
  fontFallback = false,
): Promise<void> {
  const base = source.path.replace(/\.[^./]+$/, '');
  const target = await vscode.window.showSaveDialog({
    defaultUri: source.with({ path: `${base}.${format}` }),
    filters: { [format.toUpperCase()]: [format] },
  });
  if (!target) return;
  const bytes = format === 'png' ? Buffer.from(data, 'base64') : new TextEncoder().encode(data);
  await vscode.workspace.fs.writeFile(target, bytes);
  const reveal = revealFileLabel(process.platform);
  const exported = `Exported ${vscode.workspace.asRelativePath(target)}`;
  const choice = fontFallback
    ? await vscode.window.showWarningMessage(
        `${exported} in a system font. Geist couldn't be embedded.`,
        reveal,
      )
    : await vscode.window.showInformationMessage(`${exported}.`, reveal);
  if (choice === reveal) void vscode.commands.executeCommand('revealFileInOS', target);
}
