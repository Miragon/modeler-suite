import type Canvas from "diagram-js/lib/core/Canvas";
import { DEFAULT_BOARD_SIZE } from "@miragon/event-storming-schema-model";
import { isModeClass } from "../theme/canvas-roles.js";

export interface SvgBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The live canvas's keyboard and screen reader attributes (diagram-js, a host's chrome). */
const LIVE_CANVAS_ATTRIBUTES = ["tabindex", "role", "aria-label", "aria-labelledby"] as const;

/**
 * Serializes the current canvas into standalone SVG (snapshot/export).
 * `bounds` is the framing box (typically `BoardBounds.contentBounds()`), so the whole board is
 * exported wherever its stickies sit on the free canvas; if omitted, the empty-board default
 * framing is used. Independent of the current zoom/scroll.
 */
export function saveSVG(canvas: Canvas, bounds?: SvgBounds): { svg: string } {
  const container = canvas.getContainer();
  // The canvas's own <svg> is a child of the container; the icons of a palette that a host's
  // chrome moved in front of it are <svg>s as well, only deeper down.
  const source = container.querySelector(":scope > svg");
  if (!source) throw new Error("No SVG found in the canvas container.");

  const clone = source.cloneNode(true) as SVGSVGElement;
  // The live canvas is a focusable application with a name; the exported picture is neither.
  for (const attribute of LIVE_CANVAS_ATTRIBUTES) clone.removeAttribute(attribute);
  removeModeClasses(clone);

  const box = bounds ?? { x: 0, y: 0, ...DEFAULT_BOARD_SIZE };
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
  clone.setAttribute("width", String(box.width));
  clone.setAttribute("height", String(box.height));

  // diagram-js sets a viewbox transform on the outermost layer; for the static export we
  // neutralize pan/zoom by letting the viewBox (above) determine the geometry.
  const viewport = clone.querySelector<SVGGElement>(".viewport");
  if (viewport) viewport.removeAttribute("transform");

  const svg = new XMLSerializer().serializeToString(clone);
  return { svg: '<?xml version="1.0" encoding="utf-8"?>\n' + svg };
}

/**
 * The export is light in every mode (guide §10.7): it keeps the light values the renderer drew
 * with and drops the classes that switch them, since a page with `cd-canvas.css` in dark mode
 * would otherwise recolour an SVG placed into it. An element left without a class loses the
 * attribute, so the export is the same as one drawn without the classes.
 */
function removeModeClasses(clone: SVGSVGElement): void {
  for (const element of clone.querySelectorAll("[class]")) {
    const modeClasses = [...element.classList].filter(isModeClass);
    if (modeClasses.length === 0) continue;
    element.classList.remove(...modeClasses);
    if (element.classList.length === 0) element.removeAttribute("class");
  }
}
