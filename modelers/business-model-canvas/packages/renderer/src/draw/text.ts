import TextUtil, { type TextLayoutConfig } from "diagram-js/lib/util/Text";
import { FONT } from "./styles.js";

const ELLIPSIS = "…";
const HYPHEN = "-";
/** A word is broken only where both of its parts keep this many letters. */
const SHORTEST_WORD_PART = 3;
const UNBOUNDED = 100_000;

export interface TextBox {
  width: number;
  height: number;
}

export interface FittedTextOptions {
  box: TextBox;
  fontSize: number;
  /** A text that does not fit is set smaller, one pixel at a time, down to this size. */
  smallestFontSize?: number;
  fill: string;
  align?: "left-top" | "center-middle";
  padding?: number;
  /** Above and below, where it differs from `padding`. */
  verticalPadding?: number;
  fontWeight?: number;
}

export interface FittedText {
  element: SVGElement;
  /** Whether part of the text did not fit and the last line ends in an ellipsis. */
  truncated: boolean;
}

interface Setting {
  util: TextUtil;
  config: TextLayoutConfig;
  family: string;
  maxLines: number;
  lineWidth: number;
}

function settingAt(fontSize: number, options: FittedTextOptions): Setting {
  const style = {
    fontFamily: FONT.family,
    fontSize,
    lineHeight: FONT.lineHeight,
    ...(options.fontWeight ? { fontWeight: options.fontWeight } : {}),
  };
  const horizontal = options.padding ?? 0;
  const vertical = options.verticalPadding ?? horizontal;
  const config: TextLayoutConfig = {
    box: options.box,
    // diagram-js's typings list only the centred alignments its own renderers use.
    align: (options.align ?? "left-top") as "center-middle",
    padding: { top: vertical, bottom: vertical, left: horizontal, right: horizontal },
    style: { fill: options.fill },
  };
  return {
    util: new TextUtil({ style }),
    config,
    family: style.fontFamily,
    maxLines: Math.max(
      1,
      Math.floor((options.box.height - 2 * vertical) / (fontSize * FONT.lineHeight)),
    ),
    lineWidth: options.box.width - 2 * horizontal,
  };
}

function widthOf(word: string, setting: Setting): number {
  return setting.util.getDimensions(word, {
    box: { width: UNBOUNDED, height: UNBOUNDED },
  }).width;
}

const VOWEL = /[aeiouyäöü]/i;
const LETTER = /\p{L}/u;
const UNSPLIT_PAIRS = new Set(["ch", "ck", "ph", "th", "sc"]);

type SyllableBreak = "consonants" | "vowels";

/**
 * Where a German or English word reads well broken: between two consonants that are not one
 * sound, often the joint of a compound ("Entwicklungs-teams"), or before a consonant between two
 * vowels ("Prozessautoma-tisierung").
 */
function syllableBreakAt(word: string, end: number): SyllableBreak | undefined {
  const [before, after, next] = [word[end - 1] ?? "", word[end] ?? "", word[end + 1] ?? ""];
  if (![before, after].every((letter) => LETTER.test(letter))) return undefined;
  const consonant = (letter: string) => LETTER.test(letter) && !VOWEL.test(letter);
  if (consonant(before) && consonant(after)) {
    return UNSPLIT_PAIRS.has(`${before}${after}`.toLowerCase()) ? undefined : "consonants";
  }
  return VOWEL.test(before) && consonant(after) && VOWEL.test(next) ? "vowels" : undefined;
}

/** A break between consonants wins unless it leaves much less on the line than one between vowels. */
const CONSONANT_BREAK_SHARE = 0.6;

/**
 * The longest head of `word` that fits a line with its hyphen, keeping both parts readable: at a
 * syllable break where one fits, else wherever it fits.
 */
function hyphenatedHead(word: string, setting: Setting): string | undefined {
  const ends: number[] = [];
  for (let end = word.length - SHORTEST_WORD_PART; end >= SHORTEST_WORD_PART; end--) {
    if (widthOf(`${word.slice(0, end)}${HYPHEN}`, setting) <= setting.lineWidth) ends.push(end);
  }
  const longestAt = (kind: SyllableBreak) =>
    ends.find((candidate) => syllableBreakAt(word, candidate) === kind);
  const consonants = longestAt("consonants");
  const vowels = longestAt("vowels");
  const end =
    consonants !== undefined &&
    (vowels === undefined || consonants >= CONSONANT_BREAK_SHARE * vowels)
      ? consonants
      : (vowels ?? ends[0]);
  return end === undefined ? undefined : word.slice(0, end);
}

function hyphenatedWord(word: string, setting: Setting): string {
  let rest = word;
  const lines: string[] = [];
  while (widthOf(rest, setting) > setting.lineWidth) {
    const head = hyphenatedHead(rest, setting);
    if (!head) break;
    lines.push(`${head}${HYPHEN}`);
    rest = rest.slice(head.length);
  }
  return [...lines, rest].join("\n");
}

/**
 * A word wider than a line breaks with a hyphen, where diagram-js would cut it without one
 * ("Prozessautomati / sierung"). A compound written with hyphens breaks at them first.
 */
function hyphenated(text: string, setting: Setting): string {
  return text
    .split(/(\s+|(?<=-))/)
    .map((part) => (/\S/.test(part) ? hyphenatedWord(part, setting) : part))
    .join("");
}

function linesOf(element: SVGElement): string[] {
  return [...element.children].map((line) => line.textContent ?? "");
}

function withFont(element: SVGElement, family: string): SVGElement {
  element.setAttribute("font-family", family);
  return element;
}

function fontSizesOf(options: FittedTextOptions): number[] {
  const smallest = Math.min(options.smallestFontSize ?? options.fontSize, options.fontSize);
  return Array.from(
    { length: options.fontSize - smallest + 1 },
    (_, step) => options.fontSize - step,
  );
}

function withEllipsis(text: string, setting: Setting): SVGElement {
  const { util, config, maxLines } = setting;
  const lines = linesOf(util.createText(text, config));
  const kept = lines.slice(0, maxLines - 1);
  let last = (lines[maxLines - 1] ?? "").trimEnd();
  for (;;) {
    const cut = util.createText([...kept, `${last}${ELLIPSIS}`].join("\n"), config);
    if (cut.children.length <= maxLines || last === "") return cut;
    last = last.slice(0, -1).trimEnd();
  }
}

/**
 * Text that stays inside its box: set smaller while it does not fit, down to the smallest size;
 * what still does not fit is dropped and the last kept line ends in an ellipsis, so the frame's
 * bounds cover the whole drawing and no export cuts a line off.
 */
export function fittedText(text: string, options: FittedTextOptions): FittedText {
  let setting: Setting | undefined;
  let prepared = text;
  for (const fontSize of fontSizesOf(options)) {
    setting = settingAt(fontSize, options);
    prepared = hyphenated(text, setting);
    const element = setting.util.createText(prepared, setting.config);
    if (element.children.length <= setting.maxLines) {
      return { element: withFont(element, setting.family), truncated: false };
    }
  }
  const smallest = setting!;
  return { element: withFont(withEllipsis(prepared, smallest), smallest.family), truncated: true };
}
