import {
  parseDocumentText,
  serializeDocumentText,
  type CmDocument,
} from "@miragon/context-maps-schema-model";
import { MergeConflictError, mergeRecord, type ModelTextMerge } from "@miragon/modeler-api";

function documentOf(text: string): CmDocument {
  const parsed = parseDocumentText(text);
  if (!parsed.ok) throw new MergeConflictError([], `the text is no context map: ${parsed.error}`);
  return parsed.document;
}

/**
 * The three-way merge of two `.cm.json` texts (`ModelTextMerge` of `@miragon/modeler-api`): the
 * title and every other field one by one, bounded contexts and relationships by id. Two different
 * changes of one of them, a change against its removal, and a relationship left without one of its
 * contexts throw a `MergeConflictError`. The result is canonical, as `serializeDocumentText`
 * writes it.
 */
export const mergeContextMapText: ModelTextMerge = (lastSyncedText, externalText, draftText) => {
  const [base, external, draft] = [lastSyncedText, externalText, draftText].map(documentOf) as [
    CmDocument,
    CmDocument,
    CmDocument,
  ];
  const result = mergeRecord(base, external, draft, { keyedLists: ["contexts", "relationships"] });
  if (result.conflictingIds) throw new MergeConflictError(result.conflictingIds);
  const ids = new Set(result.merged.contexts.map((context) => context.id));
  const dangling = result.merged.relationships
    .filter((relationship) => !ids.has(relationship.from) || !ids.has(relationship.to))
    .map((relationship) => relationship.id);
  if (dangling.length > 0) throw new MergeConflictError(dangling);
  const merged = serializeDocumentText(result.merged);
  documentOf(merged);
  return merged;
};
