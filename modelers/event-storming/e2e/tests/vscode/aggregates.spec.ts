import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  AGGREGATES_BOARD,
  AGGREGATES_TABLE,
  PLAIN_BOARD,
  aggregatesDialog,
  aggregatesEntryInMenu,
  aggregatesName,
  canvasSvg,
  focusRing,
  lookElsewhere,
  selectedIds,
  stickyInView,
  tableRows,
} from "../support/aggregates.js";
import { closeDialog } from "../support/viewer.js";
import {
  openWebview,
  postFromHost,
  postedMessages,
  type PostedMessage,
} from "./support/webview.js";

/**
 * Issue #116 in the VS Code webview, as in the web app (webapp-aggregates.spec.ts), with the
 * document's side of it: a name selects without posting an edit, the entry stays usable on the
 * read-only canvas of an invalid file, and an update from the host redraws the open dialog.
 */

async function openMenu(page: Page): Promise<Locator> {
  await page.locator('[data-chrome="menu"]').click();
  const dropdown = page.locator('.cd-shell-menu[role="menu"]');
  await expect(dropdown).toBeVisible();
  return dropdown;
}

async function openAggregates(page: Page): Promise<void> {
  await openMenu(page);
  await aggregatesEntryInMenu(page).click();
  await expect(aggregatesDialog(page)).toBeVisible();
}

async function edits(page: Page): Promise<PostedMessage[]> {
  return (await postedMessages(page)).filter((message) => message.type === "edit");
}

/** The next import fails, as an invalid file's does: the canvas keeps its board and locks. */
async function failNextImport(page: Page): Promise<void> {
  await page.evaluate(() => {
    const modeler = window.modeler!;
    const importText = modeler.importText.bind(modeler);
    modeler.importText = () => {
      modeler.importText = importText;
      return Promise.reject(new Error("not importable"));
    };
  });
  await postFromHost(page, { type: "update", text: "title Broken\n" });
  await expect(page.locator('[data-chrome="status"]')).toBeVisible();
}

test.describe("VS Code webview: commands and events grouped by aggregate", () => {
  test('"Aggregates…" is in the Model group only while the document has an aggregate', async ({
    page,
  }) => {
    await openWebview(page, { text: PLAIN_BOARD });
    await openMenu(page);
    await expect(
      page.locator('.cd-shell-menu[role="menu"] [data-menu-id="type-captions"]'),
    ).toBeVisible();
    await expect(aggregatesEntryInMenu(page)).toHaveCount(0);
    await page.keyboard.press("Escape");

    await postFromHost(page, { type: "update", text: AGGREGATES_BOARD });
    await expect(page.locator('[data-element-id="agg_payment"]')).toBeAttached();
    await openMenu(page);
    await expect(aggregatesEntryInMenu(page)).toHaveText("Aggregates…");
    await expect(aggregatesEntryInMenu(page)).toHaveAttribute("aria-haspopup", "dialog");
    expect(await edits(page)).toEqual([]);
  });

  test("a click on a name closes the dialog and selects and reveals its stickies, without an edit", async ({
    page,
  }) => {
    await openWebview(page, { text: AGGREGATES_BOARD });
    await openAggregates(page);
    await expect(aggregatesDialog(page)).toHaveClass(/cd-shell-dialog/);
    await expect(aggregatesDialog(page).getByRole("button", { name: "Close" })).toBeFocused();
    expect(await tableRows(page)).toEqual(AGGREGATES_TABLE);
    await closeDialog(aggregatesDialog(page), () => page.keyboard.press("Escape"));
    await expect(page.locator('[data-chrome="menu"]')).toBeFocused();

    await lookElsewhere(page, "webview");
    await openAggregates(page);
    await aggregatesName(page, "Ship Order").click();

    await expect(aggregatesDialog(page)).toHaveCount(0);
    await expect.poll(() => selectedIds(page)).toEqual(["cmd_ship"]);
    expect(await stickyInView(page, "cmd_ship")).toBe(true);
    await expect(canvasSvg(page)).toBeFocused();
    expect(await edits(page)).toEqual([]);
  });

  test("a double click on a name keeps the selection it made, without an edit", async ({
    page,
  }) => {
    await openWebview(page, { text: AGGREGATES_BOARD });
    await openAggregates(page);

    await aggregatesName(page, "Order").dblclick();

    await expect(aggregatesDialog(page)).toHaveCount(0);
    await expect.poll(() => selectedIds(page)).toEqual(["agg_order_1", "agg_order_2"]);
    await expect(page.locator(".event-storming-label-input")).toHaveCount(0);
    expect(await edits(page)).toEqual([]);
  });

  test("Enter on a name selects it and hands the focus to the canvas", async ({ page }) => {
    await openWebview(page, { text: AGGREGATES_BOARD });
    await openAggregates(page);
    await page.keyboard.press("Tab");
    await expect(aggregatesName(page, "Place Order")).toBeFocused();
    expect(await focusRing(page)).toMatchObject({ width: "2px", offset: "-2px" });

    await page.keyboard.press("Enter");

    await expect(aggregatesDialog(page)).toHaveCount(0);
    await expect.poll(() => selectedIds(page)).toEqual(["cmd_place"]);
    await expect(canvasSvg(page)).toBeFocused();
    expect(await edits(page)).toEqual([]);
  });

  test("stays usable on the read-only canvas of an invalid file", async ({ page }) => {
    await openWebview(page, { text: AGGREGATES_BOARD });
    await failNextImport(page);

    await openMenu(page);
    await expect(aggregatesEntryInMenu(page)).not.toHaveAttribute("aria-disabled", "true");
    await expect(
      page
        .locator('.cd-shell-menu[role="menu"] [data-menu-id="level"] [role="menuitemradio"]')
        .first(),
    ).toHaveAttribute("aria-disabled", "true");
    await aggregatesEntryInMenu(page).click();
    await aggregatesName(page, "Order").click();

    await expect.poll(() => selectedIds(page)).toEqual(["agg_order_1", "agg_order_2"]);
    expect(await edits(page)).toEqual([]);
  });

  test("an update from the host redraws the open dialog", async ({ page }) => {
    await openWebview(page, { text: AGGREGATES_BOARD });
    await openAggregates(page);

    await postFromHost(page, {
      type: "update",
      text: AGGREGATES_BOARD.replace("aggregate Payment ", "aggregate Invoice "),
    });

    await expect(aggregatesDialog(page).getByRole("rowheader")).toHaveText(["Order", "Invoice"]);
    await expect(aggregatesDialog(page)).toBeVisible();
  });

  test("an update that takes the last aggregate keeps the focus in the open dialog", async ({
    page,
  }) => {
    await openWebview(page, { text: AGGREGATES_BOARD });
    await openAggregates(page);
    await page.keyboard.press("Tab");
    await expect(aggregatesName(page, "Place Order")).toBeFocused();

    await postFromHost(page, { type: "update", text: PLAIN_BOARD });

    const empty = aggregatesDialog(page).getByText("The board has no aggregates.");
    await expect(empty).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(aggregatesDialog(page).getByRole("button", { name: "Close" })).toBeFocused();
  });
});
