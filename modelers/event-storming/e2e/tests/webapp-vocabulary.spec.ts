import { expect, test, type Page } from "@playwright/test";
import { encodeMapCompressed } from "../../apps/webapp/src/share.js";
import { exportBoard, exportDSL, waitForViewer } from "./support/viewer.js";
import {
  VARIANT_IDS,
  VOCABULARY_BOARD,
  activeSuggestion,
  clickSticky,
  labelField,
  panCanvas,
  suggestionList,
  suggestionListLayer,
  suggestions,
  typeLabel,
  variantDot,
  variantDots,
} from "./support/vocabulary.js";

/**
 * Issue #115 in the web app: the label editor suggests the names the board already uses for the
 * sticky's kind, and a name the board spells several ways is marked on the canvas and unified in
 * one undo step. The same runs in the VS Code webview (vscode/vocabulary.spec.ts).
 */

async function openBoard(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/#mz=${await encodeMapCompressed(VOCABULARY_BOARD)}`);
  await waitForViewer(page);
  await expect(page.locator(".cd-shell-canvas .djs-shape").first()).toBeVisible();
}

async function labelOf(page: Page, id: string): Promise<string | undefined> {
  return (await exportBoard(page)).elements.find((element) => element.id === id)?.label;
}

test.describe("webapp: label suggestions and spelling variants", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
  });

  test("suggests the names of the sticky's kind; ↓ and ↑ move, Tab takes one and keeps the focus", async ({
    page,
  }) => {
    const field = await typeLabel(page, "event_payment_received", "Ord");
    await expect(suggestionList(page)).toBeVisible();
    await expect(suggestions(page)).toHaveText(["Order Placed", "Order Shipped"]);
    expect(await activeSuggestion(page)).toBeNull();

    await page.keyboard.press("ArrowDown");
    expect(await activeSuggestion(page)).toBe("Order Placed");
    await page.keyboard.press("ArrowDown");
    expect(await activeSuggestion(page)).toBe("Order Shipped");
    await page.keyboard.press("ArrowUp");
    expect(await activeSuggestion(page)).toBe("Order Placed");

    await page.keyboard.press("Tab");
    await expect(suggestionList(page)).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Order Placed");

    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(field).toBeHidden();
    expect(await labelOf(page, "event_payment_received")).toBe("Order Placed");
  });

  test("Enter takes the active option only, Escape closes the list and then the editor", async ({
    page,
  }) => {
    const field = await typeLabel(page, "event_payment_received", "Order S");
    await expect(suggestions(page)).toHaveText(["Order Shipped"]);

    await page.keyboard.press("Escape");
    await expect(suggestionList(page)).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Order S");

    await page.keyboard.type("h");
    await expect(suggestions(page)).toHaveText(["Order Shipped"]);
    await page.keyboard.press("Enter");
    await expect(field).toHaveValue("Order Sh\n");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(field).toHaveValue("Order Shipped");
    await expect(suggestionList(page)).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(field).toBeHidden();
    expect(await labelOf(page, "event_payment_received")).toBe("Payment Received");
  });

  test("a click on an option takes it without closing the editor", async ({ page }) => {
    const field = await typeLabel(page, "event_payment_received", "Ord");
    await suggestions(page).filter({ hasText: "Order Shipped" }).click();
    await expect(suggestionList(page)).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Order Shipped");
  });

  test("the list is a canvas popup under the field that a pan closes, leaving the editor open", async ({
    page,
  }) => {
    const field = await typeLabel(page, "event_payment_received", "Ord");
    expect(await suggestionListLayer(page)).toEqual({
      zIndex: "100",
      inCanvas: true,
      belowField: true,
    });
    await panCanvas(page);
    await expect(suggestionList(page)).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Ord");
  });

  test("no suggestions for a hotspot, which is free text", async ({ page }) => {
    await page.goto(
      `/#mz=${await encodeMapCompressed(
        `${VOCABULARY_BOARD}\nhotspot Order unclear [200, 480] (id hotspot_a)\nhotspot Why [460, 700] (id hotspot_b)`,
      )}`,
    );
    await waitForViewer(page);
    await typeLabel(page, "hotspot_b", "Ord");
    await page.waitForTimeout(100);
    await expect(suggestionList(page)).toHaveCount(0);
  });

  test("marks each spelling variant with a dot whose tooltip names the other spellings", async ({
    page,
  }) => {
    await expect(variantDots(page)).toHaveCount(3);
    for (const id of VARIANT_IDS) await expect(variantDot(page, id)).toBeVisible();
    await expect(page.locator('[data-chrome="problems"]')).toBeHidden();

    await variantDot(page, "agg_order").hover();
    const tooltip = page.locator(".event-storming-spelling-tooltip");
    await expect(tooltip).toHaveText(
      "Also spelled “order” and “Orders” on this board. Unify spelling from the context pad.",
    );
    await expect(tooltip).toHaveAttribute("role", "tooltip");
    await page.mouse.move(5, 450);
    await expect(tooltip).toBeHidden();

    await variantDot(page, "agg_orders").hover();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
  });

  test("Unify spelling writes the chosen spelling on every variant, one undo takes it back", async ({
    page,
  }) => {
    const before = await exportDSL(page);
    await clickSticky(page, "agg_order_lower");
    const entry = page.locator('.djs-context-pad [data-action="unify-spelling"]');
    await expect(entry).toHaveAttribute("title", "Unify spelling to “order”");
    await entry.click();

    for (const id of VARIANT_IDS) expect(await labelOf(page, id)).toBe("order");
    await expect(variantDots(page)).toHaveCount(0);
    await expect(entry).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(variantDots(page)).toHaveCount(3);
    expect(await exportDSL(page)).toBe(before);
    expect(await labelOf(page, "agg_orders")).toBe("Orders");
  });

  test("a click on a dot selects its sticky, whose context pad offers to unify", async ({
    page,
  }) => {
    await variantDot(page, "agg_orders").click();
    await expect(page.locator('.djs-context-pad [data-action="unify-spelling"]')).toBeVisible();
    await expect(labelField(page)).toHaveCount(0);
  });
});

