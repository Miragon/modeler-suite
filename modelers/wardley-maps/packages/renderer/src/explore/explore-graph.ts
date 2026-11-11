export type ExploreDirection = "dependencies" | "dependents";

export type ExploreGraphElementKind = "node" | "pipelineFrame" | "commentary" | "other";

export interface ExploreGraphElement {
  readonly id: string;
  readonly kind: ExploreGraphElementKind;
  readonly pipelineId?: string | undefined;
  /** The pipeline this component anchors: the one of its name that it is no member of. */
  readonly anchorOfPipeline?: string | undefined;
}

export interface ExploreGraphLink {
  readonly id: string;
  readonly kind: "dependency" | "flow";
  /** The more visible end, which needs `to`. */
  readonly from: string;
  readonly to: string;
}

export interface ExploreGraph {
  readonly elements: readonly ExploreGraphElement[];
  readonly links: readonly ExploreGraphLink[];
}

function nodesOf(graph: ExploreGraph): ExploreGraphElement[] {
  return graph.elements.filter((element) => element.kind === "node");
}

export function nodeIds(graph: ExploreGraph): string[] {
  return nodesOf(graph).map((node) => node.id);
}

function appendTo(lists: Map<string, string[]>, key: string, value: string): void {
  const list = lists.get(key);
  if (!list) lists.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

/**
 * The members each node brings onto the canvas: the members of the pipeline it anchors, or its own
 * as a standalone pipeline.
 */
function membersByHolder(nodes: readonly ExploreGraphElement[]): Map<string, string[]> {
  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const anchorByPipeline = new Map<string, string>();
  for (const node of nodes) {
    if (node.anchorOfPipeline !== undefined) anchorByPipeline.set(node.anchorOfPipeline, node.id);
  }
  const members = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.pipelineId === undefined) continue;
    const holder =
      anchorByPipeline.get(node.pipelineId) ??
      (nodeIdSet.has(node.pipelineId) ? node.pipelineId : undefined);
    if (holder !== undefined && holder !== node.id) appendTo(members, holder, node.id);
  }
  return members;
}

/**
 * Dependency links, and a pipeline's membership as one more step: its anchor or the standalone
 * pipeline needs its members, so a chain goes on below a pipeline and up from a member.
 */
function dependencyAdjacency(
  graph: ExploreGraph,
  direction: ExploreDirection,
): Map<string, string[]> {
  const nodes = new Set(nodeIds(graph));
  const adjacency = new Map<string, string[]>();
  const step = (from: string, to: string) => {
    const [start, end] = direction === "dependencies" ? [from, to] : [to, from];
    if (start !== end && nodes.has(start) && nodes.has(end)) appendTo(adjacency, start, end);
  };
  for (const link of graph.links) {
    if (link.kind === "dependency") step(link.from, link.to);
  }
  for (const [holder, members] of membersByHolder(nodesOf(graph))) {
    for (const member of members) step(holder, member);
  }
  return adjacency;
}

export function neighboursOf(
  graph: ExploreGraph,
  nodeId: string,
  direction: ExploreDirection,
): string[] {
  return [...(dependencyAdjacency(graph, direction).get(nodeId) ?? [])];
}

export function chainOf(
  graph: ExploreGraph,
  nodeId: string,
  direction: ExploreDirection,
): string[] {
  const adjacency = dependencyAdjacency(graph, direction);
  const reached = new Set<string>([nodeId]);
  const chain: string[] = [];
  const queue = [nodeId];
  for (let index = 0; index < queue.length; index++) {
    for (const neighbour of adjacency.get(queue[index]!) ?? []) {
      if (reached.has(neighbour)) continue;
      reached.add(neighbour);
      chain.push(neighbour);
      queue.push(neighbour);
    }
  }
  return chain;
}

/**
 * Members follow their pipeline's anchor onto the canvas, so a revealed anchor never sits on an
 * empty pipeline. A standalone pipeline is a node itself and anchors its own members.
 */
export function visibleNodeIds(graph: ExploreGraph, visible: ReadonlySet<string>): Set<string> {
  const nodes = nodesOf(graph);
  const members = membersByHolder(nodes);
  const queue = nodes.map((node) => node.id).filter((id) => visible.has(id));
  const shown = new Set(queue);
  for (let index = 0; index < queue.length; index++) {
    for (const member of members.get(queue[index]!) ?? []) {
      if (shown.has(member)) continue;
      shown.add(member);
      queue.push(member);
    }
  }
  return shown;
}

export function hiddenNeighbourCount(
  graph: ExploreGraph,
  visible: ReadonlySet<string>,
  nodeId: string,
  direction: ExploreDirection,
): number {
  const shown = visibleNodeIds(graph, visible);
  return neighboursOf(graph, nodeId, direction).filter((id) => !shown.has(id)).length;
}

export function hiddenChainCount(
  graph: ExploreGraph,
  visible: ReadonlySet<string>,
  nodeId: string,
  direction: ExploreDirection,
): number {
  const shown = visibleNodeIds(graph, visible);
  return chainOf(graph, nodeId, direction).filter((id) => !shown.has(id)).length;
}

/** Commentary waits until every node shows, so that showing all gives back the whole map. */
export function visibleElementIds(graph: ExploreGraph, visible: ReadonlySet<string>): Set<string> {
  const shownNodes = visibleNodeIds(graph, visible);
  const shownPipelines = new Set(
    nodesOf(graph)
      .filter((node) => shownNodes.has(node.id))
      .flatMap((node) => [node.pipelineId, node.anchorOfPipeline])
      .filter((pipelineId): pipelineId is string => pipelineId !== undefined),
  );
  const everyNodeShown = nodeIds(graph).every((id) => shownNodes.has(id));
  const isShown = (element: ExploreGraphElement): boolean => {
    switch (element.kind) {
      case "node":
        return shownNodes.has(element.id);
      case "pipelineFrame":
        return shownPipelines.has(element.id);
      case "commentary":
        return everyNodeShown;
      case "other":
        return false;
    }
  };
  const shown = new Set(graph.elements.filter(isShown).map((element) => element.id));
  for (const link of graph.links) {
    if (shown.has(link.from) && shown.has(link.to)) shown.add(link.id);
  }
  return shown;
}
