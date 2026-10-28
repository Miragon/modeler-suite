import { minimalLineEdit } from "./text-lines.js";
import type { TextDocumentLike, VsCodeEditorLike } from "./types.js";

/** The parts of `vscode` a `DocumentWriter` needs. */
export type VsCodeDocumentEditLike = Pick<VsCodeEditorLike, "Range" | "WorkspaceEdit"> & {
  readonly workspace: Pick<VsCodeEditorLike["workspace"], "applyEdit">;
};

export interface DocumentWriteOptions {
  /**
   * Whether the change is the webview's own, which its canvas already shows: its change event is an
   * echo (`consumeEcho()`), not an update to import. "Insert example" passes `false`, so the canvas
   * imports the example and fits.
   */
  suppressEcho: boolean;
}

export interface DocumentWriter {
  /**
   * Queues `nextText(the document's text by then)`, written as one minimal `WorkspaceEdit`.
   * Resolves to `false` when VS Code refused the edit (a read-only file), `true` otherwise, also
   * when there was nothing to write (`undefined`, or the same text).
   */
  write(
    nextText: (currentText: string) => string | undefined,
    options: DocumentWriteOptions,
  ): Promise<boolean>;
  /** Whether the document's current text is the echo of an own write; true only once per write. */
  consumeEcho(): boolean;
  /** The writes queued or running. */
  readonly pending: number;
  /** Resolves once every write queued so far has landed or was refused. */
  settled(): Promise<void>;
}

/** VS Code writes an inserted `\n` as the document's line break, so echoes compare without it. */
function echoKey(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function linesOf(document: TextDocumentLike): string[] {
  const lines: string[] = [];
  for (let line = 0; line < document.lineCount; line++) lines.push(document.lineAt(line).text);
  return lines;
}

/**
 * Writes texts into one document, each as one minimal `WorkspaceEdit`: every canvas change is one
 * undo step of the document's history (guide §13.5), and a side-by-side text editor keeps its
 * cursor. The writes run one at a time, each diffed against the document as the previous one left
 * it: a range computed before then would point at the wrong lines.
 */
export function createDocumentWriter(
  vscode: VsCodeDocumentEditLike,
  document: TextDocumentLike,
): DocumentWriter {
  // A set: for edits A and B in quick succession every echo is recognised, in whatever order the
  // change events arrive.
  const pendingEchoes = new Set<string>();
  let queue: Promise<unknown> = Promise.resolve();
  let pending = 0;

  async function apply(text: string | undefined, suppressEcho: boolean): Promise<boolean> {
    if (text === undefined) return true;
    const change = minimalLineEdit(linesOf(document), text);
    if (!change) return true;
    // Registered before applyEdit, so the change event the edit causes is recognised as its echo.
    const key = echoKey(text);
    if (suppressEcho) pendingEchoes.add(key);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(
        change.start.line,
        change.start.character,
        change.end.line,
        change.end.character,
      ),
      change.text,
    );
    const applied = await Promise.resolve(vscode.workspace.applyEdit(edit)).then(
      (accepted) => accepted,
      () => false,
    );
    if (!applied && suppressEcho) pendingEchoes.delete(key);
    return applied;
  }

  return {
    write(nextText, { suppressEcho }) {
      pending++;
      const written = queue
        .then(() => apply(nextText(document.getText()), suppressEcho))
        .finally(() => pending--);
      queue = written.catch(() => undefined);
      return written;
    },
    consumeEcho: () => pendingEchoes.delete(echoKey(document.getText())),
    get pending() {
      return pending;
    },
    settled: () => queue.then(() => undefined),
  };
}
