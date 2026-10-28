// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PngExportOptions } from "@miragon/modeler-shell/export";

const svgToPng = vi.hoisted(() =>
  vi.fn<(svg: string, options: PngExportOptions) => Promise<Blob>>(),
);
vi.mock("@miragon/modeler-shell/export", () => ({ svgToPng }));
// The real module imports the font files as data: URLs, which only the esbuild build resolves.
vi.mock("../../src/webview/geist-faces.js", () => ({
  GEIST_FACES: [{ src: "data:font/woff2;base64,AAAA", unicodeRange: "U+0000-00FF" }],
}));

const { GEIST_FACES } = await import("../../src/webview/geist-faces.js");
const { PNG_BACKGROUND, blobToBase64, boardToPng } = await import("../../src/webview/io.js");

const vendoredTokens = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../../packages/renderer/src/theme/cd-tokens.generated.json",
    ),
    "utf8",
  ),
) as { hell: Record<string, string> };

function optionsOfLastCall(): PngExportOptions {
  return svgToPng.mock.calls.at(-1)![1];
}

beforeEach(() => {
  svgToPng.mockReset();
  svgToPng.mockResolvedValue(new Blob(["png!"], { type: "image/png" }));
});

describe("the webview's PNG export", () => {
  it("fills the ground of guide §10.7, hell['--cd-ui-grund']", () => {
    expect(PNG_BACKGROUND).toBe(vendoredTokens.hell["--cd-ui-grund"]);
  });

  it("draws at 2× on that ground, with Geist as data: URLs", async () => {
    await boardToPng("<svg/>");

    expect(svgToPng.mock.calls[0]![0]).toBe("<svg/>");
    expect(optionsOfLastCall()).toMatchObject({
      background: vendoredTokens.hell["--cd-ui-grund"],
      fonts: GEIST_FACES,
    });
    expect(optionsOfLastCall().scale).toBeUndefined();
  });

  it("draws the transparent variant at 4× without a ground", async () => {
    await boardToPng("<svg/>", true);

    expect(optionsOfLastCall()).toMatchObject({
      background: "transparent",
      scale: 4,
      fonts: GEIST_FACES,
    });
  });

  it("hands the PNG over as Base64 without the data-URL prefix", async () => {
    const png = await boardToPng("<svg/>");

    expect(png.data).toBe(Buffer.from("png!").toString("base64"));
    expect(await blobToBase64(new Blob(["png!"]))).toBe(png.data);
  });

  it("reports the system font only when the shell says the labels fell back", async () => {
    expect((await boardToPng("<svg/>")).fontFallback).toBe(false);

    svgToPng.mockImplementationOnce(async (_svg, options) => {
      options.onFontFallback?.(new Error("Geist could not be read"));
      return new Blob(["png!"], { type: "image/png" });
    });

    expect((await boardToPng("<svg/>")).fontFallback).toBe(true);
  });

  it("lets a rejection of the shell through, for the app to word", async () => {
    svgToPng.mockRejectedValueOnce(new Error("@miragon/modeler-shell/export: could not draw"));

    await expect(boardToPng("<svg/>")).rejects.toThrow("could not draw");
  });
});
