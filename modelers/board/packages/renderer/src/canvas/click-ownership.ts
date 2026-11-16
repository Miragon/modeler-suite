/**
 * Whose click and whose Backspace it is, beside an armed editor. Cut out of Canvas (board.tsx) for
 * its length, statement by statement: Canvas calls the hook where these lines stood, so React
 * registers the same hooks in the same order.
 */
import type { useStoreApi } from "@xyflow/react";
import { type MouseEvent as ReactMouseEvent, useCallback, useRef } from "react";

import { inArmedEditor } from "../arming/armed-editor.js";
import type { BoardFlowEdge, BoardFlowNode } from "../flow/flow-types.js";
import type { BoardContextValue } from "../runtime/board-context.js";

export type CanvasFlowStore = ReturnType<typeof useStoreApi<BoardFlowNode, BoardFlowEdge>>;

export interface ClickOwnership {
  onPress: (event: ReactMouseEvent) => void;
  onClickFirst: (event: ReactMouseEvent) => void;
  onClickLast: (event: ReactMouseEvent) => void;
  duringForeignClick: () => boolean;
  onBeforeDelete: () => Promise<boolean>;
  /** this click is not the board's: it began in the armed editor, or it is the tail of a drag */
  isForeignClick: (event: ReactMouseEvent) => boolean;
}

export function useClickOwnership(
  board: BoardContextValue,
  flowStore: CanvasFlowStore,
): ClickOwnership {
  // Whose click is it? Nothing stops a click inside the armed editor on its way up (model-node.tsx
  // says why), so the board's own handlers ask where it began. Not the board's are
  // - a click or double-click inside the armed editor, and a click whose press began there;
  // - a click on the pane whose press began anywhere else: the tail of a drag. The browser sends a
  //   click to the nearest common ancestor of press and release, which is the pane for a drag out
  //   of an editor that lives in a node, and a pane click disarms (measured: every such drag did).
  // React Flow selects and unselects in click handlers of its own (node wrapper, pane) that the
  // board cannot guard: the select changes it raises WHILE such a click is dispatched are dropped,
  // and the rectangle of a box selection, which those handlers hide first, is shown again.
  const press = useRef<{ target: EventTarget; inEditor: boolean } | null>(null);
  /** the last press on the board began inside the armed editor (kept after its click) */
  const lastPressInEditor = useRef(false);
  const notOurs = useRef<Event | null>(null);
  /** React Flow showed the rectangle of a box selection when that click began */
  const rectangleShown = useRef(false);
  /** scope "board": a press that holds Control or Command adds to the selection; React Flow's own key for it is off */
  const multiSelects = board.inputScope === "board";
  const onPress = useCallback(
    (event: ReactMouseEvent) => {
      // read off the press itself: no key listener on the page for it
      if (multiSelects)
        flowStore.setState({ multiSelectionActive: event.metaKey || event.ctrlKey });
      // the primary button only: no other press ends in a click
      if (event.button !== 0) return;
      press.current = { target: event.target, inEditor: inArmedEditor(event.target) };
      lastPressInEditor.current = press.current.inEditor;
    },
    [flowStore, multiSelects],
  );
  const onClickFirst = useCallback(
    (event: ReactMouseEvent) => {
      const pressed = press.current;
      // one press, one click: a click made by a key or by a script has no press of its own
      press.current = null;
      if (multiSelects)
        flowStore.setState({ multiSelectionActive: event.metaKey || event.ctrlKey });
      const { target } = event;
      const onPane = target instanceof Element && target.classList.contains("react-flow__pane");
      const editors = inArmedEditor(target) || pressed?.inEditor === true;
      const dragTail = onPane && pressed !== null && pressed.target !== target;
      notOurs.current = editors || dragTail ? event.nativeEvent : null;
      rectangleShown.current = flowStore.getState().nodesSelectionActive;
    },
    [flowStore, multiSelects],
  );
  const onClickLast = useCallback(
    (event: ReactMouseEvent) => {
      if (notOurs.current === event.nativeEvent && rectangleShown.current) {
        flowStore.setState({ nodesSelectionActive: true });
      }
    },
    [flowStore],
  );
  /** an event's phase is NONE again as soon as its dispatch is through: no flag to forget */
  const duringForeignClick = useCallback(
    (): boolean => notOurs.current !== null && notOurs.current.eventPhase !== Event.NONE,
    [],
  );
  // Whose Backspace is it? After a press inside the armed editor the keys are the editor's, also
  // when that press left the focus on <body>: a palette entry or a list entry has nothing focusable
  // under it, and the armed node's wrapper no longer catches the focus (board-flow.tsx,
  // ARMED_FIELDS). React Flow's delete key acts on <body>. The armed node is not deletable, but
  // another node or arrow that is selected would go (measured). "Inside the armed editor" is the
  // armed node's body AND the overlay layer (ARMED_EDITOR in board-arming.ts): an overlaid editor
  // lies outside its node, and counted by the node's body alone its presses were nobody's (measured:
  // Backspace after a press on its palette deleted the other selected node). The toolbar's delete
  // button is a press of its own, outside the editor, and passes
  const { armedId: armedNow } = board;
  const onBeforeDelete = useCallback(
    (): Promise<boolean> =>
      Promise.resolve(
        !(
          armedNow() !== null &&
          lastPressInEditor.current &&
          document.activeElement === document.body
        ),
      ),
    [armedNow],
  );
  const isForeignClick = (event: ReactMouseEvent): boolean => notOurs.current === event.nativeEvent;

  return {
    onPress,
    onClickFirst,
    onClickLast,
    duringForeignClick,
    onBeforeDelete,
    isForeignClick,
  };
}
