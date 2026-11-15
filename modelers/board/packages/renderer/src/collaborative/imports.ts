/** A part of the contract factory (collaborative.tsx): `importText`, one import after another. */
import { parseBoardText } from "@miragon/board-schema-model";
import type { ImportResult } from "@miragon/modeler-api";

import { type BoardStore, boardText } from "../store/board-store.js";
import { reconcileSnapshot } from "../store/document.js";
import type { BoardModelerOptions } from "./api.js";
import type { BoardSession, ViewControl } from "./view.js";

/** the origin of an import's write: no change event, no history */
const IMPORT = Symbol("board-import");

/** what an import asks of the canvas the board is drawn on; a board without a canvas answers for itself */
export interface ImportCanvas {
  /** gives up what the canvas holds back from the document: an arrow-key move that waits for its rest */
  dropHeld(): void;
  /** a model of the document is armed, or the board moves to arm one */
  editsModel(): boolean;
}

/** `importText` of a board, as the returned function */
export function createImportQueue(
  session: Pick<BoardSession, "destroyed" | "lastText">,
  store: BoardStore,
  options: Pick<BoardModelerOptions, "fitOnImport">,
  view: Pick<ViewControl, "fitted" | "setView" | "rendered">,
  canvas: ImportCanvas,
): (text: string) => Promise<ImportResult> {
  const { doc } = store;
  const { fitted, setView, rendered } = view;
  // ── imports: one after another in call order, and never inside a running user action ──
  // An import starts in a microtask of its own: one called from a change or selection listener
  // (the host echoing a peer's text while this board's own command still runs) waits until that
  // command returned, and one called behind it waits for it (contract 1.6, recommended)
  let imports: Promise<unknown> = Promise.resolve();
  const importNow = (text: string): Promise<ImportResult> => {
    if (session.destroyed) return Promise.reject(new Error("the board was destroyed"));
    const parsed = parseBoardText(text);
    // L7: refused before anything is touched
    if (!parsed.ok) return Promise.reject(new Error(`not a board: ${parsed.reason}`));
    // L1: a step the canvas scheduled for later belonged to the document this import replaces,
    // so nothing of it is written, reported or kept on the history
    canvas.dropHeld();
    // L1: silent. Only what differs is written, so a node that stays keeps its DOM and its editor
    reconcileSnapshot(doc, parsed.snapshot, IMPORT);
    // L4: the history belonged to the document the import replaced
    store.undo.clear();
    session.lastText = boardText(doc);
    // A fit changes the board zoom, and a board zoom releases an armed editor: the view is the
    // editor's for as long as its model is in the document
    if (options.fitOnImport !== false && !canvas.editsModel()) setView(fitted());
    return rendered().then(() => {
      if (session.destroyed) throw new Error("the board was destroyed during the import");
      return { warnings: [] };
    });
  };
  return (text: string): Promise<ImportResult> => {
    const result = imports.then(() => importNow(text));
    imports = result.catch(() => undefined);
    return result;
  };
}
