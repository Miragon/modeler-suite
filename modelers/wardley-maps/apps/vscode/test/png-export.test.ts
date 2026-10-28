// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import tokens from "../../../packages/renderer/src/theme/cd-tokens.generated.json" with { type: "json" };
import type { GeistFace, PngExportOptions } from "@miragon/modeler-shell/export";
import {
  PNG_EXPORT_FAILED,
  pngExportMessage,
  pngExportOptions,
} from "../src/webview/png-export.js";

const FACES: readonly GeistFace[] = [{ src: "data:font/woff2;base64,AAAA" }];
const NO_FALLBACK = (): void => undefined;

describe("the webview's PNG options", () => {
  it("fills the plot role of the tokens, as guide §10.7 asks of a notation with a plot", () => {
    const options = pngExportOptions("png", FACES, NO_FALLBACK);
    expect(options.background.toUpperCase()).toBe(tokens.hell["--cd-ui-plot"].toUpperCase());
    expect(options.scale).toBeUndefined();
  });

  it("leaves the 4x variant without a background", () => {
    const options = pngExportOptions("png-transparent", FACES, NO_FALLBACK);
    expect(options.background).toBe("transparent");
    expect(options.scale).toBe(4);
  });

  it("hands the data: faces to the export, since the webview can't fetch its font files", () => {
    for (const format of ["png", "png-transparent"] as const) {
      expect(pngExportOptions(format, FACES, NO_FALLBACK).fonts).toBe(FACES);
    }
  });

  it("reports a font fallback through the callback it was given", () => {
    const reasons: unknown[] = [];
    const options = pngExportOptions("png", FACES, () => reasons.push("fallback"));
    options.onFontFallback?.(new Error("no file"));
    expect(reasons).toEqual(["fallback"]);
  });
});

describe("the webview's PNG message", () => {
  const picture = new Blob(["png"], { type: "image/png" });
  const base64OfPicture = "cG5n";

  it("carries the picture and no fallback flag when Geist was embedded", async () => {
    const rasterize = vi.fn().mockResolvedValue(picture);
    const message = await pngExportMessage("<svg/>", "png", FACES, rasterize);
    expect(message).toEqual({ type: "export", format: "png", data: base64OfPicture });
    expect(message).not.toHaveProperty("fontFallback");
    expect(rasterize).toHaveBeenCalledWith("<svg/>", expect.objectContaining({ fonts: FACES }));
  });

  it("flags the picture for the host when the export fell back to the system font", async () => {
    const rasterize = vi.fn(async (_svg: string, options: PngExportOptions) => {
      options.onFontFallback?.(new Error("no file"));
      return picture;
    });
    const message = await pngExportMessage("<svg/>", "png-transparent", FACES, rasterize);
    expect(message).toEqual({
      type: "export",
      format: "png-transparent",
      data: base64OfPicture,
      fontFallback: true,
    });
  });

  it("rejects with the rasteriser's error, for the caller to show its own text", async () => {
    const failure = new Error("could not draw");
    const rasterize = vi.fn().mockRejectedValue(failure);
    await expect(pngExportMessage("<svg/>", "png", FACES, rasterize)).rejects.toBe(failure);
  });
});

describe("the PNG failure text", () => {
  it("says what happened and what to do, not the rasteriser's message", () => {
    expect(PNG_EXPORT_FAILED).toBe(
      "Couldn't export the map as PNG. Try again, or export it as SVG.",
    );
  });
});
