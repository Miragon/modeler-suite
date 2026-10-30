import * as vscode from 'vscode';
import { splitLines } from '@miragon/modeler-shell/vscode/extension';
import { parseText } from '@miragon/__NOTATION__-dsl';
import { validateDocument } from '@miragon/__NOTATION__-schema-model';

export const DIAGNOSTIC_SOURCE = '__NOTATION__';

/**
 * Lines the parser keeps without understanding are warnings: the canvas stays editable (guide
 * §13.5, a document with a model has problems, not an invalid file). A document the canvas cannot
 * show at all (two elements with one id) is an error on line 1, and the webview locks the canvas.
 */
export function documentDiagnostics(text: string): vscode.Diagnostic[] {
  const lines = splitLines(text);
  const { document, diagnostics } = parseText(text);
  const findings = diagnostics.map((finding) => {
    const index = Math.min(Math.max(finding.line - 1, 0), lines.length - 1);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(index, 0, index, lines[index]?.length ?? 0),
      finding.message,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    return diagnostic;
  });
  try {
    validateDocument(document);
  } catch (error) {
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, lines[0]?.length ?? 0),
      error instanceof Error ? error.message : String(error),
      vscode.DiagnosticSeverity.Error,
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    findings.push(diagnostic);
  }
  return findings;
}
