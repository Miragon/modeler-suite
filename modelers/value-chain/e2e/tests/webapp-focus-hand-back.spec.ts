import { expect, test, type Page } from "@playwright/test";
import { allowClipboardWrite, clickButtonsLikeSafari } from "./support/safari.js";
import {
  canvasSlot,
  diagramPoint,
  exportDocument,
  exportText,
  openApp,
  openExample,
  openMenu,
  toast,
  type Point,
} from "./support/webapp.js";

/**
 * The canvas keys act only while the canvas `<svg>` has the focus. Under Safari's click model
 * (support/safari.ts) a click on zoom in or zoom out hands the focus to the canvas (guide §5.8), so
 * Cmd/Ctrl+Z and C act at once. A dialog of the menu returns the focus to the menu trigger (§5.4)
 * and Share, the primary action, keeps the focus handling of a button (the shell's API.md, "Focus
 * after a pointer click"), so for them the spec checks where the focus went and that the keys act
 * once a click on the canvas has given it the focus back. Every project clicks that way;
 * `webapp-webkit` runs this spec in WebKit itself.
 */

/** An empty spot of the Porter example, right of its organizational unit, in diagram coordinates. */
const EMPTY_SPOT: Point = { x: 760, y: 420 };

interface HandBackCase {
  readonly name: string;
  /** Clicks the chrome control; ends where the canvas holds the focus. */
  run(page: Page): Promise<void>;
}

function canvas(page: Page) {
  return canvasSlot(page).locator('svg[role="application"]');
}

async function shapeCentre(page: Page, id: string): Promise<Point> {
  const box = await page.locator(`.djs-shape[data-element-id="${id}"]`).boundingBox();
  if (!box) throw new Error(`the shape ${id} has no bounding box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function connectionCount(page: Page): Promise<number> {
  return (await exportDocument(page)).connections.length;
}

function isConnecting(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Boolean(
      window
        .__valueChainApp!.modeler.diagram.get<{ isActive(): boolean | null }>("globalConnect")
        .isActive(),
    ),
  );
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
    name: "the menu's dialog closes (the focus on the menu trigger) and a click on the canvas",
    async run(page) {
      await (await openMenu(page)).locator('[data-menu-id="keyboard-shortcuts"]').click();
      const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Close" }).click();
      // The dialog is hidden and the focus is on the trigger at once, but the shell removes the
      // dialog and restores the focus again on the close event, which can follow a click on the
      // canvas and take the focus from it. A role locator ignores a hidden dialog, so match the
      // element.
      await expect(page.locator("dialog.cd-shell-dialog")).toHaveCount(0);
      await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
      await clickEmptySpot(page);
    },
  },
  {
    name: "a click on Share (the focus off the canvas) and a click on the canvas",
    async run(page) {
      await page.locator('[data-chrome="primary"]').click();
      await expect(toast(page, "Link copied")).toBeVisible();
      await expect(canvas(page)).not.toBeFocused();
      await clickEmptySpot(page);
    },
  },
];

test.beforeEach(async ({ page, context, browserName }) => {
  await clickButtonsLikeSafari(page);
  await allowClipboardWrite(context, browserName);
  await openApp(page);
  await openExample(page);
});

for (const handBack of HAND_BACK_CASES) {
  test(`Cmd/Ctrl+Z and C act on the canvas after ${handBack.name}`, async ({ page }) => {
    const original = await exportText(page);
    const connections = await connectionCount(page);
    await page.locator('.djs-shape[data-element-id="step-testing"]').click();
    await page.keyboard.press("Delete");
    await expect.poll(() => exportText(page)).not.toBe(original);

    await handBack.run(page);

    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => exportText(page)).toBe(original);

    // With the pointer on the canvas, C arms the connect tool; a drag from one step to another
    // then connects them.
    const spot = await diagramPoint(page, EMPTY_SPOT);
    await page.mouse.move(spot.x, spot.y);
    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press("c");
    await expect.poll(() => isConnecting(page)).toBe(true);
    const source = await shapeCentre(page, "step-assembly");
    const target = await shapeCentre(page, "step-testing");
    await page.mouse.move(source.x, source.y, { steps: 4 });
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => connectionCount(page)).toBe(connections + 1);
  });
}
