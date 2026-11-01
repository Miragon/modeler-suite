import { expect, test } from "@playwright/test";
import { vsCodeStubSearch } from "@miragon/modeler-shell/testing";

/**
 * The webview keeps from VS Code only the keys guide §13.5 lists, so "?" is no key here: the Help
 * entry shows no chip, and "?" from the canvas or the chrome reaches VS Code's listener on
 * `window` and opens nothing. The dialog opens from the menu.
 */
test('VS Code webview: "?" goes on to VS Code, the dialog opens from the menu', async ({
  page,
}) => {
  await page.goto(`/webview-test.html?${vsCodeStubSearch({ theme: "light" })}`);
  await page.waitForFunction(() => window.webviewReady === true);
  await page.evaluate(() => {
    const keys: string[] = [];
    Object.assign(window, { keysAtWindow: keys });
    window.addEventListener("keydown", (event) => keys.push(event.key));
  });
  const keysAtWindow = () =>
    page.evaluate(() => (window as unknown as { keysAtWindow: string[] }).keysAtWindow.splice(0));
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });

  for (const control of [
    page.locator(".djs-container > svg"),
    page.getByRole("button", { name: "Zoom in" }),
    page.getByRole("button", { name: "Menu" }),
  ]) {
    await control.focus();
    await page.keyboard.press("?");
    await expect(dialog).toBeHidden();
    expect(await keysAtWindow()).toContain("?");
  }

  await page.getByRole("button", { name: "Menu" }).click();
  const entry = page.getByRole("menuitem", { name: "Keyboard shortcuts…", exact: true });
  await expect(entry).not.toHaveAttribute("aria-keyshortcuts");
  await expect(entry).not.toContainText("?");
  await entry.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Help" })).toHaveCount(0);
});
