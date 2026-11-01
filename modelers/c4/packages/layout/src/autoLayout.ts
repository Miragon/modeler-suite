import { Graph, layout } from "@dagrejs/dagre";
import {
  STRUCTURIZR_PX_PER_UNIT,
  type AutoLayout,
  type Box,
  type ElementId,
  type Size,
} from "@miragon/c4-schema-model";
import type { ClusterTree } from "./clusters.js";
import { CAPTION_BAND, EMPTY_BOUNDARY_SIZE, FRAME_PADDING, deriveFrames } from "./frames.js";
import { roundHalfAwayFromZero, translated, unionOf } from "./geometry.js";

/** One label box per relationship, never measured, so a new description never moves anything (SPEC 4.3). */
export const LABEL_SIZE = { width: 160, height: 48 } as const;

/** Drafts, implicit views and written views without `autoLayout`: what `NEW_VIEW_AUTO_LAYOUT` writes. */
export const DEFAULT_AUTO_LAYOUT: AutoLayout = {
  rankDirection: "tb",
  rankSeparation: 300,
  nodeSeparation: 160,
  edgeSeparation: 50,
  vertices: true,
};

const MIN_RANK_SEPARATION = 80;
const MIN_NODE_SEPARATION = 60;

export interface Separations {
  readonly rankdir: "TB" | "BT" | "LR" | "RL";
  readonly ranksep: number;
  readonly nodesep: number;
  readonly edgesep: number;
}

export interface AutoLayoutGraph {
  readonly tree: ClusterTree;
  readonly elements: readonly ElementId[];
  readonly sizeOf: (id: ElementId) => Size;
  readonly edges: readonly {
    readonly key: string;
    readonly sourceId: ElementId;
    readonly destinationId: ElementId;
  }[];
  readonly autoLayout: AutoLayout | undefined;
}

/**
 * Dagre puts a frame's border one half rank step (it halves `ranksep` to make room for edge
 * labels) and half an edge separation away from the members, while a derived frame reaches the
 * padding beyond them and the caption band below. The floors keep a frame clear of every element
 * outside it whatever the `autoLayout` statement asks for.
 */
export function separations(autoLayout: AutoLayout | undefined, framed: boolean): Separations {
  const settings = autoLayout ?? DEFAULT_AUTO_LAYOUT;
  const vertical = settings.rankDirection === "tb" || settings.rankDirection === "bt";
  const ranksep = Math.max(MIN_RANK_SEPARATION, toUnits(settings.rankSeparation));
  const nodesep = Math.max(MIN_NODE_SEPARATION, toUnits(settings.nodeSeparation));
  const edgesep = Math.max(0, toUnits(settings.edgeSeparation));
  const rankAxisReach = vertical ? FRAME_PADDING + CAPTION_BAND : FRAME_PADDING;
  const orderAxisReach = vertical ? FRAME_PADDING : FRAME_PADDING + CAPTION_BAND;
  return {
    rankdir: settings.rankDirection.toUpperCase() as Separations["rankdir"],
    ranksep: framed ? Math.max(ranksep, 2 * rankAxisReach) : ranksep,
    nodesep,
    edgesep: framed ? Math.max(edgesep, orderAxisReach) : edgesep,
  };
}

function toUnits(structurizrPixels: number): number {
  if (!Number.isFinite(structurizrPixels)) return 0;
  return roundHalfAwayFromZero(structurizrPixels / STRUCTURIZR_PX_PER_UNIT);
}

type Edges = AutoLayoutGraph["edges"];

/**
 * Element boxes and leaf boundary boxes, translated so the content including the frames starts at
 * the origin. Nodes go in in document order and edges in relationship order: dagre is deterministic
 * for the same insertion order.
 */
export function autoLayoutBoxes(graph: AutoLayoutGraph): Map<string, Box> {
  try {
    return dagreBoxes(graph, graph.edges);
  } catch {
    // Dagre 3.1.1 cannot dock some parallel edges (a two-way pair with a second line one way:
    // "Not possible to find intersection inside of the rectangle"); the lines are straight and
    // drawn on top of each other anyway, so one edge per ordered pair loses nothing visible.
    return dagreBoxes(graph, onePerOrderedPair(graph.edges));
  }
}

function onePerOrderedPair(edges: Edges): Edges {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const pair = JSON.stringify([edge.sourceId, edge.destinationId]);
    if (seen.has(pair)) return false;
    seen.add(pair);
    return true;
  });
}

function dagreBoxes(graph: AutoLayoutGraph, edges: Edges): Map<string, Box> {
  const clusters = [...graph.tree.clusters.values()].filter((cluster) => cluster.present);
  const framed = clusters.some((cluster) => !cluster.leaf);
  const settings = separations(graph.autoLayout, framed);
  const dagreGraph = new Graph({ compound: true, multigraph: true });
  dagreGraph.setGraph({ ...settings, marginx: 0, marginy: 0 });
  for (const cluster of clusters) {
    dagreGraph.setNode(cluster.key, cluster.leaf ? { ...EMPTY_BOUNDARY_SIZE } : {});
  }
  const nodes = new Set<string>();
  for (const id of graph.elements) {
    if (nodes.has(id)) continue;
    nodes.add(id);
    const size = graph.sizeOf(id);
    dagreGraph.setNode(id, { width: size.width, height: size.height });
  }
  for (const cluster of clusters) {
    if (cluster.parent !== undefined) dagreGraph.setParent(cluster.key, cluster.parent);
  }
  for (const id of nodes) {
    const cluster = graph.tree.clusterOf.get(id);
    if (cluster !== undefined) dagreGraph.setParent(id, cluster);
  }
  for (const edge of edges) {
    if (!nodes.has(edge.sourceId) || !nodes.has(edge.destinationId)) continue;
    dagreGraph.setEdge(
      edge.sourceId,
      edge.destinationId,
      { width: LABEL_SIZE.width, height: LABEL_SIZE.height, labelpos: "c" },
      edge.key,
    );
  }
  layout(dagreGraph);
  const boxes = new Map<string, Box>();
  const read = (key: string, size: Size): void => {
    const node = dagreGraph.node(key);
    boxes.set(key, {
      x: roundHalfAwayFromZero((node.x ?? 0) - size.width / 2),
      y: roundHalfAwayFromZero((node.y ?? 0) - size.height / 2),
      width: size.width,
      height: size.height,
    });
  };
  for (const cluster of clusters) if (cluster.leaf) read(cluster.key, EMPTY_BOUNDARY_SIZE);
  for (const id of nodes) read(id, graph.sizeOf(id));
  return atOrigin(boxes, graph.tree);
}

function atOrigin(boxes: ReadonlyMap<string, Box>, tree: ClusterTree): Map<string, Box> {
  const frames = deriveFrames(tree, boxes);
  const content = unionOf([...boxes.values(), ...[...frames.values()].map((frame) => frame.frame)]);
  const dx = content ? -content.x : 0;
  const dy = content ? -content.y : 0;
  return new Map([...boxes].map(([key, box]) => [key, translated(box, dx, dy)]));
}
