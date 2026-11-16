/**
 * The board document in React Flow's controlled mode: the document is the model, React state is
 * the view of it. Exactly one path reads the document into React state, and the document is
 * written only at the end of a gesture, never from a measurement or a selection (sync.md 4.4).
 */
import {
  absoluteBox,
  type BoardView,
  type Box,
  type Point,
  type Side,
  SIDES,
} from "@miragon/board-schema-model";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Handle,
  MarkerType,
  type OnConnect,
  type OnDelete,
  type OnEdgesChange,
  type OnNodeDrag,
  type OnNodesChange,
  Position,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { referencesOf } from "../host/defaults.js";
import type { BoardHost } from "../host/types.js";
import { useBoardContext } from "../runtime/board-context.js";
import { writeDrop, writeRemoval } from "../store/actions.js";
import { type BoardStore, newId } from "../store/board-store.js";
import { derivedArrows } from "./derived-arrows.js";
import { type BoardFlowEdge, type BoardFlowNode, DRAG_HANDLE } from "./flow-types.js";

const POSITIONS: Readonly<Record<Side, Position>> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/**
 * The four handles of every node, one per side. board.tsx renders them as direct children of the
 * node wrapper, next to the node type's content (a handle inside a scaled subtree is measured
 * wrong, react-flow.md 7.4). All are sources: the board connects in ConnectionMode.Loose, where
 * any handle can be either end.
 */
export function NodeHandles() {
  return SIDES.map((side) => (
    <Handle key={side} id={side} type="source" position={POSITIONS[side]} />
  ));
}

/**
 * What an armed node needs on the NODE (react-flow.md 3.6): the header as the only drag handle, no
 * delete by Backspace, and a wrapper that cannot take the focus. Focusable (React Flow's default,
 * tabindex 0), the wrapper got the focus of every press on a part of the editor that is not
 * focusable itself: dmn-js closes a list as soon as the focus moves outside it, before the mouse is
 * released, so no entry could be picked; and diagram-js hands the canvas the focus back only when it
 * fell to <body> (Canvas.restoreFocus). `nokey` stays for a wrapper that is focused by script.
 */
const ARMED_FIELDS = {
  dragHandle: DRAG_HANDLE,
  deletable: false,
  focusable: false,
  className: "nokey",
} as const;

/** what React Flow owns of a node and the document does not */
const localOf = (node: BoardFlowNode | undefined): Partial<BoardFlowNode> =>
  node
    ? {
        ...(node.selected !== undefined ? { selected: node.selected } : {}),
        ...(node.measured ? { measured: node.measured } : {}),
        // a node the user is dragging or resizing keeps the geometry of the gesture: its end writes the document
        ...(node.dragging ? { dragging: true, position: node.position } : {}),
        ...(node.resizing
          ? { resizing: true, position: node.position, width: node.width, height: node.height }
          : {}),
      }
    : {};

function toFlowNodes(
  view: BoardView,
  previous: readonly BoardFlowNode[],
  armedId: string | null,
  justArmed: boolean,
): BoardFlowNode[] {
  const before = new Map(previous.map((node) => [node.id, node]));
  let changed = view.nodes.length !== previous.length;
  const next = view.nodes.map((element, index) => {
    const old = before.get(element.id);
    const armed = element.id === armedId && element.attrs.type === "model";
    // arming unselects every other node: one left selected is deleted by a Backspace typed with the
    // focus on <body> (react-flow.md 3.6, item 9)
    const unselect = justArmed && !armed && old?.selected === true;
    // the same element object (projectBoard keeps it) at the same place: the same node object,
    // which React Flow and a memoized node component skip
    if (
      old &&
      old.data.element === element &&
      old.data.armed === armed &&
      previous[index] === old &&
      !unselect
    ) {
      return old;
    }
    changed = true;
    const { attrs, parentId } = element;
    return {
      id: element.id,
      type: attrs.type,
      position: { x: attrs.x, y: attrs.y },
      width: attrs.width,
      height: attrs.height,
      ...(parentId !== undefined ? { parentId } : {}),
      data: { element, armed },
      ...localOf(old),
      ...(armed ? ARMED_FIELDS : {}),
      ...(armed && justArmed ? { selected: true } : {}),
      ...(unselect ? { selected: false } : {}),
    } satisfies BoardFlowNode;
  });
  return changed ? next : (previous as BoardFlowNode[]);
}

