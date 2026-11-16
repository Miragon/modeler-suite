/**
 * What the board reads of React Flow's store past the public hooks: the arm rules, the overlay
 * surface, the canvas keys and the gestures take these fields by name. A store field is no part
 * of the library's public promise, so a bump of @xyflow/react that renames or reshapes one fails
 * here first, by its name, and not as a board that behaves differently. Of `connection` the
 * board reads what a connection in progress holds (an arrow dropped on a node's body), so one is
 * drawn here.
 */
import "@xyflow/react/dist/style.css";

import { attachedHost } from "@miragon/modeler-api/conformance";
import {
  ConnectionMode,
  type ConnectionState,
  Handle,
  type Node,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type ReactFlowState,
  useStoreApi,
} from "@xyflow/react";
import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FlowStoreApi = ReturnType<typeof useStoreApi>;

/** every field the board's source reads off the store's state, and what `typeof` says of it */
const READ_BY_THE_BOARD = {
  transform: "object",
  panZoom: "object",
  nodeLookup: "object",
  nodes: "object",
  edges: "object",
  domNode: "object",
  width: "number",
  height: "number",
  minZoom: "number",
  maxZoom: "number",
  fitViewQueued: "boolean",
  connection: "object",
  nodesSelectionActive: "boolean",
  multiSelectionActive: "boolean",
  addSelectedNodes: "function",
} as const satisfies Partial<Record<keyof ReactFlowState, string>>;

const NODES: Node[] = [
  { id: "outer", position: { x: 40, y: 60 }, data: { label: "outer" }, width: 320, height: 200 },
  { id: "inner", parentId: "outer", position: { x: 10, y: 20 }, data: { label: "inner" } },
];

function StoreProbe({ onStore }: { onStore: (store: FlowStoreApi) => void }) {
  const store = useStoreApi();
  useEffect(() => onStore(store), [onStore, store]);
  return null;
}

describe("the store of a mounted React Flow", () => {
  let host: HTMLElement;
  let root: Root;
  let store: FlowStoreApi;

  beforeEach(async () => {
    host = attachedHost();
    root = createRoot(host);
    let seen: FlowStoreApi | undefined;
    const onStore = (api: FlowStoreApi): void => {
      seen = api;
    };
    root.render(
      <ReactFlowProvider>
        <ReactFlow defaultNodes={NODES} minZoom={0.1} maxZoom={4} />
        <StoreProbe onStore={onStore} />
      </ReactFlowProvider>,
    );
    store = await vi.waitFor(() => {
      const state = seen?.getState();
      if (!seen || !state?.panZoom || state.nodeLookup.get("inner")?.measured.width === undefined) {
        throw new Error("React Flow has not measured its nodes yet");
      }
      return seen;
    });
  });

  afterEach(() => {
    root.unmount();
    host.parentElement?.remove();
  });

  it("has every field the board reads, of the kind the board reads", () => {
    const state = store.getState() as unknown as Record<string, unknown>;
    const found = Object.fromEntries(
      Object.keys(READ_BY_THE_BOARD).map((name) => [name, typeof state[name]]),
    );
    expect(found).toEqual(READ_BY_THE_BOARD);
  });

  it("holds the view as [x, y, zoom] and writes a new array before setViewport returns", () => {
    const before = store.getState().transform;
    expect(before).toEqual([0, 0, 1]);
    const written: unknown[] = [];
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.transform !== previous.transform) written.push(state.transform);
    });
    const { panZoom } = store.getState();
    expect(panZoom?.setViewport).toBeTypeOf("function");
    void panZoom?.setViewport({ x: 30, y: -20, zoom: 0.5 });
    unsubscribe();
    expect(store.getState().transform).toEqual([30, -20, 0.5]);
    expect(store.getState().transform).not.toBe(before);
    expect(written).toEqual([[30, -20, 0.5]]);
  });

  it("knows the board's element, its size and the zoom range it was given", () => {
    const { domNode, width, height, minZoom, maxZoom } = store.getState();
    expect(domNode).toBe(host.querySelector(".react-flow"));
    expect([width, height]).toEqual([800, 600]);
    expect([minZoom, maxZoom]).toEqual([0.1, 4]);
  });

  it("keeps every node with its absolute position and its measured size", () => {
    const { nodeLookup } = store.getState();
    expect(nodeLookup).toBeInstanceOf(Map);
    expect(nodeLookup.get("outer")?.internals.positionAbsolute).toEqual({ x: 40, y: 60 });
    expect(nodeLookup.get("inner")?.internals.positionAbsolute).toEqual({ x: 50, y: 80 });
    expect(nodeLookup.get("outer")?.measured).toEqual({ width: 320, height: 200 });
    const measured = nodeLookup.get("inner")?.measured;
    expect(measured?.width).toBeGreaterThan(0);
    expect(measured?.height).toBeGreaterThan(0);
  });

  it("starts at rest: no fit queued, no connection, no selection, and takes both flags", () => {
    const state = store.getState();
    expect(state.fitViewQueued).toBe(false);
    expect(state.connection.inProgress).toBe(false);
    expect(state.nodesSelectionActive).toBe(false);
    expect(state.multiSelectionActive).toBe(false);
    store.setState({ nodesSelectionActive: true, multiSelectionActive: true });
    expect(store.getState().nodesSelectionActive).toBe(true);
    expect(store.getState().multiSelectionActive).toBe(true);
  });

  it("selects a node by its id", async () => {
    const selected = (): string[] =>
      store
        .getState()
        .nodes.filter((node) => node.selected)
        .map((node) => node.id);
    expect(selected()).toEqual([]);
    store.getState().addSelectedNodes(["inner"]);
    await expect.poll(selected).toEqual(["inner"]);
    expect(store.getState().edges).toEqual([]);
  });
});

