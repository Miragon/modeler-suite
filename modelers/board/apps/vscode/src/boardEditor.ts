import * as vscode from "vscode";
import { registerModelerEditor } from "@miragon/modeler-shell/vscode/extension";
import { PICTURE_SUFFIXES } from "@miragon/board-files";

import { boardEditorOptions, MODEL_SUFFIXES } from "./boardEditorOptions.js";
import { createVsCodeBackend } from "./files/backend.js";
import { createIndexPool } from "./files/file-index.js";

export { BOARD_VIEW_TYPE } from "./boardEditorOptions.js";

/**
 * The custom editor for `*.board` on the shell's document plumbing. The board file is VS Code's
 * text document, so dirty state, saving, Git, diff and undo are VS Code's, and every change on
 * the canvas comes back as a minimal line edit. The models and pictures a board shows are the
 * files of its repository, served to the editor's webview through VS Code's own text documents
 * and file system.
 */
export function registerBoardEditor(
  context: Pick<vscode.ExtensionContext, "extensionUri">,
): vscode.Disposable {
  const suffixes = { models: MODEL_SUFFIXES, pictures: PICTURE_SUFFIXES };
  // One index of a repository's files, however many of its boards are open.
  const indexes = createIndexPool<vscode.Uri>(vscode, suffixes);
  const editors = registerModelerEditor<vscode.TextDocument>(
    vscode,
    context,
    boardEditorOptions<vscode.TextDocument>((board) =>
      createVsCodeBackend<vscode.Uri>(vscode, { board, suffixes, indexes }),
    ),
  );
  return vscode.Disposable.from(editors, indexes);
}