function toFlowEdges(
  view: BoardView,
  previous: readonly BoardFlowEdge[],
  justArmed: boolean,
): BoardFlowEdge[] {
  const before = new Map(previous.map((edge) => [edge.id, edge]));
  let changed = view.edges.length !== previous.length;
  const next = view.edges.map((element, index) => {
    const old = before.get(element.id);
    const unselect = justArmed && old?.selected === true;
    if (old && old.data?.element === element && previous[index] === old && !unselect) return old;
    changed = true;
    const { attrs } = element;
    return {
      id: element.id,
      type: "arrow",
      source: attrs.source,
      target: attrs.target,
      sourceHandle: attrs.sourceHandle ?? null,
      targetHandle: attrs.targetHandle ?? null,
      markerEnd: { type: MarkerType.ArrowClosed },
      ...(attrs.label !== undefined ? { label: attrs.label } : {}),
      data: { element },
      ...(old?.selected !== undefined && !unselect ? { selected: old.selected } : {}),
    } satisfies BoardFlowEdge;
  });
  return changed ? next : (previous as BoardFlowEdge[]);
}

export interface BoardFlow {
  nodes: BoardFlowNode[];
  /** the stored arrows; the derived ones come from useDerivedEdges */
  edges: BoardFlowEdge[];
  view: BoardView;
  onNodesChange: OnNodesChange<BoardFlowNode>;
  onEdgesChange: OnEdgesChange<BoardFlowEdge>;
  /** the end of a node drag AND of a drag of a box selection's rectangle (React Flow calls it for both) */
  onNodeDragStop: OnNodeDrag<BoardFlowNode>;
  onConnect: OnConnect;
  onDelete: OnDelete<BoardFlowNode, BoardFlowEdge>;
}

/** arrow-key moves of the selected nodes rest this long before they are written, as one gesture */
const KEY_MOVE_REST_MS = 400;
/**
 * The moves that wait, by node id, on an object without a prototype: a peer's live document can
 * hold any id, and on a plain object the id `__proto__` would set the prototype and lose its move.
 */
const noMoves = (): Record<string, Point> => Object.create(null) as Record<string, Point>;

