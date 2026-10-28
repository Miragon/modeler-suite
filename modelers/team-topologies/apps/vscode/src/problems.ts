/**
 * What is wrong with a document text, located in the text, for the Problems view (guide §13.5):
 * errors where the text is no valid diagram (the webview then shows the last valid one, locked),
 * warnings where it opens but loses something (a connector to an element that does not exist).
 * Pure, so the extension host and the tests share it.
 */

import {
  createScanner,
  findNodeAtLocation,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";
import {
  MAX_NESTING_DEPTH,
  parseDocument,
  type DocumentIssue,
  type TtDocument,
} from "@miragon/team-topologies-schema-model";

export interface DocumentProblem {
  severity: "error" | "warning";
  message: string;
  /** Where in the text, as a character offset and length. */
  offset: number;
  length: number;
}

/** jsonc-parser's error names (its codes are a const enum, unreadable under isolatedModules). */
const SYNTAX_ERRORS: Readonly<Record<string, string>> = {
  InvalidSymbol: "unexpected character",
  InvalidNumberFormat: "invalid number",
  PropertyNameExpected: "expected a property name in double quotes",
  ValueExpected: "expected a value",
  ColonExpected: "expected a colon",
  CommaExpected: "expected a comma",
  CloseBraceExpected: "expected a closing brace",
  CloseBracketExpected: "expected a closing bracket",
  EndOfFileExpected: "expected the end of the file",
  InvalidCommentToken: "comments are not allowed",
  UnexpectedEndOfComment: "comments are not allowed",
  UnexpectedEndOfString: "unterminated string",
  UnexpectedEndOfNumber: "unterminated number",
  InvalidUnicode: "invalid Unicode escape",
  InvalidEscapeCharacter: "invalid escape character",
  InvalidCharacter: "invalid character in a string",
};

function syntaxProblem({ error, offset, length }: ParseError): DocumentProblem {
  return {
    severity: "error",
    message: `Not valid JSON: ${SYNTAX_ERRORS[printParseErrorCode(error)] ?? "unexpected input"}.`,
    offset,
    length: Math.max(length, 1),
  };
}

const NO_VALUE: DocumentProblem = {
  severity: "error",
  message: "Not valid JSON: expected a value.",
  offset: 0,
  length: 1,
};

/** The value at `path`, or the closest object or array above it when the value is missing. */
function located(tree: Node, path: (string | number)[]): { offset: number; length: number } {
  for (let depth = path.length; depth >= 0; depth -= 1) {
    const node = findNodeAtLocation(tree, path.slice(0, depth));
    if (!node) continue;
    // A missing field points at the object that lacks it: its opening brace, not the whole block.
    if (depth < path.length && (node.type === "object" || node.type === "array")) {
      return { offset: node.offset, length: 1 };
    }
    return { offset: node.offset, length: Math.max(node.length, 1) };
  }
  return { offset: 0, length: 1 };
}

/**
 * The keys a label names. A path into the known fields has at most four; only the nesting limit's
 * issue has more, a hundred, and its first four still name the field its branch starts at, while
 * the problem's place in the text points at the level too deep.
 */
const LABELLED_KEYS = 4;

function pathLabel(path: (string | number)[]): string {
  const label = path
    .slice(0, LABELLED_KEYS)
    .reduce<string>(
      (text, key) => (typeof key === "number" ? `${text}[${key}]` : text ? `${text}.${key}` : key),
      "",
    );
  return path.length > LABELLED_KEYS ? `${label}…` : label;
}

function issueMessage(issue: DocumentIssue): string {
  const where = pathLabel(issue.path);
  return where ? `${where}: ${issue.message}` : issue.message;
}

function issueProblem(tree: Node, issue: DocumentIssue): DocumentProblem {
  return { severity: "error", message: issueMessage(issue), ...located(tree, issue.path) };
}

/**
 * The offset of the first bracket that opens a level beyond `limit`. Read with jsonc-parser's own
 * scanner, so strings and comments end where its tree parser ends them (a string at a line break),
 * and a bracket closes only a level of its own kind, because the tree parser skips any other and
 * keeps nesting: the depth found here is never below the depth the tree parser descends to.
 */
function offsetBeyondNesting(text: string, limit: number): number | undefined {
  const scanner = createScanner(text, true);
  const closingBrackets: string[] = [];
  for (scanner.scan(); scanner.getTokenOffset() < text.length; scanner.scan()) {
    const offset = scanner.getTokenOffset();
    const firstCharacter = text[offset];
    if (firstCharacter === "{" || firstCharacter === "[") {
      closingBrackets.push(firstCharacter === "{" ? "}" : "]");
      if (closingBrackets.length > limit) return offset;
    } else if (firstCharacter === closingBrackets[closingBrackets.length - 1]) {
      closingBrackets.pop();
    }
  }
  return undefined;
}

/**
 * jsonc-parser's tree parser descends one call per level and overflows the stack a few thousand
 * levels down, so a text nested deeper than this is read by JSON.parse alone.
 */
const TREE_PARSER_NESTING_LIMIT = 1_000;

/** Where JSON.parse failed: V8 names the offset only in its message. */
function jsonParseErrorOffset(reason: string, text: string): number {
  const position = /at position (\d+)/.exec(reason)?.[1];
  return position === undefined ? 0 : Math.min(Number(position), text.length);
}

/**
 * A text too deep for the tree parser. Without a tree a path has no place in the text, and what
 * makes such a text invalid is its nesting, which starts at the first bracket beyond the limit.
 */
function problemsWithoutTree(text: string): DocumentProblem[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const offset = jsonParseErrorOffset(reason, text);
    return [{ severity: "error", message: `Not valid JSON: ${reason}`, offset, length: 1 }];
  }
  const result = parseDocument(value);
  if (result.ok) return [];
  const offset = offsetBeyondNesting(text, MAX_NESTING_DEPTH) ?? 0;
  return result.issues.map((issue) => ({
    severity: "error",
    message: issueMessage(issue),
    offset,
    length: 1,
  }));
}

