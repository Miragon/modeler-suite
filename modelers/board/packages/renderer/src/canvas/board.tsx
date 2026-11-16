/**
 * The board: <ReactFlow> in controlled mode on the board store, and every part an owner fills in
 * as a slot of its own. A slot is a lazily loaded module behind an error boundary (Slot), so a
 * module that fails to load or to render shows its error where it would be and nothing else stops.
 *
 * Shared file: later edits are additive only (a new node type, a new panel).
 */
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  type EdgeProps,
  type EdgeTypes,
  type IsValidConnection,
  type NodeProps,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
  type OnSelectionChangeFunc,
  ReactFlow,
  ReactFlowProvider,
  type ReactFlowState,
  useReactFlow,
  useStore,
  useStoreApi,
} from "@xyflow/react";
import {
  type ComponentType,
  lazy,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";

import { inArmedEditor } from "../arming/armed-editor.js";
import { NodeHandles, useBoard, useDerivedEdges } from "../flow/board-flow.js";
import type { BoardFlowEdge, BoardFlowNode } from "../flow/flow-types.js";
import { clientPoint } from "../geometry.js";
import {
  BoardProvider,
  type BoardRuntime,
  Slot,
  useBoardContext,
} from "../runtime/board-context.js";
import { useCanvasKeys } from "./canvas-keys.js";
import { useClickOwnership } from "./click-ownership.js";

type NodeComponent = ComponentType<NodeProps<BoardFlowNode>>;
type EdgeComponent = ComponentType<EdgeProps<BoardFlowEdge>>;
// what nodeTypes / edgeTypes take: a FUNCTION component (their props type fits no class component of ours)
type NodeFunction = (props: NodeProps<BoardFlowNode>) => ReactNode;
type EdgeFunction = (props: EdgeProps<BoardFlowEdge>) => ReactNode;

const ModelNode = lazy(() =>
  import("../nodes/model-node.js").then((module) => ({ default: module.ModelNode })),
);
const TextNode = lazy(() =>
  import("../nodes/text-node.js").then((module) => ({ default: module.TextNode })),
);
const ImageNode = lazy(() =>
  import("../nodes/image-node.js").then((module) => ({ default: module.ImageNode })),
);
const GroupNode = lazy(() =>
  import("../nodes/group-node.js").then((module) => ({ default: module.GroupNode })),
);
const ArrowEdge = lazy(() =>
  import("../edges/arrow-edge.js").then((module) => ({ default: module.ArrowEdge })),
);
const DerivedEdge = lazy(() =>
  import("../edges/derived-edge.js").then((module) => ({ default: module.DerivedEdge })),
);
const Toolbar = lazy(() => import("./toolbar.js").then((module) => ({ default: module.Toolbar })));
const BoardGestures = lazy(() =>
  import("./board-gestures.js").then((module) => ({ default: module.BoardGestures })),
);
const BoardPresenceLayer = lazy(() =>
  import("./board-presence.js").then((module) => ({ default: module.BoardPresenceLayer })),
);

function nodeSlot(name: string, Content: NodeComponent, model = false): NodeFunction {
  return function NodeSlot(props) {
    const { surfaceFailed } = useBoardContext();
    return (
      <>
        {/* Here and not in the lazily loaded content: React Flow measures a node's handles when its
            wrapper mounts, and handles that came later would not be found by any arrow (error008) */}
        <NodeHandles />
        {/* a model node whose frame failed will never register a surface: it counts as failed, not as pending */}
        <Slot
          name={`${name} ${props.id}`}
          onError={model ? () => surfaceFailed(props.id) : undefined}
        >
          <Content {...props} />
        </Slot>
      </>
    );
  };
}

function edgeSlot(name: string, Content: EdgeComponent): EdgeFunction {
  return function EdgeSlot(props) {
    return (
      <Slot name={`${name} ${props.id}`} silent>
        <Content {...props} />
      </Slot>
    );
  };
}

// module level: a new nodeTypes object or component identity per render would remount every node
const nodeTypes: NodeTypes = {
  model: nodeSlot("model node", ModelNode, true),
  text: nodeSlot("text node", TextNode),
  image: nodeSlot("image node", ImageNode),
  group: nodeSlot("group node", GroupNode),
};
const edgeTypes: EdgeTypes = {
  arrow: edgeSlot("arrow", ArrowEdge),
  derived: edgeSlot("derived arrow", DerivedEdge),
};

/** React Flow's own connect would draw an arrow from a node to itself, between two of its handles */
const joinsTwoNodes: IsValidConnection<BoardFlowEdge> = (connection) =>
  connection.source !== connection.target;

/** as soon as React Flow's instance is there: the bench installs its hooks, a host gets the instance */
function HooksBridge() {
  const board = useBoardContext();
  const flow = useReactFlow<BoardFlowNode, BoardFlowEdge>();
  const install = board.bench?.install;
  useEffect(() => install?.(board, flow), [install, board, flow]);
  useEffect(() => {
    // the instance changes its identity once the viewport exists: a host can set a view from then on
    if (!flow.viewportInitialized) return undefined;
    board.onFlow?.(flow);
    return () => board.onFlow?.(null);
  }, [board, flow]);
  return null;
}

const selectBoardElement = (state: ReactFlowState): HTMLDivElement | null => state.domNode;

/** the arm rules' listeners on the board's own element (board-arming.ts), as soon as React Flow has it */
function ArmGuards() {
  const { arming } = useBoardContext();
  const element = useStore(selectBoardElement);
  useEffect(() => (element ? arming.attach(element) : undefined), [arming, element]);
  return null;
}

function Canvas() {
  const board = useBoardContext();
  const { arm, counters, host, params, store, subscribeViewport } = board;
  const armedId = useSyncExternalStore(board.subscribeArmed, board.armedId);
  const flow = useBoard(store, armedId);
  const derived = useDerivedEdges(host, flow.view);
  const edges = useMemo(() => [...flow.edges, ...derived], [flow.edges, derived]);

  const flowStore = useStoreApi<BoardFlowNode, BoardFlowEdge>();
  const { onPress, onClickFirst, onClickLast, duringForeignClick, onBeforeDelete, isForeignClick } =
    useClickOwnership(board, flowStore);

  const ownKeys = board.inputScope === "board";
  const reactFlow = useReactFlow<BoardFlowNode, BoardFlowEdge>();
  const boardElement = useStore(selectBoardElement);
  useCanvasKeys(board, flowStore, reactFlow, boardElement);

  const { onNodesChange: applyNodes, onEdgesChange: applyEdges } = flow;
  const onNodesChange = useCallback<OnNodesChange<BoardFlowNode>>(
    (raised) => {
      const changes = duringForeignClick()
        ? raised.filter((change) => change.type !== "select")
        : raised;
      if (changes.length === 0) return;
      counters.nodeChanges += changes.length;
      // A resize tick is committed at once. Measured in Chromium: left to React's batching, a
      // NodeResizer drag raises "ResizeObserver loop completed with undelivered notifications" as
      // window error events (3 to 5 for 6 pointer moves, on every node type), which land in
      // hooks.log(); committed synchronously, none. Presumably the size of one tick reached the DOM
      // while React Flow's ResizeObserver was delivering the tick before (not looked into further).
      // The resizer's drag handler is a native listener, so no React lifecycle is running here.
      if (changes.some((change) => change.type === "dimensions" && change.resizing === true)) {
        flushSync(() => applyNodes(changes));
      } else applyNodes(changes);
    },
    [counters, applyNodes, duringForeignClick],
  );
  const onEdgesChange = useCallback<OnEdgesChange<BoardFlowEdge>>(
    (raised) => {
      const changes = duringForeignClick()
        ? raised.filter((change) => change.type !== "select")
        : raised;
      if (changes.length === 0) return;
      counters.edgeChanges += changes.length;
      applyEdges(changes);
    },
    [counters, applyEdges, duringForeignClick],
  );
  useEffect(
    () => subscribeViewport(() => void counters.viewportChanges++),
    [subscribeViewport, counters],
  );
  // an embedded board tells its host what is selected: nodes and stored arrows (a derived arrow is no element)
  const { onSelection } = board;
  const onSelectionChange = useCallback<OnSelectionChangeFunc<BoardFlowNode, BoardFlowEdge>>(
    ({ nodes: selectedNodes, edges: selectedEdges }) =>
      onSelection?.([
        ...selectedNodes.map((node) => node.id),
        ...selectedEdges.flatMap((edge) => (edge.data?.element ? [edge.id] : [])),
      ]),
    [onSelection],
  );

  return (
    <ReactFlow
      nodes={flow.nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={flow.onNodeDragStop}
      onConnect={flow.onConnect}
      isValidConnection={joinsTwoNodes}
      onDelete={flow.onDelete}
      onBeforeDelete={onBeforeDelete}
      {...(onSelection ? { onSelectionChange } : {})}
      // before any handler of React Flow: whose press, whose click (see above). Both press events,
      // since a pointerdown that is prevented has no mousedown and a second button has no pointerdown
      onPointerDownCapture={onPress}
      onMouseDownCapture={onPress}
      onClickCapture={onClickFirst}
      // and after all of them
      onClick={onClickLast}
      // a preview body is inert, so the double-click lands on the node's wrapper; inside the armed
      // editor a double-click is the editor's (a label, a cell) and arms nothing
      onNodeDoubleClick={(event, node) => {
        // the pointer is the anchor of the arm rule's zoom, in true screen px (native-geometry.ts)
        if (!inArmedEditor(event.target)) {
          void arm(node.id, { source: "pointer", point: clientPoint(event.nativeEvent) });
        }
      }}
      onPaneClick={(event) => {
        if (!isForeignClick(event)) void arm(null, { source: "pane" });
      }}
      connectionMode={ConnectionMode.Loose}
      minZoom={0.1}
      maxZoom={4}
      // the armed editor owns the double-click (label editing); it would zoom the board by 2
      zoomOnDoubleClick={false}
      // scope "board": the board answers its keys itself (above). React Flow keeps Shift for a box
      // selection: a key that alone does nothing
      {...(ownKeys
        ? {
            deleteKeyCode: null,
            multiSelectionKeyCode: null,
            panActivationKeyCode: null,
            zoomActivationKeyCode: null,
          }
        : { deleteKeyCode: ["Backspace", "Delete"] })}
      // the arrow head takes the edge's stroke from the stylesheet
      defaultMarkerColor={null}
      // true would unmount a node that leaves the viewport, and its engine with it
      onlyRenderVisibleElements={false}
      {...(params.viewport
        ? { defaultViewport: params.viewport }
        : { fitView: true, fitViewOptions: { padding: board.fitPadding } })}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} />
      <Slot name="Toolbar">
        <Toolbar />
      </Slot>
      {/* paste and drop of images, arrows dropped on a node's body, which group takes a dragged node:
          a slot of its own, so they do not go when the toolbar fails */}
      <Slot name="Board gestures" silent>
        <BoardGestures />
      </Slot>
      {/* the classes: a key or a wheel inside an overlaid editor is the editor's, as in an armed body */}
      {/* the other people on this board; nothing where the host has no presence */}
      <Slot name="Board presence" silent>
        <BoardPresenceLayer />
      </Slot>
      <div ref={board.setOverlayLayer} className="board-overlay-layer nodrag nopan nowheel nokey" />
      <ArmGuards />
      <HooksBridge />
    </ReactFlow>
  );
}

export function Board({ runtime }: { runtime: BoardRuntime }) {
  const SidePanel = runtime.bench?.SidePanel;
  return (
    <ReactFlowProvider>
      <BoardProvider runtime={runtime}>
        <div className="board-root" data-embedded={runtime.embedded}>
          <div className="board-root__canvas">
            <Canvas />
          </div>
          {/* the bench's view of the repository (its Files panel); a host has its own */}
          {SidePanel ? (
            <aside className="board-root__files">
              <Slot name="Files panel">
                <SidePanel />
              </Slot>
            </aside>
          ) : null}
        </div>
      </BoardProvider>
    </ReactFlowProvider>
  );
}
