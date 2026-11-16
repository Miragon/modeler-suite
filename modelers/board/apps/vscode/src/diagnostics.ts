import * as vscode from "vscode";
import type { ProblemCounts } from "@miragon/modeler-shell/vscode/extension";

import { boardProblem } from "./problems.js";

/** the owner of the board's entries in the Problems view, and their source */
export const BOARD_DIAGNOSTICS = "board";

/** Read-only copies (a Git diff, a file's history) would list every problem a second time. */
const IGNORED_SCHEMES: ReadonlySet<string> = new Set(["git", "gitlens", "vscode-scm"]);

/** a file the board's editor opens by its name, whichever editor shows it right now */
const isBoardFile = (document: vscode.TextDocument): boolean =>
  document.uri.path.toLowerCase().endsWith(".board");

export interface BoardDiagnostics extends vscode.Disposable {
  /**
   * Checks the document now and answers the counts for the shell's problems pill. The board's
   * editor calls it for the document it shows, whatever the file is called.
   */
  refresh(document: vscode.TextDocument): ProblemCounts;
}

/**
 * Keeps the Problems view in step with the board documents VS Code has open: one entry for a
 * text the board's reader refuses, with the reader's reason at the line it names, gone when the
 * text is valid again and when VS Code closes the document. A board file is checked when it is
 * opened and after every change of its text, in the board's editor or in a text editor alone;
 * a file of another name once the board's editor showed it, for as long as it has its entry.
 */
export function createBoardDiagnostics(): BoardDiagnostics {
  const collection = vscode.languages.createDiagnosticCollection(BOARD_DIAGNOSTICS);

  function refresh(document: vscode.TextDocument): ProblemCounts {
    const problem = IGNORED_SCHEMES.has(document.uri.scheme)
      ? undefined
      : boardProblem(document.getText());
    if (!problem) {
      collection.delete(document.uri);
      return { count: 0, errors: 0 };
    }
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(problem.line, 0, problem.line, problem.length),
      problem.message,
      vscode.DiagnosticSeverity.Error,
    );
    diagnostic.source = BOARD_DIAGNOSTICS;
    collection.set(document.uri, [diagnostic]);
    return { count: 1, errors: 1 };
  }

  const subscriptions = [
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isBoardFile(document)) refresh(document);
    }),
    vscode.workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
      // a save or a change of the dirty state: the text is the one that was checked
      if (contentChanges.length === 0) return;
      if (isBoardFile(document) || collection.has(document.uri)) refresh(document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
  ];
  for (const document of vscode.workspace.textDocuments) {
    if (isBoardFile(document)) refresh(document);
  }

  return {
    refresh,
    dispose() {
      for (const subscription of subscriptions.splice(0)) subscription.dispose();
      collection.dispose();
    },
  };
}
