import { append as svgAppend, attr as svgAttr, create as svgCreate } from "tiny-svg";

/**
 * The notation glyphs the canvas and the palette draw (anchor, accelerator, deaccelerator; guide
 * §3.6 keeps them until the modelers' dark mode), 24x24-viewBox paths from Google Material Icons
 * (Apache-2.0, © Google). `drawIcon` renders them as SVG. The context pad draws Lucide icons
 * (`lucide.ts`).
 * Source: https://github.com/google/material-design-icons (Apache License 2.0).
 */

export const ICON_PERSON =
  "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z";
/** fast_forward — Accelerator. */
export const ICON_FAST_FORWARD = "M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z";
/** fast_rewind — Deaccelerator. */
export const ICON_FAST_REWIND = "M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z";

/** Draws a 24x24 icon as an SVG group centered on (cx, cy), scaled to `size`. */
export function drawIcon(
  path: string,
  cx: number,
  cy: number,
  size: number,
  fill: string,
): SVGElement {
  const g = svgCreate("g");
  const s = size / 24;
  svgAttr(g, {
    transform: `translate(${cx - size / 2}, ${cy - size / 2}) scale(${s})`,
    fill,
    stroke: "none",
  });
  svgAppend(g, svgAttr(svgCreate("path"), { d: path }));
  return g;
}
