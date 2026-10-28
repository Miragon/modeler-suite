import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Three aggregates that spell one name three ways, and events to suggest from: the board both
 * hosts open for the label suggestions and the spelling variants (issue #115).
 */
export const VOCABULARY_BOARD = [
  "title Vocabulary",
  "command Place Order [200, 220] (id cmd_place_order)",
  "aggregate Order [460, 220] (id agg_order)",
  "aggregate order [720, 220] (id agg_order_lower)",
  "aggregate Orders [980, 220] (id agg_orders)",
  "event Order Placed [460, 480] (id event_order_placed)",
  "event Order Shipped [720, 480] (id event_order_shipped)",
  "event Payment Received [980, 480] (id event_payment_received)",
].join("\n");

export const VARIANT_IDS = ["agg_order", "agg_order_lower", "agg_orders"];

export function labelField(page: Page): Locator {
  return page.locator("textarea.event-storming-label-textarea");
}

export function suggestionList(page: Page): Locator {
  return page.getByRole("listbox", { name: "Label suggestions" });
}

export function suggestions(page: Page): Locator {
  return suggestionList(page).getByRole("option");
}

export function variantDots(page: Page): Locator {
  return page.locator(".djs-container .event-storming-spelling-variant");
}

export function variantDot(page: Page, id: string): Locator {
  return page.locator(`.djs-container .event-storming-spelling-variant[data-element-id="${id}"]`);
}

async function hitCenter(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(`.djs-container [data-element-id="${id}"] .djs-hit`).boundingBox();
  if (!box) throw new Error(`no sticky "${id}" on the canvas`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Double-clicks the sticky and types `text` over its selected label, without saving. */
export async function typeLabel(page: Page, id: string, text: string): Promise<Locator> {
  const { x, y } = await hitCenter(page, id);
  await page.mouse.dblclick(x, y);
  const field = labelField(page);
  await expect(field).toBeFocused();
  await page.keyboard.type(text);
  await expect(field).toHaveValue(text);
  return field;
}

/**
 * Scrolls the view with the wheel over the empty canvas between the two rows of stickies:
 * diagram-js takes the wheel only while the pointer is over the canvas itself.
 */
export async function panCanvas(page: Page): Promise<void> {
  const above = await hitCenter(page, "agg_order_lower");
  const below = await hitCenter(page, "event_order_shipped");
  await page.mouse.move(above.x, (above.y + below.y) / 2);
  await page.mouse.wheel(0, 120);
}

export async function clickSticky(page: Page, id: string): Promise<void> {
  const { x, y } = await hitCenter(page, id);
  await page.mouse.click(x, y);
}

/** The option the field names as active, `null` while none is. */
export async function activeSuggestion(page: Page): Promise<string | null> {
  const id = await labelField(page).getAttribute("aria-activedescendant");
  if (!id) return null;
  const option = page.locator(`[id="${id}"]`);
  await expect(option).toHaveAttribute("aria-selected", "true");
  return option.textContent();
}

/** Where the list sits: its stacking order and whether it lies in the canvas, under the field. */
export function suggestionListLayer(page: Page): Promise<{
  zIndex: string;
  inCanvas: boolean;
  belowField: boolean;
}> {
  return suggestionList(page).evaluate((list) => {
    const field = document.querySelector("textarea.event-storming-label-textarea");
    return {
      zIndex: getComputedStyle(list).zIndex,
      inCanvas: list.closest(".djs-container") !== null,
      belowField:
        !!field && list.getBoundingClientRect().top >= field.getBoundingClientRect().bottom,
    };
  });
}
