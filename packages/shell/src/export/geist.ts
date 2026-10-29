import { createSvgElement, parseSvg } from "./svg.js";

/** The family `@fontsource-variable/geist` registers, first in every renderer's text font-family. */
const GEIST_FAMILY = "Geist Variable";

/** One subset of Geist: its file and the characters it draws. */
export interface GeistFace {
  /** The font file: a `data:` URL, or a URL the page may fetch. It goes into the SVG inline. */
  readonly src: string;
  /** The subset's CSS `unicode-range`; a face without one draws every character. */
  readonly unicodeRange?: string | undefined;
  /** The CSS `font-weight`; the whole variable axis, `100 900`, when left out. */
  readonly weight?: string | undefined;
  /** The CSS `font-style`; `normal` when left out. */
  readonly style?: string | undefined;
}

/**
 * The `unicode-range` of each subset of `@fontsource-variable/geist` 5.3.0, in the order its CSS
 * declares them, for faces given by hand.
 */
export const GEIST_UNICODE_RANGES = {
  cyrillicExt: "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
  cyrillic: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
  vietnamese:
    "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
  latinExt:
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
} as const;

/**
 * The page's own Geist: every `@font-face` of 'Geist Variable' in its stylesheets, also inside
 * `@media`, `@supports`, `@layer` and `@import`, in their order, each `src` resolved against its
 * stylesheet. A cross-origin stylesheet hides its rules and is skipped.
 */
export function pageGeistFaces(): GeistFace[] {
  const faces: GeistFace[] = [];
  const seen = new Set<string>();
  for (const rule of fontFaceRules(Array.from(document.styleSheets))) {
    if (unquote(rule.style.getPropertyValue("font-family")) !== GEIST_FAMILY) continue;
    const src = firstUrl(rule.style.getPropertyValue("src"));
    if (src === undefined) continue;
    const face: GeistFace = {
      src: new URL(src, rule.parentStyleSheet?.href ?? document.baseURI).href,
      unicodeRange: descriptor(rule, "unicode-range"),
      weight: descriptor(rule, "font-weight"),
      style: descriptor(rule, "font-style"),
    };
    const key = `${face.src} ${face.unicodeRange ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    faces.push(face);
  }
  return faces;
}

/**
 * The SVG with the Geist faces its text uses in a `<style>` up front, each file inline as a
 * `data:` URL, and a hidden text per face in that face's style and weight. Returns the SVG
 * unchanged when no face draws a character of its text. Throws when the SVG does not parse or a
 * font file cannot be read.
 */
export async function embedGeist(
  svg: string,
  faces: readonly GeistFace[] = pageGeistFaces(),
): Promise<string> {
  const parsed = parseSvg(svg);
  const root = parsed.documentElement;
  const codePoints = textCodePoints(root);
  const used = faces
    .map((face) => ({ face, ranges: parseUnicodeRange(face.unicodeRange) }))
    .filter(({ ranges }) => codePoints.some((codePoint) => inRanges(ranges, codePoint)));
  if (used.length === 0) return svg;

  const rules = await Promise.all(
    used.map(async ({ face }) => fontFaceRule(face, await inlineFontFile(face.src))),
  );
  const defs = createSvgElement(parsed, "defs");
  const style = createSvgElement(parsed, "style");
  style.textContent = rules.join("");
  defs.append(style);

  // An SVG image counts as loaded before a subset that only a later character of a label needs
  // has loaded (designIQ, headless Chromium: the Ł in "Kettle from Łódź" after latin), and that
  // text comes out in the system sans. A hidden text up front, one per face in that face's style
  // and weight and in a character only that face draws, makes every subset load first. Its font
  // goes in as a style, which a rule of the SVG's own stylesheet cannot override.
  const preload = createSvgElement(parsed, "g");
  preload.setAttribute("visibility", "hidden");
  used.forEach(({ face, ranges }, index) => {
    const laterRanges = used
      .slice(index + 1)
      .filter((later) => sameStyleAndWeight(later.face, face))
      .map((later) => later.ranges);
    const sample = sampleCharacter(ranges, laterRanges, codePoints);
    if (sample === undefined) return;
    const text = createSvgElement(parsed, "text");
    text.setAttribute("style", preloadTextStyle(face));
    text.textContent = sample;
    preload.append(text);
  });
  root.insertBefore(preload, root.firstChild);
  root.insertBefore(defs, preload);
  return new XMLSerializer().serializeToString(parsed);
}

type CodePointRange = readonly [low: number, high: number];

const EVERY_CODE_POINT: readonly CodePointRange[] = [[0, 0x10ffff]];

/** `U+0-FF, U+131, U+4??` as the CSSOM or fontsource writes it; none is every code point. */
function parseUnicodeRange(unicodeRange: string | undefined): readonly CodePointRange[] {
  if (!unicodeRange?.trim()) return EVERY_CODE_POINT;
  return unicodeRange.split(",").flatMap((part): CodePointRange[] => {
    const match = /^\s*u\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(part);
    if (!match) return [];
    const [, start = "", end] = match;
    if (start.includes("?")) {
      return [
        [
          Number.parseInt(start.replaceAll("?", "0"), 16),
          Number.parseInt(start.replaceAll("?", "f"), 16),
        ],
      ];
    }
    return [[Number.parseInt(start, 16), Number.parseInt(end ?? start, 16)]];
  });
}

function inRanges(ranges: readonly CodePointRange[], codePoint: number): boolean {
  return ranges.some(([low, high]) => codePoint >= low && codePoint <= high);
}

const VISIBLE = /[\p{L}\p{M}\p{N}\p{P}\p{S}]/u;

/** How far a face's own ranges are searched for a character when the text has none of its own. */
const SAMPLE_SEARCH_LIMIT = 256;

/**
 * A visible character that this face draws and no later face of its style and weight does: of
 * faces with the same style and weight whose ranges overlap, the last one declared draws the
 * character (CSS Fonts 4, `unicode-range`); a face of another style or weight never takes it. One
 * of the text first; for a face the text uses only for white space, one of its own ranges.
 */
function sampleCharacter(
  ranges: readonly CodePointRange[],
  laterRanges: readonly (readonly CodePointRange[])[],
  textCodePoints: readonly number[],
): string | undefined {
  const drawsAlone = (codePoint: number): boolean =>
    VISIBLE.test(String.fromCodePoint(codePoint)) &&
    inRanges(ranges, codePoint) &&
    !laterRanges.some((later) => inRanges(later, codePoint));
  const fromText = textCodePoints.find(drawsAlone);
  if (fromText !== undefined) return String.fromCodePoint(fromText);
  for (const [low, high] of ranges) {
    const last = Math.min(high, low + SAMPLE_SEARCH_LIMIT);
    for (let codePoint = low; codePoint <= last; codePoint++) {
      if (drawsAlone(codePoint)) return String.fromCodePoint(codePoint);
    }
  }
  return undefined;
}

/** The characters the SVG draws as text, each once, in document order. */
function textCodePoints(root: Element): number[] {
  const text = Array.from(
    root.querySelectorAll("text, foreignObject"),
    (element) => element.textContent ?? "",
  ).join("");
  return [...new Set(Array.from(text, (character) => character.codePointAt(0) ?? 0))];
}

function faceStyle(face: GeistFace): string {
  return normalizedDescriptor(face.style) || "normal";
}

function faceWeight(face: GeistFace): string {
  return normalizedDescriptor(face.weight) || "100 900";
}

function normalizedDescriptor(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function sameStyleAndWeight(face: GeistFace, other: GeistFace): boolean {
  return faceStyle(face) === faceStyle(other) && faceWeight(face) === faceWeight(other);
}

/**
 * Font properties that pick this face: its style and weight, where a descriptor's range
 * (`100 900`, `oblique 0deg 10deg`), which no property takes, gives its first value.
 */
function preloadTextStyle(face: GeistFace): string {
  const style = faceStyle(face).replace(/^(oblique \S+) \S+$/, "$1");
  const weight = faceWeight(face).replace(/ .*$/, "");
  return `font-family:'${GEIST_FAMILY}';font-style:${style};font-weight:${weight}`;
}

function fontFaceRule(face: GeistFace, dataUrl: string): string {
  const descriptors = [
    `font-family:'${GEIST_FAMILY}'`,
    `font-style:${faceStyle(face)}`,
    `font-weight:${faceWeight(face)}`,
    // swap: a face still loading when the image is drawn shows its text in the system sans,
    // where block would leave the text out of the PNG.
    "font-display:swap",
    `src:url("${dataUrl.replace(/["\\\n]/g, encodeURIComponent)}")`,
  ];
  if (face.unicodeRange?.trim()) descriptors.push(`unicode-range:${face.unicodeRange}`);
  return `@font-face{${descriptors.join(";")}}`;
}

