import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_DOCUMENT } from "business-model-canvas-ide-editor/examples";

describe("the examples", () => {
  it("bundle example/miragon.bmc unchanged", async () => {
    const { EXAMPLE_TEXT } = await import("../../ide-editor/src/exampleText.js");
    expect(EXAMPLE_TEXT).toBe(
      readFileSync(new URL("../../../example/miragon.bmc", import.meta.url), "utf8"),
    );
  });

  it("start a new canvas with its title only", () => {
    expect(EMPTY_DOCUMENT).toBe("version: 1\ncanvas:\n  title: New business model\n");
  });
});
