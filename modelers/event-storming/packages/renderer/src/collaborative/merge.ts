import { parseDSL, serializeDSL } from "@miragon/event-storming-dsl";
import type {
  BoardConfig,
  BoardEdge,
  BoardElement,
  EventStormingBoard,
} from "@miragon/event-storming-schema-model";
import {
  MergeConflictError,
  mergeItemsById,
  mergeValue,
  type ModelTextMerge,
} from "@miragon/modeler-api";

interface Keyed<T> {
  readonly key: string;
  readonly value: T;
}

/** Keys repeated values by their occurrence, so two equal arrows or lines stay two. */
function keyedByOccurrence<T>(values: readonly T[], keyOf: (value: T) => string): Keyed<T>[] {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const base = keyOf(value);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return { key: `${base}#${occurrence}`, value };
  });
}

type ArrowEnds = Pick<BoardEdge, "from" | "to" | "label">;

const arrowEnds = (edge: ArrowEnds): string => `${edge.from}->${edge.to}`;

/** The parser numbers arrows by their line, so the number is no part of what an arrow is. */
function withoutPositionalId(edge: BoardEdge): ArrowEnds {
  return edge.label === undefined
    ? { from: edge.from, to: edge.to }
    : { from: edge.from, to: edge.to, label: edge.label };
}

function mergeConfig(
  base: BoardConfig,
  external: BoardConfig,
  draft: BoardConfig,
  conflicts: string[],
): BoardConfig {
  const merged: Record<string, unknown> = {};
  for (const field of ["title", "style", "level"] as const) {
    const result = mergeValue(base[field], external[field], draft[field]);
    if ("conflict" in result) conflicts.push(`config.${field}`);
    else if (result.merged !== undefined) merged[field] = result.merged;
  }
  return merged as unknown as BoardConfig;
}

function mergeKeyed<T>(
  lists: readonly [readonly T[], readonly T[], readonly T[]],
  keyOf: (value: T) => string,
  conflicts: string[],
): T[] {
  const [base, external, draft] = lists.map((list) => keyedByOccurrence(list, keyOf)) as [
    Keyed<T>[],
    Keyed<T>[],
    Keyed<T>[],
  ];
  const result = mergeItemsById(base, external, draft, { idOf: (item) => item.key });
  if (result.conflictingIds) {
    conflicts.push(...result.conflictingIds);
    return [];
  }
  return result.merged.map((item) => item.value);
}

function danglingReferences(
  elements: readonly BoardElement[],
  edges: readonly ArrowEnds[],
): string[] {
  const ids = new Set(elements.map((element) => element.id));
  const pinned = elements.flatMap((element) =>
    "attachedTo" in element && element.attachedTo !== undefined && !ids.has(element.attachedTo)
      ? [element.id]
      : [],
  );
  const arrows = edges.filter((edge) => !ids.has(edge.from) || !ids.has(edge.to)).map(arrowEnds);
  return [...pinned, ...arrows];
}

/**
 * The three-way merge of two `.storm` texts (`ModelTextMerge` of `@miragon/modeler-api`): the
 * board's title, style and level field by field, the elements by id (notes and drawings carry
 * theirs since the DSL writes `(id …)` for them), the arrows by their ends and the lines the
 * parser keeps unread as they are. Two different changes of one of them, a change against its
 * removal, and an arrow or a pin left pointing at a removed element throw a `MergeConflictError`.
 */
export const mergeStormText: ModelTextMerge = (lastSyncedText, externalText, draftText) => {
  const [base, external, draft] = [lastSyncedText, externalText, draftText].map(parseDSL) as [
    EventStormingBoard,
    EventStormingBoard,
    EventStormingBoard,
  ];
  const conflicts: string[] = [];
  const config = mergeConfig(base.config, external.config, draft.config, conflicts);
  const elements = mergeItemsById(base.elements, external.elements, draft.elements);
  conflicts.push(...(elements.conflictingIds ?? []));
  const edges = mergeKeyed(
    [base.edges, external.edges, draft.edges].map((list) => list.map(withoutPositionalId)) as [
      ArrowEnds[],
      ArrowEnds[],
      ArrowEnds[],
    ],
    arrowEnds,
    conflicts,
  ).map((edge, index): BoardEdge => ({ id: `arrow_${index + 1}`, edgeType: "arrow", ...edge }));
  const rawPassthrough = mergeKeyed(
    [base.rawPassthrough ?? [], external.rawPassthrough ?? [], draft.rawPassthrough ?? []],
    (line) => line,
    conflicts,
  );
  const mergedElements = elements.merged ?? [];
  if (conflicts.length === 0) conflicts.push(...danglingReferences(mergedElements, edges));
  if (conflicts.length > 0) throw new MergeConflictError(conflicts);
  return serializeDSL({
    schemaVersion: draft.schemaVersion,
    config,
    elements: mergedElements,
    edges,
    ...(rawPassthrough.length > 0 ? { rawPassthrough } : {}),
  });
};
