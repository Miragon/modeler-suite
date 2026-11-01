import { expect, test, type Page } from "@playwright/test";
import { EXAMPLE_COMPONENT_VIEW } from "../support/breadcrumbs.js";
import { EXAMPLE, EXAMPLE_CONTAINER_VIEW } from "../support/documents.js";
import { documentText, openWebview } from "./support/webview.js";

/**
 * What the VS Code webview has the host notify (UX wave 3, W3.4; guide §13.5): what Delete did, in
 * the words of the web app's toast, as an info notification; and a refused edit at the level of
 * the web app's toast, so a rule it explains is an info notification, never an error.
 */

/** The webview with the extension's plumbing, on `view`, as after a reload. */
async function open(page: Page, view: string): Promise<void> {
  await openWebview(page, { host: true, state: { c4: { activeView: view } } });
}

async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((target) => {
    const diagram = window.modeler!.diagram;
    const element = diagram.get<{ get(id: string): unknown }>("elementRegistry").get(target);
    diagram.get<{ select(element: unknown): void }>("selection").select(element);
  }, id);
  await page.locator(".djs-container > svg").focus();
}

function notifications(page: Page) {
  return page.evaluate(() => [...window.vscodeHost!.host.notifications]);
}

test.describe("VS Code webview: the host's notifications of Delete and of a refusal", () => {
  test("Delete says it removed an element from this view only", async ({ page }) => {
    await open(page, EXAMPLE_CONTAINER_VIEW);
    await select(page, "mail");

    await page.keyboard.press("Delete");

    await expect
      .poll(() => notifications(page))
      .toEqual([
        {
          severity: "info",
          message: "Removed E-mail System from this view. It stays in the model.",
        },
      ]);
    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE);
  });

  test("Delete says it deleted an element no other view shows from the model", async ({ page }) => {
    await open(page, EXAMPLE_COMPONENT_VIEW);
    await select(page, "catalogue");

    await page.keyboard.press("Delete");

    await expect
      .poll(() => notifications(page))
      .toEqual([
        { severity: "info", message: "Deleted Catalogue from the model. No other view showed it." },
      ]);
  });

  test("a refused Delete that explains a rule is an info notification, not an error", async ({
    page,
  }) => {
    await open(page, "SystemContext-bookshop");
    await select(page, "bookshop");

    await page.keyboard.press("Delete");

    await expect
      .poll(() => notifications(page))
      .toEqual([
        {
          severity: "info",
          message:
            "A system context view always shows its system. To leave it out, delete the view.",
        },
      ]);
    expect(await documentText(page)).toBe(EXAMPLE);
  });
});
