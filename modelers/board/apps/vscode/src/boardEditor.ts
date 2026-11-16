import * as vscode from "vscode";
import { registerModelerEditor } from "@miragon/modeler-shell/vscode/extension";
import { PICTURE_SUFFIXES } from "@miragon/board-files";

import { boardEditorOptions, MODEL_SUFFIXES } from "./boardEditorOptions.js";
import { registerBoardCommands } from "./commands.js";
import { createBoardDiagnostics } from "./diagnostics.js";
import { createVsCodeBackend } from "./files/backend.js";
import { createIndexPool } from "./files/file-index.js";
import { createWrittenDocuments } from "./files/written.js";
import { saveModelsWithBoard } from "./saveModels.js";

export { BOARD_VIEW_TYPE } from "./boardEditorOptions.js";

/** The section of `miragon.board.saveModelsWithBoard`. */
export const BOARD_SETTINGS = "miragon.board";
export const SAVE_MODELS_SETTING = "saveModelsWithBoard";

/** the setting as it is for the board file right now; off unless somebody turned it on */
const savesModels = (board: vscode.Uri): boolean =>
  vscode.workspace.getConfiguration(BOARD_SETTINGS, board).get(SAVE_MODELS_SETTING) === true;

/**
 * The custom editor for `*.board` on the shell's document plumbing, with its Problems view
 * entry and its commands. The board file is VS Code's text document, so dirty state, saving,
 * Git, diff and undo are VS Code's, and every change on the canvas comes back as a minimal line
 * edit. The models and pictures a board shows are the files of its repository, served to the
 * editor's webview through VS Code's own text documents and file system.
 */
export function registerBoardEditor(
  context: Pick<vscode.ExtensionContext, "extensionUri">,
): vscode.Disposable {
  const suffixes = { models: MODEL_SUFFIXES, pictures: PICTURE_SUFFIXES };
  // One index of a repository's files, however many of its boards are open.
  const indexes = createIndexPool<vscode.Uri>(vscode, suffixes);
  const problems = createBoardDiagnostics();
  // Which documents the boards' pages wrote, kept here and not by an editor: VS Code builds a
  // new editor for a board that is opened again or renamed, and its models are still its own.
  const written = createWrittenDocuments<vscode.Uri>(vscode);
  // the saves this extension makes itself, of whichever board: none of them is a person's
  const saving = new Set<string>();
  const fileThere = (document: { uri: unknown }): PromiseLike<boolean> =>
    vscode.workspace.fs.stat(document.uri as vscode.Uri).then(
      () => true,
      () => false,
    );
  const editors = registerModelerEditor<vscode.TextDocument>(vscode, context, {
    ...boardEditorOptions<vscode.TextDocument>((board) => {
      const backend = createVsCodeBackend<vscode.Uri>(vscode, {
        board,
        suffixes,
        indexes,
        written,
      });
      const saver = saveModelsWithBoard<vscode.Uri>(vscode, {
        board,
        enabled: () => savesModels(board),
        unsaved: backend.unsaved,
        saving,
        fileThere,
      });
      return {
        ...backend,
        dispose() {
          saver.dispose();
          backend.dispose();
        },
      };
    }),
    // No `clear`: the entry of a board that is still open as a text stays, and goes when VS
    // Code closes the document.
    diagnostics: { refresh: (document) => problems.refresh(document) },
  });
  return vscode.Disposable.from(
    editors,
    indexes,
    problems,
    written,
    ...registerBoardCommands(editors),
  );
}
