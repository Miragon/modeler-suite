import { expect, test, type Locator, type Page } from "@playwright/test";
import { EMPTY_BOARD, withExampleInserted } from "../../../apps/vscode/src/examples.js";
import { openWebview } from "./support/webview.js";

/**
 * The webview and the extension's document plumbing (`registerModelerEditor` of the shell, with the
 * board editor's options) together, against the shell's stand-in for VS Code's documents: what the
 * canvas does reaches the document as a minimal edit, and what happens to the document reaches the
 * canvas. A real VS Code runs the same in CI's smoke test.
 */

/** A board written as the canvas writes it, so a change on the canvas rewrites its own lines only. */
const BOARD = [
  "title Checkout",
  "command Place Order [240, 300]",
  "event Order Placed [620, 300]",
  "event Order Shipped [900, 300]",
  "Place Order -> Order Placed",
  "",
].join("\n");

function documentText(page: Page): Promise<string> {
  return page.evaluate(() => window.vscodeHost!.document.getText());
}

function canvasText(page: Page): Promise<string> {
  return page.evaluate(() => window.modeler!.exportText());
}

function appliedEdits(page: Page): Promise<number> {
  return page.evaluate(() => window.vscodeHost!.host.appliedEdits.length);
}

function postedTypes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.vscodeHost!.panel.posted.map((message) => (message as { type: string }).type),
  );
}

function sticky(page: Page, id: string): Locator {
  return page.locator(`.cd-shell-canvas .djs-shape[data-element-id="${id}"]`);
}

async function openMenu(page: Page): Promise<Locator> {
  await page.locator('[data-chrome="menu"]').click();
  const dropdown = page.locator('.cd-shell-menu[role="menu"]');
  await expect(dropdown).toBeVisible();
  return dropdown;
}

test.describe("VS Code webview: the document both ways", () => {
  test("a move on the canvas rewrites only its sticky's line, and neither its echo nor a save comes back", async ({
    page,
  }) => {
    await openWebview(page, { host: true, text: BOARD });
    expect(await canvasText(page)).toBe(BOARD);
    const box = (await sticky(page, "event_order_placed").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => documentText(page)).not.toBe(BOARD);
    const before = BOARD.split("\n");
    const after = (await documentText(page)).split("\n");
    expect(after).toHaveLength(before.length);
    expect(after.filter((line, index) => line !== before[index])).toEqual([
      expect.stringMatching(/^event Order Placed \[-?[\d.]+, -?[\d.]+\]$/),
    ]);
    expect(await appliedEdits(page)).toBe(1);

    await page.evaluate(() => window.vscodeHost!.host.save(window.vscodeHost!.document));
    expect(await postedTypes(page)).not.toContain("update");
  });

  test("a change in the text editor reaches the canvas, which writes nothing back", async ({
    page,
  }) => {
    await openWebview(page, { host: true, text: BOARD });
    await page.evaluate((text) => {
      const { host, document } = window.vscodeHost!;
      host.replaceText(document, text);
    }, `${BOARD}event Order Cancelled [1100, 300]\n`);

    await expect(sticky(page, "event_order_cancelled")).toBeVisible();
    expect(await appliedEdits(page)).toBe(0);
  });

  test("undo and redo in VS Code take the canvas back and forth, one canvas change per step", async ({
    page,
  }) => {
    await openWebview(page, { host: true, text: BOARD });
    const dropdown = await openMenu(page);
    for (const level of ["process", "design"]) {
      await dropdown.locator(`[data-menu-value="${level}"]`).click();
      await expect.poll(() => documentText(page)).toMatch(new RegExp(`^level ${level}$`, "m"));
    }
    expect(await appliedEdits(page)).toBe(2);

    const undo = () =>
      page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
    const redo = () =>
      page.evaluate(() => window.vscodeHost!.host.redo(window.vscodeHost!.document));
    expect(await undo()).toBe(true);
    await expect.poll(() => canvasText(page)).toMatch(/^level process$/m);
    expect(await undo()).toBe(true);
    await expect.poll(() => canvasText(page)).toBe(BOARD);
    expect(await documentText(page)).toBe(BOARD);
    expect(await redo()).toBe(true);
    await expect.poll(() => canvasText(page)).toMatch(/^level process$/m);
    expect(await appliedEdits(page)).toBe(2);
  });

  test("Insert example is one edit the canvas imports and fits, and one undo step", async ({
    page,
  }) => {
    await openWebview(page, { host: true, board: "empty" });
    const hint = page.locator(".cd-shell-hint");
    await hint.locator(".cd-shell-hint-action").click();

    await expect(sticky(page, "event_order_placed")).toBeVisible();
    await expect(hint).toBeHidden();
    expect(await documentText(page)).toBe(withExampleInserted(EMPTY_BOARD));
    expect(await appliedEdits(page)).toBe(1);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.connection!.viewport.isAutomatic() && window.connection!.viewport.canFit(),
        ),
      )
      .toBe(true);

    await page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
    await expect(hint).toBeVisible();
    expect(await documentText(page)).toBe(EMPTY_BOARD);
  });

  test("an edit VS Code refuses, as for a read-only file, takes the canvas back to the document", async ({
    page,
  }) => {
    await openWebview(page, { host: true, text: BOARD });
    await page.evaluate(() => {
      window.vscodeHost!.document.readOnly = true;
    });
    const dropdown = await openMenu(page);
    await dropdown.locator('[data-menu-value="process"]').click();

    await expect.poll(() => postedTypes(page)).toContain("update");
    await expect.poll(() => canvasText(page)).toBe(BOARD);
    expect(await documentText(page)).toBe(BOARD);
    expect(await appliedEdits(page)).toBe(0);
  });
});
