import { textWidth, type TextFont } from "./textMetrics.js";

export const ELLIPSIS = "…";

/** An explicit line break of a description: a line feed, or the DSL's escaped `\n`. */
const LINE_BREAK = /\r\n|\r|\n|\\n/;

export interface FittedLines {
  readonly lines: readonly string[];
  /** Text was dropped: the last kept line ends in an ellipsis. */
  readonly truncated: boolean;
}

/** The longest start of `line` that fits `maxWidth` with an ellipsis after it. */
export function ellipsize(line: string, maxWidth: number, font: TextFont): string {
  let kept = line.trimEnd();
  if (textWidth(`${kept}${ELLIPSIS}`, font) <= maxWidth) return `${kept}${ELLIPSIS}`;
  let low = 0;
  let high = kept.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (textWidth(`${kept.slice(0, middle).trimEnd()}${ELLIPSIS}`, font) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  kept = kept.slice(0, low).trimEnd();
  return `${kept}${ELLIPSIS}`;
}

/**
 * Greedy word wrap inside each explicit line; a word longer than the line breaks by binary search,
 * so no line is wider than `maxWidth`.
 */
export function wrapText(text: string, maxWidth: number, font: TextFont): string[] {
  const paragraphs = text.split(LINE_BREAK);
  while (paragraphs.length > 0 && paragraphs.at(-1)?.trim() === "") paragraphs.pop();
  // A trailing line break shows nothing, so it must neither take a line of the box (the stack
  // would sit off centre) nor make the last line that shows end in an ellipsis.
  return paragraphs.flatMap((paragraph) => {
    const lines = wrapParagraph(paragraph, maxWidth, font);
    return lines.length > 0 ? lines : [""];
  });
}

function wrapParagraph(text: string, maxWidth: number, font: TextFont): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const fits = (candidate: string) => textWidth(candidate, font) <= maxWidth;
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    let rest = word;
    while (rest.length > 1 && !fits(rest)) {
      let low = 1;
      let high = rest.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (fits(rest.slice(0, middle))) low = middle;
        else high = middle - 1;
      }
      lines.push(rest.slice(0, low));
      rest = rest.slice(low);
    }
    current = rest;
  }
  if (current) lines.push(current);
  return lines;
}

/** At most `maxLines` wrapped lines; the last kept one is ellipsised when text was dropped. */
export function fitLines(
  text: string,
  maxWidth: number,
  font: TextFont,
  maxLines: number,
): FittedLines {
  const lines = wrapText(text, maxWidth, font);
  if (lines.length <= maxLines) return { lines, truncated: false };
  if (maxLines <= 0) return { lines: [], truncated: true };
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(kept[maxLines - 1] ?? "", maxWidth, font);
  return { lines: kept, truncated: true };
}

/**
 * The same lines as `fitted` holds, of as even a width as the wrap allows: the narrowest width
 * that still wraps `text` into that many lines. A cut text and a single line stay as they are.
 */
export function balanced(
  fitted: FittedLines,
  text: string,
  maxWidth: number,
  font: TextFont,
): FittedLines {
  const count = fitted.lines.length;
  if (fitted.truncated || count < 2) return fitted;
  let narrow = 0;
  let wide = maxWidth;
  // Half a pixel: no drawn line moves by more, and the search stays short.
  while (wide - narrow > 0.5) {
    const middle = (narrow + wide) / 2;
    if (wrapText(text, middle, font).length <= count) wide = middle;
    else narrow = middle;
  }
  const lines = wrapText(text, wide, font);
  return lines.length === count ? { lines, truncated: false } : fitted;
}

/** One line: line breaks become spaces, and what does not fit ends in an ellipsis. */
export function singleLine(text: string, maxWidth: number, font: TextFont): FittedLines {
  const flat = text.split(LINE_BREAK).join(" ").replace(/\s+/g, " ").trim();
  if (flat === "") return { lines: [], truncated: false };
  if (textWidth(flat, font) <= maxWidth) return { lines: [flat], truncated: false };
  return { lines: [ellipsize(flat, maxWidth, font)], truncated: true };
}

/** Text without its line breaks, as Structurizr draws a name. */
export function withoutLineBreaks(text: string): string {
  return text.split(LINE_BREAK).join(" ").replace(/\s+/g, " ").trim();
}
