/**
 * A board's snapshot as a canvas draws it: the nodes in paint order with their parents resolved,
 * the arrows whose two ends exist. Total: whatever a peer, a merge or a hand edit left in the
 * document, the view holds only what can be drawn, and the rest stays in the document untouched.
 */
import {
  NODE_TYPES,
  type BoardEdge,
  type BoardNode,
  type BoardSnapshot,
  type BoardView,
  type Box,
  type EdgeAttrs,
  type NodeAttrs,
} from "./types.js";

const NODE_TYPE_SET: ReadonlySet<unknown> = new Set(NODE_TYPES);
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** an element of another shape (a newer build, a hand-edited file) is no node: it stays off the canvas */
export const isNodeAttrs = (
  attrs: Record<string, unknown>,
): attrs is Record<string, unknown> & NodeAttrs =>
  attrs.kind === "node" &&
  NODE_TYPE_SET.has(attrs.type) &&
  [attrs.x, attrs.y, attrs.width, attrs.height].every(isNumber) &&
  typeof attrs.z === "string";

export const isEdgeAttrs = (
  attrs: Record<string, unknown>,
): attrs is Record<string, unknown> & EdgeAttrs =>
  attrs.kind === "edge" && typeof attrs.source === "string" && typeof attrs.target === "string";

const order = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** the parent of every node: the group it names, where that is a node and closes no cycle */
function parents(
  elements: BoardSnapshot["elements"],
  nodeIds: ReadonlySet<string>,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const id of nodeIds) {
    const parent = elements[id]?.parent;
    if (typeof parent !== "string" || !nodeIds.has(parent)) continue;
    // Two people who moved two groups into each other at the same time: every node ON the cycle
    // loses its parent, on every peer alike; a node whose ancestors merely lead into a cycle
    // keeps its own.
    const seen = new Set<string>();
    let onCycle = false;
    for (
      let at: unknown = parent;
      typeof at === "string" && nodeIds.has(at) && !seen.has(at);
      at = elements[at]?.parent
    ) {
      if (at === id) {
        onCycle = true;
        break;
      }
      seen.add(at);
    }
    if (!onCycle) result.set(id, parent);
  }
  return result;
}

/**
 * The view of a snapshot. With the view of before, a node or an arrow that did not change keeps
 * its object, so a canvas that compares by identity redraws only what changed.
 */
export function projectBoard(snapshot: BoardSnapshot, previous?: BoardView): BoardView {
  const { elements } = snapshot;
  const ids = Object.keys(elements);
  const nodeIds = new Set(ids.filter((id) => isNodeAttrs(elements[id] ?? {})));
  const parentOf = parents(elements, nodeIds);

  const sorted = [...nodeIds].sort(
    (a, b) => order(String(elements[a]?.z ?? ""), String(elements[b]?.z ?? "")) || order(a, b),
  );
  const keptNodes = new Map(previous?.nodes.map((node) => [node.id, node]));
  const nodes: BoardNode[] = [];
  const placed = new Set<string>();
  const place = (id: string): void => {
    if (placed.has(id)) return;
    placed.add(id);
    const parentId = parentOf.get(id);
    // a parent comes before its children, whatever their z says
    if (parentId !== undefined) place(parentId);
    const attrs = elements[id] as Record<string, unknown> & NodeAttrs;
    const before = keptNodes.get(id);
    nodes.push(
      before && before.parentId === parentId && same(before.attrs, attrs)
        ? before
        : { id, attrs, parentId },
    );
  };
  for (const id of sorted) place(id);

  const keptEdges = new Map(previous?.edges.map((edge) => [edge.id, edge]));
  const edges: BoardEdge[] = [];
  for (const id of ids.sort(order)) {
    const attrs = elements[id] ?? {};
    // an arrow whose node was deleted meanwhile stays in the document and off the canvas
    if (!isEdgeAttrs(attrs) || !nodeIds.has(attrs.source) || !nodeIds.has(attrs.target)) continue;
    const before = keptEdges.get(id);
    edges.push(before && same(before.attrs, attrs) ? before : { id, attrs });
  }

  const meta = previous && same(previous.meta, snapshot.meta) ? previous.meta : snapshot.meta;
  return { nodes, edges, meta };
}

/** every node's box in board coordinates: the `x` and `y` of a child are relative to its parent */
export function absoluteBoxes(view: BoardView): Map<string, Box> {
  const boxes = new Map<string, Box>();
  // parents come first in the view
  for (const node of view.nodes) {
    const parent = node.parentId === undefined ? undefined : boxes.get(node.parentId);
    boxes.set(node.id, {
      x: node.attrs.x + (parent?.x ?? 0),
      y: node.attrs.y + (parent?.y ?? 0),
      width: node.attrs.width,
      height: node.attrs.height,
    });
  }
  return boxes;
}

/** one node's box in board coordinates; undefined for an id that is no node of the view */
export function absoluteBox(view: BoardView, id: string): Box | undefined {
  return absoluteBoxes(view).get(id);
}
