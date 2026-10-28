// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import tokens from "../../../packages/renderer/src/theme/cd-tokens.generated.json" with { type: "json" };
import type { GeistFace } from "@miragon/modeler-shell/export";
import { PNG_EXPORT_FAILED, pngExportOptions } from "../src/webview/png-export.js";

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

describe("the PNG failure text", () => {
  it("says what happened and what to do, not the rasteriser's message", () => {
    expect(PNG_EXPORT_FAILED).toBe(
      "Couldn't export the map as PNG. Try again, or export it as SVG.",
    );
  });
});
