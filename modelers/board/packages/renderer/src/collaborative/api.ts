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
 * - `fitOnImport` (default true): after every accepted import the content is fitted into the
 *   host's box, clear of the board's toolbar. The fit is not capped at 100 %.
 * - `freeArea`: only the `insets` form is read, for that fit. A `center` form is accepted and
 *   has no effect yet: a new node lands in the middle of what the board shows.
 * - `undoRedoKeys` (default true): Control or Command + Z, Shift + Z and Y on the focused canvas
 *   run the board's history. False leaves the keys alone, for a host that owns the history.
 */
export interface BoardModelerOptions extends CollaborativeModelerOptions {
  /** What the board asks of the place it runs in. Absent: a board of notes, groups and arrows. */
  host?: BoardHost | undefined;
  /**
   * A live document the host shares with other people: element by element on Yjs, under
   * ELEMENTS_KEY and META_KEY (store/document.ts). The board reads and writes it and never
   * destroys it; `importText` reconciles into it. A peer's change redraws the board and is no
   * `onContentChanged`. The view is fitted once when the canvas is attached, unless
   * `fitOnImport` is false or the host set a view before. Absent: the board keeps a document of
   * its own, filled by `importText`. The host must load the same copy of yjs as this package:
   * the store tells its elements by `instanceof Y.Map`.
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
}

export interface CollaborativeBoard extends CollaborativeModeler {
  readonly elements: BoardElementsSurface;
  /** the tight box of every node, from the document; undefined while the board is empty */
  contentBounds(): ElementBounds | undefined;
  readonly board: BoardHandle;
}
