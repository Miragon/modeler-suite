import { parseDSL, patchDSL } from "@miragon/wardley-dsl";
import type { MapConfig, MapEdge, WardleyMap } from "@miragon/wardley-schema-model";
import {
  MergeConflictError,
  mergeItemsById,
  mergeItemsByOccurrence,
  mergeRecord,
  type ModelTextMerge,
} from "@miragon/modeler-api";

type EdgeWithoutId = Omit<MapEdge, "id">;

/** The parser numbers dependencies and flows by their line, so the number is no part of an edge. */
function withoutPositionalId(edge: MapEdge): EdgeWithoutId {
  const { id: _positional, ...rest } = edge;
  return rest;
}

const edgeEnds = (edge: EdgeWithoutId): string => `${edge.edgeType}:${edge.from}->${edge.to}`;

function numbered(edges: readonly EdgeWithoutId[]): MapEdge[] {
  const counts = { dependency: 0, flow: 0 };
  return edges.map((edge) => {
    counts[edge.edgeType] += 1;
    const prefix = edge.edgeType === "dependency" ? "dep" : "flow";
    return { ...edge, id: `${prefix}_${counts[edge.edgeType]}` } as MapEdge;
  });
}

/**
 * The three-way merge of two OWM texts (`ModelTextMerge` of `@miragon/modeler-api`). OWM writes no
 * ids: an element is known by the id its name derives, so a rename reads as a removal and a new
 * element, which conflicts only when the other side changed that element too. The map's settings
 * merge one by one, elements by that id, dependencies and flows by their ends and the lines the
 * parser leaves unread as they are. Two different changes of one of them, a change against its
 * removal, and an edge left without one of its ends throw a `MergeConflictError`. The result is
 * the draft's text with the merged map patched in (`patchDSL`), so its comments and order stay.
 */
export const mergeOwmText: ModelTextMerge = (lastSyncedText, externalText, draftText) => {
  if (externalText === lastSyncedText || externalText === draftText) return draftText;
  if (draftText === lastSyncedText) return externalText;
  const [base, external, draft] = [lastSyncedText, externalText, draftText].map(parseDSL) as [
    WardleyMap,
    WardleyMap,
    WardleyMap,
  ];
  const conflicts: string[] = [];
  const config = mergeRecord(base.config, external.config, draft.config);
  conflicts.push(...(config.conflictingIds ?? []).map((field) => `config.${field}`));
  const elements = mergeItemsById(base.elements, external.elements, draft.elements);
  conflicts.push(...(elements.conflictingIds ?? []));
  const edges = mergeItemsByOccurrence(
    base.edges.map(withoutPositionalId),
    external.edges.map(withoutPositionalId),
    draft.edges.map(withoutPositionalId),
    edgeEnds,
  );
  conflicts.push(...(edges.conflictingIds ?? []));
  const rawPassthrough = mergeItemsByOccurrence(
    base.rawPassthrough ?? [],
    external.rawPassthrough ?? [],
    draft.rawPassthrough ?? [],
    (line) => line,
  );
  conflicts.push(...(rawPassthrough.conflictingIds ?? []));
  const mergedEdges = edges.merged ?? [];
  const mergedRawPassthrough = rawPassthrough.merged ?? [];
  if (conflicts.length === 0) {
    const ids = new Set((elements.merged ?? []).map((element) => element.id));
    conflicts.push(
      ...mergedEdges.filter((edge) => !ids.has(edge.from) || !ids.has(edge.to)).map(edgeEnds),
    );
  }
  if (conflicts.length > 0) throw new MergeConflictError(conflicts);
  const merged: WardleyMap = {
    schemaVersion: draft.schemaVersion,
    config: config.merged as MapConfig,
    elements: elements.merged ?? [],
    edges: numbered(mergedEdges),
    ...(mergedRawPassthrough.length > 0 ? { rawPassthrough: mergedRawPassthrough } : {}),
  };
  return patchDSL(draftText, merged, { previous: draft });
};
