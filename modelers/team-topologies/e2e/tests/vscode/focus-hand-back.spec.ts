import { test } from "@playwright/test";
import { FOCUS_HAND_BACK_CASES, expectCanvasKeysAct } from "../support/focusHandBack.js";
import { openWebview } from "./support/webview.js";

test.describe("VS Code webview: palette, context pad and inspector hand the focus to the canvas", () => {
  for (const focusCase of FOCUS_HAND_BACK_CASES) {
    test(focusCase.name, async ({ page }) => {
      await openWebview(page);

      await focusCase.run(page);

      await expectCanvasKeysAct(page);
    });
  }
});
