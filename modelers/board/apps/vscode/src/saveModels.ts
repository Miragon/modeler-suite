/**
 * "Save the models with the board", for one open board: when a person saves the board file, the
 * models that board's page wrote are saved too. Off unless the setting says so, since a model
 * is a file of its own that a person may not want written yet. A model whose file is no longer
 * there stays unsaved: a save would write again a file that somebody removed.
 *
 * Built on what a real VS Code showed (the board's guide, "Saving, as measured"). It hears every
 * save a person makes of a board, whether or not the board itself has unsaved changes. Only
 * will-save says who asked, so the reason is kept from there to did-save. The models are saved
 * after the board's did-save and never inside its will-save, whose listeners VS Code gives a
 * time budget. A save an extension makes looks like a person's to VS Code, so the saves made
 * here are written down while they run and none of them saves a second round.
 */
import type { DisposableLike } from "@miragon/modeler-shell/vscode/extension";

import {
  MANUAL_SAVE,
  type BoardUriLike,
  type BoardVsCodeLike,
  type SavableDocumentLike,
} from "./files/vscode-like.js";

type SavingVsCodeLike<Uri extends BoardUriLike> = {
  readonly workspace: Pick<
    BoardVsCodeLike<Uri>["workspace"],
    "onWillSaveTextDocument" | "onDidSaveTextDocument"
  >;
};

/** a document, and whether its file is on the disk */
type FileThere = (document: SavableDocumentLike) => PromiseLike<boolean>;

export interface SaveModelsOptions<Uri> {
  /** the board file whose save by a person is the moment */
  readonly board: Uri;
  /** asked at every such save: a person may change the setting while the board is open */
  enabled(): boolean;
  /** the documents this board's page wrote that are unsaved now */
  unsaved(): readonly SavableDocumentLike[];
  /**
   * The documents the extension is saving right now, by the name VS Code has for each, shared
   * by every open board: the save of one of them is no person's, whatever VS Code says.
   */
  readonly saving: Set<string>;
  /**
   * Whether the file of a document is still there. A document whose file went (another program
   * removed it, or a person renamed it while an edit was on its way) is not saved: VS Code
   * would write the file again. Absent: every document is saved.
   */
  readonly fileThere?: FileThere | undefined;
}

/**
 * Saves every document at once and waits for none before the next: one that VS Code cannot
 * save (its file is newer on disk) stays unsaved, VS Code says why, and the others are saved.
 * One that is being saved already is left to that save: two editors of one board hear the same
 * save of it.
 */
async function saveAll(
  documents: readonly SavableDocumentLike[],
  saving: Set<string>,
  fileThere: FileThere | undefined,
): Promise<void> {
  await Promise.all(
    documents.map(async (document) => {
      const name = document.uri.toString();
      if (saving.has(name)) return;
      saving.add(name);
      try {
        if (fileThere === undefined || (await fileThere(document))) await document.save();
      } catch {
        // VS Code could not save it and said so: the document stays unsaved
      } finally {
        saving.delete(name);
      }
    }),
  );
}

export function saveModelsWithBoard<Uri extends BoardUriLike>(
  vscode: SavingVsCodeLike<Uri>,
  options: SaveModelsOptions<Uri>,
): DisposableLike {
  const board = options.board.toString();
  /** the save of the board that is on its way was asked for by a person */
  let byPerson = false;
  const subscriptions: DisposableLike[] = [
    vscode.workspace.onWillSaveTextDocument(({ document, reason }) => {
      if (document.uri.toString() !== board) return;
      byPerson = reason === MANUAL_SAVE && !options.saving.has(board);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.toString() !== board || !byPerson) return;
      byPerson = false;
      if (options.enabled()) void saveAll(options.unsaved(), options.saving, options.fileThere);
    }),
  ];
  return {
    dispose() {
      for (const subscription of subscriptions.splice(0)) subscription.dispose();
    },
  };
}
