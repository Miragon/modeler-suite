const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/** The SVG's document; throws when it does not parse or its root is no `<svg>`. */
export function parseSvg(svg: string): Document {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  if (
    root.namespaceURI !== SVG_NAMESPACE ||
    root.localName !== "svg" ||
    parsed.getElementsByTagName("parsererror").length > 0
  ) {
    throw new Error("@miragon/modeler-shell: the SVG does not parse.");
  }
  return parsed;
}

export function createSvgElement(owner: Document, name: string): Element {
  return owner.createElementNS(SVG_NAMESPACE, name);
}

/** What every modeler drew so far for an SVG without a usable size. */
const FALLBACK_SIZE: PixelSize = { width: 1000, height: 700 };

/**
 * The root's own `width` and `height` in pixels, else its `viewBox`. Reads the root element only:
 * a pattern over the text would take the width of the first nested element when the root has a
 * relative size such as `100%`.
 */
export function svgSize(root: Element): PixelSize {
  const width = absoluteLength(root.getAttribute("width"));
  const height = absoluteLength(root.getAttribute("height"));
  if (width !== undefined && height !== undefined) return { width, height };
  const viewBox = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [, , viewBoxWidth = NaN, viewBoxHeight = NaN] = viewBox;
  if (viewBox.length === 4 && viewBoxWidth > 0 && viewBoxHeight > 0) {
    return { width: width ?? viewBoxWidth, height: height ?? viewBoxHeight };
  }
  return { width: width ?? FALLBACK_SIZE.width, height: height ?? FALLBACK_SIZE.height };
}

function absoluteLength(value: string | null): number | undefined {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/.exec(value ?? "");
  const length = match ? Number(match[1]) : NaN;
  return length > 0 ? length : undefined;
}
