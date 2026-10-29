import { expect, test, type Page } from "@playwright/test";
import { encodeMapCompressed } from "../../apps/webapp/src/share.js";
import {
  AGGREGATES_BOARD,
  AGGREGATES_TABLE,
  PLACEHOLDER_BOARD,
  PLAIN_BOARD,
  aggregatesDialog,
  aggregatesEntryInMenu,
  aggregatesName,
  canvasSvg,
  focusRing,
  lookElsewhere,
  menuLayout,
  selectedIds,
  stickyInView,
  tableRows,
} from "./support/aggregates.js";
import { closeDialog, exportDSL, openMenu, waitForViewer } from "./support/viewer.js";

/**
 * Issue #116 in the web app: "Aggregates…" in the Model group while the board has a named
 * aggregate (a placeholder such as "Aggregate 2" counts for nothing), the shell's dialog with one
 * row group per aggregate, and a name that selects and reveals its stickies without an undo step,
 * a change of the board or of the link. The same runs in the VS Code webview
 * (vscode/aggregates.spec.ts).
 */

async function link(board: string): Promise<string> {
  return `#mz=${await encodeMapCompressed(board)}`;
}

async function openBoard(page: Page, board: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${await link(board)}`);
  await waitForViewer(page);
  await expect(page.locator(".cd-shell-canvas .djs-shape").first()).toBeVisible();
}

async function openAggregates(page: Page): Promise<void> {
  await openMenu(page);
  await aggregatesEntryInMenu(page).click();
  await expect(aggregatesDialog(page)).toBeVisible();
}

function canUndo(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    (
      window.__eventStormingViewer as unknown as {
        get(name: "commandStack"): { canUndo(): boolean };
      }
    )
      .get("commandStack")
      .canUndo(),
  );
}

test.describe("webapp: commands and events grouped by aggregate", () => {
  test('"Aggregates…" ends the Model group only while the board has an aggregate', async ({
    page,
  }) => {
    await openBoard(page, PLAIN_BOARD);
    expect(await menuLayout(await openMenu(page))).toEqual([
      "new-diagram",
      "open",
      "show-example",
      "|",
      "level",
      "type-captions",
      "|",
      "export-png",
      "export-svg",
      "export-png-transparent",
      "export-json",
      "export-storm",
      "|",
      "keyboard-shortcuts",
    ]);
    await page.keyboard.press("Escape");

    await page.evaluate((hash) => (location.hash = hash), await link(AGGREGATES_BOARD));
    await expect(page.locator('[data-element-id="agg_payment"]')).toBeAttached();
    const dropdown = await openMenu(page);
    expect((await menuLayout(dropdown)).slice(4, 8)).toEqual([
      "level",
      "type-captions",
      "aggregates",
      "|",
    ]);
    const entry = aggregatesEntryInMenu(page);
    await expect(entry).toHaveText("Aggregates…");
    await expect(entry).toHaveAttribute("role", "menuitem");
    await expect(entry).toHaveAttribute("aria-haspopup", "dialog");
    await expect(entry.locator(".cd-shell-menu-item-icon svg")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The entry follows every command: gone with the last aggregate, back with the undo.
    await page.evaluate(() => {
      const viewer = window.__eventStormingViewer as unknown as {
        get(name: "modeling"): { removeElements(elements: unknown[]): void };
        get(name: "elementRegistry"): {
          filter(test: (element: { eventStormingType?: string }) => boolean): unknown[];
        };
      };
      const registry = viewer.get("elementRegistry");
      viewer
        .get("modeling")
        .removeElements(registry.filter((element) => element.eventStormingType === "aggregate"));
    });
    await openMenu(page);
    await expect(aggregatesEntryInMenu(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.evaluate(() =>
      (window.__eventStormingViewer as unknown as { get(name: "commandStack"): { undo(): void } })
        .get("commandStack")
        .undo(),
    );
    await openMenu(page);
    await expect(aggregatesEntryInMenu(page)).toBeVisible();
  });

  test('"Aggregates…" stays out while every aggregate carries a placeholder, until one is renamed', async ({
    page,
  }) => {
    await openBoard(page, PLACEHOLDER_BOARD);
    await openMenu(page);
    await expect(
      page.locator('.cd-shell-menu[role="menu"] [data-menu-id="type-captions"]'),
    ).toBeVisible();
    await expect(aggregatesEntryInMenu(page)).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      const viewer = window.__eventStormingViewer as unknown as {
        get(name: "eventStormingModeling"): { updateLabel(element: unknown, label: string): void };
        get(name: "elementRegistry"): { get(id: string): unknown };
      };
      viewer
        .get("eventStormingModeling")
        .updateLabel(viewer.get("elementRegistry").get("agg_new"), "Order");
    });
    await openMenu(page);
    await aggregatesEntryInMenu(page).click();
    expect(await tableRows(page)).toEqual([["Place Order", "Order", "Order Placed"]]);
  });

  test("the shell's dialog shows a row group per aggregate, its lines following the arrows", async ({
    page,
  }) => {
    await openBoard(page, AGGREGATES_BOARD);
    await openAggregates(page);

    const dialog = aggregatesDialog(page);
    await expect(dialog).toHaveClass(/cd-shell-dialog/);
    await expect(dialog).toHaveClass(/event-storming-aggregates/);
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    const table = dialog.getByRole("table", { name: "Commands and events by aggregate" });
    await expect(table.getByRole("columnheader")).toHaveText(["Commands", "Aggregate", "Events"]);
    expect(await tableRows(page)).toEqual(AGGREGATES_TABLE);
    await expect(dialog.getByRole("rowheader")).toHaveText(["Order", "Payment"]);
    // "Refund" reaches no aggregate, so no row names it.
    await expect(aggregatesName(page, "Refund")).toHaveCount(0);

    const font = await table.evaluate((element) => getComputedStyle(element).fontSize);
    expect(font).toBe("13px");
  });

  test("a click on a name closes the dialog, selects and reveals its stickies, and changes nothing else", async ({
    page,
  }) => {
    await openBoard(page, AGGREGATES_BOARD);
    const board = await exportDSL(page);
    const url = page.url();
    await lookElsewhere(page, "webapp");
    expect(await stickyInView(page, "agg_order_1")).toBe(false);

    await openAggregates(page);
    await aggregatesName(page, "Order").click();

    await expect(aggregatesDialog(page)).toHaveCount(0);
    await expect.poll(() => selectedIds(page)).toEqual(["agg_order_1", "agg_order_2"]);
    expect(await stickyInView(page, "agg_order_1")).toBe(true);
    expect(await stickyInView(page, "agg_order_2")).toBe(true);
    await expect(canvasSvg(page)).toBeFocused();
    expect(await canUndo(page)).toBe(false);
    expect(await exportDSL(page)).toBe(board);
    expect(page.url()).toBe(url);

    // The next name takes the selection over, also one far to the right of the first.
    await openAggregates(page);
    await aggregatesName(page, "Payment Received").click();
    await expect.poll(() => selectedIds(page)).toEqual(["evt_paid"]);
    expect(await stickyInView(page, "evt_paid")).toBe(true);
  });

  test("a double click on a name keeps the selection it made and opens no label editor", async ({
    page,
  }) => {
    await openBoard(page, AGGREGATES_BOARD);
    const board = await exportDSL(page);
    await openAggregates(page);

    await aggregatesName(page, "Order").dblclick();

    await expect(aggregatesDialog(page)).toHaveCount(0);
    await expect.poll(() => selectedIds(page)).toEqual(["agg_order_1", "agg_order_2"]);
    await expect(page.locator(".event-storming-label-input")).toHaveCount(0);
    expect(await canUndo(page)).toBe(false);
    expect(await exportDSL(page)).toBe(board);
  });

  test("by keyboard: the dialog opens on Close, Tab reaches the names, Escape returns to the menu, Enter selects", async ({
    page,
  }) => {
    await openBoard(page, AGGREGATES_BOARD);
    const trigger = page.locator('[data-chrome="menu"]');

    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("a");
    await expect(aggregatesEntryInMenu(page)).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = aggregatesDialog(page);
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(aggregatesName(page, "Place Order")).toBeFocused();
    expect(await focusRing(page)).toMatchObject({ width: "2px", offset: "-2px" });

    await closeDialog(dialog, () => page.keyboard.press("Escape"));
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await selectedIds(page)).toEqual([]);

    await page.keyboard.press("Enter");
    await page.keyboard.press("a");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(aggregatesName(page, "Order")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(aggregatesName(page, "Order Placed")).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(dialog).toHaveCount(0);
    await expect.poll(() => selectedIds(page)).toEqual(["evt_placed"]);
    await expect(canvasSvg(page)).toBeFocused();
  });

  test("high contrast widens the names' focus ring to 3px, forced colours draw it in Highlight", async ({
    page,
  }) => {
    await openBoard(page, AGGREGATES_BOARD);
    await page.evaluate(() => document.documentElement.setAttribute("data-cd-kontrast", "hoch"));
    await page.locator('[data-chrome="menu"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("a");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(aggregatesName(page, "Place Order")).toBeFocused();
    expect(await focusRing(page)).toMatchObject({ width: "3px", offset: "-3px" });

    await page.emulateMedia({ forcedColors: "active" });
    const highlight = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "Highlight";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect((await focusRing(page)).color).toBe(highlight);
  });
});
