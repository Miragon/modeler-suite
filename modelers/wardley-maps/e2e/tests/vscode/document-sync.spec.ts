import { expect, test, type Page } from "@playwright/test";
import { EMPTY_MAP, EXAMPLE_MAP, withExampleInserted } from "../../../apps/vscode/src/examples.js";
import { openWebview } from "./support/webview.js";

/**
 * The webview and the extension's document plumbing (`registerModelerEditor` of the shell, with the
 * map editor's options) together, against the shell's stand-in for VS Code's documents: what the
 * canvas does reaches the document as a minimal edit, and what happens to the document reaches the
 * canvas. A real VS Code runs the same in CI's smoke test.
 */

function documentText(page: Page): Promise<string> {
  return page.evaluate(() => window.vscodeHost!.document.getText());
}

function canvasText(page: Page): Promise<string> {
  return page.evaluate(() => window.modeler!.exportText());
}

function postedTypes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.vscodeHost!.panel.posted.map((message) => (message as { type: string }).type),
  );
}

test.describe("VS Code webview: the document both ways", () => {
  test("a move on the canvas rewrites only its component's line, whose echo is not imported", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    const kettle = page.locator('.cd-shell-canvas [data-element-id="cmp_kettle"] .djs-hit').first();
    const box = (await kettle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE_MAP);
    const before = EXAMPLE_MAP.split("\n");
    const after = (await documentText(page)).split("\n");
    expect(after).toHaveLength(before.length);
    const changed = after.filter((line, index) => line !== before[index]);
    expect(changed).toEqual([expect.stringMatching(/^component Kettle \[0\.43, 0\.\d+\]$/)]);
    expect(await page.evaluate(() => window.vscodeHost!.host.appliedEdits.length)).toBe(1);
    expect(await postedTypes(page)).not.toContain("update");
  });

  test("a change in the text editor reaches the canvas", async ({ page }) => {
    await openWebview(page, { host: true });
    await page.evaluate((text) => {
      const { host, document } = window.vscodeHost!;
      host.replaceText(document, text);
    }, `${EXAMPLE_MAP}component Milk [0.7, 0.5]\nCup of Tea -> Milk\n`);

    await expect(page.locator('.cd-shell-canvas [data-element-id="cmp_milk"]')).toBeVisible();
    expect(await page.evaluate(() => window.vscodeHost!.host.appliedEdits.length)).toBe(0);
  });

  test("undo and redo in VS Code take the canvas back and forth, one canvas change per step", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    const dropdown = page.locator('.cd-shell-menu[role="menu"]');
    for (const size of ["large", "wide"]) {
      await page.locator('[data-chrome="menu"]').click();
      await dropdown.locator('[data-menu-id="map-size"]').click();
      const popover = page.locator('.cd-shell .wardley-map-size[role="dialog"]');
      await popover.locator("select").selectOption(size);
      await popover.getByRole("button", { name: "Done" }).click();
      await expect(popover).toBeHidden();
    }
    await expect.poll(() => documentText(page)).toMatch(/^size \[1760, 720\]$/m);

    const undo = () =>
      page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
    const redo = () =>
      page.evaluate(() => window.vscodeHost!.host.redo(window.vscodeHost!.document));
    expect(await undo()).toBe(true);
    await expect.poll(() => canvasText(page)).toMatch(/^size \[1440, 900\]$/m);
    expect(await undo()).toBe(true);
    await expect.poll(() => canvasText(page)).not.toMatch(/^size /m);
    expect(await documentText(page)).toBe(EXAMPLE_MAP);
    expect(await redo()).toBe(true);
    await expect.poll(() => canvasText(page)).toMatch(/^size \[1440, 900\]$/m);
  });

  test("Insert example is one edit the canvas imports and fits, and one undo step", async ({
    page,
  }) => {
    await openWebview(page, { host: true, map: "empty" });
    const hint = page.locator(".cd-shell-hint");
    await hint.locator(".cd-shell-hint-action").click();

    await expect(page.locator('.cd-shell-canvas [data-element-id="cmp_kettle"]')).toBeVisible();
    await expect(hint).toBeHidden();
    expect(await documentText(page)).toBe(withExampleInserted(EMPTY_MAP));
    expect(await page.evaluate(() => window.vscodeHost!.host.appliedEdits.length)).toBe(1);

    await page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
    await expect(hint).toBeVisible();
    expect(await documentText(page)).toBe(EMPTY_MAP);
  });
});
