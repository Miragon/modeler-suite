import type { BoardEdge, BoardNode } from "@miragon/board-schema-model";
import type { Edge, Node } from "@xyflow/react";

/** `armed` is this client's own and never written to the board document */
export type BoardFlowNode = Node<{ element: BoardNode; armed: boolean }>;
/** a stored arrow carries its element; a derived arrow the relation it shows, and is stored nowhere */
export type BoardFlowEdge = Edge<{ element?: BoardEdge; rel?: string }>;

/** `node.dragHandle` of an armed model node: only its header moves it */
export const DRAG_HANDLE = ".board-node__header";
