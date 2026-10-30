/** Pure layout helpers for the free Event Storming canvas (no persistence, no DOM). */

import { compareCodeUnits } from "./order.js";
import type { BoardElement, EventStormingBoard } from "./types.js";

/**
 * Default framing for an empty board in board pixels. Single source of truth for the
 * renderer's board-bounds service (fitView and SVG export fall back to it when the
 * board has no elements).
 */
export const DEFAULT_BOARD_SIZE = { width: 1080, height: 680 } as const;

export function timelineOrder(
  first: Pick<BoardElement, "id" | "position">,
  second: Pick<BoardElement, "id" | "position">,
): number {
  return (
    first.position.x - second.position.x ||
    first.position.y - second.position.y ||
    compareCodeUnits(first.id, second.id)
  );
}

/**
 * Elements in timeline order: sorted by `position.x`, then `position.y`, then `id` (by UTF-16 code
 * unit, not by locale, so `spreadTimeline` places stickies on the same spot alike on every
 * machine). Pure and deterministic; mirrors how a facilitator reads a board left to right.
 */
export function sortByTimeline(board: EventStormingBoard): BoardElement[] {
  return [...board.elements].sort(timelineOrder);
}
