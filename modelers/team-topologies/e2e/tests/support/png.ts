import type { Page } from "@playwright/test";

/** The background of "Export as PNG" (guide §10.7: `hell['--cd-ui-grund']`, a notation without a plot). */
export const PNG_BACKGROUND = "#F9F7F7";

/** What a pixel that nothing was drawn on reads as. */
export const TRANSPARENT = "#00000000";

async function pixelOf(page: Page, imageUrl: string, x: number, y: number): Promise<string> {
  const rgba = await page.evaluate(
    async ({ imageUrl, x, y }) => {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("the browser could not draw the image"));
      });
      image.src = imageUrl;
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("the page has no 2D canvas");
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(x, y, 1, 1).data);
    },
    { imageUrl, x, y },
  );
  const [red = 0, green = 0, blue = 0, alpha = 0] = rgba;
  const hex = (channel: number): string => channel.toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(red)}${hex(green)}${hex(blue)}${alpha === 255 ? "" : hex(alpha)}`;
}

/** The pixel at (`x`, `y`) of a PNG given as Base64, as `#RRGGBB`, or `#RRGGBBAA` where it is not opaque. */
export function pngPixel(page: Page, base64: string, x = 0, y = 0): Promise<string> {
  return pixelOf(page, `data:image/png;base64,${base64}`, x, y);
}

/** The pixel at (`x`, `y`) of an SVG drawn as an image, in the format of `pngPixel`. */
export function svgPixel(page: Page, svg: string, x = 0, y = 0): Promise<string> {
  return pixelOf(page, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, x, y);
}
