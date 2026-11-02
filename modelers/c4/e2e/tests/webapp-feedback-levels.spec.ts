import { expect, test, type Page } from "@playwright/test";
import { EXAMPLE, EXAMPLE_CONTAINER_VIEW } from "./support/documents.js";
import { exportText, forgetStorageOnEveryVisit, openWorkspace, toast } from "./support/webapp.js";

/**
 * The level of the web app's toasts for a refused edit (UX wave 3, W3.4; guide §9): a refusal that
 * explains a rule of C4 or of Structurizr is an info toast, never the danger toast and alert of a
 * failure.
 */

const CONTEXT_VIEW = "SystemContext-bookshop";

async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((target) => {
    const diagram = window.app!.modeler.diagram;
    const element = diagram.get<{ get(id: string): unknown }>("elementRegistry").get(target);
    diagram.get<{ select(element: unknown): void }>("selection").select(element);
  }, id);
  await page.locator(".djs-container > svg").focus();
}

test.describe("web app: the level of a refused edit", () => {
  test.beforeEach(async ({ page }) => {
    await forgetStorageOnEveryVisit(page);
  });

  test("Delete on the system of its own context view explains the rule in an info toast", async ({
    page,
  }) => {
    await openWorkspace(page, EXAMPLE, CONTEXT_VIEW);
    await select(page, "bookshop");

    await page.keyboard.press("Delete");

    const refused = toast(
      page,
      "A system context view always shows its system. To leave it out, delete the view.",
    );
    await expect(refused).toBeVisible();
    await expect(refused).toHaveAttribute("data-status", "info");
    await expect(page.getByRole("alert").filter({ hasText: "A system context view" })).toHaveCount(
      0,
    );
    expect(await exportText(page)).toBe(EXAMPLE);
  });

  test("a relationship to the element itself explains the rule in an info toast", async ({
    page,
  }) => {
    await openWorkspace(page, EXAMPLE, EXAMPLE_CONTAINER_VIEW);

    await page.evaluate(() => window.app!.modeler.c4.createRelationship("api", "api"));

    const refused = toast(page, "An element can't have a relationship to itself.");
    await expect(refused).toHaveAttribute("data-status", "info");
    expect(await exportText(page)).toBe(EXAMPLE);
  });
});
