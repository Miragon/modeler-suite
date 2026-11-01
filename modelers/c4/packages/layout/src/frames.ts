import type { Box } from "@miragon/c4-schema-model";
import type { ClusterKey, ClusterTree } from "./clusters.js";
import { unionOf } from "./geometry.js";

/** Structurizr's 60 px padding × 8/15 (SPEC 4.3). */
export const FRAME_PADDING = 32;
export const CAPTION_BAND = 40;
export const EMPTY_BOUNDARY_SIZE = { width: 320, height: 200 } as const;

export interface Frame {
  /** What the frame is drawn around, before the padding; undefined for a leaf boundary. */
  readonly content: Box | undefined;
  readonly frame: Box;
}

/**
 * Derived on every render, never stored: the members' union plus the padding and the caption band,
 * nested frames around inner ones. A leaf boundary is the box placed for its key.
 */
export function deriveFrames(
  tree: ClusterTree,
  boxes: ReadonlyMap<string, Box>,
): Map<ClusterKey, Frame> {
  const frames = new Map<ClusterKey, Frame>();
  for (const key of tree.bottomUp) {
    const cluster = tree.clusters.get(key);
    if (!cluster?.present) continue;
    if (cluster.leaf) {
      const box = boxes.get(key);
      if (box) frames.set(key, { content: undefined, frame: box });
      continue;
    }
    const content = unionOf([
      ...cluster.members.map((id) => boxes.get(id)),
      ...cluster.elements.map((id) => boxes.get(id)),
      ...cluster.children.map((child) => frames.get(child)?.frame),
    ]);
    if (content) frames.set(key, { content, frame: padded(content) });
  }
  return frames;
}

export function padded(content: Box): Box {
  return {
    x: content.x - FRAME_PADDING,
    y: content.y - FRAME_PADDING,
    width: content.width + 2 * FRAME_PADDING,
    height: content.height + 2 * FRAME_PADDING + CAPTION_BAND,
  };
}
