import { MARK_COLORS, type RelationshipPatternSpec } from "@miragon/context-maps-schema-model";
import { readableTextColour } from "./contextColours.js";
import { INK, NEUTRAL_STROKE, PAPER } from "./styles.js";

/** Only the notation's own tokens have a colour, not the keys every object inherits (`toString`). */
function markColour(token: string): string | undefined {
  return Object.hasOwn(MARK_COLORS, token) ? MARK_COLORS[token] : undefined;
}

/** The fill of an integration-role chip (OHS, PL, ACL, CF) or of any other marker token. */
export function markFill(token: string): string {
  return markColour(token) ?? NEUTRAL_STROKE;
}

/** A marker's text is schwarz or weiss, whichever has more contrast on its fill (guide §10.6). */
export function markTextColour(token: string): string {
  return readableTextColour(markFill(token));
}

/** The direction letter (U, D, S, C) at a relationship end, drawn on a paper halo. */
export function directionLetterColour(direction: string): string {
  return markColour(direction) ?? INK;
}

/**
 * The chip a symmetric pattern (P, SK, SW) carries mid-line: schwarz on paper, because the lighter
 * pattern strokes stay below 4.5:1 as text, edged in the pattern's stroke as its colour cue.
 */
export function patternChipColours(spec: Pick<RelationshipPatternSpec, "stroke">): {
  fill: string;
  text: string;
  border: string;
} {
  return { fill: PAPER, text: INK, border: spec.stroke };
}
