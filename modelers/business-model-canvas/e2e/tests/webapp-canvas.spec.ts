import { expect, test, type Page } from "@playwright/test";
import { parse } from "yaml";
import {
  exportText,
  openApp,
  openExample,
  openMenu,
  readDownload,
  startScreen,
  waitForApp,
} from "./support/webapp.js";
import { openNotesPanel } from "./support/notes-panel.js";

/**
 * What the web app adds around the canvas: dragging a sticky between blocks, the legend, the title
 * dialog, notes kept over a reload, the .bmc download and the attribution under the canvas, not in
 * the legal line.
 */

function sticky(page: Page, id: string) {
  return page.locator(`.djs-shape[data-element-id="${id}"]`);
}

async function drag(page: Page, from: string, onto: string): Promise<void> {
  const source = (await sticky(page, from).boundingBox())!;
  const target = (await sticky(page, onto).boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 6, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await openExample(page);
});

test("a sticky dragged onto another one in another block goes before it, as one undo step", async ({
  page,
}) => {
  const before = await exportText(page);
  await drag(page, "workshops", "bpmn-io");

  await expect
    .poll(async () =>
      parse(await exportText(page))["key-partners"].items.map((item: { id: string }) => item.id),
    )
    .toEqual(["workshops", "bpmn-io", "orca-team"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => exportText(page)).toBe(before);
});

test("the drag shows where the sticky lands, and the drop takes the insertion line away", async ({
  page,
}) => {
  const source = (await sticky(page, "engineering").boundingBox())!;
  const target = (await sticky(page, "orca-team").boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 6, target.y + target.height / 2, { steps: 12 });
  await expect(page.locator(".layer-bmc-drop-feedback line")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator(".layer-bmc-drop-feedback > *")).toHaveCount(0);
});

test("the legend explains the folded corner of a sticky with notes", async ({ page }) => {
  const menu = await openMenu(page);
  await menu.locator('[data-menu-id="legend"]').click();
  const rows = page.locator('[data-chrome="legend"] .cd-shell-legend-row');
  await expect(rows).toHaveText(["Has notes"]);
});

test("Canvas title changes the title, which the tab and the download take", async ({ page }) => {
  const menu = await openMenu(page);
  await menu.locator('[data-menu-id="canvas-title"]').click();
  const dialog = page.getByRole("dialog", { name: "Canvas title" });
  await dialog.getByLabel("Title").fill("Shop");
  await dialog.getByRole("button", { name: "Apply" }).click();

  await expect(page).toHaveTitle("Shop · Business Model Canvas Modeler");
  const download = page.waitForEvent("download");
  await page.keyboard.press("ControlOrMeta+s");
  expect((await download).suggestedFilename()).toBe("shop.bmc");
  expect(await readDownload(download)).toBe(await exportText(page));
});

test("a new canvas with only a title is kept over a reload", async ({ page }) => {
  await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
  await expect(page.locator(".djs-shape[data-element-id]")).toHaveCount(0);
  await (await openMenu(page)).locator('[data-menu-id="canvas-title"]').click();
  const dialog = page.getByRole("dialog", { name: "Canvas title" });
  await dialog.getByLabel("Title").fill("Acme");
  await dialog.getByRole("button", { name: "Apply" }).click();

  await page.reload();
  await waitForApp(page);
  await expect(startScreen(page)).toBeHidden();
  expect(parse(await exportText(page)).canvas.title).toBe("Acme");
});

test("a new canvas with only a note on the whole canvas is kept over a reload", async ({
  page,
}) => {
  await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
  await expect(page.locator(".djs-shape[data-element-id]")).toHaveCount(0);
  await openNotesPanel(page);
  await page.getByRole("button", { name: "Add note" }).click();
  await page.keyboard.type("Who pays for the hosting?");
  await page.locator(".djs-container").click({ position: { x: 5, y: 5 } });

  await page.reload();
  await waitForApp(page);
  await expect(startScreen(page)).toBeHidden();
  expect(parse(await exportText(page)).canvas.notes).toEqual([
    { text: "Who pays for the hosting?" },
  ]);
});

test("the canvas's licence shows once, under the canvas", async ({ page }) => {
  await expect(page.locator('[data-chrome="legal"]')).not.toContainText("Strategyzer");
  await expect(page.locator(".layer-bmc-frame text", { hasText: "strategyzer.com" })).toHaveCount(
    1,
  );
});

test("a note on a block and on the whole canvas starts from their comment and lands in the file", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add a note to Channels" }).click();
  const panel = page.locator('[data-chrome="inspector"]');
  await expect(panel).toBeVisible();
  await page.keyboard.type("Partner listing in the Orca catalog?");
  await page.mouse.click(10, 500);
  await expect
    .poll(async () => parse(await exportText(page)).channels.notes)
    .toEqual([{ text: "Partner listing in the Orca catalog?" }]);
  await expect(page.getByRole("button", { name: "Notes on Channels, 1" })).toBeVisible();

  await page.getByRole("button", { name: "Add a note to the whole canvas" }).click();
  await page.keyboard.type("Pricing still open");
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => parse(await exportText(page)).canvas.notes)
    .toEqual([{ text: "Pricing still open" }]);
  await expect(panel.locator(".bmc-panel-note textarea").first()).toHaveValue("Pricing still open");
  await page.keyboard.press("Escape");
  await page.keyboard.press("n");
  await expect(panel).toBeHidden();
});
