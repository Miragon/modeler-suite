import type { Diagnostic, DiagnosticCode } from "@miragon/c4-schema-model";
import type { TextRange } from "../types.js";
import type { LineIndex } from "./lines.js";

/** Statement identity for a diagnostic: the first line's text with whitespace runs collapsed. */
export function normalisedAnchor(text: string, range: TextRange): string {
  const newline = text.indexOf("\n", range.start);
  const lineEnd = newline === -1 || newline > range.end ? range.end : newline;
  return text.slice(range.start, lineEnd).trim().split(/\s+/).join(" ");
}

export interface DiagnosticInput {
  readonly code: DiagnosticCode;
  readonly severity: Diagnostic["severity"];
  readonly rejects: boolean;
  readonly message: string;
  readonly range: TextRange;
  /** Where the statement the diagnostic belongs to starts; `range` by default. */
  readonly anchorRange?: TextRange;
}

export function makeDiagnostic(text: string, lines: LineIndex, input: DiagnosticInput): Diagnostic {
  const start = lines.position(input.range.start);
  const end = lines.position(input.range.end);
  return {
    severity: input.severity,
    code: input.code,
    message: input.message,
    range: { start: input.range.start, end: input.range.end },
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
    rejects: input.rejects,
    anchor: normalisedAnchor(text, input.anchorRange ?? input.range),
  };
}

/** A rule of SPEC 3.8 that makes the text unreadable for the canvas. */
export function rejection(
  code: DiagnosticCode,
  message: string,
  range: TextRange,
  anchorRange?: TextRange,
): DiagnosticInput {
  return {
    code,
    severity: "error",
    rejects: true,
    message,
    range,
    ...(anchorRange ? { anchorRange } : {}),
  };
}

/**
 * What Structurizr 6.2.4 refuses but the canvas reads safely (SPEC 3.8); a warning where
 * Structurizr reads the text differently without failing.
 */
export function incompatibility(
  message: string,
  range: TextRange,
  anchorRange?: TextRange,
  severity: "error" | "warning" = "error",
): DiagnosticInput {
  return {
    code: "structurizr-rejects",
    severity,
    rejects: false,
    message,
    range,
    ...(anchorRange ? { anchorRange } : {}),
  };
}

export const MESSAGES = {
  unclosedBlock: "This block isn't closed. Add a line with “}” to end it.",
  unexpectedClose: "This “}” closes no block. Remove it, or open the block it belongs to.",
  unterminatedComment: "This block comment isn't closed. End it with a line that ends in “*/”.",
  unterminatedTextBlock: 'This text block isn\'t closed. End it with a line that ends in “"""”.',
  trailingComment:
    "Structurizr reads a comment after a statement as more values and mostly refuses the line. Move the comment onto a line of its own.",
  emptyTextBlock: "Structurizr fails on an empty text block. Write at least one line into it.",
  markerWithoutTextBlock:
    'Structurizr fails on this line, which ends in “"""” without opening a text block. Remove the quotes at its end.',
  textBlockLineTooShort:
    "Structurizr fails on a text block line that is shorter than the indentation of the block's first line. Indent this line as far as the first one.",
  ignoredLastLine:
    "Structurizr ignores the last line because it ends in “\\”. Remove the backslash or add the line it continues into.",
  ignoredClosingLine:
    "Structurizr ignores the last line because it ends in “\\”, so the block this “}” closes stays open and Structurizr fails. Remove the backslash.",
  invisibleLine:
    "Structurizr fails on a line that holds only control characters or special spaces. Remove them or leave the line empty.",
  invalidIdentifier: (identifier: string) =>
    `Structurizr checks “${identifier}” as an identifier on this line too, and it isn't a valid one. Use only letters, digits, “_” and “-”, and don't start with “-”.`,
} as const;
