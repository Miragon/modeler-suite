import { expect, test } from "@playwright/test";
import { blockOf, titleOf } from "@miragon/business-model-canvas-schema-model";
import { exportDocument, openApp, openExample } from "./support/webapp.js";

test.describe("webapp export round-trip", () => {
  test("loads the example and exports the canvas and an SVG", async ({ page }) => {
    await openApp(page);
    await openExample(page);

    const document = await exportDocument(page);
    expect(titleOf(document)).toBe("Miragon Modeler Suite");
    expect(blockOf(document, "customer-segments")!.items.map((sticky) => sticky.id)).toEqual([
      "consultants",
      "agent-teams",
      "architects",
    ]);

    const { svg } = await page.evaluate(() =>
      window.__businessModelCanvasApp!.modeler.diagram.saveSVG(),
    );
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("NaN");
  });
});
