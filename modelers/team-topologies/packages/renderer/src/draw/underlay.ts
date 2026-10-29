import { ALL_INTERACTION_SPECS, ALL_TEAM_SPECS } from "@miragon/team-topologies-schema-model";
import { MIRAGON } from "../theme/index.js";
import { contrastRatio, parseHexColour } from "./colour.js";

/**
 * The class of `cd-canvas.css` (guide §10.2) under a contour from the exception of §10.6: its
 * stroke shows in `--cd-ui-kontur` under `data-cd-kontrast="hoch"` of the nearest mode carrier and
 * is `none` everywhere else. The SVG export drops every `cd-c-*` class, so there it stays `none`.
 */
export const HIGH_CONTRAST_UNDERLAY_CLASS = "cd-c-unterleger-hoch";

/** The underlay is 2px wider than the contour on it, a 1px rim on either side (guide §10.6). */
export const UNDERLAY_EXTRA_WIDTH = 2;

const NON_TEXT_CONTRAST = 3;

/**
 * The official Team-Shape-Templates contours below 3:1 on the canvas ground (`--cd-ui-grund`),
 * kept in the templates' values (#94, guide §10.6). Under high contrast each lies on an underlay
 * (#213): the contour holds 5.27 to 12.34:1 on it, and without high contrast and in the export it
 * stays as the template draws it. `notation-contrast.test.ts` pins the six.
 */
const TEMPLATE_CONTOURS_ON_UNDERLAY: ReadonlySet<string> = new Set(
  [...ALL_TEAM_SPECS, ...ALL_INTERACTION_SPECS]
    .map((spec) => spec.stroke.toUpperCase())
    .filter((stroke) => contrastOnGround(stroke) < NON_TEXT_CONTRAST),
);

/**
 * Whether an element's contour lies on the high-contrast underlay: only a template contour from
 * the exception, never a stroke the user set (guide §10.6 leaves those as they are stored).
 */
export function contourOnUnderlay(templateStroke: string, ownStroke: string | undefined): boolean {
  return ownStroke === undefined && TEMPLATE_CONTOURS_ON_UNDERLAY.has(templateStroke.toUpperCase());
}

/** The template contours that lie on the underlay, upper-case. */
export function templateContoursOnUnderlay(): string[] {
  return [...TEMPLATE_CONTOURS_ON_UNDERLAY];
}

function contrastOnGround(stroke: string): number {
  const colour = parseHexColour(stroke);
  const ground = parseHexColour(MIRAGON.grau);
  return colour && ground ? contrastRatio(colour, ground) : Number.POSITIVE_INFINITY;
}
