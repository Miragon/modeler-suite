import { describe, expect, it } from "vitest";
import { canvasFileName, isDefaultName } from "../src/files.js";

describe("canvasFileName", () => {
  it("names a download after the canvas title, the file itself with the .bmc extension", () => {
    expect(canvasFileName("Miragon Modeler Suite", "png")).toBe("miragon-modeler-suite.png");
    expect(canvasFileName("Miragon Modeler Suite", "svg")).toBe("miragon-modeler-suite.svg");
    expect(canvasFileName("Miragon Modeler Suite", "bmc")).toBe("miragon-modeler-suite.bmc");
  });

  it("falls back to a generic name for a title the app gave the canvas, or none", () => {
    expect(canvasFileName("New business model", "bmc")).toBe("canvas.bmc");
    expect(canvasFileName(undefined, "svg")).toBe("canvas.svg");
    expect(canvasFileName("  ", "svg")).toBe("canvas.svg");
    expect(canvasFileName("!!!", "svg")).toBe("canvas.svg");
  });

  it("writes ASCII: umlauts lose their marks, ß becomes ss, the length is capped", () => {
    expect(canvasFileName("Größe & Übergabe", "png")).toBe("grosse-ubergabe.png");
    expect(canvasFileName("a".repeat(80), "png")).toBe(`${"a".repeat(60)}.png`);
  });
});

describe("isDefaultName", () => {
  it("knows the title of a new canvas, in any case and with spaces around", () => {
    expect(isDefaultName(" New Business Model ")).toBe(true);
    expect(isDefaultName("Miragon Modeler Suite")).toBe(false);
  });
});
