import type { Box, ElementId, Size } from "@miragon/c4-schema-model";
import { autoLayoutBoxes } from "./autoLayout.js";
import { clusterTree, type ClusterTree } from "./clusters.js";
import { EMPTY_BOUNDARY_SIZE, deriveFrames } from "./frames.js";
import { bottom, unionOf } from "./geometry.js";
import { placeItems, type PlacementContext, type PlacementItem } from "./placement.js";
import { relationshipGeometry, type DrawnRelationship } from "./relationships.js";
import type { LayoutInput, ViewGeometry } from "./types.js";

/** The size of a Box, the default shape of every kind but people (SPEC 6.2). */
const FALLBACK_SIZE: Size = { width: 240, height: 160 };
/** Structurizr draws the title below the diagram at the bottom left (R-JSON §2.8). */
const TITLE_GAP = 32;

/**
 * Dagre for a view without stored boxes, `placeUnplaced` for the rest; pure and deterministic. The
 * input holds no text, so a rename or a new description never moves anything (SPEC 4.3).
 */
export function layoutView(input: LayoutInput): ViewGeometry {
  const tree = clusterTree(input.members);
  const elements = viewElements(input);
  const relationships = drawnRelationships(input, new Set(elements));
  const context: PlacementContext = { tree, relationships };
  const boxes = new Map<string, Box>();
  const placed = new Set<ElementId>();
  for (const id of elements) {
    const stored = input.stored.elements.get(id);
    if (!stored || !Number.isFinite(stored.x) || !Number.isFinite(stored.y)) continue;
    boxes.set(id, { x: stored.x, y: stored.y, ...sizeOf(id, input) });
    placed.add(id);
  }
  const unplaced = elements.filter((id) => !placed.has(id));
  if (placed.size === 0) {
    laidOutAutomatically(boxes, input, tree, elements, relationships, context);
  } else {
    const items = unplaced.map((id) => ({ key: id, size: sizeOf(id, input) }));
    const leaves = leafBoundaryItems(tree, () =>
      automaticBoxes(input, tree, elements, relationships),
    );
    placeItems(boxes, [...items, ...leaves], context);
  }
  const frames = deriveFrames(tree, boxes);
  const elementBoxes = new Map<ElementId, Box>();
  for (const id of elements) {
    const box = boxes.get(id);
    if (box) elementBoxes.set(id, box);
  }
  const { vertices, routes, labelBoxes } = relationshipGeometry(
    relationships,
    elementBoxes,
    input.stored.relationships,
  );
  const boundaries = new Map<ElementId, Box>();
  const groups = new Map<string, Box>();
  for (const cluster of tree.clusters.values()) {
    const frame = frames.get(cluster.key)?.frame;
    if (!frame) continue;
    (cluster.kind === "boundary" ? boundaries : groups).set(cluster.frameKey, frame);
  }
  const frameBoxes = [...boundaries.values(), ...groups.values()];
  return {
    boxes: elementBoxes,
    placed,
    vertices,
    routes,
    boundaries,
    groups,
    labelBoxes,
    title: titleAnchor([...elementBoxes.values(), ...frameBoxes], [...labelBoxes.values()]),
    mode: placed.size === 0 ? "auto" : unplaced.length === 0 ? "stored" : "mixed",
  };
}

/** Free slots next to the first placed neighbour, never overlapping (SPEC 4.3). */
export function placeUnplaced(
  boxes: ReadonlyMap<ElementId, Box>,
  unplaced: readonly ElementId[],
  input: LayoutInput,
): Map<ElementId, Box> {
  const tree = clusterTree(input.members);
  const elements = viewElements(input);
  const viewRelationships = drawnRelationships(input, new Set(elements));
  const leaves = leafBoundaryItems(tree, () =>
    automaticBoxes(input, tree, elements, viewRelationships),
  );
  const working = new Map<string, Box>(boxes);
  const items = unplaced.map((id) => ({ key: id, size: sizeOf(id, input) }));
  placeItems(working, [...items, ...leaves], {
    tree,
    relationships: drawnRelationships(input, new Set([...elements, ...boxes.keys(), ...unplaced])),
  });
  for (const leaf of leaves) {
    if (!boxes.has(leaf.key)) working.delete(leaf.key);
  }
  return working;
}

function viewElements(input: LayoutInput): ElementId[] {
  return [...new Set(input.members.elements)];
}

/** A failure inside dagre must not keep a view from drawing: its elements are then placed one by one. */
function laidOutAutomatically(
  boxes: Map<string, Box>,
  input: LayoutInput,
  tree: ClusterTree,
  elements: readonly ElementId[],
  relationships: readonly DrawnRelationship[],
  context: PlacementContext,
): void {
  const laidOut = automaticBoxes(input, tree, elements, relationships);
  if (laidOut) {
    for (const [key, box] of laidOut) boxes.set(key, box);
    return;
  }
  const items = elements.map((id) => ({ key: id, size: sizeOf(id, input) }));
  placeItems(boxes, [...items, ...leafBoundaryItems(tree, () => undefined)], context);
}

function automaticBoxes(
  input: LayoutInput,
  tree: ClusterTree,
  elements: readonly ElementId[],
  relationships: readonly DrawnRelationship[],
): Map<string, Box> | undefined {
  try {
    return autoLayoutBoxes({
      tree,
      elements,
      sizeOf: (id) => sizeOf(id, input),
      edges: relationships,
      autoLayout: input.autoLayout,
    });
  } catch {
    return undefined;
  }
}

/**
 * An empty boundary has no stored box, so in a pinned view it keeps the place the automatic layout
 * gives it while nothing covers that place: pinning the view and moving other elements leave it
 * where it was drawn.
 */
function leafBoundaryItems(
  tree: ClusterTree,
  automatic: () => ReadonlyMap<string, Box> | undefined,
): PlacementItem[] {
  const leaves = [...tree.clusters.values()].filter((cluster) => cluster.leaf);
  if (leaves.length === 0) return [];
  const laidOut = automatic();
  return leaves.map((cluster) => ({
    key: cluster.key,
    size: EMPTY_BOUNDARY_SIZE,
    preferred: laidOut?.get(cluster.key),
  }));
}

function drawnRelationships(
  input: LayoutInput,
  elements: ReadonlySet<ElementId>,
): DrawnRelationship[] {
  const drawn: DrawnRelationship[] = [];
  for (const key of new Set(input.members.relationships)) {
    const ends = input.relationshipEnds.get(key);
    if (!ends || !elements.has(ends.sourceId) || !elements.has(ends.destinationId)) continue;
    drawn.push({ key, sourceId: ends.sourceId, destinationId: ends.destinationId });
  }
  return drawn;
}

function sizeOf(id: ElementId, input: LayoutInput): Size {
  const stored = input.stored.elements.get(id);
  const size = input.sizes.get(id) ?? {
    width: stored?.width ?? FALLBACK_SIZE.width,
    height: stored?.height ?? FALLBACK_SIZE.height,
  };
  return {
    width: usable(size.width) ? size.width : FALLBACK_SIZE.width,
    height: usable(size.height) ? size.height : FALLBACK_SIZE.height,
  };
}

function usable(length: number): boolean {
  return Number.isFinite(length) && length > 0;
}

function titleAnchor(content: readonly Box[], labels: readonly Box[]): { x: number; y: number } {
  const drawn = unionOf(content);
  if (!drawn) return { x: 0, y: 0 };
  const lowest = Math.max(bottom(drawn), ...labels.map(bottom));
  return { x: drawn.x, y: lowest + TITLE_GAP };
}
