import * as vscode from "vscode";
import { describeDiagnostic, parseText } from "@miragon/business-model-canvas-dsl";

export const DIAGNOSTIC_COLLECTION_NAME = "business-model-canvas";

/** A finding of the document text by its place in the text (unit-testable without VS Code). */
export interface DocumentProblem {
  severity: "error" | "warning";
  message: string;
  offset: number;
  length: number;
}

/** The parser's findings, each at the place of the text it names. */
export function documentProblems(text: string): DocumentProblem[] {
  return parseText(text).diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity,
    message: describeDiagnostic(diagnostic),
    offset: diagnostic.range[0],
    length: diagnostic.range[1] - diagnostic.range[0],
  }));
}

/** Turns offsets into positions, finding each line by binary search over the line starts. */
function positionsIn(text: string): (offset: number) => vscode.Position {
  const starts = [0];
  for (const match of text.matchAll(/\r\n|\n|\r/g)) starts.push(match.index + match[0].length);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (starts[middle]! <= offset) low = middle;
      else high = middle - 1;
    }
    return new vscode.Position(low, offset - starts[low]!);
  };
}

/** The problems of the document text for the Problems view. */
export function documentDiagnostics(text: string): vscode.Diagnostic[] {
  const positionAt = positionsIn(text);
  return documentProblems(text).map((problem) => {
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(positionAt(problem.offset), positionAt(problem.offset + problem.length)),
      problem.message,
      problem.severity === "error"
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = DIAGNOSTIC_COLLECTION_NAME;
    return diagnostic;
  });
}
