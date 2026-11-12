import { parseText, serializeText } from '@miragon/__NOTATION__-dsl';
import { validateDocument, type DiagramDocument } from '@miragon/__NOTATION__-schema-model';
import { MergeConflictError, mergeRecord, type ModelTextMerge } from '@miragon/modeler-api';

function documentOf(text: string): DiagramDocument {
  try {
    return validateDocument(parseText(text).document);
  } catch (error) {
    throw new MergeConflictError([], `the text is no diagram: ${String(error)}`);
  }
}

/**
 * The three-way merge of two diagram texts (`ModelTextMerge` of `@miragon/modeler-api`), which an
 * IDE host (Orca) calls when an agent writes the file under the user's unsaved edits: the nodes by
 * id, the title and the list of passthrough lines as one value each. Two different changes of one of
 * them, or a change against a removal, throw a `MergeConflictError`, and so does a text the canvas
 * rejects. The result is canonical, as `serializeText` writes it.
 */
export const mergeDiagramText: ModelTextMerge = (lastSyncedText, externalText, draftText) => {
  const [base, external, draft] = [lastSyncedText, externalText, draftText].map(documentOf) as [
    DiagramDocument,
    DiagramDocument,
    DiagramDocument,
  ];
  const result = mergeRecord(base, external, draft, { keyedLists: ['nodes'] });
  if (result.conflictingIds) throw new MergeConflictError(result.conflictingIds);
  return serializeText(result.merged);
};
