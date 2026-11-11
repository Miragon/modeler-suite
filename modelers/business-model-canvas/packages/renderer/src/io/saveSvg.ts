import type Canvas from "diagram-js/lib/core/Canvas";
import { COLORS } from "../draw/styles.js";
import type ContentBounds from "./ContentBounds.js";

const EXPORT_PADDING = 20;
const EMPTY_EXPORT = { x: 0, y: 0, width: 800, height: 600 };
/** Editing aids that are no part of the picture: the hints of empty blocks, drop feedback. */
const LIVE_ONLY = ".djs-outline, .djs-hit, .bmc-hint, .bmc-drop-feedback";
/** What the live canvas carries for keyboard and screen-reader use, not for a picture. */
const LIVE_CANVAS_ATTRIBUTES = ["tabindex", "role", "aria-label", "aria-roledescription"];

/**
 * A standalone SVG of the content. The canvas's own `<svg>` child: the shell moves the palette,
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
  const viewport = clone.querySelector<SVGGElement>(".viewport");
  viewport?.removeAttribute("transform");
  // The title, the header line and the attribution stand on the ground, not on the sheet: the
  // ground goes with them, so they stay readable on a dark page (§10.7, the PNG has it too).
  const ground = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  for (const [name, value] of Object.entries({ ...box, fill: COLORS.surround })) {
    ground.setAttribute(name, String(value));
  }
  viewport?.prepend(ground);
  for (const helper of clone.querySelectorAll(LIVE_ONLY)) {
    helper.remove();
  }
  // The live canvas shows a sticky's full text in its own tooltip; a picture names it natively.
  for (const visual of clone.querySelectorAll<SVGElement>("[data-bmc-description]")) {
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = visual.getAttribute("data-bmc-description");
    visual.prepend(title);
    visual.removeAttribute("data-bmc-description");
    visual.removeAttribute("data-bmc-tooltip");
  }
  const svg = withoutCharactersXmlForbids(new XMLSerializer().serializeToString(clone));
  return { svg: `<?xml version="1.0" encoding="utf-8"?>\n${svg}` };
}

/**
 * A sticky may hold control characters, which the live canvas shows but XML 1.0 forbids: the
 * serializer writes them anyway, and no viewer (nor the PNG export) reads the picture then.
 */
function withoutCharactersXmlForbids(svg: string): string {
  let allowed = "";
  for (const character of svg) {
    const code = character.codePointAt(0)!;
    const forbidden =
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      (code >= 0xd800 && code <= 0xdfff) ||
      code === 0xfffe ||
      code === 0xffff;
    if (!forbidden) allowed += character;
  }
  return allowed;
}
