/**
 * Where a node is armed, for the arm rules at work (board-arming.ts): read off React Flow's store
 * and the screen.
 */
import type { Point } from "@miragon/board-schema-model";

import { screenRect } from "../geometry.js";
import { type ArmRuleSet, armViewport } from "./arm-rules.js";
import type { FlowStore } from "./arming-api.js";
import type { ArmAnchor, Viewport } from "./types.js";

export function armPlacement(
  flowStore: FlowStore,
  viewport: () => Viewport,
  rulesOf: (nodeId: string) => ArmRuleSet,
): (nodeId: string, point: Point | undefined, anchorKind: ArmAnchor) => Viewport | null {
  /**
   * The viewport `nodeId` is armed at, null while the board or the node is not measured. True
   * screen geometry (native-geometry.ts): the board's viewport is in real px, also while the
   * `shim` strategy gives another node's editor a virtual space. `anchorKind` is the arming's,
   * also in a look that has no pointer any more (`point` undefined).
   */
  const placement = (
    nodeId: string,
    point: Point | undefined,
    anchorKind: ArmAnchor,
  ): Viewport | null => {
    const state = flowStore.getState();
    const node = state.nodeLookup.get(nodeId);
    const width = node?.measured.width ?? node?.width ?? 0;
    const height = node?.measured.height ?? node?.height ?? 0;
    if (
      !node ||
      !state.panZoom ||
      !state.domNode ||
      !(width > 0) ||
      !(height > 0) ||
      !(state.width > 0)
    )
      return null;
    const now = viewport();
    const frame = screenRect(state.domNode);
    // clear of the toolbar: the box a node may use begins under the toolbar's band. The band is the
    // same before and after the arming: the toolbar's Done control keeps one box in both states
    const toolbar = state.domNode.querySelector(".board-toolbar");
    const band = toolbar ? Math.max(0, screenRect(toolbar).bottom - frame.top) : 0;
    const { x, y } = node.internals.positionAbsolute;
    return armViewport({
      viewport: now,
      node: { x, y, width, height },
      box: { x: 0, y: band, width: state.width, height: state.height - band },
      anchor: point
        ? { x: point.x - frame.left, y: point.y - frame.top }
        : { x: now.x + (x + width / 2) * now.zoom, y: now.y + (y + height / 2) * now.zoom },
      anchorKind,
      rule: rulesOf(nodeId).armzoom,
    });
  };
  return placement;
}