/** Connectors the diagram drops on open, as the renderer's importer warns about them. */
function attachmentWarnings(document: TtDocument, tree: Node): DocumentProblem[] {
  const elementIds = new Set(
    [...document.nodes, ...document.interactions, ...document.flows].map((element) => element.id),
  );
  const annotationIds = new Set(document.annotations.map((annotation) => annotation.id));
  return document.annotations.flatMap((annotation, index) => {
    const target = annotation.attachedTo;
    if (target === undefined || elementIds.has(target)) return [];
    const reason = annotationIds.has(target)
      ? `is attached to the annotation "${target}"; an annotation attaches only to a team, an interaction or a flow, so its connector is dropped.`
      : `is attached to "${target}", which is not in the diagram, so its connector is dropped.`;
    return [
      {
        severity: "warning" as const,
        message: `Annotation "${annotation.id}" ${reason}`,
        ...located(tree, ["annotations", index, "attachedTo"]),
      },
    ];
  });
}

export function documentProblems(text: string): DocumentProblem[] {
  // A blank file is a new, empty diagram (the webview reads it the same way).
  if (text.trim() === "") return [];
  if (offsetBeyondNesting(text, TREE_PARSER_NESTING_LIMIT) !== undefined) {
    return problemsWithoutTree(text);
  }
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (errors.length > 0) return errors.map(syntaxProblem);
  if (!tree) return [NO_VALUE];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [{ severity: "error", message: `Not valid JSON: ${reason}`, offset: 0, length: 1 }];
  }
  const result = parseDocument(value);
  if (!result.ok) return result.issues.map((issue) => issueProblem(tree, issue));
  return attachmentWarnings(result.document, tree);
}