/** a handle per side that is named after its side and may be either end, as the board's nodes have them */
function SidedNode() {
  return (
    <>
      <Handle id="left" type="source" position={Position.Left} />
      <Handle id="right" type="source" position={Position.Right} />
    </>
  );
}

// module level: a new object per render would remount the nodes
const SIDED_TYPES = { sided: SidedNode };

const SIDED: Node[] = [
  { id: "from", type: "sided", position: { x: 40, y: 60 }, data: {}, width: 160, height: 80 },
  { id: "to", type: "sided", position: { x: 400, y: 300 }, data: {}, width: 160, height: 80 },
];

describe("a connection that is being drawn", () => {
  let host: HTMLElement;
  let root: Root;
  let store: FlowStoreApi;

  beforeEach(async () => {
    host = attachedHost();
    root = createRoot(host);
    let seen: FlowStoreApi | undefined;
    const onStore = (api: FlowStoreApi): void => {
      seen = api;
    };
    root.render(
      <ReactFlowProvider>
        <ReactFlow
          defaultNodes={SIDED}
          nodeTypes={SIDED_TYPES}
          connectionMode={ConnectionMode.Loose}
          minZoom={0.1}
          maxZoom={4}
        />
        <StoreProbe onStore={onStore} />
      </ReactFlowProvider>,
    );
    store = await vi.waitFor(() => {
      const state = seen?.getState();
      // a connection ends at a handle only once React Flow has measured the node's handles
      if (!seen || !state?.panZoom || !state.nodeLookup.get("to")?.internals.handleBounds) {
        throw new Error("React Flow has not measured its handles yet");
      }
      return seen;
    });
  });

  afterEach(() => {
    root.unmount();
    host.parentElement?.remove();
  });

  it("holds the pointer in the board element's px, the handle and node it began at and the handle it is over, up to the update that ends it", () => {
    // zoomed and panned: the pointer is kept in px of the board's element, not in flow units
    void store.getState().panZoom?.setViewport({ x: 30, y: -20, zoom: 0.5 });
    const board = host.querySelector(".react-flow")?.getBoundingClientRect();
    if (!board) throw new Error("React Flow has no element");
    const handle = (nodeId: string, side: string): Element => {
      const found = host.querySelector(
        `.react-flow__node[data-id="${nodeId}"] .react-flow__handle[data-handleid="${side}"]`,
      );
      if (!found) throw new Error(`the node ${nodeId} has no handle ${side}`);
      return found;
    };
    const centre = (element: Element): { clientX: number; clientY: number } => {
      const box = element.getBoundingClientRect();
      return { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    };
    // a point of the bare pane, out of reach of every handle and of the edges that pan the board
    const bare = { clientX: board.left + 700, clientY: board.top + 80 };
    const mouse = { bubbles: true, cancelable: true, view: window, button: 0 };
    const moveTo = (to: { clientX: number; clientY: number }): void =>
      void document.dispatchEvent(new MouseEvent("mousemove", { ...mouse, ...to, buttons: 1 }));
    const inProgress = (): Extract<ConnectionState, { inProgress: true }> => {
      const { connection } = store.getState();
      if (!connection.inProgress) throw new Error("no connection is in progress");
      return connection;
    };
    // what the board reads off the update that ends a connection: the connection as it was
    const ended: ConnectionState[] = [];
    const unsubscribe = store.subscribe((state, previous) => {
      if (previous.connection.inProgress && !state.connection.inProgress) {
        ended.push(previous.connection);
      }
    });

    const from = handle("from", "right");
    from.dispatchEvent(new MouseEvent("mousedown", { ...mouse, ...centre(from), buttons: 1 }));
    moveTo(bare);
    const pointer = { x: bare.clientX - board.left, y: bare.clientY - board.top };
    expect(inProgress().pointer).toEqual(pointer);
    expect(inProgress().fromHandle.id).toBe("right");
    expect(inProgress().fromNode.id).toBe("from");
    // the board asks only whether there is one
    expect(inProgress().toHandle).toBeFalsy();

    moveTo(centre(handle("to", "left")));
    expect(inProgress().toHandle).toMatchObject({ id: "left", nodeId: "to" });

    moveTo(bare);
    document.dispatchEvent(new MouseEvent("mouseup", { ...mouse, ...bare }));
    unsubscribe();
    expect(store.getState().connection.inProgress).toBe(false);
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({
      inProgress: true,
      pointer,
      fromHandle: { id: "right" },
      fromNode: { id: "from" },
    });
    expect(ended[0]?.toHandle).toBeFalsy();
  });
});
