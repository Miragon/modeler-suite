import { expect, test, type Page } from "@playwright/test";
import { INVALID_STATUS_DELAY_MS } from "@miragon/modeler-shell/core";
import type { EventStormingReadOnly } from "@miragon/event-storming-renderer";
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

/** Whether the canvas refuses edits, which it does from the failed import on. */
function canvasLocked(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    window
      .modeler!.diagram.get<Pick<EventStormingReadOnly, "isReadOnly">>("eventStormingReadOnly")
      .isReadOnly(),
  );
}

/**
 * An update whose import fails, as an invalid file's does while someone types it: the canvas keeps
 * its board and locks. The DSL reads every text today, so the test makes one import fail.
 */
async function typeAnInvalidFile(page: Page): Promise<void> {
  await page.evaluate(() => {
    const modeler = window.modeler!;
    const importText = modeler.importText.bind(modeler);
    modeler.importText = () => {
      modeler.importText = importText;
      return Promise.reject(new Error("not importable"));
    };
  });
  await postFromHost(page, { type: "update", text: "title Broken\n" });
  await expect.poll(() => canvasLocked(page)).toBe(true);
}

async function typeAValidFile(page: Page, text: string): Promise<void> {
  await postFromHost(page, { type: "update", text });
  await expect.poll(() => canvasLocked(page)).toBe(false);
}

/**
 * Issue #494: guide §13.5 shows the lock of an invalid file only after 800ms without a valid
 * import, so typing in the text editor beside the board does not flicker, and guide §8 counts the
 * hidden dots among the lock's marks. The page's clock stands still between the steps, so a slow
 * machine cannot stretch the 800ms.
 */
test.describe("VS Code webview: the spelling-variant dots while the file is typed", () => {
  const MOVED_BOARD = VOCABULARY_BOARD.replace("[200, 220]", "[200, 300]");

  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await openWebview(page, { text: VOCABULARY_BOARD });
    await expect(variantDots(page)).toHaveCount(3);
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1000);
  });

  async function expectAllDots(page: Page): Promise<void> {
    await expect(variantDots(page)).toHaveCount(3);
    for (const id of VARIANT_IDS) await expect(variantDot(page, id)).toBeVisible();
  }

  test("keeps the dots through an invalid file that turns valid within 800ms", async ({ page }) => {
    await typeAnInvalidFile(page);
    await expectAllDots(page);
    await page.clock.runFor(INVALID_STATUS_DELAY_MS - 1);
    await expectAllDots(page);

    await typeAValidFile(page, MOVED_BOARD);
    await page.clock.runFor(INVALID_STATUS_DELAY_MS);
    await expectAllDots(page);
    await expect(page.locator('[data-chrome="status"]')).toBeHidden();
    expect(await edits(page)).toEqual([]);
  });

  test("hides the dots 800ms after an invalid file, and brings them back with a valid one", async ({
    page,
  }) => {
    await typeAnInvalidFile(page);
    await page.clock.runFor(INVALID_STATUS_DELAY_MS - 1);
    await expectAllDots(page);

    await page.clock.runFor(1);
    await expect(variantDots(page)).toHaveCount(0);
    await expect(page.locator('[data-chrome="status"]')).toBeVisible();

    await typeAValidFile(page, MOVED_BOARD);
    await expectAllDots(page);
    expect(await edits(page)).toEqual([]);
  });
});
