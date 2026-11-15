/**
 * The board's gestures that belong to no single node, and what the toolbar's add actions share
 * with them:
 *
 * - while a node is dragged, the group that would take it shows so (the drop itself, with the
 *   membership, is one write of board-flow.tsx: board-actions.ts writeDrop);
 * - an arrow drawn from a handle and released on a node, not on one of its handles, ends at that
 *   node's nearest side (React Flow itself connects only within reach of a handle);
 * - an image file pasted or dropped onto the board becomes a repository file and an image node;
 * - the board zoom reaches the stylesheet, so that arrow heads, labels and handles keep a size on
 *   screen one can read and grab when the board is zoomed out.
 *
 * Everything listens: nothing here is in the way of a node's or an editor's own events. Each
 * write is one gesture of the board store at the END of the user's gesture.
 */
import type { Point } from "@miragon/board-schema-model";
import { useReactFlow, useStore, useStoreApi } from "@xyflow/react";
import { ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { BoardFlowEdge, BoardFlowNode } from "../flow/flow-types.js";
import { importImages } from "../gestures/images.js";
import { nextPlace } from "../gestures/placement.js";
import { setReceiving } from "../gestures/receiving.js";
import { useBoardContext } from "../runtime/board-context.js";
import {
  addArrow,
  arrowEndAt,
  formatBytes,
  groupAround,
  IMAGE_LIMIT_BYTES,
  IMAGE_TYPE_NAMES,
  sideOf,
} from "../store/actions.js";

/** how far out the board is, in three steps: what a handle's size on screen is styled against */
const viewOf = (zoom: number): string => (zoom >= 0.75 ? "near" : zoom >= 0.4 ? "mid" : "far");

// ── the component ────────────────────────────────────────────────────────────

/** an input, a text field or an armed editor under the event: a paste there is theirs */
const takesText = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest("input, textarea, [contenteditable], .nokey") !== null;
const carriesFiles = (event: DragEvent): boolean =>
  event.dataTransfer?.types.includes("Files") === true;

/** how near (in screen px) to a node an arrow's loose end still lands on it */
const ARROW_REACH_PX = 12;
/** the edge layers that scale their chrome against the board zoom (board.css, --board-zoom) */
const ZOOM_AWARE = ".react-flow__edges, .react-flow__edgelabel-renderer";

/** Renders nothing but the hint while a file is dragged over the page. Mounted once, inside <ReactFlow>. */
export function BoardGestures() {
  const board = useBoardContext();
  const { host: boardHost, store, subscribeViewport, inputScope } = board;
  const flow = useReactFlow<BoardFlowNode, BoardFlowEdge>();
  const flowStore = useStoreApi<BoardFlowNode, BoardFlowEdge>();
  const host = useStore((state) => state.domNode);
  const [dropping, setDropping] = useState(false);

  // groups: who would take the dragged node. Who took it is written with the drop itself, in one
  // gesture (board-flow.tsx: onNodeDragStop, board-actions.ts: writeDrop)
  useEffect(() => {
    let dragged = false;
    const stop = flowStore.subscribe((state, previous) => {
      if (state.nodes === previous.nodes) return;
      const now = new Set<string>();
      for (const node of state.nodes) if (node.dragging) now.add(node.id);
      if (now.size === 0 && !dragged) return;
      dragged = now.size > 0;
      if (!dragged) {
        setReceiving(new Set());
        return;
      }
      const view = store.getSnapshot();
      const takers = new Set<string>();
      for (const id of now) {
        const node = state.nodeLookup.get(id);
        if (!node || node.type === "group") continue;
        const { x, y } = node.internals.positionAbsolute;
        const centre = {
          x: x + (node.measured.width ?? 0) / 2,
          y: y + (node.measured.height ?? 0) / 2,
        };
        const group = groupAround(view, centre, node.parentId);
        if (group !== undefined && group !== node.parentId) takers.add(group);
      }
      setReceiving(takers);
    });
    return () => {
      stop();
      setReceiving(new Set());
    };
  }, [flowStore, store]);

  // arrows: a connection released on a node, away from its handles
  useEffect(
    () =>
      flowStore.subscribe((state, previous) => {
        const was = previous.connection;
        if (state.connection === was || !was.inProgress || state.connection.inProgress) return;
        // within reach of a handle React Flow decided itself: it connected (onConnect) or refused
        if (was.toHandle) return;
        const [x, y, zoom] = state.transform;
        // the pointer is kept in the board element's px
        const point = { x: (was.pointer.x - x) / zoom, y: (was.pointer.y - y) / zoom };
        const from = sideOf(was.fromHandle.id);
        const to = arrowEndAt(store.getSnapshot(), point, ARROW_REACH_PX / zoom, was.fromNode.id);
        if (from && to) addArrow(store, { node: was.fromNode.id, side: from }, to);
      }),
    [flowStore, store],
  );

  // The board zoom for the stylesheet, with no React render per zoom tick:
  // - as --board-zoom on the two edge layers, so arrow heads and labels keep a least size on
  //   screen. Not on the board's root: a custom property restyles everything below its element,
  //   and that would be every node and every editor on each tick.
  // - as data-board-view on the root, in three steps, for the handles: an attribute restyles only
  //   what a selector names, and it changes only when a step is crossed.
  useEffect(() => {
    if (!host) return;
    let applied = Number.NaN;
    const apply = (zoom: number): void => {
      if (zoom === applied) return;
      applied = zoom;
      for (const layer of host.querySelectorAll<HTMLElement>(ZOOM_AWARE)) {
        layer.style.setProperty("--board-zoom", String(zoom));
      }
      if (host.dataset.boardView !== viewOf(zoom)) host.dataset.boardView = viewOf(zoom);
    };
    apply(flowStore.getState().transform[2]);
    const stop = subscribeViewport((viewport) => apply(viewport.zoom));
    return () => {
      stop();
      delete host.dataset.boardView;
    };
  }, [host, flowStore, subscribeViewport]);

  // images: paste and drop
  useEffect(() => {
    const centre = (): Point => nextPlace(flow, host);
    // scope "board": what is aimed at a control beside the board is the page's
    const ours = (event: Event): boolean =>
      inputScope === "page" ||
      (event.target instanceof Node && host?.contains(event.target) === true);
    const onPaste = (event: ClipboardEvent): void => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0 || takesText(event.target) || !ours(event)) return;
      event.preventDefault();
      void importImages({ host: boardHost, store }, files, centre());
    };
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onDragOver = (event: DragEvent): void => {
      if (!carriesFiles(event) || !ours(event)) return;
      // without this the browser would leave the page for the dropped file
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setDropping(true);
      // dragleave fires for every element the pointer crosses: the hint goes when dragover stops coming
      clearTimeout(idle);
      idle = setTimeout(() => setDropping(false), 200);
    };
    const onDrop = (event: DragEvent): void => {
      if (!carriesFiles(event) || !ours(event)) return;
      event.preventDefault();
      clearTimeout(idle);
      setDropping(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      const onBoard = event.target instanceof Node && host?.contains(event.target) === true;
      const at = onBoard
        ? flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
        : centre();
      void importImages({ host: boardHost, store }, files, at);
    };
    document.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      clearTimeout(idle);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [flow, host, boardHost, store, inputScope]);

  if (!host || !dropping) return null;
  return createPortal(
    <div className="board-drop-hint" role="status">
      <div className="board-drop-hint__card">
        <ImagePlus aria-hidden />
        <strong>Drop to add an image</strong>
        <span>
          {IMAGE_TYPE_NAMES}, up to {formatBytes(IMAGE_LIMIT_BYTES)}. It becomes a file of the
          repository.
        </span>
      </div>
    </div>,
    host,
  );
}
