import type {
  CollaborativeModeler,
  CollaborativeModelerOptions,
  ElementBounds,
  ElementsSurface,
} from "@miragon/modeler-api";
import type * as Y from "yjs";
import type { BoardHost } from "../host/types.js";
import type { BoardStore } from "../store/board-store.js";

/** `meta.notation` of a board: the stable id a host binds the notation by. */
export const NOTATION = "board";

/**
 * The contract's options plus the board's own. Of the contract's three:
 * - `fitOnImport` (default true): after an accepted import the content is fitted into the
 *   host's box, clear of the board's toolbar. Not while a model is armed or the board moves to
 *   arm one: a fit changes the board zoom, which releases the editor, so the view stays as it
 *   is, and a host that echoes the board file on every sync does not put a person out of the
 *   model they edit. An import that takes the armed model away fits as usual. The fit is not
 *   capped at 100 %. An import before `attachTo` has no box to fit into and is not fitted
 *   later: the host attaches first, as the contract has it.
 * - `freeArea`: only the `insets` form is read, for that fit. A call of it that throws is
 *   reported once (`console.error`, prefix `[board]`) and answered with the insets it gave
 *   last, or with none. A `center` form is accepted and has no effect yet: a new node lands in
 *   the middle of what the board shows.
 * - `undoRedoKeys` (default true): Control or Command + Z, Shift + Z and Y on the focused canvas
 *   run the board's history. False leaves the keys alone, for a host that owns the history.
 */
export interface BoardModelerOptions extends CollaborativeModelerOptions {
  /** What the board asks of the place it runs in. Absent: a board of notes, groups and arrows. */
  host?: BoardHost | undefined;
  /**
   * A live document the host shares with other people: element by element on Yjs, under
   * ELEMENTS_KEY and META_KEY (store/document.ts), every attribute a plain JSON value. A nested
   * Yjs type as a value is not supported: the board draws and exports it, and an `importText`
   * then fails in the middle of its write. The board reads and writes the document and never
   * destroys it; `importText` reconciles into it. A peer's change redraws the board and is no
   * `onContentChanged`.
   *
   * The view is fitted once, unless `fitOnImport` is false: when the canvas is attached, or,
   * for a document that has no node by then (a sync provider hands its document out before its
   * first sync), when a change that is not this board's own brings the first one. A view the
   * host set and an import before that both take the place of this fit, an import by fitting
   * as every import does. A first node this board's own gesture made is left where the person
   * put it, and nothing is fitted after it.
   *
   * One document takes one board per page. The board tells its own changes from everyone
   * else's by the origin of the transaction (BOARD_LOCAL, BOARD_AMEND, its undo manager), and
   * the two origins are one value for every board store: a write through another store on the
   * same document under them, a second board's or the host's own `createBoardStore(doc)`,
   * counts as this board's. It is reported by `onContentChanged`, and a gesture among them is
   * on this board's history, where this board's undo takes it back.
   *
   * Absent: the board keeps a document of its own, filled by `importText`. The host must load
   * the same copy of yjs as this package: the store tells its elements by `instanceof Y.Map`.
   */
  liveDocument?: Y.Doc | undefined;
}

/** Nodes and stored arrows under the ids of the board file, with their boxes. Never a derived arrow. */
export type BoardElementsSurface = ElementsSurface & Required<Pick<ElementsSurface, "bounds">>;

/** Beyond the contract: what a host's own wiring or a test drives, as `diagram` is on the other renderers. */
export interface BoardHandle {
  /** the board document as the canvas reads and writes it */
  readonly store: BoardStore;
  /** the board's history: every gesture made here since the last import */
  undo(): void;
  redo(): void;
  /** resolves once the canvas exists in the host it was attached to; never rejects */
  readonly mounted: Promise<void>;
  /**
   * Resolves once the board is gone after `destroy()`, which returns before that: the canvas is
   * unmounted, and every editor of a model node has had its `destroy()` (an armed one its
   * `release()` before), also one the host hands in after its node or the board went, which is
   * destroyed as it comes. From then on the board calls no editor, and a host may end what its
   * editors were bound to (a live session, a files port). Settles once, also when `destroy()` is
   * called again and for a board that never mounted; never rejects. Pending until `destroy()`,
   * and for as long as a promise that `open()` returned is.
   */
  readonly unmounted: Promise<void>;
}

export interface CollaborativeBoard extends CollaborativeModeler {
  readonly elements: BoardElementsSurface;
  /** the tight box of every node, from the document; undefined while the board is empty */
  contentBounds(): ElementBounds | undefined;
  readonly board: BoardHandle;
}
