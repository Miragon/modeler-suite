import type { Ancestry, ElementId, FieldSource, Relationship, RelationshipEvent } from "./types.js";

const NO_SOURCE: FieldSource = {
  form: "absent",
  statement: -1,
  token: undefined,
  editable: false,
  reason: undefined,
};

const IMPLIED_FIELDS: Relationship["fields"] = {
  description: NO_SOURCE,
  technology: NO_SOURCE,
  tags: NO_SOURCE,
  url: NO_SOURCE,
};

/**
 * The implied relationships of the explicit ones, in creation order (R-DSL §10.1, SPEC 4.1), as
 * Structurizr's two built-in strategies create them while the parser reads the relationships in
 * document order: for every pair of ancestors-or-self that are not related by ancestry, unless
 * a relationship (unless-any) or one with the same description (unless-same) already exists.
 * An explicit relationship its source already has with the same destination and description is
 * refused by Structurizr (`Element.has`), so it neither counts nor implies anything.
 *
 * An implied relationship carries its origin's tags: Structurizr gives it none of its own, but its
 * style and the `relationship.tag` expressions read the linked relationship's tags.
 */
export function impliedRelationships(
  events: readonly RelationshipEvent[],
  ancestry: Ancestry,
): Relationship[] {
  const state = new RelationshipState();
  const implied: Relationship[] = [];
  for (const { relationship, strategy } of events) {
    if (
      state.hasSame(relationship.sourceId, relationship.destinationId, relationship.description)
    ) {
      continue;
    }
    state.add(relationship);
    if (strategy === "none") continue;
    for (const source of selfAndAncestors(relationship.sourceId, ancestry)) {
      for (const destination of selfAndAncestors(relationship.destinationId, ancestry)) {
        if (!impliedIsAllowed(source, destination, ancestry)) continue;
        const exists =
          strategy === "unless-any"
            ? state.hasAny(source, destination)
            : state.hasSame(source, destination, relationship.description);
        if (exists) continue;
        const created = state.createImplied(relationship, source, destination);
        state.add(created);
        implied.push(created);
      }
    }
  }
  return implied;
}

class RelationshipState {
  private readonly outgoing = new Map<ElementId, Relationship[]>();
  private readonly impliedPerPair = new Map<string, number>();

  add(relationship: Relationship): void {
    const list = this.outgoing.get(relationship.sourceId);
    if (list) list.push(relationship);
    else this.outgoing.set(relationship.sourceId, [relationship]);
  }

  hasAny(source: ElementId, destination: ElementId): boolean {
    return (this.outgoing.get(source) ?? []).some(
      (relationship) => relationship.destinationId === destination,
    );
  }

  hasSame(source: ElementId, destination: ElementId, description: string): boolean {
    return (this.outgoing.get(source) ?? []).some(
      (relationship) =>
        relationship.destinationId === destination && relationship.description === description,
    );
  }

  createImplied(origin: Relationship, source: ElementId, destination: ElementId): Relationship {
    const pair = `${source}->${destination}`;
    const count = (this.impliedPerPair.get(pair) ?? 0) + 1;
    this.impliedPerPair.set(pair, count);
    const key = count === 1 ? `implied:${pair}` : undefined;
    return {
      key,
      canvasKey: key ?? `implied:${pair}#${count}`,
      identifier: undefined,
      sourceId: source,
      destinationId: destination,
      description: origin.description,
      technology: origin.technology,
      tags: origin.tags,
      url: undefined,
      implied: true,
      impliedBy: origin.key,
      bulk: false,
      fields: IMPLIED_FIELDS,
    };
  }
}

function selfAndAncestors(id: ElementId, ancestry: Ancestry): ElementId[] {
  const chain: ElementId[] = [];
  const seen = new Set<ElementId>();
  for (let current: ElementId | undefined = id; current !== undefined;) {
    if (seen.has(current)) break;
    seen.add(current);
    chain.push(current);
    current = ancestry.parents.get(current);
  }
  return chain;
}

function impliedIsAllowed(source: ElementId, destination: ElementId, ancestry: Ancestry): boolean {
  if (source === destination) return false;
  return !isAncestor(source, destination, ancestry) && !isAncestor(destination, source, ancestry);
}

function isAncestor(candidate: ElementId, of: ElementId, ancestry: Ancestry): boolean {
  return selfAndAncestors(of, ancestry).slice(1).includes(candidate);
}
