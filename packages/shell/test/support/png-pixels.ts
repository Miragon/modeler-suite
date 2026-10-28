/// <reference types="vite/client" />
/** Reading PNGs back in the browser tests of `./export`. */
import monoLatinExtUrl from "@fontsource-variable/geist-mono/files/geist-mono-latin-ext-wght-normal.woff2?url";
import monoLatinUrl from "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url";
import { GEIST_UNICODE_RANGES } from "../../src/export/index.js";

export async function pngPixels(png: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(png);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no 2D context");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function pixelAt(pixels: ImageData, x: number, y: number): number[] {
  const offset = (y * pixels.width + x) * 4;
  return Array.from(pixels.data.subarray(offset, offset + 4));
}

/** The width of the dark pixels: a label's ink, from its first glyph's left edge to its last's right. */
export function inkWidth(pixels: ImageData): number {
  let left = Infinity;
  let right = -Infinity;
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      const [red = 0, green = 0, blue = 0, alpha = 0] = pixelAt(pixels, x, y);
      if (alpha > 128 && (red + green + blue) / 3 < 128) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  return right >= left ? right - left + 1 : 0;
}

export const LABEL = { x: 8, baseline: 34, fontSize: 24, width: 480, height: 48 } as const;

/**
 * What a glyph falls back to where Geist is missing: Geist Mono, which the test SVG brings itself.
 * The system's sans and monospace differ by platform; on Linux both came within a few pixels of
 * Geist for some labels, while Geist Mono is wider in nearly every glyph everywhere.
 */
export const FALLBACK_FAMILY = "'Geist Mono Variable'";

let fallbackFaces: Promise<string> | undefined;

function fallbackFontFaces(): Promise<string> {
  fallbackFaces ??= Promise.all([fileAsDataUrl(monoLatinExtUrl), fileAsDataUrl(monoLatinUrl)]).then(
    ([latinExt, latin]) =>
      `@font-face{font-family:${FALLBACK_FAMILY};font-weight:100 900;src:url("${latinExt}");` +
      `unicode-range:${GEIST_UNICODE_RANGES.latinExt}}` +
      `@font-face{font-family:${FALLBACK_FAMILY};font-weight:100 900;src:url("${latin}");` +
      `unicode-range:${GEIST_UNICODE_RANGES.latin}}`,
  );
  return fallbackFaces;
}

/**
 * One label in 'Geist Variable', without 'Geist' (a local install must not stand in), falling back
 * to Geist Mono, whose subsets hidden texts load up front as embedGeist does for Geist. Build it
 * before a test stubs `fetch`: the first call reads the fallback's files.
 */
export async function labelSvg(label: string): Promise<string> {
  const preload = ["ł", "A"]
    .map((sample) => `<text style="font-family:${FALLBACK_FAMILY}">${sample}</text>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LABEL.width}" height="${LABEL.height}">` +
    `<defs><style>${await fallbackFontFaces()}</style></defs>` +
    `<g visibility="hidden">${preload}</g>` +
    `<text x="${LABEL.x}" y="${LABEL.baseline}" font-family="'Geist Variable', ${FALLBACK_FAMILY}" ` +
    `font-size="${LABEL.fontSize}">${label}</text></svg>`
  );
}

/** The label's ink width at `scale` when the page itself draws it in `family`, on a canvas. */
export async function canvasInkWidth(
  label: string,
  family: string,
  scale: number,
): Promise<number> {
  const font = `${LABEL.fontSize}px ${family}`;
  await document.fonts.load(font, label);
  const canvas = document.createElement("canvas");
  canvas.width = LABEL.width * scale;
  canvas.height = LABEL.height * scale;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no 2D context");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.font = font;
  context.fillStyle = "black";
  context.fillText(label, LABEL.x, LABEL.baseline);
  return inkWidth(context.getImageData(0, 0, canvas.width, canvas.height));
}

/** A file the test server serves, as a `data:` URL. */
export async function fileAsDataUrl(url: string): Promise<string> {
  const file = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(`could not read ${url}`));
    reader.readAsDataURL(file);
  });
}