const CROWDED_BOARD = [
  "title Crowded",
  ..."ABCDEFGH".split("").map((letter, index) => `event Order ${letter} [${index * 220}, 0]`),
  "event Payment Received [770, 300] (id event_payment_received)",
  "event Invoice Sent [770, 600]",
].join("\n");

test.describe("webapp: label suggestions in a low window", () => {
  test("the list stays in the free area beside the field and scrolls itself, never the board", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 520 });
    await page.goto(`/#mz=${await encodeMapCompressed(CROWDED_BOARD)}`);
    await waitForViewer(page);
    await typeLabel(page, "event_payment_received", "Ord");
    await expect(suggestions(page)).toHaveCount(8);

    const placement = () =>
      suggestionList(page).evaluate((list) => {
        const canvas = list.closest(".djs-container")!;
        const field = document.querySelector("textarea.event-storming-label-textarea")!;
        const [listBox, fieldBox, canvasBox] = [list, field, canvas].map((element) =>
          element.getBoundingClientRect(),
        );
        return {
          overField: listBox!.top < fieldBox!.bottom && listBox!.bottom > fieldBox!.top,
          fromTop: listBox!.top - canvasBox!.top,
          fromBottom: canvasBox!.bottom - listBox!.bottom,
          canvasScrolled: canvas.scrollTop + canvas.scrollLeft,
          listScrolls: list.scrollHeight > list.clientHeight,
        };
      });
    const opened = await placement();
    expect(opened.overField).toBe(false);
    expect(opened.fromTop).toBeGreaterThanOrEqual(64);
    expect(opened.fromBottom).toBeGreaterThanOrEqual(64);
    expect(opened.listScrolls).toBe(true);

    await page.keyboard.press("ArrowUp");
    expect(await activeSuggestion(page)).toBe("Order H");
    await expect(suggestions(page).filter({ hasText: "Order H" })).toBeInViewport();
    expect((await placement()).canvasScrolled).toBe(0);
  });
});
