/**
 * The canvas in both modes (guide §10.2): the renderer draws the light values as attributes, and a
 * colour it chooses itself gets one class per property that switches the property to its role in
 * the mode of the nearest `data-cd-theme` carrier. A notation colour and a colour the author set
 * get no class and keep their value in every mode; a line among them that falls below 3:1 on the
 * dark ground lies on an underlay (§10.6). The SVG export removes every class here (§10.7).
 */

import { DARK_CANVAS_GROUND } from "../theme/index.js";
import { contrastRatio } from "./contextColours.js";

/** The role classes of `cd-canvas.css`, by the role they draw in. */
export const ROLE_CLASS = {
  fillGrund: "cd-c-fill-grund",
  fillPlot: "cd-c-fill-plot",
  fillFlaecheHoch: "cd-c-fill-flaeche-hoch",
  fillText: "cd-c-fill-text",
  fillTextLeise: "cd-c-fill-text-leise",
  strokeText: "cd-c-stroke-text",
  strokeKontur: "cd-c-stroke-kontur",
  strokeLinie: "cd-c-stroke-linie",
  /**
   * `cd-canvas.css` fills in the quiet text role but has no stroke for it, which the stroked team
   * glyph of an unclassified context needs: `assets/context-maps.css` adds it under the renderer's
   * own prefix, with the same contract.
   */
  strokeTextLeise: "cm-c-stroke-text-leise",
} as const;

/**
 * A second path under a line, `stroke="none"` as an attribute: `cd-canvas.css` shows it in
 * `--cd-ui-kontur` in dark (4.95:1 on the ground) and nowhere else.
 */
export const UNDERLAY_CLASS = "cd-c-unterleger";

/** The underlay is 2px wider than the line on it, a 1px rim on either side (guide §10.6). */
export const UNDERLAY_EXTRA_WIDTH = 2;

const NON_TEXT_CONTRAST = 3;

const MODE_CLASS_PREFIX = "cd-c-";

/**
 * Whether a line the renderer cannot recolour (a notation colour, a colour the author set) needs
 * the underlay: below 3:1 on the dark ground. A value that is no hex colour gets none.
 */
export function needsDarkUnderlay(stroke: string): boolean {
  const ratio = contrastRatio(stroke, DARK_CANVAS_GROUND);
  return ratio !== undefined && ratio < NON_TEXT_CONTRAST;
}

/** Whether a class switches a colour with the mode, so an export must not carry it. */
export function isModeClass(name: string): boolean {
  return name.startsWith(MODE_CLASS_PREFIX) || name === ROLE_CLASS.strokeTextLeise;
}

/** A `class` attribute of the given names, the absent ones left out. */
export function classNames(...names: Array<string | false | undefined>): string {
  return names.filter((name): name is string => Boolean(name)).join(" ");
}
