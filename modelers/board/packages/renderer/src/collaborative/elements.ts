/** A part of the contract factory (collaborative.tsx): the elements surface of a board. */
import { absoluteBoxes, type Box, type Side } from "@miragon/board-schema-model";
import type { ElementBounds, ElementInfo } from "@miragon/modeler-api";

import type { BoardStore } from "../store/board-store.js";
import type { CollaborativeBoard } from "./api.js";
import type { SelectionMirror } from "./selection.js";
import type { BoardSession, ViewControl } from "./view.js";

/** the first line of a note's Markdown without its marks: what a host lists the element under */
export function firstLine(text: string | undefined): string | undefined {
  const line = text
    ?.split("\n")
    .map((one) => one.replace(/^[#>*\-\s]+/, "").trim())
    .find((one) => one !== "");
  return line === undefined || line === "" ? undefined : line;
}

/** where an arrow leaves or reaches a node: the middle of the named side, the node's middle without one */
export function endPoint(box: Box, side: Side | undefined): { x: number; y: number } {
  const [midX, midY] = [box.x + box.width / 2, box.y + box.height / 2];
  if (side === "top") return { x: midX, y: box.y };
  if (side === "bottom") return { x: midX, y: box.y + box.height };
  if (side === "left") return { x: box.x, y: midY };
  if (side === "right") return { x: box.x + box.width, y: midY };
  return { x: midX, y: midY };
}

export function createElementsSurface(
  session: Pick<BoardSession, "destroyed" | "flow">,
  store: BoardStore,
  mirror: SelectionMirror,
  view: Pick<ViewControl, "bringIntoView">,
): CollaborativeBoard["elements"] {
  const { selected, selectionListeners, onCanvas, setSelection } = mirror;
  const { bringIntoView } = view;
  // ── the elements (optional surface): nodes and arrows under the ids of the board file ──
  const boundsOf = (id: string): ElementBounds | undefined => {
    const snapshot = store.getSnapshot();
    const boxes = absoluteBoxes(snapshot);
    const node = boxes.get(id);
    if (node) return { x: node.x, y: node.y, width: node.width, height: node.height };
    const arrow = snapshot.edges.find((edge) => edge.id === id);
    const [from, to] = [boxes.get(arrow?.attrs.source ?? ""), boxes.get(arrow?.attrs.target ?? "")];
    if (!arrow || !from || !to) return undefined;
    // the box around its two ends: both lie on their nodes, so the content box holds it
    const [a, b] = [
      endPoint(from, arrow.attrs.sourceHandle),
      endPoint(to, arrow.attrs.targetHandle),
    ];
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
  };
  const elements: CollaborativeBoard["elements"] = {
    list(): ElementInfo[] {
      const snapshot = store.getSnapshot();
      const named = (id: string, name: string | undefined): ElementInfo =>
        name === undefined ? { id } : { id, name };
      return [
        ...snapshot.nodes.map((node) =>
          named(
            node.id,
            node.attrs.type === "text" || node.attrs.type === "group"
              ? firstLine(node.attrs.text)
              : node.attrs.file,
          ),
        ),
        ...snapshot.edges.map((edge) => named(edge.id, firstLine(edge.attrs.label))),
      ];
    },
    reveal(id) {
      if (session.destroyed || !onCanvas().has(id)) return false;
      const select = <T extends { id: string; selected?: boolean }>(items: T[]): T[] =>
        items.map((item) =>
          Boolean(item.selected) === (item.id === id)
            ? item
            : { ...item, selected: item.id === id },
        );
      if (session.flow) {
        // through React Flow's own change path: the board's state follows as after a click
        void session.flow.setNodes(select);
        void session.flow.setEdges(select);
        const box = boundsOf(id);
        if (box) bringIntoView(box);
      }
      // at once, not when React Flow reports it: a host reads selection() right after
      setSelection([id]);
      return true;
    },
    selection() {
      const known = onCanvas();
      return selected().filter((id) => known.has(id));
    },
    onSelection(listener) {
      selectionListeners.add(listener);
      return () => void selectionListeners.delete(listener);
    },
    bounds: boundsOf,
  };
  return elements;
}
