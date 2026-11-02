import { expect, test, type Page } from "@playwright/test";
import { centreOf, select, shape, type Point } from "./support/canvas.js";
import { allowClipboardWrite, clickButtonsLikeSafari } from "./support/safari.js";
import {
  canvasSlot,
  diagramPoint,
  exportText,
  openExampleFromStartScreen,
  openMenu,
  toast,
} from "./support/webapp.js";

/**
 * The canvas keys act only while the canvas `<svg>` has the focus. Under Safari's click model
 * (support/safari.ts) a click on zoom in, zoom out or Share hands the focus to the canvas (guide
 * §5.8, §5.7), so Cmd/Ctrl+Z and C act at once; Enter on Share leaves it on the button. A dialog of
 * the menu returns the focus to the menu trigger (§5.4), so for it the spec checks where the focus
 * went and that the keys act once a click on the canvas has given it the focus back. Every project
 * clicks that way; `webapp-webkit` runs this spec in WebKit itself.
 */

/** An empty spot of the example's landscape, left of the customer, in diagram coordinates. */
const EMPTY_SPOT: Point = { x: 240, y: 80 };

interface HandBackCase {
  readonly name: string;
  /** Clicks the chrome control; ends where the canvas holds the focus. */
  run(page: Page): Promise<void>;
}

function canvas(page: Page) {
  return canvasSlot(page).locator('svg[role="application"]');
}

function isConnecting(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Boolean(
      window.app!.modeler.diagram.get<{ isActive(): boolean | null }>("globalConnect").isActive(),
    ),
  );
}

function viewbox(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify(window.app!.modeler.diagram.get<{ viewbox(): unknown }>("canvas").viewbox()),
  );
}

/** A zoom control animates the view: the spec reads the shapes' places once it rests. */
async function viewRests(page: Page): Promise<void> {
  let previous = await viewbox(page);
  await expect
    .poll(async () => {
      const now = await viewbox(page);
      const rests = now === previous;
      previous = now;
      return rests;
    })
    .toBe(true);
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
    name: "a click on Share",
    async run(page) {
      await page.locator('[data-chrome="primary"]').click();
      await expect(toast(page, "Link copied")).toBeVisible();
    },
  },
];

test.beforeEach(async ({ page, context, browserName }) => {
  await clickButtonsLikeSafari(page);
  await allowClipboardWrite(context, browserName);
  await openExampleFromStartScreen(page);
});

test("Enter on Share leaves the focus on the button", async ({ page }) => {
  const share = page.locator('[data-chrome="primary"]');
  await share.focus();
  await page.keyboard.press("Enter");
  await expect(toast(page, "Link copied")).toBeVisible();
  await expect(share).toBeFocused();
  await expect(canvas(page)).not.toBeFocused();
});

for (const handBack of HAND_BACK_CASES) {
  test(`Cmd/Ctrl+Z and C act on the canvas after ${handBack.name}`, async ({ page }) => {
    const original = await exportText(page);
    // Delete takes the bookshop out of the landscape, since other views show it. The e-mail system
    // would not do: it lies under the inspector, which glides the canvas aside for it until Delete
    // closes the panel, so how far the drag's ends moved would depend on that gap.
    await select(page, "bookshop");
    await page.keyboard.press("Delete");
    await expect.poll(() => exportText(page)).not.toBe(original);

    await handBack.run(page);

    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => exportText(page)).toBe(original);

    // With the pointer on the canvas, C arms the connect tool; a drag from the customer to the
    // payment provider then connects them.
    await viewRests(page);
    const spot = await diagramPoint(page, EMPTY_SPOT);
    await page.mouse.move(spot.x, spot.y);
    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press("c");
    await expect.poll(() => isConnecting(page)).toBe(true);
    const source = await centreOf(shape(page, "customer"));
    const target = await centreOf(shape(page, "payments"));
    await page.mouse.move(source.x, source.y, { steps: 4 });
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => exportText(page)).toContain("customer -> payments");
  });
}
