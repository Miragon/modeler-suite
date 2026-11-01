import { expect, test, type Page } from "@playwright/test";
import {
  shellConformanceCases,
  vsCodeStubSearch,
  type ShellConformanceHarness,
} from "@miragon/modeler-shell/testing";
import { THEMES } from "@miragon/c4-renderer/themes";
import {
  EXAMPLE_COMPONENT_VIEW,
  breadcrumb,
  elementLabelEditorHooks,
  registerBreadcrumbTests,
  showInspector,
  showLegend,
  showStatus,
} from "../support/breadcrumbs.js";
import { canvasText, openWebview } from "./support/webview.js";

/** The webview comes back to the view it showed, as after a reload. */
async function open(page: Page, view?: string): Promise<void> {
  await openWebview(page, view === undefined ? {} : { state: { c4: { activeView: view } } });
}

/** The extension's problem count, which the pill shows. */
async function showProblems(page: Page): Promise<void> {
  await page.evaluate(() => window.postMessage({ type: "problems", count: 2, errors: 1 }, "*"));
  await page.locator('[data-chrome="problems"]').waitFor();
}

/** The cases of the shell's kit that read what a canvas holds: its tab stops and its layers. */
const CASES_ON_THE_CANVAS = new Set(["aria", "overlayLayers"]);

const harness: ShellConformanceHarness<Page> = {
  host: "ide",
  themes: THEMES,
  async open(page, { size, requested }) {
    await page.setViewportSize(size);
    const search = new URLSearchParams(vsCodeStubSearch(requested));
    search.set("state", JSON.stringify({ c4: { activeView: EXAMPLE_COMPONENT_VIEW } }));
    await page.goto(`/webview-test.html?${search.toString()}`);
    await page.waitForFunction(() => window.webviewReady === true);
    await breadcrumb(page).waitFor();
  },
  absent: [],
  show: {
    problems: showProblems,
    status: showStatus,
    legend: showLegend,
    inspector: showInspector,
  },
  labelEditor: elementLabelEditorHooks(canvasText),
};

/**
 * The breadcrumb in the VS Code webview: the host-independent part, a reload that keeps it with
 * its view, then the shell's kit on the view where it shows, for the cases that look into the
 * canvas: the tab order and the overlay layers.
 */
test.describe("VS Code webview: breadcrumb", () => {
  registerBreadcrumbTests({
    open,
    islands: {
      legend: showLegend,
      inspector: showInspector,
      status: showStatus,
      problems: showProblems,
      "every island": async (page) => {
        await showProblems(page);
        await showLegend(page);
        await showStatus(page);
        await showInspector(page);
      },
    },
  });

  test("a reload that comes back to a component view shows its path", async ({ page }) => {
    await open(page, EXAMPLE_COMPONENT_VIEW);
    await expect(breadcrumb(page).locator('[aria-current="page"]')).toHaveText("API components");
    await expect(breadcrumb(page).getByRole("button")).toHaveCount(3);
  });

  test.describe("shell conformance with the breadcrumb shown", () => {
    test.describe.configure({ timeout: 90_000 });
    for (const conformanceCase of shellConformanceCases()) {
      if (!CASES_ON_THE_CANVAS.has(conformanceCase.name)) continue;
      test(conformanceCase.name, async ({ page }) => {
        const outcome = await conformanceCase.run(page, harness);
        expect(outcome?.skipped ?? []).toEqual([]);
      });
    }
  });
});
