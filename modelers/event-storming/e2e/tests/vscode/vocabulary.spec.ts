import { expect, test, type Page } from "@playwright/test";
import {
  VARIANT_IDS,
  VOCABULARY_BOARD,
  activeSuggestion,
  clickSticky,
  panCanvas,
  suggestionList,
  suggestionListLayer,
  suggestions,
  typeLabel,
  variantDot,
  variantDots,
} from "../support/vocabulary.js";
import {
  openWebview,
  postFromHost,
  postedMessages,
  type PostedMessage,
} from "./support/webview.js";

/**
 * Issue #115 in the VS Code webview: the label suggestions and the spelling variants as in the web
 * app (webapp-vocabulary.spec.ts), with the document's side of it: a suggestion lands in the file
 * as one edit, unifying a spelling is one edit (one step of VS Code's undo), and a variant reaches
 * neither the problems pill nor anything the webview posts besides that edit.
 */

async function edits(page: Page): Promise<PostedMessage[]> {
  return (await postedMessages(page)).filter((message) => message.type === "edit");
}

function count(text: unknown, line: string): number {
  return String(text)
    .split("\n")
    .filter((candidate) => candidate.startsWith(line)).length;
}

test.describe("VS Code webview: label suggestions and spelling variants", () => {
  test.beforeEach(async ({ page }) => {
    await openWebview(page, { text: VOCABULARY_BOARD });
  });

  test("suggests the names of the sticky's kind; Tab takes one without leaving the editor", async ({
    page,
  }) => {
    const field = await typeLabel(page, "event_payment_received", "Ord");
    await expect(suggestions(page)).toHaveText(["Order Placed", "Order Shipped"]);
    expect(await suggestionListLayer(page)).toEqual({
      zIndex: "100",
      inCanvas: true,
      belowField: true,
    });

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    expect(await activeSuggestion(page)).toBe("Order Shipped");
    await page.keyboard.press("Tab");
    await expect(suggestionList(page)).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Order Shipped");
    expect(await edits(page)).toEqual([]);

    await page.keyboard.press("ControlOrMeta+Enter");
    await expect.poll(async () => (await edits(page)).length).toBe(1);
    const [edit] = await edits(page);
    expect(count(edit!["text"], "event Order Shipped ")).toBe(2);
  });

  test("Escape and a pan close the list and leave the editor open with its text", async ({
    page,
  }) => {
    const field = await typeLabel(page, "event_payment_received", "Ord");
    await page.keyboard.press("Escape");
    await expect(suggestionList(page)).toBeHidden();
    await expect(field).toBeFocused();

    await page.keyboard.type("e");
    await expect(suggestionList(page)).toBeVisible();
    await panCanvas(page);
    await expect(suggestionList(page)).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Orde");
    expect(await edits(page)).toEqual([]);
  });

  test("marks the spelling variants on the canvas only, never in the problems pill", async ({
    page,
  }) => {
    await expect(variantDots(page)).toHaveCount(3);
    for (const id of VARIANT_IDS) await expect(variantDot(page, id)).toBeVisible();
    await expect(page.locator('[data-chrome="problems"]')).toBeHidden();
    expect((await postedMessages(page)).map((message) => message.type)).toEqual(["ready"]);
  });

  test("keeps the dots when the host re-imports the document, as after an undo of another edit", async ({
    page,
  }) => {
    await expect(variantDots(page)).toHaveCount(3);
    const command = page.locator('.djs-container [data-element-id="cmd_place_order"] .djs-hit');
    const before = (await command.boundingBox())!.y;
    await postFromHost(page, {
      type: "update",
      text: VOCABULARY_BOARD.replace("[200, 220]", "[200, 300]"),
    });
    await expect.poll(async () => (await command.boundingBox())!.y).toBeGreaterThan(before + 20);
    await expect(variantDots(page)).toHaveCount(3);
    for (const id of VARIANT_IDS) await expect(variantDot(page, id)).toBeVisible();
  });

  test("Unify spelling is one edit of the document; the host's undo brings the variants back", async ({
    page,
  }) => {
    await clickSticky(page, "agg_orders");
    await page.locator('.djs-context-pad [data-action="unify-spelling"]').click();
    await expect(variantDots(page)).toHaveCount(0);
    await expect.poll(async () => (await edits(page)).length).toBe(1);
    const [edit] = await edits(page);
    expect(count(edit!["text"], "aggregate Orders ")).toBe(3);
    expect(count(edit!["text"], "aggregate Order ")).toBe(0);
    expect(count(edit!["text"], "aggregate order ")).toBe(0);

    await postFromHost(page, { type: "update", text: VOCABULARY_BOARD });
    await expect(variantDots(page)).toHaveCount(3);
  });
});
