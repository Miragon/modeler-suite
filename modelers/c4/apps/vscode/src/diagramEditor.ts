import * as vscode from "vscode";
import { parseWorkspace } from "@miragon/c4-dsl";
import {
  IMAGE_EXPORT_KINDS,
  exportToFile,
  registerModelerEditor,
  type ModelerEditor,
} from "@miragon/modeler-shell/vscode/extension";
import {
  registerSideBySideCommands,
  registerWebviewCommands,
  revealRestoredTab,
} from "./commands.js";
import type { C4Diagnostics } from "./diagnostics.js";
import { DIAGRAM_EDITOR_OPTIONS, DIAGRAM_VIEW_TYPES } from "./diagramEditorOptions.js";
import { withExampleInserted } from "./examples.js";
import { registerGoToViewCommand } from "./goToView.js";
import { isLikeC4Installed, isLikeC4Model, reopenForLikeC4 } from "./likeC4.js";
import type { WebviewToHost } from "./protocol.js";
import { webviewFlushes, type WebviewFlushes } from "./saveFlush.js";

type DiagramEditor = ModelerEditor<vscode.TextDocument>;

/*
 * The empty-file hint shows while the model has no element, also in a workspace that already
 * holds views or styles, which the example can't be merged into: the user asked, so the answer is
 * never silent (guide §9, §13.5).
 */
export const EXAMPLE_NEEDS_VALID_FILE =
  "Couldn't insert the example: fix the problems of this file first.";
export const EXAMPLE_NEEDS_EMPTY_FILE =
  "Couldn't insert the example: it only goes into a blank file or an empty workspace. Run New C4 Diagram from Example instead.";

function insertExample(text: string): string | undefined {
  const withExample = withExampleInserted(text);
  if (withExample === undefined) {
    const message = parseWorkspace(text).ok ? EXAMPLE_NEEDS_EMPTY_FILE : EXAMPLE_NEEDS_VALID_FILE;
    void vscode.window.showErrorMessage(message);
  }
  return withExample;
}

/**
 * The inspector's "Defined on line N" (SPEC 5.6): the text editor of the document that is already
 * visible shows the line, else one opens beside the diagram. `line` counts from 1.
 */
export async function revealSourceLine(
  document: vscode.TextDocument,
  line: unknown,
): Promise<void> {
  if (typeof line !== "number" || !Number.isInteger(line) || line < 1) return;
  const index = Math.min(line, document.lineCount) - 1;
  const range = new vscode.Range(index, 0, index, 0);
  const uri = document.uri.toString();
  const visible = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.toString() === uri,
  );
  const editor = await vscode.window.showTextDocument(document, {
    viewColumn: visible?.viewColumn ?? vscode.ViewColumn.Beside,
    selection: range,
  });
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/**
 * The custom text editor on the shell's document plumbing: the document stays the source of
 * truth, so VS Code owns dirty state, saving, Git, diff and undo (guide §13.5). The shell writes the
 * webview HTML, connects the theme bridge, writes every canvas edit back as one minimal
 * WorkspaceEdit without importing its echo, answers "Insert example" and keeps the problems pill in
 * step; the modeler adds its diagnostics and its commands, hands an export to the shell's save
 * dialog and notification, and has a save commit a field still being typed in first. The editors of
 * `.c4` and of `.dsl` files are one editor with two view types, so the commands reach both.
 */
export function registerDiagramEditor(
  context: Pick<vscode.ExtensionContext, "extensionUri">,
  diagnostics: C4Diagnostics,
): vscode.Disposable {
  // The plumbing posts its own messages; Go to View posts to the editor of a document itself.
  const openEditors = new Map<string, DiagramEditor>();
  const flushes = new WeakMap<DiagramEditor, WebviewFlushes>();
  /** The view type whose editor had the focus last, so a command means the diagram seen last. */
  let focusedLast: string | undefined;

  const register = (viewType: string) =>
    registerModelerEditor<vscode.TextDocument, WebviewToHost>(vscode, context, {
      ...DIAGRAM_EDITOR_OPTIONS,
      viewType,
      insertExample,
      diagnostics: {
        refresh: (document) => diagnostics.refreshEditor(document),
        clear: (document) => diagnostics.releaseEditor(document),
      },
      onMessage: (message, editor) => {
        switch (message.type) {
          case "export":
            return exportToFile(vscode, {
              kind: IMAGE_EXPORT_KINDS[message.format],
              data: message.data,
              sourceUri: editor.document.uri,
              defaultName: "c4",
              fontFallback: message.fontFallback === true,
              platform: process.platform,
            });
          case "c4.flushed":
            return flushes.get(editor)?.answered(message.id);
          case "c4.revealSource":
            return revealSourceLine(editor.document, message.line);
          default:
            return undefined;
        }
      },
      onDidOpen: (editor) => {
        if (isLikeC4Model(editor.document, isLikeC4Installed())) {
          // The plumbing hands on the panel VS Code resolved the editor with, which can close.
          const panel = editor.panel as unknown as vscode.WebviewPanel;
          void reopenForLikeC4({ document: editor.document, panel });
          return undefined;
        }
        const key = editor.document.uri.toString();
        openEditors.set(key, editor);
        const flush = webviewFlushes(editor);
        flushes.set(editor, flush);
        const noteFocus = (): void => {
          if (editor.panel.active) focusedLast = viewType;
        };
        noteFocus();
        const viewState = editor.panel.onDidChangeViewState(noteFocus);
        // An inspector field or the label editor commits on blur or Enter, and Ctrl/Cmd+S keeps the
        // focus where it is. An autosave after a delay is left alone: it would commit, and add an
        // undo step, mid-typing.
        const willSave = vscode.workspace.onWillSaveTextDocument((event) => {
          if (event.document.uri.toString() !== key) return;
          if (event.reason === vscode.TextDocumentSaveReason.AfterDelay) return;
          event.waitUntil(flush.request());
        });
        return {
          dispose: () => {
            viewState.dispose();
            willSave.dispose();
            flush.dispose();
            if (openEditors.get(key) === editor) openEditors.delete(key);
          },
        };
      },
    });
  const editors = new Map(DIAGRAM_VIEW_TYPES.map((viewType) => [viewType, register(viewType)]));
  const registrations = [...editors.values()];

  const revealActiveDocument = (): vscode.Uri | undefined => {
    const last = focusedLast === undefined ? undefined : editors.get(focusedLast);
    for (const registration of last ? [last, ...registrations] : registrations) {
      const uri = registration.revealActiveDocument();
      if (uri) return uri;
    }
    return undefined;
  };
  // The plumbing knows a diagram tab VS Code restored after a reload only once it is shown.
  const revealDiagram = async () => revealActiveDocument() ?? revealRestoredTab(DIAGRAM_VIEW_TYPES);
  return vscode.Disposable.from(
    ...registrations,
    ...registerWebviewCommands((name, uri) =>
      registrations.some((registration) => registration.runCommand(name, uri)),
    ),
    ...registerSideBySideCommands(revealDiagram),
    registerGoToViewCommand(
      async (uri) => {
        const target = uri ?? (await revealDiagram());
        return target && openEditors.get(target.toString());
      },
      (document) => diagnostics.readable(document),
    ),
  );
}