export function useBoard(store: BoardStore, armedId: string | null): BoardFlow {
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [nodes, setNodes] = useState<BoardFlowNode[]>(() =>
    toFlowNodes(view, [], armedId, armedId !== null),
  );
  const [edges, setEdges] = useState<BoardFlowEdge[]>(() => toFlowEdges(view, [], false));
  const armedBefore = useRef(armedId);
  // document (and arming) → React state: the ONLY effect between the two, and it never writes the document.
  // A layout effect: the arm rules disarm a node synchronously before a board zoom (flushSync in
  // board-arming.ts), and a state set in a layout effect is rendered inside that same flush, where
  // one set in a passive effect waits for a later task
  useLayoutEffect(() => {
    const justArmed = armedId !== null && armedId !== armedBefore.current;
    armedBefore.current = armedId;
    setNodes((previous) => toFlowNodes(view, previous, armedId, justArmed));
    setEdges((previous) => toFlowEdges(view, previous, justArmed));
  }, [view, armedId]);

  // React state → document: the end of a gesture, in one transaction. Moves that ended and are not
  // written yet wait here: a drag's are written at once by its stop handler, an arrow-key move has
  // no such handler and is written once the keys rest
  const ended = useRef<{ positions: Record<string, Point>; timer?: ReturnType<typeof setTimeout> }>(
    { positions: noMoves() },
  );
  const writeMoves = useCallback(
    (also: readonly BoardFlowNode[] = []): void => {
      const pending = ended.current;
      clearTimeout(pending.timer);
      const positions = {
        ...pending.positions,
        ...Object.fromEntries(also.map((node) => [node.id, node.position])),
      };
      pending.positions = noMoves();
      // where the nodes are and whose they are (a node dropped into a group joins it), together
      if (Object.keys(positions).length > 0) writeDrop(store, positions);
    },
    [store],
  );
  useEffect(() => {
    const pending = ended.current;
    return () => clearTimeout(pending.timer);
  }, []);
  // An import replaces the document the waiting moves were made on: they are given up, and their
  // nodes stand where the document has them again. Without that the canvas would show a place no
  // file holds, and the next arrow key would write it after all
  const dropMoves = useCallback((): void => {
    const pending = ended.current;
    clearTimeout(pending.timer);
    const waiting = new Set(Object.keys(pending.positions));
    pending.positions = noMoves();
    if (waiting.size === 0) return;
    setNodes((previous) =>
      previous.map((node) => {
        const { x, y } = node.data.element.attrs;
        return waiting.has(node.id) ? { ...node, position: { x, y } } : node;
      }),
    );
  }, []);
  // whoever mounted the board ends what waits here: an import drops it, a destroy writes it
  const { onHeldMoves } = useBoardContext();
  useEffect(() => {
    onHeldMoves?.({ drop: dropMoves, write: () => writeMoves() });
    return () => onHeldMoves?.(null);
  }, [onHeldMoves, dropMoves, writeMoves]);

  // React Flow's own changes stay in React state: drag frames, selection, measured sizes
  const onNodesChange = useCallback<OnNodesChange<BoardFlowNode>>(
    (changes) => {
      setNodes((previous) => applyNodeChanges(changes, previous));
      // `dragging: false` is the LAST position of a move: the end of a drag (its stop handler
      // follows in the same task) or an arrow-key step, after which nothing follows. A drag's
      // ticks say `true`, a resize's positions say nothing
      const pending = ended.current;
      let moved = false;
      for (const change of changes) {
        if (change.type !== "position" || change.dragging !== false || !change.position) continue;
        pending.positions[change.id] = change.position;
        moved = true;
      }
      if (!moved) return;
      clearTimeout(pending.timer);
      pending.timer = setTimeout(writeMoves, KEY_MOVE_REST_MS);
    },
    [writeMoves],
  );
  const onEdgesChange = useCallback<OnEdgesChange<BoardFlowEdge>>(
    (changes) => setEdges((previous) => applyEdgeChanges(changes, previous)),
    [],
  );

  const onNodeDragStop = useCallback<OnNodeDrag<BoardFlowNode>>(
    (_event, _node, dragged) => writeMoves(dragged),
    [writeMoves],
  );
  const onConnect = useCallback<OnConnect>(
    ({ source, target, sourceHandle, targetHandle }) => {
      const side = (handle: string | null): Side | undefined => SIDES.find((one) => one === handle);
      const [from, to] = [side(sourceHandle), side(targetHandle)];
      store.gesture((tx) =>
        tx.create(newId("e"), {
          kind: "edge",
          source,
          target,
          ...(from ? { sourceHandle: from } : {}),
          ...(to ? { targetHandle: to } : {}),
        }),
      );
    },
    [store],
  );
  const onDelete = useCallback<OnDelete<BoardFlowNode, BoardFlowEdge>>(
    ({ nodes: removedNodes, edges: removedEdges }) =>
      writeRemoval(
        store,
        removedNodes.map((node) => node.id),
        // a derived arrow is no element: it goes when the model's text says so
        removedEdges.flatMap((edge) => (edge.data?.element ? [edge.id] : [])),
      ),
    [store],
  );
  return {
    nodes,
    edges,
    view,
    onNodesChange,
    onEdgesChange,
    onNodeDragStop,
    onConnect,
    onDelete,
  };
}

const centre = (box: Box): { x: number; y: number } => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

/** the two sides that face each other, for an arrow nobody drew */
function facingSides(from: Box, to: Box): { sourceHandle: Side; targetHandle: Side } {
  const [a, b] = [centre(from), centre(to)];
  if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
    return b.x >= a.x
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" };
  }
  return b.y >= a.y
    ? { sourceHandle: "bottom", targetHandle: "top" }
    : { sourceHandle: "top", targetHandle: "bottom" };
}

/**
 * The derived arrows of the board (derived-arrows.ts): recomputed from the references the host
 * lists whenever that list changed, and from the node positions. Never stored.
 */
export function useDerivedEdges(host: BoardHost, view: BoardView): BoardFlowEdge[] {
  const references = referencesOf(host);
  const listed = useSyncExternalStore(references.onChange, references.list);
  return useMemo(() => {
    const models = view.nodes.map((node) => ({ id: node.id, file: node.attrs.file }));
    return derivedArrows(listed, models).flatMap((arrow) => {
      const [from, to] = [absoluteBox(view, arrow.source), absoluteBox(view, arrow.target)];
      if (!from || !to) return [];
      return [
        {
          id: arrow.id,
          type: "derived",
          source: arrow.source,
          target: arrow.target,
          ...facingSides(from, to),
          markerEnd: { type: MarkerType.ArrowClosed },
          selectable: false,
          deletable: false,
          focusable: false,
          data: { rel: arrow.rel },
        } satisfies BoardFlowEdge,
      ];
    });
  }, [listed, view]);
}
