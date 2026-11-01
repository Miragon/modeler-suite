/*
 * The nesting of a view's boundaries and groups as one tree (SPEC 4.1, 4.3). Dagre takes a strict
 * tree of clusters, while the projection lists boundaries and groups separately: a container group
 * sits inside its system's boundary, a nested group inside its outer group, and an element belongs
 * to the innermost frame that lists it.
 */
import { groupKey, type ElementId, type ViewMembers } from "@miragon/c4-schema-model";

export type ClusterKey = string;

export interface Cluster {
  readonly key: ClusterKey;
  readonly kind: "boundary" | "group";
  /** What `ViewGeometry` stores the frame under: the boundary's element id, the group's `groupKey`. */
  readonly frameKey: string;
  readonly members: readonly ElementId[];
  readonly parent: ClusterKey | undefined;
  readonly children: readonly ClusterKey[];
  readonly elements: readonly ElementId[];
  readonly depth: number;
  /** Drawn: it holds an element at some depth, or it is a boundary (drawn also when empty). */
  readonly present: boolean;
  /** A boundary that holds nothing drawn: a fixed box of its own instead of a frame around members. */
  readonly leaf: boolean;
}

export interface ClusterTree {
  readonly clusters: ReadonlyMap<ClusterKey, Cluster>;
  readonly bottomUp: readonly ClusterKey[];
  readonly clusterOf: ReadonlyMap<ElementId, ClusterKey>;
  /** The frames around an element, a leaf boundary or a frame: innermost first, the key itself excluded. */
  ancestors(key: string): readonly ClusterKey[];
}

export function boundaryKey(elementId: ElementId): ClusterKey {
  return `boundary:${elementId}`;
}

/** `group:<scopeId>/<path>`: a model-level group and a system's group may share a path. */
export function groupClusterKey(group: ViewMembers["groups"][number]): ClusterKey {
  return `group:${groupKey(group.scopeId, group.path)}`;
}

interface Draft {
  readonly key: ClusterKey;
  readonly kind: "boundary" | "group";
  readonly frameKey: string;
  readonly members: ElementId[];
  readonly listedBoundaries: ClusterKey[];
  parent: ClusterKey | undefined;
  readonly explicitParent: ClusterKey | undefined;
}

export function clusterTree(members: ViewMembers): ClusterTree {
  const inView = new Set(members.elements);
  const drafts = new Map<ClusterKey, Draft>();
  draftBoundaries(members, inView, drafts);
  draftGroups(members, inView, drafts);
  for (const draft of drafts.values()) {
    if (draft.explicitParent) setParent(drafts, draft.key, draft.explicitParent);
  }
  attachRootGroupsToBoundaries(drafts);
  moveListedBoundariesIntoGroups(drafts);
  return finish(drafts, members.elements);
}

function draftBoundaries(
  members: ViewMembers,
  inView: ReadonlySet<ElementId>,
  drafts: Map<ClusterKey, Draft>,
): void {
  const boundaryIds = new Set(members.boundaries.map((boundary) => boundary.elementId));
  for (const boundary of members.boundaries) {
    const key = boundaryKey(boundary.elementId);
    if (drafts.has(key)) continue;
    const parentId = boundary.parentId;
    drafts.set(key, {
      key,
      kind: "boundary",
      frameKey: boundary.elementId,
      members: unique(boundary.members.filter((id) => inView.has(id))),
      listedBoundaries: [],
      parent: undefined,
      explicitParent:
        parentId !== undefined && parentId !== boundary.elementId && boundaryIds.has(parentId)
          ? boundaryKey(parentId)
          : undefined,
    });
  }
}

