import {
  createEmptyDocument,
  parseDocumentJSON,
  serializeDocument,
  type ValueChainDocument,
} from "@miragon/value-chain-schema-model";
import { MergeConflictError, mergeRecord, type ModelTextMerge } from "@miragon/modeler-api";
import { BLANK_DOCUMENT_NAME } from "./CollaborativeValueChain.js";

function documentOf(text: string): ValueChainDocument {
  try {
    return text.trim() === "" ? createEmptyDocument(BLANK_DOCUMENT_NAME) : parseDocumentJSON(text);
  } catch (error) {
    throw new MergeConflictError([], `the text is no value chain: ${String(error)}`);
  }
}

/**
 * The three-way merge of two `.vc.json` texts (`ModelTextMerge` of `@miragon/modeler-api`): the
 * document's fields one by one, steps, org units and connections by id. Two different changes of
 * one of them, a change against its removal, and a connection left without its source or target
 * throw a `MergeConflictError`, and so does a result that breaks a rule between elements (a
 * connection its kinds may not have). The result is canonical, as `serializeDocument` writes it.
 */
export const mergeValueChainText: ModelTextMerge = (lastSyncedText, externalText, draftText) => {
  const [base, external, draft] = [lastSyncedText, externalText, draftText].map(documentOf) as [
    ValueChainDocument,
    ValueChainDocument,
    ValueChainDocument,
  ];
  const result = mergeRecord(base, external, draft, { keyedLists: ["elements", "connections"] });
  if (result.conflictingIds) throw new MergeConflictError(result.conflictingIds);
  const ids = new Set(result.merged.elements.map((element) => element.id));
  const dangling = result.merged.connections
    .filter((connection) => !ids.has(connection.source) || !ids.has(connection.target))
    .map((connection) => connection.id);
  if (dangling.length > 0) throw new MergeConflictError(dangling);
  const merged = serializeDocument(result.merged);
  documentOf(merged);
  return merged;
};
