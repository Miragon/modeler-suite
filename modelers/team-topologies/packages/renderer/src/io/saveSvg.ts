/**
 * Serialises the current canvas into a standalone SVG (snapshot / export),
 * framing the content bounds the fit shows, label text included, independent of
 * the current zoom / scroll.
 * Interaction chrome (selection outlines, resize handles, hover state) is left
 * out. Nothing sits behind the diagram, so the SVG is transparent and a PNG takes the
 * background of its own export (guide §10.7).
 */

import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { diagramContentBounds, type ContentBounds } from "./TtViewport.js";

const MARGIN = 40;
const EMPTY_CANVAS_BOUNDS: ContentBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const INTERACTION_CHROME_SELECTOR = [
  ".djs-outline",
  ".djs-resizer",
  ".djs-selection-outline",
  ".djs-lasso-overlay",
  ".djs-dragger",
  ".djs-bendpoint",
  ".djs-segment-dragger",
].join(", ");

const TRANSIENT_CLASSES = ["selected", "hover"];

const CANVAS_ONLY_ATTRIBUTES = ["class", "tabindex", "role", "aria-roledescription", "aria-label"];

export function saveSVG(canvas: Canvas, elementRegistry: ElementRegistry): { svg: string } {
  const container = canvas.getContainer();
  const source = container.querySelector(":scope > svg");
  if (!source) throw new Error("No SVG found in the canvas container.");

  const bounds = diagramContentBounds(elementRegistry) ?? EMPTY_CANVAS_BOUNDS;
  // Label text makes the bounds fractional; whole units keep width and height equal to the viewBox.
  const x = Math.floor(bounds.minX - MARGIN);
  const y = Math.floor(bounds.minY - MARGIN);
  const width = Math.ceil(bounds.maxX + MARGIN) - x;
  const height = Math.ceil(bounds.maxY + MARGIN) - y;

  const clone = source.cloneNode(true) as SVGSVGElement;
  for (const name of CANVAS_ONLY_ATTRIBUTES) clone.removeAttribute(name);
  for (const node of clone.querySelectorAll(INTERACTION_CHROME_SELECTOR)) node.remove();
  for (const node of clone.querySelectorAll(TRANSIENT_CLASSES.map((name) => `.${name}`).join())) {
    node.classList.remove(...TRANSIENT_CLASSES);
  }

  clone.setAttribute("xmlns", SVG_NAMESPACE);
  clone.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  // Neutralise pan/zoom: let the viewBox (above) drive the geometry.
  const viewport = clone.querySelector<SVGGElement>(".viewport");
  if (viewport) viewport.removeAttribute("transform");

  const svg = new XMLSerializer().serializeToString(clone);
  return { svg: '<?xml version="1.0" encoding="utf-8"?>\n' + svg };
}