function draftGroups(
  members: ViewMembers,
  inView: ReadonlySet<ElementId>,
  drafts: Map<ClusterKey, Draft>,
): void {
  const firstByKey = new Map<ClusterKey, ViewMembers["groups"][number]>();
  for (const group of members.groups) {
    if (!firstByKey.has(groupClusterKey(group))) firstByKey.set(groupClusterKey(group), group);
  }
  for (const group of members.groups) {
    const key = groupClusterKey(group);
    if (drafts.has(key)) continue;
    const outer = [...firstByKey.values()]
      .filter(
        (other) =>
          other.scopeId === group.scopeId &&
          other.depth < group.depth &&
          isOuterGroupPath(other.path, group.path),
      )
      .sort((first, second) => second.path.length - first.path.length)[0];
    drafts.set(key, {
      key,
      kind: "group",
      frameKey: groupKey(group.scopeId, group.path),
      members: unique(group.members.filter((id) => inView.has(id))),
      listedBoundaries: unique(
        group.members
          .filter((id) => !inView.has(id) && drafts.has(boundaryKey(id)))
          .map(boundaryKey),
      ),
      parent: undefined,
      explicitParent: outer === undefined ? undefined : groupClusterKey(outer),
    });
  }
}

/**
 * `Outer` holds `Outer/Inner` for any one-character `structurizr.groupSeparator`, but not
 * `Outerwear`; the depth check above keeps a sibling such as `Outer Services` (depth 0) out of it.
 */
function isOuterGroupPath(outer: string, inner: string): boolean {
  if (outer.length === 0 || inner.length <= outer.length || !inner.startsWith(outer)) return false;
  return !/[\p{L}\p{N}]/u.test(inner.charAt(outer.length));
}

/** A group of the model's elements sits inside the innermost boundary that holds all of them. */
function attachRootGroupsToBoundaries(drafts: Map<ClusterKey, Draft>): void {
  const boundaries = [...drafts.values()].filter((draft) => draft.kind === "boundary");
  for (const group of drafts.values()) {
    if (group.kind !== "group" || group.parent !== undefined) continue;
    const elements = groupElements(drafts, group);
    const listed = groupListedBoundaries(drafts, group);
    if (elements.size === 0 && listed.size === 0) continue;
    let innermost: Draft | undefined;
    let innermostDepth = -1;
    for (const boundary of boundaries) {
      const holdsAll =
        [...elements].every((id) => boundaryHolds(drafts, boundary.key, id)) &&
        [...listed].every((key) => isStrictlyUnder(drafts, key, boundary.key));
      const depth = ancestorsOf(drafts, boundary.key).length;
      if (holdsAll && depth > innermostDepth) {
        innermost = boundary;
        innermostDepth = depth;
      }
    }
    if (innermost) setParent(drafts, group.key, innermost.key);
  }
}

/** A group that names a boundary (a group of systems in a container view) draws around its frame. */
function moveListedBoundariesIntoGroups(drafts: Map<ClusterKey, Draft>): void {
  for (const group of drafts.values()) {
    for (const listed of group.listedBoundaries) {
      const boundary = drafts.get(listed);
      if (boundary && boundary.parent === group.parent) setParent(drafts, listed, group.key);
    }
  }
}

function groupElements(drafts: ReadonlyMap<ClusterKey, Draft>, group: Draft): Set<ElementId> {
  const elements = new Set(group.members);
  for (const draft of drafts.values()) {
    if (draft.kind === "group" && isStrictlyUnder(drafts, draft.key, group.key)) {
      for (const id of draft.members) elements.add(id);
    }
  }
  return elements;
}

function groupListedBoundaries(
  drafts: ReadonlyMap<ClusterKey, Draft>,
  group: Draft,
): Set<ClusterKey> {
  const listed = new Set(group.listedBoundaries);
  for (const draft of drafts.values()) {
    if (draft.kind === "group" && isStrictlyUnder(drafts, draft.key, group.key)) {
      for (const key of draft.listedBoundaries) listed.add(key);
    }
  }
  return listed;
}

function boundaryHolds(
  drafts: ReadonlyMap<ClusterKey, Draft>,
  boundary: ClusterKey,
  id: ElementId,
): boolean {
  for (const draft of drafts.values()) {
    if (draft.kind !== "boundary" || !draft.members.includes(id)) continue;
    if (draft.key === boundary || isStrictlyUnder(drafts, draft.key, boundary)) return true;
  }
  return false;
}

function isStrictlyUnder(
  drafts: ReadonlyMap<ClusterKey, Draft>,
  key: ClusterKey,
  outer: ClusterKey,
): boolean {
  return ancestorsOf(drafts, key).includes(outer);
}

