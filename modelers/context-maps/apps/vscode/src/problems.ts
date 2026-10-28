import {
  createScanner,
  findNodeAtLocation,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";
import {
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

interface Span {
  start: number;
  end: number;
}

/**
 * jsonc-parser descends one call per level and overflows the stack a few thousand levels down,
 * so a text nested deeper than this is read without a syntax tree.
 */
const TREE_PARSER_NESTING_LIMIT = 1_000;

const BYTE_ORDER_MARK = "\uFEFF";

/** "CloseBraceExpected" → "close brace expected". */
function words(code: string): string {
  return code.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function span(node: Node | undefined, text: string): Span {
  if (!node) return { start: 0, end: Math.max(0, text.indexOf("\n")) || text.length };
  const target = node.parent?.type === "property" ? node.parent : node;
  return { start: target.offset, end: target.offset + target.length };
}

/** A token as jsonc-parser's scanner reads it, told apart by its first character. */
interface Token {
  readonly first: string;
  readonly start: number;
  readonly end: number;
  /** A string's value, without its quotes and escapes. */
  readonly value: string;
}

/** The tokens of `text` as jsonc-parser reads them, without whitespace and comments. */
function* tokensOf(text: string): Generator<Token> {
  const scanner = createScanner(text, true);
  scanner.setPosition(text.startsWith(BYTE_ORDER_MARK) ? 1 : 0);
  for (scanner.scan(); scanner.getTokenOffset() < text.length; scanner.scan()) {
    const start = scanner.getTokenOffset();
    const end = start + scanner.getTokenLength();
    yield { first: text.charAt(start), start, end, value: scanner.getTokenValue() };
  }
}

/**
 * The offset of the first bracket that opens a level beyond `limit`. Read as jsonc-parser reads
 * the text, so strings and comments end where its tree parser ends them (a string at a line
 * break), and a bracket closes only a level of its own kind, because the tree parser skips any
 * other and keeps nesting: the depth found here is never below the depth the tree parser
 * descends to.
 */
function offsetBeyondNesting(text: string, limit: number): number | undefined {
  const closingBrackets: string[] = [];
  for (const { first, start } of tokensOf(text)) {
    if (first === "{" || first === "[") {
      closingBrackets.push(first === "{" ? "}" : "]");
      if (closingBrackets.length > limit) return start;
    } else if (first === closingBrackets.at(-1)) {
      closingBrackets.pop();
    }
  }
  return undefined;
}

/** The syntax tree of `text` with jsonc-parser's errors, or no tree for a text too deep for it. */
function syntaxTree(text: string): { tree: Node | undefined; errors: ParseError[] } {
  const errors: ParseError[] = [];
  if (offsetBeyondNesting(text, TREE_PARSER_NESTING_LIMIT) !== undefined) {
    return { tree: undefined, errors };
  }
  const tree = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  return { tree, errors };
}

/**
 * Where JSON.parse failed in `text`, when V8 names the offset in its message (it does not for an
 * unexpected token), counted after the byte order mark that `parseDocumentText` drops.
 */
function jsonErrorOffset(message: string, text: string): number | undefined {
  const position = /at position (\d+)/.exec(message)?.[1];
  if (position === undefined) return undefined;
  return Math.min(Number(position) + (text.startsWith(BYTE_ORDER_MARK) ? 1 : 0), text.length);
}

interface OpenContainer {
  readonly isArray: boolean;
  /** Where the container starts: at its key when it is the value of a member. */
  readonly start: number;
  /** The indices of the paths that name this container. */
  readonly named: readonly number[];
  /** The key or index of the member being read. */
  member: string | number;
  /** Where that member starts: at its key in an object, at its value in an array. */
  memberStart: number;
}

function startsValue(parent: OpenContainer | undefined, previous: string | undefined): boolean {
  if (parent === undefined) return true;
  return parent.isArray ? previous === "[" || previous === "," : previous === ":";
}

/**
 * Where the value at each path sits in a text JSON.parse accepted, marked as {@link span} marks
 * it in a tree (a member from its key). Read token by token, because the texts it is for
 * overflow the tree parser. A repeated key counts at its last occurrence, the one JSON.parse
 * keeps.
 */
function spansAtPaths(
  text: string,
  paths: ReadonlyArray<ParseIssue["path"]>,
): Array<Span | undefined> {
  const indicesByPath = new Map<string, number[]>();
  paths.forEach((path, index) => {
    const key = JSON.stringify(path);
    indicesByPath.set(key, [...(indicesByPath.get(key) ?? []), index]);
  });
  const pathLengths = new Set(paths.map((path) => path.length));
  const spans: Array<Span | undefined> = paths.map(() => undefined);
  const open: OpenContainer[] = [];
  let previous: string | undefined;
  for (const token of tokensOf(text)) {
    const parent = open.at(-1);
    if (token.first === "}" || token.first === "]") {
      const closed = open.pop();
      if (closed !== undefined) {
        for (const index of closed.named) spans[index] = { start: closed.start, end: token.end };
      }
    } else if (startsValue(parent, previous)) {
      if (parent?.isArray) {
        parent.member = previous === "[" ? 0 : Number(parent.member) + 1;
        parent.memberStart = token.start;
      }
      const named = pathLengths.has(open.length)
        ? (indicesByPath.get(JSON.stringify(open.map(({ member }) => member))) ?? [])
        : [];
      const start = parent?.memberStart ?? token.start;
      if (token.first === "{" || token.first === "[") {
        const isArray = token.first === "[";
        open.push({ isArray, start, named, member: 0, memberStart: token.start });
      } else {
        for (const index of named) spans[index] = { start, end: token.end };
      }
    } else if (token.first === '"' && parent !== undefined) {
      parent.member = token.value;
      parent.memberStart = token.start;
    }
    previous = token.first;
  }
  return spans;
}

/**
 * Where the issues of a text read without a tree go: a finding with a path where a tree would
 * put it, a JSON error where V8 names its position, and anything else at the start of the file.
 * Only a text JSON.parse read has findings with a path.
 */
function spansWithoutTree(issues: readonly ParseIssue[], text: string): Span[] {
  const paths = issues.map(({ path }) => path);
  const atPaths = paths.some((path) => path.length > 0) ? spansAtPaths(text, paths) : [];
  return issues.map((issue, index) => {
    if (issue.path.length > 0) return atPaths[index] ?? span(undefined, text);
    const offset = jsonErrorOffset(issue.message, text);
    if (offset === undefined) return span(undefined, text);
    return { start: offset, end: Math.min(offset + 1, text.length) };
  });
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
 * repeated id at the repeat, a nesting issue at the first object or array beyond the limit), and
 * the semantic rules (relationship findings on the relationship's object). An empty text is an
 * empty map, without problems. A text too deep for the tree parser is read token by token: its
 * structural errors keep their places, a JSON error sits where V8's message names it, and what
 * has no place (a semantic finding, a JSON error without a position) at the start of the file.
 */
export function mapProblems(text: string): MapProblem[] {
  if (text.trim() === "") return [];
  const { tree, errors } = syntaxTree(text);
  if (errors.length > 0) {
    return errors.map((error) => ({
      severity: "error",
      message: `Not valid JSON: ${words(printParseErrorCode(error.error))}.`,
      start: error.offset,
      end: error.offset + Math.max(error.length, 1),
    }));
  }
  const parsed = parseDocumentText(text);
  if (!parsed.ok) {
    const issues = parsed.issues ?? [{ path: [], message: parsed.error }];
    const spans =
      tree === undefined
        ? spansWithoutTree(issues, text)
        : issues.map(({ path }) =>
            span(path.length > 0 ? findNodeAtLocation(tree, [...path]) : undefined, text),
          );
    return issues.map((issue, index) => {
      const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return { severity: "error", message: `${where}${issue.message}`, ...spans[index] };
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
