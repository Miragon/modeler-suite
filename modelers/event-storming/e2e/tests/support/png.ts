import type { Download, Page } from "@playwright/test";

declare global {
  interface Window {
    /** The sources the page gave an <img>, in order: the shell loads the SVG of a PNG export so. */
    __imageSources?: string[];
  }
}

/** Guide §10.7: the ground of "Export as PNG", `hell['--cd-ui-grund']` (#F9F7F7). */
export const PNG_GROUND = [0xf9, 0xf7, 0xf7, 0xff] as const;

/** Records every `src` the page sets on an <img>, before any of the page's scripts run. */
export async function recordImageSources(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    if (!descriptor?.set) return;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...descriptor,
      set(this: HTMLImageElement, value: string) {
        (window.__imageSources ??= []).push(String(value));
        descriptor.set!.call(this, value);
      },
    });
  });
}

/** The last SVG the page drew as an image, decoded from its data: URL. */
export async function lastDrawnSvg(page: Page): Promise<string> {
  const source = await page.evaluate(() => window.__imageSources?.at(-1) ?? "");
  const comma = source.indexOf(",");
  if (!source.startsWith("data:image/svg+xml") || comma < 0) {
    throw new Error(`the page drew no SVG from a data: URL (it set "${source.slice(0, 40)}")`);
  }
  return decodeURIComponent(source.slice(comma + 1));
}

export async function readDownload(download: Download): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** The pixel in the top left corner as [red, green, blue, alpha]. */
  readonly corner: readonly number[];
}

/** Decodes a PNG in the page, where the browser's own decoder and a canvas read it back. */
export function decodePng(page: Page, png: Buffer | string): Promise<DecodedPng> {
  const base64 = typeof png === "string" ? png : png.toString("base64");
  return page.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2D context to read the PNG back");
    context.drawImage(bitmap, 0, 0);
    return {
      width: bitmap.width,
      height: bitmap.height,
      corner: [...context.getImageData(0, 0, 1, 1).data],
    };
  }, base64);
}