function ancestorsOf(drafts: ReadonlyMap<ClusterKey, Draft>, key: ClusterKey): ClusterKey[] {
  const chain: ClusterKey[] = [];
  let parent = drafts.get(key)?.parent;
  while (parent !== undefined && !chain.includes(parent) && parent !== key) {
    chain.push(parent);
    parent = drafts.get(parent)?.parent;
  }
  return chain;
}

/** Refuses a parent that would close a cycle, so a malformed projection still yields a tree. */
function setParent(drafts: Map<ClusterKey, Draft>, key: ClusterKey, parent: ClusterKey): void {
  const draft = drafts.get(key);
  if (!draft || !drafts.has(parent) || parent === key) return;
  if (ancestorsOf(drafts, parent).includes(key)) return;
  draft.parent = parent;
}

function finish(
  drafts: ReadonlyMap<ClusterKey, Draft>,
  elements: readonly ElementId[],
): ClusterTree {
  const order = [...drafts.keys()];
  const children = new Map<ClusterKey, ClusterKey[]>(order.map((key) => [key, []]));
  for (const draft of drafts.values()) {
    if (draft.parent !== undefined) children.get(draft.parent)?.push(draft.key);
  }
  const depth = new Map<ClusterKey, number>(
    order.map((key) => [key, ancestorsOf(drafts, key).length]),
  );
  const clusterOf = innermostClusters(drafts, elements, depth);
  const assigned = new Map<ClusterKey, ElementId[]>(order.map((key) => [key, []]));
  for (const id of unique(elements)) {
    const key = clusterOf.get(id);
    if (key !== undefined) assigned.get(key)?.push(id);
  }
  const bottomUp = [...order].sort(
    (first, second) =>
      (depth.get(second) ?? 0) - (depth.get(first) ?? 0) ||
      order.indexOf(first) - order.indexOf(second),
  );
  const present = new Map<ClusterKey, boolean>();
  const clusters = new Map<ClusterKey, Cluster>();
  for (const key of bottomUp) {
    const draft = drafts.get(key);
    if (!draft) continue;
    const ownElements = assigned.get(key) ?? [];
    const kids = children.get(key) ?? [];
    const holdsDrawn = ownElements.length > 0 || kids.some((kid) => present.get(kid) === true);
    present.set(key, holdsDrawn || draft.kind === "boundary");
    clusters.set(key, {
      key,
      kind: draft.kind,
      frameKey: draft.frameKey,
      members: draft.members,
      parent: draft.parent,
      children: kids,
      elements: ownElements,
      depth: depth.get(key) ?? 0,
      present: present.get(key) === true,
      leaf: draft.kind === "boundary" && !holdsDrawn,
    });
  }
  const ordered = new Map(
    order.flatMap((key) => {
      const cluster = clusters.get(key);
      return cluster ? [[key, cluster] as const] : [];
    }),
  );
  const known = new Map<string, readonly ClusterKey[]>();
  return {
    clusters: ordered,
    bottomUp,
    clusterOf,
    ancestors: (key) => {
      const cached = known.get(key);
      if (cached) return cached;
      const own = clusterOf.get(key);
      const chain =
        own === undefined ? ancestorsOf(drafts, key) : [own, ...ancestorsOf(drafts, own)];
      known.set(key, chain);
      return chain;
    },
  };
}

function innermostClusters(
  drafts: ReadonlyMap<ClusterKey, Draft>,
  elements: readonly ElementId[],
  depth: ReadonlyMap<ClusterKey, number>,
): Map<ElementId, ClusterKey> {
  const clusterOf = new Map<ElementId, ClusterKey>();
  const deepest = new Map<ElementId, number>();
  const inView = new Set(elements);
  for (const draft of drafts.values()) {
    const ownDepth = depth.get(draft.key) ?? 0;
    for (const id of draft.members) {
      if (!inView.has(id)) continue;
      if (ownDepth > (deepest.get(id) ?? -1)) {
        deepest.set(id, ownDepth);
        clusterOf.set(id, draft.key);
      }
    }
  }
  return clusterOf;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
