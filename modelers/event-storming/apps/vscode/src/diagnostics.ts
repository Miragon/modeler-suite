import * as vscode from "vscode";
import { parseDSLWithDiagnostics } from "@miragon/event-storming-dsl";
import { splitLines, type ProblemCounts } from "@miragon/modeler-shell/vscode/extension";

export const DIAGNOSTIC_COLLECTION_NAME = "event-storming";

/**
 * The parser is lenient: a typo or a dangling arrow keeps the line (it survives the round trip)
 * instead of failing the whole board. Its findings are therefore warnings, never errors, and the
 * canvas stays editable (guide §13.5: diagnostics with a model are problems, not an invalid file).
 */
export function boardDiagnostics(text: string): vscode.Diagnostic[] {
  const lines = splitLines(text);
  const lastLine = lines.length - 1;
  return parseDSLWithDiagnostics(text).diagnostics.map((finding) => {
    const lineIndex = Math.min(Math.max(finding.line - 1, 0), lastLine);
    const lineText = lines[lineIndex] ?? "";
    const firstCharacter = lineText.length - lineText.trimStart().length;
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(lineIndex, firstCharacter, lineIndex, lineText.length),
      finding.message,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = DIAGNOSTIC_COLLECTION_NAME;
    return diagnostic;
  });
}

/**
 * The `event-storming` collection behind the Problems view and the problems pill. It holds the
 * findings of a board from the moment its board editor opens until it closes; a `.storm` file open
 * only as text has none.
 */
export class BoardDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection(
    DIAGNOSTIC_COLLECTION_NAME,
  );

  /** Checks `document` now and returns the pill's counts: warnings only, so no errors. */
  refresh(document: vscode.TextDocument): ProblemCounts {
    const diagnostics = boardDiagnostics(document.getText());
    this.collection.set(document.uri, diagnostics);
    return { count: diagnostics.length, errors: 0 };
  }

  clear(document: vscode.TextDocument): void {
    this.collection.delete(document.uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
