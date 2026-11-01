import type {
  AutoLayout,
  Box,
  ElementId,
  Point,
  Size,
  StoredBox,
  ViewMembers,
} from "@miragon/c4-schema-model";
import type { LayoutInput } from "../../src/index.js";

export interface ViewSpec {
  readonly elements: readonly ElementId[];
  /** `[source, destination]`, keyed `source->destination`, or with an own key. */
  readonly relationships?: readonly (
    | readonly [ElementId, ElementId]
    | { readonly key: string; readonly sourceId: ElementId; readonly destinationId: ElementId }
  )[];
  readonly boundaries?: ViewMembers["boundaries"];
  readonly groups?: ViewMembers["groups"];
  readonly sizes?: Readonly<Record<ElementId, Size>>;
  readonly stored?: Readonly<Record<ElementId, StoredBox>>;
  readonly vertices?: Readonly<Record<string, readonly Point[]>>;
  readonly autoLayout?: AutoLayout;
}

export const BOX: Size = { width: 240, height: 160 };
export const PERSON: Size = { width: 216, height: 216 };

export function layoutInput(spec: ViewSpec): LayoutInput {
  const ends = new Map<string, { sourceId: ElementId; destinationId: ElementId }>();
  for (const relationship of spec.relationships ?? []) {
    if (isPair(relationship)) {
      const [sourceId, destinationId] = relationship;
      ends.set(`${sourceId}->${destinationId}`, { sourceId, destinationId });
    } else {
      ends.set(relationship.key, {
        sourceId: relationship.sourceId,
        destinationId: relationship.destinationId,
      });
    }
  }
  return {
    members: {
      elements: spec.elements,
      relationships: [...ends.keys()],
      boundaries: spec.boundaries ?? [],
      groups: spec.groups ?? [],
      diagnostics: [],
    },
    sizes: new Map(spec.elements.map((id) => [id, spec.sizes?.[id] ?? BOX])),
    stored: {
      elements: new Map(Object.entries(spec.stored ?? {})),
      relationships: new Map(Object.entries(spec.vertices ?? {})),
      unmatched: [],
      malformed: [],
    },
    autoLayout: spec.autoLayout,
    relationshipEnds: ends,
  };
}

function isPair(
  relationship: NonNullable<ViewSpec["relationships"]>[number],
): relationship is readonly [ElementId, ElementId] {
  return Array.isArray(relationship);
}

export function autoLayout(
  rankDirection: AutoLayout["rankDirection"],
  rankSeparation = 300,
  nodeSeparation = 160,
  edgeSeparation = 50,
  vertices = true,
): AutoLayout {
  return { rankDirection, rankSeparation, nodeSeparation, edgeSeparation, vertices };
}

export function overlap(first: Box, second: Box): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

export function contains(outer: Box, inner: Box): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

/** A seeded generator, so a failing case names its seed and reproduces (no new dependency). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

export function plain<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, inner: unknown) =>
      inner instanceof Map
        ? [...inner.entries()]
        : inner instanceof Set
          ? [...inner.values()]
          : inner,
    ),
  );
}
