import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Two steps of a checkout with the aggregate repeated at each and spelled two ways, a command that
 * reaches no aggregate, and a second aggregate far to the right: the board both hosts open for
 * "Aggregates…" (issue #116).
 */
export const AGGREGATES_BOARD = [
  "title Aggregates",
  "command Place Order [150, 220] (id cmd_place)",
  "aggregate Order [350, 220] (id agg_order_1)",
  "event Order Placed [550, 220] (id evt_placed)",
  "command Ship Order [750, 220] (id cmd_ship)",
  "aggregate Orders [950, 220] (id agg_order_2)",
  "event Order Shipped [1150, 220] (id evt_shipped)",
  "command Refund [150, 480] (id cmd_refund)",
  "aggregate Payment [3400, 900] (id agg_payment)",
  "event Payment Received [3600, 900] (id evt_paid)",
  "",
  "#cmd_place -> #agg_order_1",
  "#agg_order_1 -> #evt_placed",
  "#cmd_ship -> #agg_order_2",
  "#agg_order_2 -> #evt_shipped",
  "#agg_payment -> #evt_paid",
].join("\n");

/** A board with commands and events but no aggregate: the menu has no "Aggregates…". */
export const PLAIN_BOARD = [
  "title Plain",
  "command Place Order [150, 220] (id cmd_place)",
  "event Order Placed [350, 220] (id evt_placed)",
  "",
  "#cmd_place -> #evt_placed",
].join("\n");

/** The table's rows as text: per line the cells, the aggregate's only in its first line. */
export const AGGREGATES_TABLE = [
  ["Place Order", "Order", "Order Placed"],
  ["Ship Order", "Order Shipped"],
  ["", "Payment", "Payment Received"],
];

export function aggregatesEntryInMenu(page: Page): Locator {
  return page.locator('.cd-shell-menu[role="menu"] [data-menu-id="aggregates"]');
}

export function aggregatesDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Aggregates" });
}

export function aggregatesName(page: Page, name: string): Locator {
  return aggregatesDialog(page).getByRole("button", { name, exact: true });
}

/** The ids of the menu's entries in order, a separator as "|". */
export function menuLayout(dropdown: Locator): Promise<Array<string | null>> {
  return dropdown.evaluate((menu) =>
    [...menu.children].map((child) =>
      child.getAttribute("role") === "separator" ? "|" : child.getAttribute("data-menu-id"),
    ),
  );
}

/** The body rows of the dialog's table, each as the text of its cells. */
export function tableRows(page: Page): Promise<string[][]> {
  return aggregatesDialog(page)
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => [...(row as HTMLTableRowElement).cells].map((cell) => cell.textContent)),
    );
}

export function selectedIds(page: Page): Promise<string[]> {
  return page
    .locator(".cd-shell-canvas .djs-shape.selected")
    .evaluateAll((shapes) => shapes.map((shape) => shape.getAttribute("data-element-id") ?? ""));
}

export function canvasSvg(page: Page): Locator {
  return page.locator(".cd-shell-canvas svg[tabindex]");
}

/** Whether the sticky lies inside the canvas slot, wholly. */
export async function stickyInView(page: Page, id: string): Promise<boolean> {
  const sticky = await page
    .locator(`.cd-shell-canvas .djs-shape[data-element-id="${id}"] .djs-hit`)
    .boundingBox();
  const slot = await page.locator(".cd-shell-canvas").boundingBox();
  if (!sticky || !slot) return false;
  return (
    sticky.x >= slot.x &&
    sticky.y >= slot.y &&
    sticky.x + sticky.width <= slot.x + slot.width &&
    sticky.y + sticky.height <= slot.y + slot.height
  );
}

/** Moves the view far away from every sticky, so a reveal has to bring them back. */
export async function lookElsewhere(page: Page, diagram: "webapp" | "webview"): Promise<void> {
  await page.evaluate((where) => {
    interface Viewbox {
      viewbox(box?: { x: number; y: number; width: number; height: number }): {
        outer: { width: number; height: number };
      };
      zoom(scale?: number): number;
    }
    interface Injector {
      get(name: "canvas"): Viewbox;
    }
    const host = window as unknown as {
      __eventStormingViewer?: Injector;
      modeler?: { diagram: Injector };
    };
    const injector = where === "webapp" ? host.__eventStormingViewer : host.modeler?.diagram;
    if (!injector) throw new Error("no diagram on the page");
    const canvas = injector.get("canvas");
    canvas.zoom(1);
    const { outer } = canvas.viewbox();
    canvas.viewbox({ x: -6000, y: -6000, width: outer.width, height: outer.height });
  }, diagram);
  await expect(page.locator(".cd-shell-canvas .djs-shape .djs-hit").first()).toBeAttached();
}

/** The focus ring of the focused element: width, offset and colour. */
export function focusRing(page: Page): Promise<{ width: string; offset: string; color: string }> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    if (!focused) throw new Error("nothing has the focus");
    const style = getComputedStyle(focused);
    return { width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor };
  });
}
