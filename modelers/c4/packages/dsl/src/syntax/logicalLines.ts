/*
 * `StructurizrDslParser.preProcessLines`, re-implemented on offsets: continuations and text blocks
 * join physical lines into the logical lines the tokenizer reads. The order of the checks and
 * every quirk follow the reference code, so a statement spans exactly the lines Structurizr reads
 * as one, block comments included (Structurizr pre-processes their lines too).
 */
import type { TextRange } from "../types.js";
import { isCommentLine, javaLeadingWhitespace, javaTrim } from "./characters.js";
import { BYTE_ORDER_MARK, type PhysicalLine } from "./lines.js";

const TEXT_BLOCK_MARKER = '"""';

/** Stands in for `"${<uuid>}"`'s name: a character the reference classifies as plain text. */
export const PLACEHOLDER_CHARACTER = "\uE000";

export interface TextBlockSpan {
  /** From the marker that opens it to the end of the logical line. */
  readonly range: TextRange;
  /** The content as Structurizr reads it: indentation cut, final line break dropped, not unescaped. */
  readonly value: string;
}

export type LogicalLineProblem =
  | "unterminated-text-block"
  | "empty-text-block"
  | "marker-without-text-block"
  | "text-block-line-too-short"
  | "ignored-last-line";

export interface LogicalLine {
  readonly firstLine: number;
  readonly lastLine: number;
  /** The first physical line's start. */
  readonly start: number;
  /** The last physical line's end, line break excluded. */
  readonly end: number;
  /** What the parse loop reads: a leading byte order mark cut, a text block replaced by `"<placeholder>"`. */
  readonly chars: string;
  /** The source offset of every character of `chars`. */
  readonly offsets: readonly number[];
  /** The index of the text block's placeholder in `chars`, or -1. */
  readonly placeholder: number;
  readonly textBlock: TextBlockSpan | undefined;
  /** At least one physical line ends in `\` and continues into the next. */
  readonly continued: boolean;
  readonly problems: readonly { readonly problem: LogicalLineProblem; readonly range: TextRange }[];
}

class LineBuffer {
  private parts: string[] = [];
  offsets: number[] = [];

  appendSlice(text: string, from: number, to: number): void {
    if (to <= from) {
      return;
    }
    this.parts.push(text.slice(from, to));
    for (let offset = from; offset < to; offset += 1) {
      this.offsets.push(offset);
    }
  }

  appendLineBreak(offset: number): void {
    this.parts.push("\n");
    this.offsets.push(offset);
  }

  text(): string {
    return this.parts.join("");
  }
}

interface PendingLine {
  readonly firstLine: number;
  readonly buffer: LineBuffer;
  readonly problems: { problem: LogicalLineProblem; range: TextRange }[];
  continued: boolean;
  textBlockOpened: boolean;
}

/**
 * `source.split('"""')` of the reference: the content is what lies between the first two markers;
 * `undefined` where Structurizr throws (no content, or nothing after the only marker).
 */
function textBlockContent(
  chars: string,
  terminated: boolean,
): { first: number; content: string | undefined } {
  const first = chars.indexOf(TEXT_BLOCK_MARKER);
  if (!terminated) {
    const content = chars.slice(first + TEXT_BLOCK_MARKER.length);
    return { first, content: content.endsWith("\n") ? content.slice(0, -1) : content };
  }
  const second = chars.indexOf(TEXT_BLOCK_MARKER, first + TEXT_BLOCK_MARKER.length);
  const between =
    second === -1
      ? chars.slice(first + TEXT_BLOCK_MARKER.length)
      : chars.slice(first + TEXT_BLOCK_MARKER.length, second);
  return { first, content: between === "" ? undefined : between.slice(0, -1) };
}

