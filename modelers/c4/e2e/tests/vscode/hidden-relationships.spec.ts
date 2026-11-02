import { expect, test, type Page } from "@playwright/test";
import { shape } from "../support/canvas.js";
import { EXAMPLE, EXAMPLE_CONTAINER_VIEW } from "../support/documents.js";
import { documentText, openWebview, replaceDocument } from "./support/webview.js";

/**
 * A relationship on a system itself in the VS Code webview (SPEC 4.1; guide §13.5): the notice
 * after drawing one comes as the host's info notification in the web app's words, and the
 * container view's chip opens the same dialog on the shell's chrome, whose Assign writes the
 * document.
 */

const WITH_CRM = EXAMPLE.replace(
  '        mail = softwareSystem "E-mail System"',
  '        crm = softwareSystem "CRM" "Keeps the customer records."\n        mail = softwareSystem "E-mail System"',
).replace(
  '        mail -> customer "Delivers order confirmations to"\n',
  '        mail -> customer "Delivers order confirmations to"\n        bookshop -> crm "Syncs customers with"\n',
);

function notifications(page: Page) {
  return page.evaluate(() => [...window.vscodeHost!.host.notifications]);
}

test.describe("VS Code webview: a relationship on a system with containers", () => {
  test("drawing one in the landscape is an info notification, once", async ({ page }) => {
    await openWebview(page, { host: true });

    await page.evaluate(() =>
      window.modeler!.c4.createRelationship("bookshop", "payments", {
        description: "Settles with",
      }),
    );
    await page.evaluate(() =>
      window.modeler!.c4.createRelationship("bookshop", "mail", { description: "Reports to" }),
    );

    await expect
      .poll(() => notifications(page))
      .toEqual([
        {
          severity: "info",
          message:
            "Bookshop → Payment Provider connects the systems themselves, so Bookshop's container view won't show it. Draw it from a container, or use Move to a container…",
        },
      ]);
  });

  test("the container view's chip assigns it to a container in the document", async ({ page }) => {
    await openWebview(page, { host: true });
    await replaceDocument(page, WITH_CRM);
    await expect.poll(() => page.evaluate(() => window.modeler!.exportText())).toBe(WITH_CRM);
    await page.evaluate(
      (key) => window.modeler!.views.open(key, { cause: "user" }),
      EXAMPLE_CONTAINER_VIEW,
    );

    const chip = page.locator(".c4-hidden-relationships");
    await expect(chip).toHaveAccessibleName("1 relationship of Bookshop isn't shown here");
    await chip.click();
    const dialog = page.getByRole("dialog", { name: "Move to a container" });
    await dialog.getByRole("button", { name: "Assign" }).click();
    await expect(dialog).toBeHidden();

    await expect(shape(page, "crm")).toBeVisible();
    await expect(chip).toBeHidden();
    await expect.poll(() => documentText(page)).toContain('webApp -> crm "Syncs customers with"');
  });
});
