import { FONT } from "../draw/styles.js";

/** A font of the canvas: the family is always Geist's stack (guide §4). */
export interface TextFont {
  readonly family: string;
  readonly size: number;
  readonly weight: number;
  readonly lineHeight: number;
}

export function canvasFont(size: number, weight: number, lineHeight: number): TextFont {
  return { family: FONT.family, size, weight, lineHeight };
}

export function lineHeightOf(font: TextFont): number {
  return font.size * font.lineHeight;
}

/** The CSS `font` shorthand of a canvas font, for `measureText` and `document.fonts`. */
export function cssFont(font: Pick<TextFont, "family" | "size" | "weight">): string {
  return `${font.weight} ${font.size}px ${font.family}`;
}

let measureContext: CanvasRenderingContext2D | null | undefined;
let generation = 0;

/**
 * The advance width of `text` at zoom 1. A canvas measures it, not the SVG: Chromium lays SVG text
 * out at the scaled font size, so a width read from the drawing would change with the zoom. Without
 * a canvas (Node) a character estimate stands in, so DOM-free callers still get a layout.
 */
export function textWidth(text: string, font: TextFont): number {
  if (measureContext === undefined) {
    measureContext =
      typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  if (!measureContext) return text.length * font.size * 0.58;
  measureContext.font = cssFont(font);
  return measureContext.measureText(text).width;
}

/** Bumped when the web font arrived: every cached layout was measured in the fallback font. */
export function measurementGeneration(): number {
  return generation;
}

export function resetTextMeasurement(): void {
  generation += 1;
}
