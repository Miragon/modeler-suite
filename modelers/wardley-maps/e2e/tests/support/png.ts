import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

export type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

const tokens = JSON.parse(
  readFileSync(
    new URL("../../../packages/renderer/src/theme/cd-tokens.generated.json", import.meta.url),
    "utf8",
  ),
) as { hell: Record<string, string> };

function rgbaOf(hex: string): Rgba {
  const channels = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!channels) throw new Error(`not a six-digit hex colour: ${hex}`);
  const [, red = "", green = "", blue = ""] = channels;
  return [parseInt(red, 16), parseInt(green, 16), parseInt(blue, 16), 255];
}

/** Guide §10.7: the PNG of a notation with a plot lies on `hell['--cd-ui-plot']`. */
export const PLOT_BACKGROUND = rgbaOf(tokens.hell["--cd-ui-plot"]!);

/** What the old renderer rasteriser filled; the plot role is not it. */
export const PAPER_BACKGROUND = rgbaOf(tokens.hell["--cd-ui-grund"]!);

/** The top left pixel of a PNG, decoded by the page's own browser. */
export function cornerPixel(page: Page, png: Buffer): Promise<Rgba> {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2D canvas");
    context.drawImage(image, 0, 0);
    const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
    return [red, green, blue, alpha] as const;
  }, png.toString("base64"));
}
