import type { Download, Page } from "@playwright/test";

export type Rgba = readonly [number, number, number, number];

/** Guide §10.7: a PNG of a notation without a plot lies on the canvas ground, #F9F7F7. */
export const PNG_GROUND: Rgba = [0xf9, 0xf7, 0xf7, 255];

export async function downloadBytes(download: Promise<Download>): Promise<Buffer> {
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * The pixel of a PNG at `at`, decoded in a blank page of the same browser: the page under test may
 * be one whose content security policy refuses the data: image this needs.
 */
export async function pixelOf(
  page: Page,
  png: Buffer,
  at: { x: number; y: number } = { x: 0, y: 0 },
): Promise<Rgba> {
  const scratch = await page.context().newPage();
  try {
    return await scratch.evaluate(
      async ({ base64, at }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("the scratch page has no 2D context");
        context.drawImage(image, 0, 0);
        const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(
          at.x,
          at.y,
          1,
          1,
        ).data;
        return [red, green, blue, alpha] as const;
      },
      { base64: png.toString("base64"), at },
    );
  } finally {
    await scratch.close();
  }
}
