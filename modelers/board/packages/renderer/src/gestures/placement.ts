import type { Point } from "@miragon/board-schema-model";
import { useReactFlow, useStoreApi } from "@xyflow/react";
import type { BoardFlowEdge, BoardFlowNode } from "../flow/flow-types.js";

// ── the board's centre, and selecting what was just added ────────────────────

let lastPlace: { x: number; y: number; count: number } | null = null;

/**
 * The middle of what the board shows, in board coordinates: where a new node goes that has no
 * place of its own (the toolbar, a paste). A second one added from the same view lands a step
 * down and to the right, so it does not hide the first.
 */
export function nextPlace(
  flow: { screenToFlowPosition(point: Point): Point },
  host: HTMLElement | null | undefined,
): Point {
  const rect = host?.getBoundingClientRect();
  const middle = flow.screenToFlowPosition(
    rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 },
  );
  const again =
    lastPlace !== null &&
    Math.abs(lastPlace.x - middle.x) < 1 &&
    Math.abs(lastPlace.y - middle.y) < 1;
  lastPlace = { ...middle, count: again && lastPlace ? lastPlace.count + 1 : 0 };
  const step = (lastPlace.count % 8) * 28;
  return { x: middle.x + step, y: middle.y + step };
}

/** what the add actions need of React Flow: where a new node goes, and a way to select it */
export function useBoardPlacement(): { centre(): Point; select(nodeId: string): void } {
  const flow = useReactFlow<BoardFlowNode, BoardFlowEdge>();
  const flowStore = useStoreApi<BoardFlowNode, BoardFlowEdge>();
  return {
    centre: () => nextPlace(flow, flowStore.getState().domNode),
    select(nodeId) {
      // the node reaches React Flow's store a commit or two after the board document has it
      const now = (): boolean => {
        const state = flowStore.getState();
        if (!state.nodeLookup.has(nodeId)) return false;
        // like a click on it: this node selected, every other node and arrow not
        state.addSelectedNodes([nodeId]);
        return true;
      };
      if (now()) return;
      const stop = flowStore.subscribe(() => {
        if (now()) stop();
      });
      setTimeout(stop, 2000);
    },
  };
}
