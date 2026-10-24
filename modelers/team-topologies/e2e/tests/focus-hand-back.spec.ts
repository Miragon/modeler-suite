import { test } from "@playwright/test";
import { FOCUS_HAND_BACK_CASES, expectCanvasKeysAct } from "./support/focusHandBack.js";
import { gotoApp, loadExample } from "./support/modeler.js";

test.describe("webapp: palette, context pad and inspector hand the focus to the canvas", () => {
  for (const focusCase of FOCUS_HAND_BACK_CASES) {
    test(focusCase.name, async ({ page }) => {
      await gotoApp(page);
      await loadExample(page);

      await focusCase.run(page);

      await expectCanvasKeysAct(page);
    });
  }
});
