import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

const tokens = JSON.parse(
  readFileSync(
    new URL("../../../packages/renderer/src/theme/cd-tokens.generated.json", import.meta.url),
    "utf8",
  ),
) as { hell: Record<string, string> };

/** Guide §10.7: a PNG of a notation without a plot lies on `hell['--cd-ui-grund']`. */
export const PNG_GROUND = tokens.hell["--cd-ui-grund"]!.toLowerCase();

export interface PngFacts {
  readonly width: number;
  readonly height: number;
  /** Top left, top right, bottom left and bottom right pixel, `#rrggbb` or `#rrggbb/alpha`. */
  readonly corners: readonly string[];
}

/** Decodes `png` in the page, as the browser draws it. */
export function pngFacts(page: Page, png: Uint8Array): Promise<PngFacts> {
  return page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${base64}`)).blob(),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("the page has no 2D canvas");
    context.drawImage(bitmap, 0, 0);
    const pixel = (x: number, y: number): string => {
      const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
      const hex = [red, green, blue].map((channel) => channel!.toString(16).padStart(2, "0"));
      return `#${hex.join("")}${alpha === 255 ? "" : `/${alpha}`}`;
    };
    const right = bitmap.width - 1;
    const bottom = bitmap.height - 1;
    return {
      width: bitmap.width,
      height: bitmap.height,
      corners: [pixel(0, 0), pixel(right, 0), pixel(0, bottom), pixel(right, bottom)],
    };
  }, Buffer.from(png).toString("base64"));
}

/**
 * Records the SVGs the page loads into an `<img>` from now on, which is what the PNG export draws:
 * the test reads from them what the export embedded.
 */
export function recordRasterisedSvgs(page: Page): Promise<void> {
  return page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { rasterisedSvgs: string[] }).rasterisedSvgs = seen;
    const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    if (!source?.set) throw new Error("HTMLImageElement.src has no setter to record");
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...source,
      set(this: HTMLImageElement, value: string) {
        if (value.startsWith("data:image/svg+xml")) {
          seen.push(decodeURIComponent(value.slice(value.indexOf(",") + 1)));
        }
        source.set!.call(this, value);
      },
    });
  });
}

export function rasterisedSvgs(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...(window as unknown as { rasterisedSvgs: string[] }).rasterisedSvgs,
  ]);
}
