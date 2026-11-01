import { expect, test } from "@playwright/test";
import { labelEditor, select, shape } from "./support/canvas.js";
import { EXAMPLE, EXAMPLE_CONTAINER_VIEW } from "./support/documents.js";
import { activeViewKey } from "./support/navigation.js";
import {
  exportText,
  forgetStorageOnEveryVisit,
  openMenu,
  openWorkspace,
  toast,
} from "./support/webapp.js";

/**
 * A relationship drawn on a system in the landscape (SPEC 4.1): Structurizr implies relationships
 * upward only, so the system's container view leaves it out. The web app says so once as an info
 * toast, the container view's chip says what is missing, and its dialog assigns the relationship
 * to a container, after which the container view shows it.
 */
test.describe("web app: a relationship drawn on a system, then assigned to a container", () => {
  test.beforeEach(async ({ page }) => {
    await forgetStorageOnEveryVisit(page);
  });

  test("the landscape, the container view's chip, Assign, and the relationship in sight", async ({
    page,
  }) => {
    await openWorkspace(page, EXAMPLE);

    // A new system from the palette, named in its editor.
    await page.locator('.djs-palette [data-action="create.softwareSystem"]').focus();
    await page.keyboard.press("Enter");
    await expect(labelEditor(page)).toBeVisible();
    await page.keyboard.type("CRM");
    await page.keyboard.press("Enter");
    await expect(labelEditor(page)).toHaveCount(0);
    await expect(shape(page, "crm")).toBeVisible();

    // Bookshop → CRM, by the keyboard's way to draw one.
    await select(page, "bookshop");
    const menu = await openMenu(page);
    await menu.locator('[data-menu-id="add-relationship"]').click();
    const addDialog = page.getByRole("dialog", { name: "Add relationship" });
    await addDialog.getByRole("combobox", { name: "To" }).selectOption({ label: "CRM" });
    await addDialog.getByRole("textbox", { name: "Description" }).fill("Syncs customers with");
    await addDialog.getByRole("textbox", { name: "Technology" }).fill("HTTPS");
    await addDialog.getByRole("button", { name: "Add relationship" }).click();
    await expect(addDialog).toBeHidden();
    const notice = toast(
      page,
      "Bookshop → CRM connects the systems themselves, so Bookshop's container view won't show it. Draw it from a container, or use Move to a container…",
    );
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("data-status", "info");

    // One level down the relationship is gone, and the chip says why.
    await select(page, "bookshop");
    await page.keyboard.press("Enter");
    await expect.poll(() => activeViewKey(page)).toBe(EXAMPLE_CONTAINER_VIEW);
    await expect(shape(page, "crm")).toHaveCount(0);
    const chip = page.locator(".c4-hidden-relationships");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAccessibleName("1 relationship of Bookshop isn't shown here");

    await chip.click();
    const dialog = page.getByRole("dialog", { name: "Move to a container" });
    const choice = dialog.getByRole("combobox", { name: "Container of Bookshop" });
    await expect(choice).toBeFocused();
    await choice.selectOption({ label: "API" });
    await dialog.getByRole("button", { name: "Assign" }).click();
    await expect(dialog).toBeHidden();

    await expect(shape(page, "crm")).toBeVisible();
    await expect(page.locator('.djs-connection[data-element-id="rel:api->crm"]')).toBeVisible();
    // The moved relationship alone is selected, so the inspector shows its fields.
    const inspector = page.locator('[data-chrome="inspector"]');
    await expect(inspector).toContainText("API → CRM");
    await expect(inspector.getByRole("textbox", { name: "Description" })).toHaveValue(
      "Syncs customers with",
    );
    await expect(chip).toBeHidden();
    const text = await exportText(page);
    expect(text).toContain('        api -> crm "Syncs customers with" "HTTPS"\n');
    expect(text).not.toContain("bookshop -> crm");
    expect(text).toMatch(/"c4modeler\.element\.crm" "-?\d+,-?\d+"/);
  });
});
