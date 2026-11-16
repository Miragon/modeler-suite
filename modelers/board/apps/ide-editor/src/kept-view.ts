/**
 * The view of a board, kept by its host between two lives of the page: a webview that VS Code
 * builds anew (a reload, a restored window), a browser tab that is reloaded. The board file
 * holds no view, so where a person looked last is the host's to keep.
 *
 * A kept view takes the place of the first fit only where it still makes sense for the board
 * that is there now. The editor cannot know which text a kept view was a view of, since a file
 * may change while its page is away, so the test is what a person would see: a view that shows
 * none of the board's nodes is not restored, because an empty canvas reads as an empty board.
 * Each node is asked by its own box. The box around all of them is no measure: a view between
 * two groups of nodes that lie far apart is inside that box and shows nothing.
 * A host keeps one place per document.
 */
import type { Bounds, Insets, Size } from "@miragon/modeler-shell/core";
import type { IdeEditorState } from "@miragon/modeler-shell/ide";

import type { ViewSubscription } from "./view-events.js";
import {
  BOARD_MAX_ZOOM,
  BOARD_MIN_ZOOM,
  sameView,
  viewOf,
  type BoardView,
  type ViewedBoard,
} from "./zoom-target.js";

/**
 * Where a host keeps what an editor wants back after a reload, by key. The shell's
 * `IdeEditorState` fits: in VS Code it is the webview's state. Neither call may throw.
 */
export type KeptState = Pick<IdeEditorState, "read" | "write">;

/** The board's key in the host's place. Every other key there is somebody else's. */
export const BOARD_VIEW_KEY = "boardView";

/**
 * How much of a node's box a kept view has to show, in px each way: enough to see that the
 * board is not empty and where the rest of it lies.
 */
export const IN_SIGHT_PX = 48;

/** A pan, a wheel and the move to an armed model change the view with every frame. */
export const VIEW_REST_MS = 250;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** What a host kept, as a view of a board: undefined for nothing and for any other value. */
export function keptView(value: unknown): BoardView | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const { x, y, zoom } = value as Record<string, unknown>;
  if (!finite(x) || !finite(y) || !finite(zoom)) return undefined;
  // The board would take a zoom outside its range for the nearer end: no view it ever had.
  if (zoom < BOARD_MIN_ZOOM || zoom > BOARD_MAX_ZOOM) return undefined;
  return { x, y, zoom };
}

/**
 * Whether a view shows a box of the board: `IN_SIGHT_PX` of it each way, inside the part of the
 * slot the shell's chrome leaves free. A box that is smaller than that on screen has to be in
 * sight whole.
 */
export function showsContent(view: BoardView, bounds: Bounds, size: Size, insets: Insets): boolean {
  const left = view.x + bounds.x * view.zoom;
  const top = view.y + bounds.y * view.zoom;
  const width = bounds.width * view.zoom;
  const height = bounds.height * view.zoom;
  const seenWidth = Math.min(left + width, size.width - insets.right) - Math.max(left, insets.left);
  const seenHeight =
    Math.min(top + height, size.height - insets.bottom) - Math.max(top, insets.top);
  return seenWidth >= Math.min(IN_SIGHT_PX, width) && seenHeight >= Math.min(IN_SIGHT_PX, height);
}

/**
 * The kept view where it is one and shows one of this board's boxes in this slot. `boxes` are
 * the boxes of what the board draws, each in board coordinates: none for an empty board.
 */
export function keptViewFor(
  value: unknown,
  boxes: readonly Bounds[],
  size: Size,
  insets: Insets,
): BoardView | undefined {
  const view = keptView(value);
  if (!view) return undefined;
  return boxes.some((box) => showsContent(view, box, size, insets)) ? view : undefined;
}

export interface ViewKeeper {
  /**
   * The first view stands, restored or fitted: it is the app's own and is not kept. From now on
   * a view that differs from the one kept last is kept once it rested.
   */
  start(): void;
  /**
   * Keeps the view the board has now, where it is not the one kept last, and keeps no more.
   * Called before the board goes, which answers with no view afterwards.
   */
  stop(): void;
}

export interface ViewKeeperOptions {
  modeler: Pick<ViewedBoard, "getViewState">;
  place: Pick<KeptState, "write">;
  /** tells when the board's view may have changed */
  onView: ViewSubscription;
  /** how long a view has to rest before it is kept; default `VIEW_REST_MS` */
  restMs?: number | undefined;
}

/**
 * Keeps the board's view in the host's place: one write once the view rested, and none while
 * it is the view that was kept last. In VS Code a write is a message to the editor, so a write
 * per frame of a pan would be sixty a second.
 */
export function keepView(options: ViewKeeperOptions): ViewKeeper {
  const { modeler, place, onView } = options;
  const restMs = options.restMs ?? VIEW_REST_MS;
  let last: BoardView | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopListening: (() => void) | undefined;
  const keep = (): void => {
    timer = undefined;
    const now = viewOf(modeler);
    if (last && sameView(now, last)) return;
    last = now;
    place.write(BOARD_VIEW_KEY, now);
  };
  return {
    start() {
      if (stopListening) return;
      last = viewOf(modeler);
      stopListening = onView(() => {
        clearTimeout(timer);
        timer = setTimeout(keep, restMs);
      });
    },
    stop() {
      if (!stopListening) return;
      stopListening();
      stopListening = undefined;
      clearTimeout(timer);
      // also a view the watch has not told of yet: it looks once per frame
      keep();
    },
  };
}
