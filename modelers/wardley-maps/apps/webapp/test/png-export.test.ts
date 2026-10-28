// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import tokens from "../../../packages/renderer/src/theme/cd-tokens.generated.json" with { type: "json" };
import { PNG_EXPORT_FAILED, fontFallbackText, pngExportOptions } from "../src/png-export.js";

describe("the web app's PNG options", () => {
  it("fills the plot role of the tokens, as guide §10.7 asks of a notation with a plot", () => {
    const options = pngExportOptions("png", () => undefined);
    expect(options.background.toUpperCase()).toBe(tokens.hell["--cd-ui-plot"].toUpperCase());
    expect(options.scale).toBeUndefined();
  });

  it("leaves the 4x variant without a background", () => {
    const options = pngExportOptions("png-transparent", () => undefined);
    expect(options.background).toBe("transparent");
    expect(options.scale).toBe(4);
  });

  it("reads Geist from the page, whose stylesheets load it", () => {
    expect(pngExportOptions("png", () => undefined).fonts).toBeUndefined();
  });

  it("reports a font fallback through the callback it was given", () => {
    const reports: string[] = [];
    pngExportOptions("png", () => reports.push("fallback")).onFontFallback?.(new Error("no file"));
    expect(reports).toEqual(["fallback"]);
  });
});

describe("the PNG texts", () => {
  it("says what happened and what to do on a failure, not the rasteriser's message", () => {
    expect(PNG_EXPORT_FAILED).toBe(
      "Couldn't export the map as PNG. Try again, or export it as SVG.",
    );
  });

  it("names the file when the labels fell back to the system font", () => {
    expect(fontFallbackText("tea-shop.png")).toBe(
      "Exported tea-shop.png in a system font. Geist couldn't be embedded.",
    );
  });
});
