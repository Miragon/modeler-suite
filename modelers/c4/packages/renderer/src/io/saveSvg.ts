import type Canvas from "diagram-js/lib/core/Canvas";
import { DRILL_CLASS } from "../draw/drillBadge.js";
import { FEEDBACK_CLASS } from "../draw/drawItems.js";
import type ContentBounds from "./ContentBounds.js";

const EXPORT_PADDING = 20;
const EMPTY_EXPORT = { x: 0, y: 0, width: 800, height: 600 };
/** What the live canvas carries for keyboard and screen-reader use, not for a picture. */
const LIVE_CANVAS_ATTRIBUTES = ["tabindex", "role", "aria-label", "aria-roledescription"];
/**
 * The interaction helpers, the connect and drop feedback ring and the drill badge, which only the
 * live canvas uses. The handles of a selection (bendpoints, which stay on a relationship once
 * hovered, resize handles, the outline of several) have no paint of their own: diagram-js's
 * stylesheet shows them, so a standalone picture would fill them black.
 */
const LIVE_CANVAS_PARTS = [
  ".djs-outline",
  ".djs-hit",
  ".djs-bendpoints",
  ".djs-resizer",
  ".djs-selection-outline",
  `.${DRILL_CLASS}`,
  `.${FEEDBACK_CLASS}`,
].join(", ");
/**
 * The design system's role classes follow the page's mode; each such node also carries its light
 * value as an attribute, so without the class the picture stays light (guide §10.7).
 */
const ROLE_CLASS_PREFIX = "cd-c-";

/**
 * A standalone SVG of the content. The canvas's OWN `<svg>` child: the shell moves the palette,
 * with its icon `<svg>`s, in front of it inside the same container.
 */
export function saveSVG(
  canvas: Canvas,
  bounds: Pick<ContentBounds, "contentBounds">,
): { svg: string } {
  const source = [...canvas.getContainer().children].find(
    (child): child is SVGSVGElement => child instanceof SVGSVGElement,
  );
  if (!source) throw new Error("No SVG found in the canvas container.");
  const box = bounds.contentBounds(EXPORT_PADDING) ?? EMPTY_EXPORT;
  const clone = source.cloneNode(true) as SVGSVGElement;
  for (const attribute of LIVE_CANVAS_ATTRIBUTES) clone.removeAttribute(attribute);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
  clone.setAttribute("width", String(box.width));
  clone.setAttribute("height", String(box.height));
  clone.querySelector<SVGGElement>(".viewport")?.removeAttribute("transform");
  for (const part of clone.querySelectorAll(LIVE_CANVAS_PARTS)) part.remove();
  for (const node of clone.querySelectorAll(`[class*="${ROLE_CLASS_PREFIX}"]`)) {
    removeRoleClasses(node);
  }
  const svg = new XMLSerializer().serializeToString(clone);
  return { svg: `<?xml version="1.0" encoding="utf-8"?>\n${svg}` };
}

function removeRoleClasses(node: Element): void {
  const roles = [...node.classList].filter((name) => name.startsWith(ROLE_CLASS_PREFIX));
  node.classList.remove(...roles);
  if (node.classList.length === 0) node.removeAttribute("class");
}
