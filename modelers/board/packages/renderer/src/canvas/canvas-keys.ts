/**
 * The board's own keys, on the pane. Cut out of Canvas (board.tsx) for its length, statement by
 * statement: Canvas calls the hook where the effect stood, so React registers it in the same order.
 */
import type { ReactFlowInstance } from "@xyflow/react";
import { useEffect } from "react";

import type { BoardFlowEdge, BoardFlowNode } from "../flow/flow-types.js";
import type { BoardContextValue } from "../runtime/board-context.js";
import type { CanvasFlowStore } from "./click-ownership.js";

export function useCanvasKeys(
  board: BoardContextValue,
  flowStore: CanvasFlowStore,
  reactFlow: ReactFlowInstance<BoardFlowNode, BoardFlowEdge>,
  boardElement: HTMLDivElement | null,
): void {
  // Keys stay on the canvas (scope "board"). React Flow listens on the document: Delete and
  // Backspace delete the selection wherever the focus is, Space is taken from every element that
  // is no button. So its own key codes are switched off below and the board answers the keys
  // itself, on the element that holds the nodes (the pane), which takes the focus with a click on
  // the board or a Tab into it. The pane and not the board's root: the layer of an armed editor is
  // a child of the root, and a press on a part of that editor that cannot take the focus has to
  // leave the focus on <body> (board-flow.tsx, ARMED_FIELDS), not on a focusable ancestor.
  const ownKeys = board.inputScope === "board";
  const { arming, store, undoRedoKeys } = board;
  useEffect(() => {
    const pane = ownKeys ? boardElement?.querySelector<HTMLElement>(".react-flow__pane") : null;
    if (!pane) return undefined;
    pane.tabIndex = 0;
    pane.setAttribute("aria-label", "Board");
    const onKeyDown = (event: KeyboardEvent): void => {
      // a keydown without a key (browser autofill dispatches one) is nobody's
      if (event.defaultPrevented || typeof event.key !== "string") return;
      const { target } = event;
      // a field of the board (a note's editor, a label's input) and an armed node keep their keys
      if (
        !(target instanceof Element) ||
        target.closest("input, textarea, select, [contenteditable], .nokey")
      )
        return;
      // a board that moves takes no key: not the delete key for the node the double-click selected, either
      if (arming.state().moving) return;
      const command = event.ctrlKey || event.metaKey;
      if (!command && !event.altKey && (event.key === "Delete" || event.key === "Backspace")) {
        const state = flowStore.getState();
        const nodes = state.nodes.filter((node) => node.selected);
        const selectedEdges = state.edges.filter((edge) => edge.selected);
        if (nodes.length === 0 && selectedEdges.length === 0) return;
        event.preventDefault();
        void reactFlow.deleteElements({ nodes, edges: selectedEdges });
        flowStore.setState({ nodesSelectionActive: false });
        // the node that had the focus may be the one that goes: the next key is the board's again
        pane.focus({ preventScroll: true });
        return;
      }
      if (command && !event.altKey && undoRedoKeys) {
        const key = event.key.toLowerCase();
        const undo = key === "z" && !event.shiftKey;
        const redo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
        if (!undo && !redo) return;
        event.preventDefault();
        if (undo) store.undo.undo();
        else store.undo.redo();
      }
    };
    pane.addEventListener("keydown", onKeyDown);
    return () => {
      pane.removeEventListener("keydown", onKeyDown);
      pane.removeAttribute("tabindex");
      pane.removeAttribute("aria-label");
    };
  }, [ownKeys, boardElement, arming, undoRedoKeys, flowStore, reactFlow, store]);
}
