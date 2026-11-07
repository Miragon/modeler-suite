import { parseWorkspace } from "@miragon/c4-dsl";
import { MergeConflictError, mergeTextLines, type ModelTextMerge } from "@miragon/modeler-api";

/** The parser's findings on `text`; throws a conflict when it is no workspace at all. */
function findingsOf(text: string, what: string): Set<string> {
  const parsed = parseWorkspace(text);
  if (!parsed.ok) {
    const first = parsed.diagnostics.find((diagnostic) => diagnostic.rejects);
    throw new MergeConflictError(
      [],
      `${what} is no workspace: ${first?.message ?? "it does not parse"}`,
    );
  }
  return new Set(parsed.diagnostics.map((diagnostic) => diagnostic.message));
}

/**
 * The three-way merge of two Structurizr DSL texts (`ModelTextMerge` of `@miragon/modeler-api`).
 * The DSL is the document itself, kept as written, and an element without an identifier has no key
 * to merge it by, so the texts merge line by line (`mergeTextLines`): changes to different regions
 * are all kept, and two different changes of one region conflict. So does a result the parser
 * finds something in that neither side had (a relationship to an element the other side removed).
 */
export const mergeC4Text: ModelTextMerge = (lastSyncedText, externalText, draftText) => {
  const known = new Set([
    ...findingsOf(externalText, "the outside text"),
    ...findingsOf(draftText, "the draft"),
  ]);
  const result = mergeTextLines(lastSyncedText, externalText, draftText);
  if (result.conflictingIds) throw new MergeConflictError(result.conflictingIds);
  const added = [...findingsOf(result.merged, "the merged text")].filter(
    (finding) => !known.has(finding),
  );
  if (added.length > 0) throw new MergeConflictError([], `the merged text ${added.join("; ")}`);
  return result.merged;
};
