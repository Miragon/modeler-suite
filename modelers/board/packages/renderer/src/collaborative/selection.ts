/** A part of the contract factory (collaborative.tsx): the selection, as a host reads it. */
import type { BoardStore } from "../store/board-store.js";
import type { BoardSession } from "./view.js";

export interface SelectionMirror {
  /** the ids as they were set last; `elements.selection()` leaves out what left the canvas since */
  selected(): string[];
  readonly selectionListeners: Set<(ids: string[]) => void>;
  /** the ids of everything the canvas draws of the document */
  onCanvas(): Set<string>;
  /** takes a selection and tells the listeners, unless it is the one it holds */
  setSelection(ids: readonly string[]): void;
}

export function createSelectionMirror(
  session: Pick<BoardSession, "destroyed">,
  store: BoardStore,
): SelectionMirror {
  // ── the selection: React Flow's, mirrored here so that a host reads it at once ──
  let selected: string[] = [];
  const selectionListeners = new Set<(ids: string[]) => void>();
  const onCanvas = (): Set<string> => {
    const snapshot = store.getSnapshot();
    return new Set([
      ...snapshot.nodes.map((node) => node.id),
      ...snapshot.edges.map((edge) => edge.id),
    ]);
  };
  const setSelection = (ids: readonly string[]): void => {
    const known = onCanvas();
    const next = ids.filter((id) => known.has(id));
    if (next.length === selected.length && next.every((id, index) => id === selected[index]))
      return;
    selected = next;
    for (const listener of [...selectionListeners]) {
      // a listener may destroy the board
      if (session.destroyed) return;
      // or take a later one off, which is then not called either (contract 1.6)
      if (!selectionListeners.has(listener)) continue;
      listener([...next]);
    }
  };
  return { selected: () => selected, selectionListeners, onCanvas, setSelection };
}