/** Each fetched font file as a `data:` URL, once per page; a failed read is tried again next time. */
const inlinedFiles = new Map<string, Promise<string>>();

function inlineFontFile(src: string): Promise<string> {
  if (src.startsWith("data:")) return Promise.resolve(asFontDataUrl(src));
  const href = new URL(src, document.baseURI).href;
  let reading = inlinedFiles.get(href);
  if (!reading) {
    reading = readAsDataUrl(href);
    inlinedFiles.set(href, reading);
    reading.catch(() => inlinedFiles.delete(href));
  }
  return reading;
}

async function readAsDataUrl(href: string): Promise<string> {
  const response = await fetch(href);
  if (!response.ok) throw new Error(`@miragon/modeler-shell: ${href} answered ${response.status}.`);
  const file = await response.blob();
  const type = file.type.startsWith("font/") ? file.type : "font/woff2";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error(`@miragon/modeler-shell: could not read ${href}.`));
    reader.readAsDataURL(new Blob([file], { type }));
  });
}

function asFontDataUrl(dataUrl: string): string {
  return /^data:font\//i.test(dataUrl)
    ? dataUrl
    : dataUrl.replace(/^data:[^;,]*/, "data:font/woff2");
}

function* fontFaceRules(sheets: readonly CSSStyleSheet[]): Generator<CSSFontFaceRule> {
  for (const sheet of sheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    yield* fontFaceRulesIn(rules);
  }
}

function* fontFaceRulesIn(rules: CSSRuleList): Generator<CSSFontFaceRule> {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSFontFaceRule) yield rule;
    else if (rule instanceof CSSImportRule)
      yield* fontFaceRules(rule.styleSheet ? [rule.styleSheet] : []);
    else if (rule instanceof CSSGroupingRule) yield* fontFaceRulesIn(rule.cssRules);
  }
}

function descriptor(rule: CSSFontFaceRule, name: string): string | undefined {
  return rule.style.getPropertyValue(name).trim() || undefined;
}

function firstUrl(src: string): string | undefined {
  return /url\(\s*(["']?)(.*?)\1\s*\)/.exec(src)?.[2] || undefined;
}

function unquote(value: string): string {
  return value.trim().replace(/^(["'])(.*)\1$/, "$2");
}
