import { expect, test, type Page } from "@playwright/test";
import { allowClipboardWrite, clickButtonsLikeSafari } from "./support/safari.js";
import {
  canvasSlot,
  closeDialog,
  exportMap,
  mapPositionPoint,
  menuEntry,
  openExample,
  waitForViewer,
} from "./support/viewer.js";

/**
 * The canvas keys act only while the canvas `<svg>` has the focus. Under Safari's click model
 * (support/safari.ts) a click on zoom in or zoom out hands the focus to the canvas (guide §5.8), so
 * Cmd/Ctrl+Z and C act at once. A dialog of the menu returns the focus to the menu trigger (§5.4)
 * and Share, the primary action, keeps the focus handling of a button (the shell's API.md, "Focus
 * after a pointer click"), so for them the spec checks where the focus went and that the keys act
 * once a click on the canvas has given it the focus back. Every project clicks that way;
 * `webapp-webkit` runs this spec in WebKit itself.
 */

/** An empty spot of the Tea Shop example, in its genesis column. */
const EMPTY_SPOT = { visibility: 0.6, evolution: 0.12 };

interface HandBackCase {
  readonly name: string;
  /** Clicks the chrome control; ends where the canvas holds the focus. */
  run(page: Page): Promise<void>;
}

function canvas(page: Page) {
  return canvasSlot(page).locator('svg[role="application"]');
}

async function elementCount(page: Page): Promise<number> {
  return (await exportMap(page)).elements.length;
}

function isCreating(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const viewer = window.__wardleyViewer as unknown as {
      get(name: "dragging"): { context(): { prefix: string } | null };
    };
    return viewer.get("dragging").context()?.prefix === "create";
  });
}

async function clickEmptySpot(page: Page): Promise<void> {
  const spot = await mapPositionPoint(page, EMPTY_SPOT);
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
    name: "the menu's dialog closes (the focus on the menu trigger) and a click on the canvas",
    async run(page) {
      await menuEntry(page, "keyboard-shortcuts");
      const dialog = page.locator("dialog.wardley-shortcuts");
      await closeDialog(dialog, () => dialog.getByRole("button", { name: "Close" }).click());
      await expect(dialog).toBeHidden();
      await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
      await clickEmptySpot(page);
    },
  },
  {
    name: "a click on Share (the focus off the canvas) and a click on the canvas",
    async run(page) {
      await page.locator('[data-chrome="primary"]').click();
      await expect(
        page.locator('[data-chrome="toasts"] .cd-shell-toast').filter({ hasText: "Link copied" }),
      ).toBeVisible();
      await expect(canvas(page)).not.toBeFocused();
      await clickEmptySpot(page);
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

for (const handBack of HAND_BACK_CASES) {
  test(`Cmd/Ctrl+Z and C act on the canvas after ${handBack.name}`, async ({ page }) => {
    const count = () => elementCount(page);
    const before = await count();
    await page
      .locator('.cd-shell-canvas [data-element-id="cmp_power"] .djs-hit')
      .first()
      .click({ force: true });
    await page.keyboard.press("Delete");
    await expect.poll(count).toBe(before - 1);

    await handBack.run(page);

    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(count).toBe(before);

    // With the pointer on the canvas, C attaches a new component to it and a click places it.
    const spot = await mapPositionPoint(page, EMPTY_SPOT);
    await page.mouse.move(spot.x, spot.y);
    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press("c");
    await expect.poll(() => isCreating(page)).toBe(true);
    await page.mouse.move(spot.x + 8, spot.y + 8, { steps: 4 });
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(count).toBe(before + 1);
  });
}
