import type { Box, ElementId, ViewMembers } from "@miragon/c4-schema-model";
import { clusterTree, type ClusterKey, type ClusterTree } from "./clusters.js";
import { deriveFrames } from "./frames.js";
import { overlaps } from "./geometry.js";

export interface ViewFrame {
  readonly box: Box;
  /** The view's elements outside the frame whose boxes the frame overlaps, in view order. */
  readonly intruders: readonly ElementId[];
}

export interface ViewFrames {
  readonly boundaries: ReadonlyMap<ElementId, ViewFrame>;
  /** By `groupKey(scopeId, path)`, as in `ViewGeometry.groups`. */
  readonly groups: ReadonlyMap<string, ViewFrame>;
}

/**
 * The frames `layoutView` would derive around `boxes`, without laying anything out (SPEC 4.3): the
 * live picture of a drag, cheap enough for every pointer move. A boundary that frames nothing drawn
 * keeps its box from `leafBoundaries`.
 */
export function viewFrames(
  members: ViewMembers,
  boxes: ReadonlyMap<ElementId, Box>,
  leafBoundaries: ReadonlyMap<ElementId, Box> = new Map(),
): ViewFrames {
  const tree = clusterTree(members);
  const input = new Map<string, Box>(boxes);
  for (const cluster of tree.clusters.values()) {
    const leafBox = cluster.leaf ? leafBoundaries.get(cluster.frameKey) : undefined;
    if (leafBox) input.set(cluster.key, leafBox);
  }
  const frames = deriveFrames(tree, input);
  const elements = [...new Set(members.elements)];
  const boundaries = new Map<ElementId, ViewFrame>();
  const groups = new Map<string, ViewFrame>();
  for (const cluster of tree.clusters.values()) {
    const box = frames.get(cluster.key)?.frame;
    if (!box) continue;
    const framed = framedElements(tree, cluster.key);
    const intruders = elements.filter((id) => {
      const element = boxes.get(id);
      return element !== undefined && !framed.has(id) && overlaps(box, element);
    });
    (cluster.kind === "boundary" ? boundaries : groups).set(cluster.frameKey, { box, intruders });
  }
  return { boundaries, groups };
}

/** The elements a frame holds at any depth. */
function framedElements(tree: ClusterTree, key: ClusterKey): Set<ElementId> {
  const framed = new Set<ElementId>();
  const pending = [key];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const cluster = tree.clusters.get(next);
    if (!cluster) continue;
    for (const id of cluster.elements) framed.add(id);
    pending.push(...cluster.children);
  }
  return framed;
}