function completeLine(
  pending: PendingLine,
  lines: readonly PhysicalLine[],
  lastLine: number,
  terminated: boolean,
): LogicalLine {
  const start = lines[pending.firstLine]?.start ?? 0;
  const end = lines[lastLine]?.end ?? start;
  let chars = pending.buffer.text();
  let offsets = pending.buffer.offsets;
  let placeholder = -1;
  let textBlock: TextBlockSpan | undefined;
  const rewrites = terminated ? chars.endsWith(TEXT_BLOCK_MARKER) : pending.textBlockOpened;
  if (rewrites) {
    const { first, content } = textBlockContent(chars, terminated);
    const markerOffset = offsets[first] ?? start;
    if (!terminated) {
      pending.problems.push({
        problem: "unterminated-text-block",
        range: { start: markerOffset, end: markerOffset + TEXT_BLOCK_MARKER.length },
      });
    } else if (content === undefined) {
      pending.problems.push({
        problem: pending.textBlockOpened ? "empty-text-block" : "marker-without-text-block",
        range: { start: markerOffset, end },
      });
    }
    if (content !== undefined || pending.textBlockOpened) {
      chars = `${chars.slice(0, first)}"${PLACEHOLDER_CHARACTER}"`;
      offsets = [
        ...offsets.slice(0, first),
        markerOffset,
        markerOffset + 1,
        Math.max(markerOffset + 2, end - 1),
      ];
      placeholder = first + 1;
      textBlock = { range: { start: markerOffset, end }, value: content ?? "" };
    }
  }
  if (chars.startsWith(BYTE_ORDER_MARK)) {
    chars = chars.slice(1);
    offsets = offsets.slice(1);
    placeholder = placeholder === -1 ? -1 : placeholder - 1;
  }
  return {
    firstLine: pending.firstLine,
    lastLine,
    start,
    end,
    chars,
    offsets,
    placeholder,
    textBlock,
    continued: pending.continued,
    problems: pending.problems,
  };
}

function newPending(firstLine: number): PendingLine {
  return {
    firstLine,
    buffer: new LineBuffer(),
    problems: [],
    continued: false,
    textBlockOpened: false,
  };
}

/** Joins physical lines into logical lines; every physical line belongs to exactly one. */
export function logicalLines(text: string, lines: readonly PhysicalLine[]): LogicalLine[] {
  const result: LogicalLine[] = [];
  const bom = text.startsWith(BYTE_ORDER_MARK);
  let pending = newPending(0);
  let lineComplete = true;
  let inTextBlock = false;
  let leadingSpace = -1;
  lines.forEach((line, index) => {
    const content = text.slice(line.start, line.end);
    if (inTextBlock) {
      if (content.endsWith(TEXT_BLOCK_MARKER)) {
        pending.buffer.appendSlice(text, line.end - TEXT_BLOCK_MARKER.length, line.end);
        inTextBlock = false;
        leadingSpace = -1;
        lineComplete = true;
      } else {
        if (leadingSpace === -1) {
          leadingSpace = javaLeadingWhitespace(content);
        }
        if (javaTrim(content) !== "") {
          if (content.length < leadingSpace) {
            pending.problems.push({
              problem: "text-block-line-too-short",
              range: { start: line.start, end: line.end },
            });
          } else {
            pending.buffer.appendSlice(text, line.start + leadingSpace, line.end);
          }
        }
        pending.buffer.appendLineBreak(line.end);
      }
    } else {
      const comment = isCommentLine(index === 0 && bom ? BYTE_ORDER_MARK + content : content);
      if (!comment && content.endsWith("\\")) {
        pending.buffer.appendSlice(text, line.start, line.end - 1);
        pending.continued = true;
        lineComplete = false;
      } else if (!comment && content.endsWith(TEXT_BLOCK_MARKER)) {
        pending.buffer.appendSlice(text, line.start, line.end);
        pending.textBlockOpened = true;
        inTextBlock = true;
        lineComplete = false;
      } else {
        const skipped = lineComplete ? 0 : javaLeadingWhitespace(content);
        pending.buffer.appendSlice(text, line.start + skipped, line.end);
        lineComplete = true;
      }
    }
    if (lineComplete) {
      result.push(completeLine(pending, lines, index, true));
      pending = newPending(index + 1);
    }
  });
  if (!lineComplete && lines.length > 0) {
    const last = lines.length - 1;
    if (!inTextBlock) {
      const lastLine = lines[last] ?? { start: 0, end: 0 };
      pending.problems.push({
        problem: "ignored-last-line",
        range: { start: lastLine.start, end: lastLine.end },
      });
    }
    result.push(completeLine(pending, lines, last, false));
  }
  return result;
}
