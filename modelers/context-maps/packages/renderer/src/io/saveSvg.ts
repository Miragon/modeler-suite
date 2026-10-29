/**
 * Serialises the current canvas into a standalone SVG (snapshot / export),
 * fitted to the content bounds and independent of the current zoom / scroll.
 */

import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { isModeClass } from "../draw/canvasRoles.js";
import { isCmContext } from "../model/di-types.js";

const MARGIN = 40;

/** What the live canvas <svg> carries for keyboard and screen-reader users, not for a picture. */
const LIVE_CANVAS_ATTRIBUTES = ["tabindex", "role", "aria-label"];

export function saveSVG(canvas: Canvas, elementRegistry: ElementRegistry): { svg: string } {
  // The container's own <svg> child: a chrome that moves the palette in front of it (the modeler
  // shell does) puts the palette's icon <svg>s first in the container.
  const source = canvas.getContainer().querySelector(":scope > svg");
  if (!source) throw new Error("No SVG found in the canvas container.");

  // Content bounds from the context boxes (relationship lines stay within them).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elementRegistry.getAll()) {
    if (!isCmContext(el)) continue;
    const s = el as unknown as { x: number; y: number; width: number; height: number };
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  }

  const x = minX - MARGIN;
  const y = minY - MARGIN;
  const width = maxX - minX + MARGIN * 2;
  const height = maxY - minY + MARGIN * 2;

  const clone = source.cloneNode(true) as SVGSVGElement;
  for (const attribute of LIVE_CANVAS_ATTRIBUTES) clone.removeAttribute(attribute);
  removeModeClasses(clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  clone.setAttribute("width", String(Math.round(width)));
  clone.setAttribute("height", String(Math.round(height)));

  // Neutralise pan/zoom: let the viewBox (above) drive the geometry.
  const viewport = clone.querySelector<SVGGElement>(".viewport");
  if (viewport) viewport.removeAttribute("transform");

  const svg = new XMLSerializer().serializeToString(clone);
  return { svg: '<?xml version="1.0" encoding="utf-8"?>\n' + svg };
}

/**
 * The role and underlay classes switch a colour with the mode of the page around them, and an
 * export is light in every mode (guide §10.7): an exported SVG placed into a dark page keeps the
 * light attributes the renderer drew, and its underlays stay `stroke="none"`.
 */
function removeModeClasses(clone: SVGSVGElement): void {
  for (const node of clone.querySelectorAll("[class]")) {
    const modeClasses = [...node.classList].filter(isModeClass);
    if (modeClasses.length === 0) continue;
    node.classList.remove(...modeClasses);
    if (node.classList.length === 0) node.removeAttribute("class");
  }
}
