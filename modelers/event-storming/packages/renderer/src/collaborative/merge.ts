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
  mergeItemsByOccurrence,
  mergeValue,
  type ModelTextMerge,
} from "@miragon/modeler-api";

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
  const arrows = mergeItemsByOccurrence(
    base.edges.map(withoutPositionalId),
    external.edges.map(withoutPositionalId),
    draft.edges.map(withoutPositionalId),
    arrowEnds,
  );
  conflicts.push(...(arrows.conflictingIds ?? []));
  const edges = (arrows.merged ?? []).map((edge, index): BoardEdge => ({
    id: `arrow_${index + 1}`,
    edgeType: "arrow",
    ...edge,
  }));
  const rawPassthrough = mergeItemsByOccurrence(
    base.rawPassthrough ?? [],
    external.rawPassthrough ?? [],
    draft.rawPassthrough ?? [],
    (line) => line,
  );
  conflicts.push(...(rawPassthrough.conflictingIds ?? []));
  const mergedRawPassthrough = rawPassthrough.merged ?? [];
  const mergedElements = elements.merged ?? [];
  if (conflicts.length === 0) conflicts.push(...danglingReferences(mergedElements, edges));
  if (conflicts.length > 0) throw new MergeConflictError(conflicts);
  return serializeDSL({
    schemaVersion: draft.schemaVersion,
    config,
    elements: mergedElements,
    edges,
    ...(mergedRawPassthrough.length > 0 ? { rawPassthrough: mergedRawPassthrough } : {}),
  });
};
