import { test, type Page } from "@playwright/test";
import { registerFitFeedbackTests } from "../support/fit-feedback.js";
import { openWebview } from "./support/webview.js";

/** The webview comes back to the view it showed, as after a reload. */
async function open(page: Page, view?: string): Promise<void> {
  await openWebview(page, view === undefined ? {} : { state: { c4: { activeView: view } } });
}

/**
 * The fit the VS Code webview hands the canvas (UX wave 2, P6): after "Lay out automatically", and
 * clear of the breadcrumb.
 */
test.describe("VS Code webview: the fit after Lay out automatically and below the breadcrumb", () => {
  registerFitFeedbackTests({ open });
});
