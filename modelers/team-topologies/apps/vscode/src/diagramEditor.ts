import * as vscode from "vscode";
import {
  registerModelerEditor,
  type ModelerEditor,
  type ModelerEditorRegistration,
} from "@miragon/modeler-shell/vscode/extension";
import { documentDiagnostics, problemCounts } from "./diagnostics.js";
import { DIAGRAM_EDITOR_OPTIONS } from "./diagramEditorOptions.js";
import { withExampleInserted } from "./examples.js";
import { exportImage } from "./exportImage.js";
import type { HostToWebview, WebviewToHost } from "./protocol.js";

/** The open text diagrams: the focused one, the one focused last, and their Command Palette commands. */
export type DiagramEditors = ModelerEditorRegistration<vscode.TextDocument>;

type DiagramEditor = ModelerEditor<vscode.TextDocument>;

export const INSERT_EXAMPLE_FAILED =
  "Couldn't insert the example: fix the problems of this file first.";

/**
 * VS Code gives a save participant about 1.5 s before it skips it, and drops one that overruns
 * repeatedly; a webview that doesn't answer in time is saved without its draft instead.
 */
export const FLUSH_TIMEOUT_MS = 1000;

/** The `flush` round trips of one editor's webview. */
interface WebviewFlushes {
  /** Resolves once the webview committed its draft (or did not answer in time) and its edit landed. */
  request(): Promise<void>;
  answered(id: number): void;
  /** The editor closed: no answer comes any more. */
  dispose(): void;
}

function webviewFlushes(editor: DiagramEditor): WebviewFlushes {
  const pending = new Map<number, () => void>();
  let nextId = 1;
  return {
    request: () =>
      new Promise<void>((resolve) => {
        const id = nextId++;
        const finish = (): void => {
          clearTimeout(timer);
          pending.delete(id);
          resolve();
        };
        const timer = setTimeout(finish, FLUSH_TIMEOUT_MS);
        pending.set(id, finish);
        editor.post({ type: "flush", id } satisfies HostToWebview).then((delivered) => {
          if (!delivered) finish();
        }, finish);
      }).then(() => editor.written()),
    answered: (id) => pending.get(id)?.(),
    dispose: () => {
      for (const finish of [...pending.values()]) finish();
    },
  };
}

/**
 * The custom editor for `.tt`/`.ttm.json`, on the shell's document plumbing: the native JSON stays
 * the document, so VS Code keeps dirty state, saving, Git, diff and undo, and every change on the
 * canvas comes back as a minimal line edit. The document's problems go to the Problems view and the
 * pill, and a save first commits a field still being typed in.
 */
export function registerDiagramEditor(
  context: Pick<vscode.ExtensionContext, "extensionUri">,
  diagnostics: vscode.DiagnosticCollection,
): DiagramEditors {
  const flushes = new WeakMap<DiagramEditor, WebviewFlushes>();
  return registerModelerEditor<vscode.TextDocument, WebviewToHost>(vscode, context, {
    ...DIAGRAM_EDITOR_OPTIONS,
    insertExample: (text) => {
      const withExample = withExampleInserted(text);
      if (withExample === undefined) void vscode.window.showErrorMessage(INSERT_EXAMPLE_FAILED);
      return withExample;
    },
    diagnostics: {
      refresh: (document) => {
        const found = documentDiagnostics(document.getText(), document);
        diagnostics.set(document.uri, found);
        return problemCounts(found);
      },
      clear: (document) => diagnostics.delete(document.uri),
    },
    onDidOpen: (editor) => {
      const flush = webviewFlushes(editor);
      flushes.set(editor, flush);
      // An inspector field commits on blur or Enter, and Ctrl/Cmd+S keeps the focus where it is. An
      // autosave after a delay is left alone: it would commit, and add an undo step, mid-typing.
      const willSave = vscode.workspace.onWillSaveTextDocument((event) => {
        if (event.document.uri.toString() !== editor.document.uri.toString()) return;
        if (event.reason === vscode.TextDocumentSaveReason.AfterDelay) return;
        event.waitUntil(flush.request());
      });
      return {
        dispose: () => {
          willSave.dispose();
          flush.dispose();
        },
      };
    },
    onMessage: (message, editor) => {
      switch (message.type) {
        case "flushed":
          return flushes.get(editor)?.answered(message.id);
        case "export":
          return exportImage(editor.document.uri, message);
        default:
          return undefined;
      }
    },
  });
}
