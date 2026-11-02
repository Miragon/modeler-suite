import type {
  ElementId,
  GroupDefinition,
  ModelElement,
  Relationship,
  RelationshipKey,
  Workspace,
} from "../types.js";

/** Lookups over one workspace, built once and shared by membership and the catalog. */
export interface ModelIndex {
  readonly workspace: Workspace;
  readonly elementOrder: ReadonlyMap<ElementId, number>;
  readonly byId: ReadonlyMap<ElementId, ModelElement>;
  readonly children: ReadonlyMap<ElementId, readonly ModelElement[]>;
  /** Relationships whose two ends are elements of the model, in the workspace's order. */
  readonly relationships: readonly Relationship[];
  readonly relationshipOrder: ReadonlyMap<Relationship, number>;
  readonly outgoing: ReadonlyMap<ElementId, readonly Relationship[]>;
  readonly incoming: ReadonlyMap<ElementId, readonly Relationship[]>;
  /** An element (or a group's elements) a view term names; undefined when nothing has the identifier. */
  elementsNamed(identifier: string): readonly ModelElement[] | undefined;
  /** Only an element, never a group (`context.getElement` where groups do not count). */
  elementNamed(identifier: string): ModelElement | undefined;
  relationshipNamed(identifier: string): Relationship | undefined;
  /** The implied relationships a relationship's key links to. */
  impliedFrom(key: RelationshipKey): readonly Relationship[];
  ancestors(id: ElementId): readonly ElementId[];
  /** The group an element is written in, then the groups around it, innermost first. */
  groupChain(element: ModelElement): readonly GroupDefinition[];
  groupDepth(group: GroupDefinition): number;
}

const indexes = new WeakMap<Workspace, ModelIndex>();

export function modelIndex(workspace: Workspace): ModelIndex {
  let index = indexes.get(workspace);
  if (index === undefined) {
    index = buildIndex(workspace);
    indexes.set(workspace, index);
  }
  return index;
}

function push<Key, Value>(map: Map<Key, Value[]>, key: Key, value: Value): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function buildIndex(workspace: Workspace): ModelIndex {
  const byId = new Map(workspace.elements.map((element) => [element.id, element]));
  const elementOrder = new Map(workspace.elements.map((element, order) => [element.id, order]));
  const referable = new Map<string, ModelElement>();
  const children = new Map<ElementId, ModelElement[]>();
  for (const element of workspace.elements) {
    if (!element.implicit) referable.set(element.id.toLowerCase(), element);
    if (element.parentId !== undefined) push(children, element.parentId, element);
  }
  const relationships = workspace.relationships.filter(
    (relationship) => byId.has(relationship.sourceId) && byId.has(relationship.destinationId),
  );
  const outgoing = new Map<ElementId, Relationship[]>();
  const incoming = new Map<ElementId, Relationship[]>();
  const named = new Map<string, Relationship>();
  const implied = new Map<RelationshipKey, Relationship[]>();
  for (const relationship of relationships) {
    push(outgoing, relationship.sourceId, relationship);
    push(incoming, relationship.destinationId, relationship);
    if (relationship.identifier !== undefined) {
      named.set(relationship.identifier.toLowerCase(), relationship);
    }
    if (relationship.implied && relationship.impliedBy !== undefined) {
      push(implied, relationship.impliedBy, relationship);
    }
  }
  const groups = groupIndex(workspace);
  const ancestorCache = new Map<ElementId, ElementId[]>();
  const ancestors = (id: ElementId): ElementId[] => {
    const cached = ancestorCache.get(id);
    if (cached) return cached;
    const chain: ElementId[] = [];
    for (let parent = byId.get(id)?.parentId; parent !== undefined;) {
      if (chain.includes(parent) || parent === id) break;
      chain.push(parent);
      parent = byId.get(parent)?.parentId;
    }
    ancestorCache.set(id, chain);
    return chain;
  };
  return {
    workspace,
    elementOrder,
    byId,
    children,
    relationships,
    relationshipOrder: new Map(relationships.map((relationship, order) => [relationship, order])),
    outgoing,
    incoming,
    elementsNamed: (identifier) => {
      const element = referable.get(identifier.toLowerCase());
      if (element) return [element];
      const group = groups.byIdentifier.get(identifier.toLowerCase());
      return group && groups.elementsOf(group);
    },
    elementNamed: (identifier) => referable.get(identifier.toLowerCase()),
    relationshipNamed: (identifier) => named.get(identifier.toLowerCase()),
    impliedFrom: (key) => implied.get(key) ?? [],
    ancestors,
    groupChain: groups.chainOf,
    groupDepth: groups.depthOf,
  };
}

interface GroupIndex {
  readonly byIdentifier: ReadonlyMap<string, GroupDefinition>;
  elementsOf(group: GroupDefinition): readonly ModelElement[];
  chainOf(element: ModelElement): readonly GroupDefinition[];
  depthOf(group: GroupDefinition): number;
}

/**
 * Groups by scope (the element whose block holds them) and full path. A nested group's path is
 * its parent's path, the model's `structurizr.groupSeparator` and its name, so its parent is the
 * group of the same scope whose path the rest of it starts with.
 */
function groupIndex(workspace: Workspace): GroupIndex {
  const scoped = (scope: ElementId | undefined, path: string) => `${scope ?? ""}\u0000${path}`;
  const byPath = new Map<string, GroupDefinition>();
  const byIdentifier = new Map<string, GroupDefinition>();
  for (const group of workspace.groups) {
    if (!byPath.has(scoped(group.parentId, group.path))) {
      byPath.set(scoped(group.parentId, group.path), group);
    }
    if (group.identifier !== undefined) byIdentifier.set(group.identifier.toLowerCase(), group);
  }
  const parentOf = new Map<GroupDefinition, GroupDefinition>();
  for (const group of workspace.groups) {
    if (group.path === group.name || !group.path.endsWith(group.name)) continue;
    const prefix = group.path.slice(0, group.path.length - group.name.length);
    const parent = workspace.groups
      .filter(
        (candidate) =>
          candidate !== group &&
          candidate.parentId === group.parentId &&
          prefix.length > candidate.path.length &&
          prefix.startsWith(candidate.path),
      )
      .reduce<GroupDefinition | undefined>(
        (longest, candidate) =>
          longest === undefined || candidate.path.length > longest.path.length
            ? candidate
            : longest,
        undefined,
      );
    if (parent) parentOf.set(group, parent);
  }
  const chainFrom = (group: GroupDefinition | undefined): GroupDefinition[] => {
    const chain: GroupDefinition[] = [];
    for (let current = group; current !== undefined && !chain.includes(current);) {
      chain.push(current);
      current = parentOf.get(current);
    }
    return chain;
  };
  const chainOf = (element: ModelElement): GroupDefinition[] => {
    if (element.group === undefined) return [];
    const own = byPath.get(scoped(element.parentId, element.group));
    return chainFrom(own);
  };
  // A view term naming a group takes the elements written in its block and in the blocks of the
  // groups inside it (`ElementGroup.getElements`), never those `!element` moves into it or custom
  // elements; the group string of an element only decides the frames it is drawn in.
  const members = new Map<GroupDefinition, Set<ElementId>>();
  for (const group of workspace.groups) members.set(group, new Set(group.members));
  return {
    byIdentifier,
    elementsOf: (group) =>
      workspace.elements.filter((element) => members.get(group)?.has(element.id) === true),
    chainOf,
    depthOf: (group) => chainFrom(group).length - 1,
  };
}
