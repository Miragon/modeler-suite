import type Canvas from "diagram-js/lib/core/Canvas";
import type { Box } from "@miragon/c4-schema-model";
import { hashText } from "../document/hash.js";
import { DRILL_CLASS } from "../draw/drillBadge.js";
import { FEEDBACK_CLASS } from "../draw/drawItems.js";
import { LABELS_LAYER } from "../draw/RelationshipLabels.js";
import { CONNECT_SOURCE_MARKER } from "../rules/C4Connect.js";
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
 * The markers of the pointer, the selection and a running gesture: they style the live canvas
 * only, and where the pointer happens to rest must not change the exported text.
 */
const INTERACTION_MARKERS = new Set([
  "hover",
  "selected",
  "attach-ok",
  "connect-ok",
  "connect-not-ok",
  "connect-hover",
  "drop-ok",
  "drop-not-ok",
  "new-parent",
  "resize-not-ok",
  "djs-drag-active",
  "djs-dragging",
  "djs-resizing",
  "djs-updating",
  CONNECT_SOURCE_MARKER,
]);

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
  cutOutCanvasGrounds(clone, box);
  for (const node of [clone, ...clone.querySelectorAll("[class]")]) removeLiveClasses(node);
  const svg = new XMLSerializer().serializeToString(clone);
  return { svg: `<?xml version="1.0" encoding="utf-8"?>\n${svg}` };
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
/** A label's ground in the canvas's own ground, which only the live canvas lies on. */
const CANVAS_GROUND = ".c4-label-ground.cd-c-fill-grund";

/**
 * The export lies on no ground of its own, as the family's do: the PNG gets the canvas's ground
 * from the app, the SVG whatever page it is placed on. A label ground in the canvas's ground
 * colour would show there as a box of that colour, so the export cuts it out of what the label
 * covers instead (one mask on every layer below the labels, and one on each earlier label it
 * overlaps) and drops it: the picture shows the page under the label's text, as the canvas shows
 * its ground, and the PNG on that ground stays what it was. Grounds in a boundary's fill or in the
 * plot white stay as drawn: they are part of the picture.
 */
function cutOutCanvasGrounds(clone: SVGSVGElement, box: Box): void {
  const labels = clone.querySelector(`.layer-${LABELS_LAYER}`);
  if (!labels) return;
  const groups = [...labels.children];
  const grounds = groups.map((group) => group.querySelector<SVGRectElement>(CANVAS_GROUND));
  const cutOuts = grounds.filter((ground): ground is SVGRectElement => ground !== null);
  if (cutOuts.length === 0) return;
  const defs = document.createElementNS(SVG_NAMESPACE, "defs");
  clone.prepend(defs);
  const below = addMask(defs, box, cutOuts);
  for (let layer = labels.previousElementSibling; layer; layer = layer.previousElementSibling) {
    layer.setAttribute("mask", below);
  }
  groups.forEach((group, index) => {
    const extent = group.querySelector<SVGRectElement>(".c4-label-ground");
    if (!extent) return;
    const later = grounds
      .slice(index + 1)
      .filter((ground): ground is SVGRectElement => ground !== null)
      .filter((ground) => overlaps(rectOf(ground), rectOf(extent)));
    if (later.length > 0) group.setAttribute("mask", addMask(defs, box, later));
  });
  for (const ground of cutOuts) ground.remove();
}

/**
 * A mask that keeps the export's box but the given grounds; its id comes from what it cuts, so
 * two exports placed into one page do not share it by accident, and an export stays byte-stable.
 */
function addMask(defs: SVGDefsElement, box: Box, grounds: readonly SVGRectElement[]): string {
  const mask = document.createElementNS(SVG_NAMESPACE, "mask");
  const area = { x: box.x, y: box.y, width: box.width, height: box.height };
  setAttributes(mask, { ...area, maskUnits: "userSpaceOnUse" });
  // A luminance mask: white keeps what lies beneath, black cuts it away. No colour of the picture.
  mask.append(rect(area, "white"));
  for (const ground of grounds) {
    const cut = rect(rectOf(ground), "black");
    const radius = ground.getAttribute("rx");
    if (radius !== null) cut.setAttribute("rx", radius);
    mask.append(cut);
  }
  const id = `c4-label-cutout-${hashText(mask.outerHTML).split(":")[0]}`;
  mask.setAttribute("id", id);
  defs.append(mask);
  return `url(#${id})`;
}

function rect(box: Box, fill: string): SVGRectElement {
  const node = document.createElementNS(SVG_NAMESPACE, "rect");
  setAttributes(node, { ...box, fill });
  return node;
}

function setAttributes(node: Element, attributes: Record<string, string | number>): void {
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
}

function rectOf(node: SVGRectElement): Box {
  const value = (name: string) => Number(node.getAttribute(name) ?? 0);
  return { x: value("x"), y: value("y"), width: value("width"), height: value("height") };
}

function overlaps(left: Box, right: Box): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

function removeLiveClasses(node: Element): void {
  const live = [...node.classList].filter(
    (name) => name.startsWith(ROLE_CLASS_PREFIX) || INTERACTION_MARKERS.has(name),
  );
  node.classList.remove(...live);
  if (node.classList.length === 0) node.removeAttribute("class");
}
