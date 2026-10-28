import { expect, test, type Page } from "@playwright/test";
import { allowClipboardWrite, clickButtonsLikeSafari } from "./support/safari.js";
import {
  closeDialog,
  diagramPoint,
  exportBoard,
  openExample,
  openMenu,
  selectShape,
  waitForViewer,
} from "./support/viewer.js";

/**
 * The canvas keys act only while the canvas `<svg>` has the focus. Under Safari's click model
 * (support/safari.ts) a click on zoom in, zoom out or Share hands the focus to the canvas (guide
 * §5.8, §5.7), so Cmd/Ctrl+Z and C act at once; Enter on Share leaves it on the button. The
 * shortcuts dialog of the menu returns the focus to the menu trigger (§5.4), so for it the spec
 * checks where the focus went and that the keys act once a click on the canvas has given it the
 * focus back. Every project clicks that way; `webapp-webkit` runs this spec in WebKit itself.
 */

/** An empty spot of the Order Checkout example, in diagram coordinates: below its policy. */
const EMPTY_SPOT = { x: 900, y: 470 };

interface HandBackCase {
  readonly name: string;
  /** Clicks the chrome control; ends where the canvas holds the focus. */
  run(page: Page): Promise<void>;
}

function canvas(page: Page) {
  return page.locator('.cd-shell-canvas svg[role="application"]');
}

async function elementCount(page: Page, elementType?: string): Promise<number> {
  const { elements } = await exportBoard(page);
  return elements.filter((element) => !elementType || element.elementType === elementType).length;
}

function isCreating(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const viewer = window.__eventStormingViewer as unknown as {
      get(name: "dragging"): { context(): { prefix: string } | null };
    };
    return viewer.get("dragging").context()?.prefix === "create";
  });
}

function shareToast(page: Page) {
  return page.locator('[data-chrome="toasts"] .cd-shell-toast').filter({ hasText: "Link copied" });
}

async function clickEmptySpot(page: Page): Promise<void> {
  const spot = await diagramPoint(page, EMPTY_SPOT);
  await page.mouse.click(spot.x, spot.y);
}

const HAND_BACK_CASES: readonly HandBackCase[] = [
  ...(["in", "out"] as const).map((direction): HandBackCase => ({
    name: `a click on zoom ${direction}`,
    async run(page) {
      await page.locator(`[data-chrome="zoom"] [data-zoom="${direction}"]`).click();
    },
  })),
  {
    name: "the shortcuts dialog closes (the focus on the menu trigger) and a click on the canvas",
    async run(page) {
      await (await openMenu(page)).locator('[data-menu-id="keyboard-shortcuts"]').click();
      const dialog = page.locator(".cd-shell dialog.cd-shell-shortcuts");
      await expect(dialog).toBeVisible();
      await closeDialog(dialog, () => dialog.getByRole("button", { name: "Close" }).click());
      await expect(dialog).toBeHidden();
      await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
      await clickEmptySpot(page);
    },
  },
  {
    name: "a click on Share",
    async run(page) {
      await page.locator('[data-chrome="primary"]').click();
      await expect(shareToast(page)).toBeVisible();
    },
  },
];

test.beforeEach(async ({ page, context, browserName }) => {
  await clickButtonsLikeSafari(page);
  await allowClipboardWrite(context, browserName);
  await page.goto("/");
  await waitForViewer(page);
  await openExample(page);
});

test("Enter on Share leaves the focus on the button", async ({ page }) => {
  const share = page.locator('[data-chrome="primary"]');
  await share.focus();
  await page.keyboard.press("Enter");
  await expect(shareToast(page)).toBeVisible();
  await expect(share).toBeFocused();
  await expect(canvas(page)).not.toBeFocused();
});

for (const handBack of HAND_BACK_CASES) {
  test(`Cmd/Ctrl+Z and C act on the canvas after ${handBack.name}`, async ({ page }) => {
    const count = () => elementCount(page);
    const commands = () => elementCount(page, "command");
    const before = await count();
    const commandsBefore = await commands();
    await selectShape(page, "event_order_placed");
    await page.keyboard.press("Delete");
    await expect.poll(count).toBe(before - 1);

    await handBack.run(page);

    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(count).toBe(before);

    // With the pointer on the canvas, C attaches a new command to it and a click places it.
    const spot = await diagramPoint(page, EMPTY_SPOT);
    await page.mouse.move(spot.x, spot.y);
    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press("c");
    await expect.poll(() => isCreating(page)).toBe(true);
    await page.mouse.move(spot.x + 8, spot.y + 8, { steps: 4 });
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(commands).toBe(commandsBefore + 1);
    expect(await count()).toBe(before + 1);
  });
}
