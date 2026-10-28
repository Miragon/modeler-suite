import { embedGeist, type GeistFace } from "./geist.js";
import { parseSvg, svgSize, type PixelSize } from "./svg.js";

export interface PngExportOptions {
  /**
   * What lies under the drawing, a CSS colour (guide §10.7): `hell['--cd-ui-plot']` of the
   * vendored `cd-tokens.generated.json` for a notation with a plot (Wardley Maps),
   * `hell['--cd-ui-grund']` for the others, `"transparent"` for "Export as PNG (4×, transparent)".
   */
  readonly background: string;
  /**
   * PNG pixels per SVG unit: 2 by default (§10.7), 4 for the transparent variant. Lowered where the
   * browser would refuse a canvas that large.
   */
  readonly scale?: number | undefined;
  /** The Geist faces to embed: the page's own (`pageGeistFaces()`) when left out, none with `[]`. */
  readonly fonts?: readonly GeistFace[] | undefined;
}

const DEFAULT_SCALE = 2;

/** Per side, in every current browser. */
const MAX_SIDE = 32_767;

/**
 * Pixels in all: desktop browsers draw 2^27 (what Wardley Maps exported up to), iOS Safari only
 * 2^24 (4,096²). A canvas the browser refuses yields no PNG, so the smaller one is the retry.
 */
const MAX_PIXELS = [2 ** 27, 2 ** 24] as const;

/**
 * A renderer's standalone SVG (`saveSVG()`) as a PNG: its labels in Geist, on the background the
 * caller names, at `scale` times its size. Browser only (`Image`, `<canvas>`).
 */
export async function svgToPng(svg: string, options: PngExportOptions): Promise<Blob> {
  const scale = options.scale ?? DEFAULT_SCALE;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`@miragon/modeler-shell: svgToPng takes a positive scale, got ${scale}.`);
  }
  const background = options.background === "transparent" ? undefined : options.background;
  if (background !== undefined && !CSS.supports("color", background)) {
    throw new RangeError(`@miragon/modeler-shell: svgToPng got "${background}", no CSS colour.`);
  }
  const size = svgSize(parseSvg(svg).documentElement);
  const image = await loadImage(await inGeist(svg, options.fonts));
  for (const pixels of attemptSizes(size, scale)) {
    const png = await drawPng(image, pixels, background);
    if (png) return png;
  }
  throw new Error("@miragon/modeler-shell: the browser refused to draw the PNG.");
}

/**
 * The PNG's size: the SVG's times `scale`, lowered proportionally where it would pass the limits,
 * so a huge diagram still exports, at a lower density.
 */
export function pngSize(size: PixelSize, scale: number, maxPixels: number): PixelSize {
  const fittingScale = Math.min(
    scale,
    MAX_SIDE / size.width,
    MAX_SIDE / size.height,
    Math.sqrt(maxPixels / (size.width * size.height)),
  );
  // Rounding up could pass a limit the browser holds to the pixel; the epsilon keeps a side that
  // is the limit itself, give or take a floating-point error, at the limit.
  const round = fittingScale < scale ? (length: number) => Math.floor(length + 1e-9) : Math.round;
  return {
    width: Math.max(1, Math.min(MAX_SIDE, round(size.width * fittingScale))),
    height: Math.max(1, Math.min(MAX_SIDE, round(size.height * fittingScale))),
  };
}

function attemptSizes(size: PixelSize, scale: number): PixelSize[] {
  const sizes: PixelSize[] = [];
  for (const maxPixels of MAX_PIXELS) {
    const pixels = pngSize(size, scale, maxPixels);
    const previous = sizes.at(-1);
    if (!previous || pixels.width * pixels.height < previous.width * previous.height) {
      sizes.push(pixels);
    }
  }
  return sizes;
}

async function inGeist(svg: string, fonts: readonly GeistFace[] | undefined): Promise<string> {
  try {
    return await embedGeist(svg, fonts);
  } catch (error) {
    // A PNG in the system sans beats no PNG.
    console.warn("@miragon/modeler-shell: the PNG falls back to the system sans:", error);
    return svg;
  }
}

async function loadImage(svg: string): Promise<HTMLImageElement> {
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("@miragon/modeler-shell: the browser could not draw the SVG."));
  });
  // A data: URL, since a widget's content security policy may refuse blob: images (the MCP Apps
  // default is img-src 'self' data:).
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  // load can fire before an embedded font is ready; decode() waits for it.
  await image.decode().catch(() => undefined);
  return image;
}

/** The PNG, or null where the browser refuses a canvas this large. */
async function drawPng(
  image: HTMLImageElement,
  pixels: PixelSize,
  background: string | undefined,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  if (background !== undefined) {
    context.fillStyle = background;
    context.fillRect(0, 0, pixels.width, pixels.height);
  }
  context.drawImage(image, 0, 0, pixels.width, pixels.height);
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  canvas.width = 0;
  canvas.height = 0;
  return png;
}
