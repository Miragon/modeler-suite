import { expect, test, type Page } from "@playwright/test";
import { openWorkspace } from "./support/webapp.js";

/**
 * The chip on Help › "Keyboard shortcuts…" names a key, so the key works: "?" opens the dialog in
 * the web app, except in a text field and on the start screen, where there is nothing to show. For
 * assistive technology the entry names the keys that type "?" on US and German keyboards (guide
 * §5.6).
 */
const shortcutsDialog = (page: Page) => page.getByRole("dialog", { name: "Keyboard shortcuts" });

test.describe("web app: the keyboard shortcuts key", () => {
  test('the Help entry shows "?" and "?" opens the dialog from the canvas', async ({ page }) => {
    await openWorkspace(page);
    await page.getByRole("button", { name: "Menu" }).click();
    const entry = page.getByRole("menuitem", { name: "Keyboard shortcuts…", exact: true });
    await expect(entry).toHaveAttribute("aria-keyshortcuts", "Shift+/ Shift+ß");
    await expect(entry).toContainText("?");
    await page.keyboard.press("Escape");

    const canvas = page.locator(".djs-container > svg");
    await canvas.focus();
    await page.keyboard.press("?");
    await expect(shortcutsDialog(page)).toBeVisible();
    await expect(shortcutsDialog(page).getByRole("row", { name: "Keyboard shortcuts" })).toHaveText(
      "Keyboard shortcuts?",
    );
    await page.keyboard.press("Escape");
    await expect(shortcutsDialog(page)).toBeHidden();
    await expect(canvas).toBeFocused();
  });

  test('"?" stays a character in the label editor', async ({ page }) => {
    await openWorkspace(page);
    await page.locator(".djs-shape[data-element-id]").first().dblclick();
    const editor = page.locator("textarea.diagram-label-editor");
    await editor.press("End");
    await editor.press("?");
    await expect(editor).toHaveValue(/\?$/);
    await expect(shortcutsDialog(page)).toBeHidden();
  });

  test('"?" opens nothing on the start screen', async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.app?.shell.isEmptyStateShown() === true);
    await page.keyboard.press("?");
    await expect(shortcutsDialog(page)).toBeHidden();
  });
});
