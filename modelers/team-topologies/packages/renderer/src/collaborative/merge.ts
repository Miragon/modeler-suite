import { serializeDocument, type TtDocument } from "@miragon/team-topologies-schema-model";
import { MergeConflictError, mergeRecord, type ModelTextMerge } from "@miragon/modeler-api";
import { parseDocumentText } from "./CollaborativeTeamTopologies.js";

function documentOf(text: string): TtDocument {
  try {
    return parseDocumentText(text);
  } catch (error) {
    throw new MergeConflictError([], `the text is no Team Topologies diagram: ${String(error)}`);
  }
}

/**
 * The three-way merge of two `.tt` texts (`ModelTextMerge` of `@miragon/modeler-api`): the title
 * and every other field one by one, teams, interactions, flows and annotations by id. Two
 * different changes of one of them, a change against its removal, and an annotation left pinned
 * to a removed shape throw a `MergeConflictError`. The result is canonical, as `serializeDocument`
 * writes it.
 */
export const mergeTeamTopologiesText: ModelTextMerge = (
  lastSyncedText,
  externalText,
  draftText,
) => {
  const [base, external, draft] = [lastSyncedText, externalText, draftText].map(documentOf) as [
    TtDocument,
    TtDocument,
    TtDocument,
  ];
  const result = mergeRecord(base, external, draft, {
    keyedLists: ["nodes", "interactions", "flows", "annotations"],
  });
  if (result.conflictingIds) throw new MergeConflictError(result.conflictingIds);
  const { nodes, interactions, flows, annotations } = result.merged;
  const shapes = new Set([...nodes, ...interactions, ...flows].map((shape) => shape.id));
  const dangling = annotations
    .filter(
      (annotation) => annotation.attachedTo !== undefined && !shapes.has(annotation.attachedTo),
    )
    .map((annotation) => annotation.id);
  if (dangling.length > 0) throw new MergeConflictError(dangling);
  const merged = serializeDocument(result.merged);
  documentOf(merged);
  return merged;
};
