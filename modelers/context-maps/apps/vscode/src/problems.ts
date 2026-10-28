import {
  findNodeAtLocation,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";
import {
  MAX_NESTING_DEPTH,
  parseDocumentText,
  validateDocument,
  type ParseIssue,
  type SemanticFinding,
} from "@miragon/context-maps-schema-model";

/** A problem of a map text, at character offsets of that text. */
export interface MapProblem {
  severity: "error" | "warning";
  message: string;
  /** The rule of a semantic finding (guide: the code next to the message). */
  rule?: string;
  start: number;
  end: number;
}

/**
 * jsonc-parser descends one call per level and overflows the stack a few thousand levels down,
 * so a text nested deeper than this is read by the schema model's JSON.parse alone.
 */
const TREE_PARSER_NESTING_LIMIT = 1_000;

/** "CloseBraceExpected" → "close brace expected". */
function words(code: string): string {
  return code.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function span(node: Node | undefined, text: string): { start: number; end: number } {
  if (!node) return { start: 0, end: Math.max(0, text.indexOf("\n")) || text.length };
  const target = node.parent?.type === "property" ? node.parent : node;
  return { start: target.offset, end: target.offset + target.length };
}

/** The offset of the first bracket that opens a level beyond `limit`, outside strings. */
function offsetBeyondNesting(text: string, limit: number): number | undefined {
  let depth = 0;
  let inString = false;
  for (let offset = 0; offset < text.length; offset++) {
    const char = text[offset];
    if (inString) {
      if (char === "\\") offset++;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      if (++depth > limit) return offset;
    } else if (char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
    }
  }
  return undefined;
}

/**
 * Where JSON.parse failed in `text`: V8 names the offset only in its message, counted after the
 * byte order mark that `parseDocumentText` drops.
 */
function jsonErrorOffset(message: string, text: string): number | undefined {
  const position = /at position (\d+)/.exec(message)?.[1];
  if (position === undefined) return undefined;
  return Math.min(Number(position) + (text.startsWith("\uFEFF") ? 1 : 0), text.length);
}

/**
 * Where an issue of a text too deep for the tree parser goes, without a tree to find its path in:
 * a JSON error where JSON.parse found it, a nesting issue at the first bracket beyond
 * {@link MAX_NESTING_DEPTH} (no other path is that long: the model's own fields need four
 * levels), and anything else at the start of the file.
 */
function spanWithoutTree(issue: ParseIssue, text: string): { start: number; end: number } {
  const offset =
    issue.path.length === 0
      ? jsonErrorOffset(issue.message, text)
      : issue.path.length >= MAX_NESTING_DEPTH
        ? offsetBeyondNesting(text, MAX_NESTING_DEPTH)
        : undefined;
  if (offset === undefined) return span(undefined, text);
  return { start: offset, end: Math.min(offset + 1, text.length) };
}

/** The relationship objects of the map text by their `id`. */
function relationshipsById(tree: Node): Map<string, Node> {
  const list = findNodeAtLocation(tree, ["relationships"]);
  return new Map(
    (list?.children ?? []).flatMap((child): Array<[string, Node]> => {
      const id = findNodeAtLocation(child, ["id"])?.value;
      return typeof id === "string" ? [[id, child]] : [];
    }),
  );
}

function semanticProblems(
  tree: Node | undefined,
  text: string,
  findings: SemanticFinding[],
  severity: MapProblem["severity"],
): MapProblem[] {
  const relationships = tree === undefined ? new Map<string, Node>() : relationshipsById(tree);
  return findings.map((finding) => {
    const node =
      finding.relationshipId === undefined ? undefined : relationships.get(finding.relationshipId);
    return { severity, message: finding.message, rule: finding.rule, ...span(node, text) };
  });
}

/**
 * Every problem of a map text: JSON syntax errors, structural errors at the offending value (a
 * repeated id at the repeat), and the semantic rules (relationship findings on the relationship's
 * object). An empty text is an empty map, without problems. A text nested too deep for the tree
 * parser has its nesting issue at the first bracket beyond {@link MAX_NESTING_DEPTH}.
 */
export function mapProblems(text: string): MapProblem[] {
  if (text.trim() === "") return [];
  let tree: Node | undefined;
  if (offsetBeyondNesting(text, TREE_PARSER_NESTING_LIMIT) === undefined) {
    const syntaxErrors: ParseError[] = [];
    tree = parseTree(text, syntaxErrors, { disallowComments: true, allowTrailingComma: false });
    if (syntaxErrors.length > 0 || !tree) {
      return syntaxErrors.map((error) => ({
        severity: "error",
        message: `Not valid JSON: ${words(printParseErrorCode(error.error))}.`,
        start: error.offset,
        end: error.offset + Math.max(error.length, 1),
      }));
    }
  }
  const parsed = parseDocumentText(text);
  if (!parsed.ok) {
    return (parsed.issues ?? [{ path: [], message: parsed.error }]).map((issue) => {
      const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return {
        severity: "error",
        message: `${where}${issue.message}`,
        ...(tree === undefined
          ? spanWithoutTree(issue, text)
          : span(
              issue.path.length > 0 ? findNodeAtLocation(tree, [...issue.path]) : undefined,
              text,
            )),
      };
    });
  }
  const report = validateDocument(parsed.document);
  return [
    ...semanticProblems(tree, text, report.errors, "error"),
    ...semanticProblems(tree, text, report.warnings, "warning"),
  ];
}

/** The problems pill's summary: how many problems, how many of them errors. */
export function problemCounts(problems: readonly MapProblem[]): { count: number; errors: number } {
  return {
    count: problems.length,
    errors: problems.filter((problem) => problem.severity === "error").length,
  };
}
