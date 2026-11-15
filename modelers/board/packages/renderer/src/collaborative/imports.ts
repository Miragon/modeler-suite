/** A part of the contract factory (collaborative.tsx): `importText`, one import after another. */
import { parseBoardText } from "@miragon/board-schema-model";
import type { ImportResult } from "@miragon/modeler-api";

import { type BoardStore, boardText } from "../store/board-store.js";
import { reconcileSnapshot } from "../store/document.js";
import type { BoardModelerOptions } from "./api.js";
import type { BoardSession, ViewControl } from "./view.js";

/** the origin of an import's write: no change event, no history */
const IMPORT = Symbol("board-import");

/** `importText` of a board, as the returned function */
export function createImportQueue(
  session: Pick<BoardSession, "destroyed" | "lastText">,
  store: BoardStore,
  options: Pick<BoardModelerOptions, "fitOnImport">,
  view: Pick<ViewControl, "fitted" | "setView" | "rendered">,
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
    // L1: silent. Only what differs is written, so a node that stays keeps its DOM and its editor
    reconcileSnapshot(doc, parsed.snapshot, IMPORT);
    // L4: the history belonged to the document the import replaced
    store.undo.clear();
    session.lastText = boardText(doc);
    if (options.fitOnImport !== false) setView(fitted());
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
