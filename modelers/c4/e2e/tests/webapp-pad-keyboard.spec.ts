import { expect, test, type Page } from "@playwright/test";
import { labelEditor, select } from "./support/canvas.js";
import { EXAMPLE } from "./support/documents.js";
import { exportText, forgetStorageOnEveryVisit, openWorkspace } from "./support/webapp.js";

/**
 * The context pad by keyboard in the web app (UX wave 3): Tab from the canvas reaches the pad of
 * the selection before the shell's inspector, the arrows move through it, Enter runs the click
 * append with its name editor, and Escape gives the canvas the keys back with the selection kept.
 */

const focusedEntry = (page: Page) => page.locator(".djs-context-pad.open .entry:focus");

test.describe("web app: the context pad by keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await forgetStorageOnEveryVisit(page);
    await openWorkspace(page, EXAMPLE);
  });

  test("Tab reaches the pad after the canvas and before the inspector; Shift+Tab goes back", async ({
    page,
  }) => {
    await select(page, "customer");
    await expect(page.locator('.djs-context-pad.open[role="toolbar"]')).toHaveAccessibleName(
      "Element actions",
    );
    await page.keyboard.press("Tab");
    await expect(focusedEntry(page)).toHaveAttribute("data-action", "append.person");
    await expect(focusedEntry(page)).toHaveAccessibleName("Append person");
    await page.keyboard.press("Tab");
    await expect(page.locator(".c4-inspector-close")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(".djs-container > svg")).toBeFocused();
  });

  test("the arrows move, Enter appends with the name editor, Escape returns to the canvas", async ({
    page,
  }) => {
    const before = await exportText(page);
    await select(page, "payments");
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown");
    await expect(focusedEntry(page)).toHaveAttribute("data-action", "append.softwareSystem");
    await page.keyboard.press("Enter");
    await expect(labelEditor(page)).toBeFocused();
    await expect(labelEditor(page)).toHaveValue("Software System");
    await page.keyboard.type("Ledger");
    await page.keyboard.press("Enter");
    await expect(labelEditor(page)).toHaveAttribute("data-field", "description");
    await page.keyboard.press("Escape");
    await expect(labelEditor(page)).toHaveCount(0);
    const after = await exportText(page);
    expect(after).not.toBe(before);
    expect(after).toContain('softwareSystem "Ledger"');
    expect(after).toContain("payments -> ledger");

    await select(page, "payments");
    await page.keyboard.press("Tab");
    await page.keyboard.press("End");
    await expect(focusedEntry(page)).toHaveAttribute("data-action", "delete-from-model");
    await page.keyboard.press("Escape");
    await expect(page.locator(".djs-container > svg")).toBeFocused();
    const selected = await page.evaluate(() =>
      window
        .app!.modeler.diagram.get<{ get(): Array<{ id: string }> }>("selection")
        .get()
        .map((element) => element.id),
    );
    expect(selected).toEqual(["payments"]);
  });
});
