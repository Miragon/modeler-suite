import type { TextFont } from "./textMetrics.js";

/**
 * Advance widths in em that no glyph of its class exceeds in Geist at weight 600, measured: the
 * narrow marks and lowercase letters, the medium ones, the remaining lowercase letters, digits,
 * capitals, and the widest (m, w, M, W, %, @ and every letter outside Basic Latin).
 */
const NARROW = new Set(" !\"'(),.:;I[]`ijl{|}");
const MEDIUM = new Set("*-1frt");
const WIDEST = new Set("%@MWmw");
const NARROW_EM = 0.4;
const MEDIUM_EM = 0.45;
const LOWERCASE_EM = 0.64;
const DIGIT_EM = 0.68;
const CAPITAL_EM = 0.77;
const WIDEST_EM = 1;

function advanceOf(character: string): number {
  if (NARROW.has(character)) return NARROW_EM;
  if (MEDIUM.has(character)) return MEDIUM_EM;
  if (WIDEST.has(character)) return WIDEST_EM;
  if (character >= "a" && character <= "z") return LOWERCASE_EM;
  if (character >= "0" && character <= "9") return DIGIT_EM;
  if (character >= "A" && character <= "Z") return CAPITAL_EM;
  const code = character.codePointAt(0) ?? 0;
  return code >= 0x20 && code < 0x7f ? CAPITAL_EM : WIDEST_EM;
}

/**
 * How wide `text` can be drawn in `font` at most, without measuring: a box sized by it does not
 * move when the web font arrives, and the text it holds is not cut short.
 */
export function widestTextWidth(text: string, font: Pick<TextFont, "size">): number {
  let width = 0;
  for (const character of text) width += advanceOf(character);
  return Math.ceil(width * font.size);
}
