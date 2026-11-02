import type { Point } from "@miragon/c4-schema-model";
import type { TextBand } from "../text/types.js";
import { applyPaint, type FillRole, type Paint } from "./styles.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type SvgAttributes = Readonly<Record<string, string | number | undefined>>;

/** Two decimals: exports stay byte-stable, and the drawing gains nothing from more. */
export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * An SVG node with presentation attributes. Not tiny-svg's `attr`, which writes paint and font as
 * inline style: the export keeps attributes, and other tools read them (guide §4, §10.2).
 */
export function svgElement<Tag extends keyof SVGElementTagNameMap>(
  tag: Tag,
  attributes: SvgAttributes = {},
): SVGElementTagNameMap[Tag] {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    node.setAttribute(name, typeof value === "number" ? formatNumber(value) : value);
  }
  return node;
}

export function append<Node extends SVGElement>(parent: SVGElement, node: Node): Node {
  parent.appendChild(node);
  return node;
}

export function clearChildren(node: Element): void {
  while (node.firstChild) node.firstChild.remove();
}

/**
 * One `<text>` per line of the band, every one carrying the family, size and weight (SVG text does
 * not inherit the container's font, guide §4) and `geometricPrecision`, so its width scales with
 * the zoom as the canvas measured it. `origin` turns diagram into the parent's coordinates.
 */
export function appendBand(
  parent: SVGElement,
  band: TextBand,
  origin: Point,
  className: string,
): SVGTextElement[] {
  const lineHeight = band.font.size * band.font.lineHeight;
  const x =
    band.align === "centre" ? band.box.x + band.box.width / 2 - origin.x : band.box.x - origin.x;
  const paint: Paint<FillRole> =
    band.colour === undefined ? { role: band.role } : { colour: band.colour };
  return band.lines.flatMap((line, index) => {
    if (line === "") return [];
    const text = svgElement("text", {
      class: className,
      x,
      y: band.box.y - origin.y + index * lineHeight + lineHeight / 2,
      "font-family": band.font.family,
      "font-size": band.font.size,
      "font-weight": band.font.weight,
      "text-anchor": band.align === "centre" ? "middle" : "start",
      "dominant-baseline": "central",
      "text-rendering": "geometricPrecision",
    });
    applyPaint(text, "fill", paint);
    text.textContent = line;
    return [append(parent, text)];
  });
}
