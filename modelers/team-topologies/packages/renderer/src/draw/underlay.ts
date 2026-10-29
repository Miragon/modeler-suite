import {
  ALL_INTERACTION_SPECS,
  ALL_TEAM_SPECS,
  FLOW_SPEC,
} from "@miragon/team-topologies-schema-model";
import { MIRAGON } from "../theme/index.js";
import { contrastRatio, parseHexColour } from "./colour.js";

/**
 * The class of `cd-canvas.css` (guide §10.2) under a contour from the exception of §10.6: its
 * stroke shows in `--cd-ui-kontur` under `data-cd-kontrast="hoch"` of the nearest mode carrier and
 * is `none` everywhere else. The SVG export drops every `cd-c-*` class, so there it stays `none`.
 */
export const HIGH_CONTRAST_UNDERLAY_CLASS = "cd-c-unterleger-hoch";

/**
 * The class of `cd-canvas.css` (guide §10.2) under a notation stroke below 3:1 on the dark canvas:
 * its stroke shows in `--cd-ui-kontur` when the nearest mode carrier is dark and is `none` in the
 * light mode and in the export, which drops every `cd-c-*` class (guide §10.6).
 */
export const DARK_UNDERLAY_CLASS = "cd-c-unterleger";

/** The underlay is 2px wider than the contour on it, a 1px rim on either side (guide §10.6). */
export const UNDERLAY_EXTRA_WIDTH = 2;

const NON_TEXT_CONTRAST = 3;

/** The canvas ground of the light mode, `--cd-ui-grund`. */
const LIGHT_GROUND = MIRAGON.grau;

/** The canvas ground of the dark mode, `--cd-ui-grund`: the brand black (guide §3.5). */
const DARK_GROUND = MIRAGON.schwarz;

/**
 * The official Team-Shape-Templates contours below 3:1 on the canvas ground (`--cd-ui-grund`),
 * kept in the templates' values (#94, guide §10.6). Under high contrast each lies on an underlay
 * (#213): the contour holds 5.27 to 12.34:1 on it, and without high contrast and in the export it
 * stays as the template draws it. `notation-contrast.test.ts` pins the six.
 */
const TEMPLATE_CONTOURS_ON_UNDERLAY: ReadonlySet<string> = new Set(
  [...ALL_TEAM_SPECS, ...ALL_INTERACTION_SPECS]
    .map((spec) => spec.stroke.toUpperCase())
    .filter((stroke) => contrastOn(stroke, LIGHT_GROUND) < NON_TEXT_CONTRAST),
);

/**
 * The notation strokes below 3:1 on the dark canvas ground, which keep their colour on an underlay
 * in `--cd-ui-kontur` there (guide §10.6: the flow of change in `#6B6459`). The six template
 * contours of the light exception hold 5.27 to 12.34:1 on black and need none.
 * `notation-contrast.test.ts` pins the list.
 */
const NOTATION_STROKES_ON_DARK_UNDERLAY: ReadonlySet<string> = new Set(
  [...ALL_TEAM_SPECS, ...ALL_INTERACTION_SPECS, FLOW_SPEC]
    .map((spec) => spec.stroke.toUpperCase())
    .filter((stroke) => contrastOn(stroke, DARK_GROUND) < NON_TEXT_CONTRAST),
);

/**
 * The underlay a notation stroke lies on, as the class of `cd-canvas.css` that shows it, or
 * `undefined` for none: a template contour from the light exception lies on the high-contrast
 * underlay, a notation stroke below 3:1 on the dark ground on the dark one. A stroke the user set
 * gets none, since guide §10.6 leaves it as it is stored.
 */
export function underlayClass(
  notationStroke: string,
  ownStroke: string | undefined,
): string | undefined {
  if (ownStroke !== undefined) return undefined;
  const stroke = notationStroke.toUpperCase();
  if (TEMPLATE_CONTOURS_ON_UNDERLAY.has(stroke)) return HIGH_CONTRAST_UNDERLAY_CLASS;
  if (NOTATION_STROKES_ON_DARK_UNDERLAY.has(stroke)) return DARK_UNDERLAY_CLASS;
  return undefined;
}

/** The template contours that lie on the high-contrast underlay, upper-case. */
export function templateContoursOnUnderlay(): string[] {
  return [...TEMPLATE_CONTOURS_ON_UNDERLAY];
}

/** The notation strokes that lie on the dark underlay, upper-case. */
export function notationStrokesOnDarkUnderlay(): string[] {
  return [...NOTATION_STROKES_ON_DARK_UNDERLAY];
}

function contrastOn(stroke: string, ground: string): number {
  const colour = parseHexColour(stroke);
  const groundColour = parseHexColour(ground);
  return colour && groundColour ? contrastRatio(colour, groundColour) : Number.POSITIVE_INFINITY;
}
