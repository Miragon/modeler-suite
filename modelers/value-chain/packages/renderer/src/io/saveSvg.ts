import type Canvas from "diagram-js/lib/core/Canvas";
import type VcBounds from "../bounds/VcBounds.js";

const EXPORT_PADDING = 20;

/** What the empty canvas exports: a blank sheet of this size at the origin. */
const EMPTY_EXPORT = { x: 0, y: 0, width: 800, height: 600 };

/** Attributes the live canvas carries for keyboard and screen-reader use, not for a picture. */
const LIVE_CANVAS_ATTRIBUTES = ["tabindex", "role", "aria-label", "aria-roledescription"];

const CANVAS_ROLE_CLASS_PREFIX = "cd-c-";

/**
 * Standalone SVG export: clones the live SVG, sets a viewBox around the diagram contents and
 * strips the pan/zoom transform. Fonts and colours are SVG presentation attributes, and the role
 * classes that draw the canvas's mode are dropped, so the result renders identically outside the
 * editor and stays light in every mode (guide §10.7).
 */
export function saveSVG(canvas: Canvas, bounds: Pick<VcBounds, "contentBounds">): { svg: string } {
  // The canvas's own <svg> child: a host chrome may move the palette, with its icon <svg>s, in
  // front of it inside the same container.
  const source = [...canvas.getContainer().children].find(
    (child): child is SVGSVGElement => child instanceof SVGSVGElement,
  );
  if (!source) {
    throw new Error("No SVG found in the canvas container.");
  }

  const box = bounds.contentBounds(EXPORT_PADDING) ?? EMPTY_EXPORT;

  const clone = source.cloneNode(true) as SVGSVGElement;
  for (const attribute of LIVE_CANVAS_ATTRIBUTES) {
    clone.removeAttribute(attribute);
  }
  removeCanvasRoleClasses(clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
  clone.setAttribute("width", String(box.width));
  clone.setAttribute("height", String(box.height));

  const viewport = clone.querySelector<SVGGElement>(".viewport");
  if (viewport) {
    viewport.removeAttribute("transform");
  }

  const svg = new XMLSerializer().serializeToString(clone);
  return { svg: `<?xml version="1.0" encoding="utf-8"?>\n${svg}` };
}

/**
 * The `cd-c-*` classes draw a role in the mode of the nearest carrier. An exported SVG placed into
 * a page that loads `cd-canvas.css` would follow that page's mode, so the export keeps only the
 * light values the renderer drew with, and no class attribute where a role class was the only one.
 */
function removeCanvasRoleClasses(clone: SVGSVGElement): void {
  for (const node of clone.querySelectorAll(`[class*="${CANVAS_ROLE_CLASS_PREFIX}"]`)) {
    const roles = [...node.classList].filter((name) => name.startsWith(CANVAS_ROLE_CLASS_PREFIX));
    node.classList.remove(...roles);
    if (node.classList.length === 0) node.removeAttribute("class");
  }
}
