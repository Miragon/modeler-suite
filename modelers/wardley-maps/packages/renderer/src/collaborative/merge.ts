import { parseDSL, patchDSL } from "@miragon/wardley-dsl";
import type { MapConfig, MapEdge, WardleyMap } from "@miragon/wardley-schema-model";
import {
  MergeConflictError,
  mergeItemsById,
  mergeRecord,
  type ModelTextMerge,
} from "@miragon/modeler-api";

interface Keyed<T> {
  readonly key: string;
  readonly value: T;
}

/** Keys repeated values by their occurrence, so two equal dependencies or lines stay two. */
function keyedByOccurrence<T>(values: readonly T[], keyOf: (value: T) => string): Keyed<T>[] {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const base = keyOf(value);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return { key: `${base}#${occurrence}`, value };
  });
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
  const edges = mergeKeyed(
    [base.edges, external.edges, draft.edges].map((list) => list.map(withoutPositionalId)) as [
      EdgeWithoutId[],
      EdgeWithoutId[],
      EdgeWithoutId[],
    ],
    edgeEnds,
    conflicts,
  );
  const rawPassthrough = mergeKeyed(
    [base.rawPassthrough ?? [], external.rawPassthrough ?? [], draft.rawPassthrough ?? []],
    (line) => line,
    conflicts,
  );
  if (conflicts.length === 0) {
    const ids = new Set((elements.merged ?? []).map((element) => element.id));
    conflicts.push(
      ...edges.filter((edge) => !ids.has(edge.from) || !ids.has(edge.to)).map(edgeEnds),
    );
  }
  if (conflicts.length > 0) throw new MergeConflictError(conflicts);
  const merged: WardleyMap = {
    schemaVersion: draft.schemaVersion,
    config: config.merged as MapConfig,
    elements: elements.merged ?? [],
    edges: numbered(edges),
    ...(rawPassthrough.length > 0 ? { rawPassthrough } : {}),
  };
  return patchDSL(draftText, merged, { previous: draft });
};
