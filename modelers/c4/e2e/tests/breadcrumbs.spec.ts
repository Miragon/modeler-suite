import { expect, test, type Page } from "@playwright/test";
import {
  shellConformanceCases,
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
} from "./support/breadcrumbs.js";
import { EXAMPLE, EXAMPLE_WITH_PROBLEMS } from "./support/documents.js";
import {
  exportText,
  forgetStorageOnEveryVisit,
  openWorkspace,
  workspaceLink,
} from "./support/webapp.js";

/** The example with findings, on the component view: the pill shows below the breadcrumb. */
async function showProblems(page: Page): Promise<void> {
  await page.goto(await workspaceLink(EXAMPLE_WITH_PROBLEMS, EXAMPLE_COMPONENT_VIEW));
  await page.waitForFunction(
    (text) => window.app?.modeler.exportText() === text,
    EXAMPLE_WITH_PROBLEMS,
  );
}

async function open(page: Page, view?: string): Promise<void> {
  await forgetStorageOnEveryVisit(page);
  await openWorkspace(page, EXAMPLE, view);
}

/** The cases of the shell's kit that read what a canvas holds: its tab stops and its layers. */
const CASES_ON_THE_CANVAS = new Set(["aria", "overlayLayers"]);

const harness: ShellConformanceHarness<Page> = {
  host: "web",
  themes: THEMES,
  async open(page, { size }) {
    await page.setViewportSize(size);
    await open(page, EXAMPLE_COMPONENT_VIEW);
    await breadcrumb(page).waitFor();
  },
  absent: ["invalid"],
  show: {
    problems: showProblems,
    status: showStatus,
    legend: showLegend,
    inspector: showInspector,
  },
  labelEditor: elementLabelEditorHooks(exportText),
};

/**
 * The breadcrumb in the web app: the host-independent part, then the shell's kit on the view
 * where the breadcrumb shows (its other runs open the landscape, where it is hidden), for the
 * cases that look into the canvas: the tab order (menu, Share, palette, canvas, nothing between)
 * and the overlay layers (a lasting overlay at z-index 100 or below).
 */
test.describe("web app: breadcrumb", () => {
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
