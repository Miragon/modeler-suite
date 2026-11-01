import * as vscode from "vscode";
import { parseWorkspace, type ParseResult } from "@miragon/c4-dsl";
import type { Diagnostic } from "@miragon/c4-schema-model";
import type { ProblemCounts } from "@miragon/modeler-shell/vscode/extension";

export const DIAGNOSTIC_COLLECTION_NAME = "c4";
export const DIAGNOSTIC_SOURCE = "C4 Modeler";
const REFRESH_DELAY_MS = 200;

/** Read-only copies (Git diffs, history) would list every problem a second time. */
const IGNORED_SCHEMES: ReadonlySet<string> = new Set(["git", "gitlens", "vscode-scm"]);

interface TextPositions {
  positionAt(offset: number): vscode.Position;
}

type CheckedDocument = Pick<vscode.TextDocument, "uri" | "getText" | "positionAt">;

/** The first token, after an optional `id =`, starts with `/*`: the line opens a block comment. */
const OPENS_BLOCK_COMMENT = /^(?:[^\s"]+\s+=\s+)?\/\*/;

/**
 * Whether the text is a Structurizr workspace: after blank lines and comments its first statement
 * is `workspace` or a directive (`!const` may come before it). `.dsl` is also ACPI's source
 * extension (R-UX §5.4) and `.c4` LikeC4's, and those files must get no findings of this modeler.
 * Comments follow the reference parser, as the canvas's parser does: a line that starts with the
 * opening marker and ends with the closing one is a comment of its own, block comments nest, and a
 * `//` line never closes one.
 */
export function isStructurizrWorkspaceText(text: string): boolean {
  let commentDepth = 0;
  for (const physicalLine of text.split("\n")) {
    const line = physicalLine.trim();
    if (line === "" || line.startsWith("//") || line.startsWith("#")) continue;
    if (line.startsWith("/*") && line.endsWith("*/")) continue;
    if (OPENS_BLOCK_COMMENT.test(line)) {
      commentDepth += 1;
    } else if (commentDepth > 0) {
      if (line.endsWith("*/")) commentDepth -= 1;
    } else {
      return /^workspace(?:\s|$)/i.test(line) || /^![a-z]/i.test(line);
    }
  }
  return false;
}

/** The documents this modeler checks whatever their language id: a `.c4` or `.dsl` workspace. */
export function isStructurizrWorkspaceDocument(
  document: Pick<vscode.TextDocument, "uri" | "getText">,
): boolean {
  return isCheckedFile(document.uri) && isStructurizrWorkspaceText(document.getText());
}

function isCheckedFile(uri: vscode.Uri): boolean {
  return !IGNORED_SCHEMES.has(uri.scheme) && /\.(?:c4|dsl)$/i.test(uri.path);
}

/**
 * The parser's findings with their exact ranges, for the Problems view and the pill. The webview
 * locks the canvas only when its import rejects (guide §13.5): a compatibility error is a problem
 * of a document the canvas still edits (SPEC 3.8).
 */
export function documentDiagnostics(
  result: Pick<ParseResult, "diagnostics">,
  positions: TextPositions,
): vscode.Diagnostic[] {
  return result.diagnostics.map((finding) => {
    const start = positions.positionAt(finding.range.start);
    const end = positions.positionAt(finding.range.end);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(start.line, start.character, end.line, end.character),
      finding.message,
      severityOf(finding),
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = `c4.${finding.code}`;
    return diagnostic;
  });
}

function severityOf(finding: Diagnostic): vscode.DiagnosticSeverity {
  if (finding.severity === "error") return vscode.DiagnosticSeverity.Error;
  if (finding.severity === "warning") return vscode.DiagnosticSeverity.Warning;
  return vscode.DiagnosticSeverity.Information;
}

/**
 * The pill's summary: how many problems, how many of them errors. An info describes what the
 * modeler keeps for Structurizr, not something to fix, so it stays in the Problems view and out of
 * the pill, as it stays out of the web app's list.
 */
export function problemCounts(diagnostics: readonly vscode.Diagnostic[]): ProblemCounts {
  return {
    count: diagnostics.filter(
      (diagnostic) => diagnostic.severity !== vscode.DiagnosticSeverity.Information,
    ).length,
    errors: diagnostics.filter(
      (diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error,
    ).length,
  };
}

function unreadable(error: unknown): vscode.Diagnostic {
  const reason = error instanceof Error ? error.message : String(error);
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(0, 0, 0, 0),
    `Couldn't check this file (${reason}). Report it with the file attached.`,
    vscode.DiagnosticSeverity.Error,
  );
  diagnostic.source = DIAGNOSTIC_SOURCE;
  return diagnostic;
}

/**
 * The `c4` collection behind the Problems view and the problems pill. It checks every open `.c4`
 * and `.dsl` text document that is a Structurizr workspace, whatever language another extension
 * gave it, and the document of every open C4 editor, which the user chose to read as one. It also
 * keeps the last parse without a rejection per document: the canvas of an invalid file shows that
 * one (guide §13.5), so Go to View lists its views.
 */
export class C4Diagnostics implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly readableParses = new Map<string, ParseResult>();
  private readonly inEditor = new Set<string>();
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME);
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => this.refresh(document)),
      vscode.workspace.onDidChangeTextDocument((event) => this.scheduleRefresh(event.document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.forget(document.uri)),
    );
    for (const document of vscode.workspace.textDocuments) this.refresh(document);
  }

  /** Checks a text document now, or clears it when it is no Structurizr workspace (any longer). */
  refresh(document: CheckedDocument): ProblemCounts {
    const key = document.uri.toString();
    if (!this.inEditor.has(key) && !isStructurizrWorkspaceDocument(document)) {
      this.forget(document.uri);
      return { count: 0, errors: 0 };
    }
    return this.check(document);
  }

  /** The C4 editor's refresh: on open, on `ready` and after every change (the shell's plumbing). */
  refreshEditor(document: CheckedDocument): ProblemCounts {
    this.inEditor.add(document.uri.toString());
    return this.check(document);
  }

  /** The C4 editor closed: the document keeps its findings only while it is a workspace. */
  releaseEditor(document: CheckedDocument): void {
    this.inEditor.delete(document.uri.toString());
    if (!isStructurizrWorkspaceDocument(document)) this.forget(document.uri);
  }

  /** The current parse when the canvas can read it, else the last one it could, else none. */
  readable(document: Pick<vscode.TextDocument, "uri" | "getText">): ParseResult | undefined {
    const current = safeParse(document.getText());
    if (current?.ok) return current;
    return this.readableParses.get(document.uri.toString());
  }

  count(uri: vscode.Uri): number {
    return this.collection.get(uri)?.length ?? 0;
  }

  dispose(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    for (const subscription of this.subscriptions) subscription.dispose();
    this.collection.dispose();
    this.readableParses.clear();
  }

  /**
   * Typing fires a change per keystroke; parse once the user pauses. An open C4 editor refreshes
   * at once instead (`refreshEditor`): its canvas imports every change, and the pill counts what
   * the canvas shows.
   */
  private scheduleRefresh(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    // Output channels and every other document fire changes too; none of them is ever checked.
    if (this.inEditor.has(key) || !isCheckedFile(document.uri)) return;
    this.cancelPending(key);
    this.pending.set(
      key,
      setTimeout(() => {
        this.pending.delete(key);
        this.refresh(document);
      }, REFRESH_DELAY_MS),
    );
  }

  private check(document: CheckedDocument): ProblemCounts {
    const key = document.uri.toString();
    this.cancelPending(key);
    let diagnostics: vscode.Diagnostic[];
    try {
      const result = parseWorkspace(document.getText());
      if (result.ok) this.readableParses.set(key, result);
      diagnostics = documentDiagnostics(result, document);
    } catch (error) {
      // The editor refreshes the diagnostics while it opens: a fault of the parser must not keep
      // the diagram from opening, so it becomes a finding of its own.
      diagnostics = [unreadable(error)];
    }
    this.collection.set(document.uri, diagnostics);
    return problemCounts(diagnostics);
  }

  private forget(uri: vscode.Uri): void {
    const key = uri.toString();
    this.cancelPending(key);
    this.readableParses.delete(key);
    this.collection.delete(uri);
  }

  private cancelPending(key: string): void {
    const timer = this.pending.get(key);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.pending.delete(key);
  }
}

function safeParse(text: string): ParseResult | undefined {
  try {
    return parseWorkspace(text);
  } catch {
    return undefined;
  }
}
