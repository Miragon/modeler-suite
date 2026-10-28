import { expect, test, type Page } from "@playwright/test";

/*
 * Where the shell's dialog sits in an embedding host (guide §5.1, §8): over the part of the modeler's
 * container that shows while it fits there with 16px around it, else in the window. The kit's
 * `shortcutsDialog` case sees a container that fills the window; /host.html puts the container, which
 * mounts no shell, anywhere in the page.
 */

const WINDOW = { width: 1280, height: 900 };

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

async function openHost(page: Page): Promise<void> {
  await page.setViewportSize(WINDOW);
  await page.goto("/host.html");
  await page.waitForFunction(() => window.__hostDemo?.ready === true);
}

function place(page: Page, box: Box, extra: Record<string, string> = {}): Promise<void> {
  return page.locator("#modeler").evaluate(
    (element, { box, extra }) => {
      Object.assign(element.style, {
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        ...extra,
      });
    },
    { box, extra },
  );
}

async function openDialog(page: Page): Promise<void> {
  await page.evaluate(() => window.__hostDemo?.open());
  await expect(page.locator("dialog.cd-shell-dialog[open]")).toHaveCount(1);
}

function dialogBox(page: Page): Promise<Box> {
  return page.locator("dialog.cd-shell-dialog").evaluate((element) => {
    const { left, top, width, height } = element.getBoundingClientRect();
    return { left, top, width, height };
  });
}

/** The dialog's centre is where `centre` says, within a pixel, once the dialog caught up. */
async function expectCentre(page: Page, centre: { x: number; y: number }): Promise<void> {
  await expect
    .poll(async () => {
      const box = await dialogBox(page);
      return Math.max(
        Math.abs(box.left + box.width / 2 - centre.x),
        Math.abs(box.top + box.height / 2 - centre.y),
      );
    })
    .toBeLessThanOrEqual(1);
}

const WINDOW_CENTRE = { x: WINDOW.width / 2, y: WINDOW.height / 2 };

test.describe("the shell's dialog in an embedding host without a mounted shell", () => {
  test("centres over the modeler's container, not over the window", async ({ page }) => {
    await openHost(page);
    await place(page, { left: 300, top: 120, width: 800, height: 600 });

    await openDialog(page);

    await expectCentre(page, { x: 700, y: 420 });
  });

  test("keeps its backdrop on the whole window: a click beside the container closes it", async ({
    page,
  }) => {
    await openHost(page);
    await place(page, { left: 300, top: 120, width: 800, height: 600 });
    await openDialog(page);

    await page.mouse.click(10, 880);

    await expect(page.locator("dialog.cd-shell-dialog")).toHaveCount(0);
  });

  test("stays in the window's centre where the container has no room for it", async ({ page }) => {
    await openHost(page);
    await place(page, { left: 300, top: 120, width: 400, height: 300 });

    await openDialog(page);

    await expectCentre(page, WINDOW_CENTRE);
  });

  test("asks for 16px around the dialog in the container", async ({ page }) => {
    await openHost(page);
    await place(page, { left: 300, top: 120, width: 800, height: 600 });
    await openDialog(page);
    const { width, height } = await dialogBox(page);

    await place(page, { left: 300, top: 120, width: width + 2 * 16, height: height + 2 * 16 });
    await expectCentre(page, { x: 300 + (width + 32) / 2, y: 120 + (height + 32) / 2 });

    await place(page, { left: 300, top: 120, width: width + 2 * 16 - 2, height: height + 2 * 16 });
    await expectCentre(page, WINDOW_CENTRE);
  });

  test("takes its size from a container that is a size container, and centres over it", async ({
    page,
  }) => {
    await openHost(page);
    await place(page, { left: 700, top: 400, width: 500, height: 400 }, { containerType: "size" });

    await openDialog(page);

    // Container units resolve against the content box, inside the 1px border.
    expect((await dialogBox(page)).width).toBe(500 - 2 - 32);
    await expectCentre(page, { x: 950, y: 600 });
  });

  test("follows a resize of the container and of the window while it is open", async ({ page }) => {
    await openHost(page);
    await place(page, { left: 300, top: 120, width: 800, height: 600 });
    await openDialog(page);
    await expectCentre(page, { x: 700, y: 420 });

    await place(page, { left: 300, top: 120, width: 900, height: 500 });
    await expectCentre(page, { x: 750, y: 370 });

    // The container reaches 1200px to the right; of it shows 300px to 1000px in the narrower window.
    await page.setViewportSize({ width: 1000, height: 800 });
    await expectCentre(page, { x: 650, y: 370 });
  });

  test("follows a scroll of the page", async ({ page }) => {
    await openHost(page);
    await place(page, { left: 300, top: 200, width: 800, height: 600 });
    await openDialog(page);
    await expectCentre(page, { x: 700, y: 500 });

    await page.evaluate(() => window.scrollTo(0, 120));

    await expectCentre(page, { x: 700, y: 380 });
  });

  test("centres over the part that a scrolling panel around the container shows", async ({
    page,
  }) => {
    await openHost(page);
    await page.evaluate(() => {
      const modeler = document.getElementById("modeler")!;
      const panel = document.createElement("div");
      panel.id = "panel";
      Object.assign(panel.style, {
        position: "absolute",
        left: "100px",
        top: "50px",
        width: "700px",
        height: "700px",
        overflow: "auto",
      });
      const spacer = document.createElement("div");
      spacer.style.height = "2000px";
      modeler.replaceWith(panel);
      panel.append(modeler, spacer);
    });
    await place(page, { left: 0, top: 0, width: 680, height: 1200 }, { position: "relative" });
    await openDialog(page);
    // What shows of the container is its box inside the panel's, which a scrollbar narrows.
    const shown = await page.evaluate(() => {
      const container = document.getElementById("modeler")!.getBoundingClientRect();
      const panel = document.getElementById("panel")!;
      const frame = panel.getBoundingClientRect();
      const left = Math.max(container.left, frame.left + panel.clientLeft);
      const top = Math.max(container.top, frame.top + panel.clientTop);
      const right = Math.min(container.right, frame.left + panel.clientLeft + panel.clientWidth);
      const bottom = Math.min(container.bottom, frame.top + panel.clientTop + panel.clientHeight);
      return { x: (left + right) / 2, y: (top + bottom) / 2 };
    });

    await expectCentre(page, shown);

    // The container stays in the panel, but only a thin strip of it is left once the panel scrolled.
    await page.locator("#panel").evaluate((element) => {
      element.scrollTop = 1100;
    });

    await expectCentre(page, WINDOW_CENTRE);
  });

  test("keeps the focus inside and gives it back where it was, shifted or not", async ({
    page,
  }) => {
    await openHost(page);
    await place(page, { left: 300, top: 120, width: 800, height: 600 });
    await page.locator("#open").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("dialog.cd-shell-dialog[open]")).toHaveCount(1);
    await expectCentre(page, { x: 700, y: 420 });

    for (const key of ["Tab", "Shift+Tab", "Tab", "Tab"]) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(
        true,
      );
    }
    await page.keyboard.press("Escape");

    await expect(page.locator("dialog.cd-shell-dialog")).toHaveCount(0);
    await expect(page.locator("#open")).toBeFocused();
  });
});
