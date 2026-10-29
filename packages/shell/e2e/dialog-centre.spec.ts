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

/** Puts an element with `overflow: hidden` and the given position around #modeler, which stays absolute. */
function wrapModeler(page: Page, position: "static" | "relative"): Promise<void> {
  return page.evaluate((position) => {
    const modeler = document.getElementById("modeler")!;
    const wrapper = document.createElement("div");
    Object.assign(wrapper.style, { position, overflow: "hidden", width: "300px", height: "200px" });
    modeler.replaceWith(wrapper);
    wrapper.append(modeler);
  }, position);
}

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

  test("judges a click against the shifted panel: the window's centre is backdrop where the panel left it", async ({
    page,
  }) => {
    await openHost(page);
    await place(page, { left: 300, top: 120, width: 800, height: 600 });
    await openDialog(page);
    await expectCentre(page, { x: 700, y: 420 });
    // The panel spans x 420 to 980; in the window's centre it would span 360 to 920.
    expect((await dialogBox(page)).left).toBeCloseTo(420, 0);

    await page.mouse.click(950, 420);
    await expect(page.locator("dialog.cd-shell-dialog")).toHaveCount(1);

    await page.mouse.click(390, 420);
    await expect(page.locator("dialog.cd-shell-dialog")).toHaveCount(0);
  });

  test("stays in the window's centre where too little of the container shows", async ({ page }) => {
    await openHost(page);
    // Of the container, only the 200px strip above the window's bottom edge shows.
    await place(page, { left: 300, top: 700, width: 800, height: 600 });

    await openDialog(page);

    await expectCentre(page, WINDOW_CENTRE);
  });

  test("asks for 16px around the dialog in the part of the container that shows", async ({
    page,
  }) => {
    await openHost(page);
    await place(page, { left: 300, top: 120, width: 800, height: 600 });
    await openDialog(page);
    const { height } = await dialogBox(page);
    const top = WINDOW.height - (height + 2 * 16);

    await place(page, { left: 300, top, width: 800, height: 600 });
    await expectCentre(page, { x: 700, y: (top + WINDOW.height) / 2 });

    await place(page, { left: 300, top: top + 2, width: 800, height: 600 });
    await expectCentre(page, WINDOW_CENTRE);
  });

  test("takes its size from a container that is a size container, and centres over it", async ({
    page,
  }) => {
    await openHost(page);
    await place(page, { left: 700, top: 400, width: 500, height: 400 }, { containerType: "size" });

    await openDialog(page);

    // The sizes refer to the content box, inside the 1px border.
    expect((await dialogBox(page)).width).toBe(500 - 2 - 32);
    await expectCentre(page, { x: 950, y: 600 });
  });

  test("takes its width from a side panel narrower than the dialog, without a size container", async ({
    page,
  }) => {
    await openHost(page);
    await place(page, { left: 800, top: 0, width: 480, height: 900 });

    await openDialog(page);

    expect((await dialogBox(page)).width).toBe(480 - 2 - 32);
    await expectCentre(page, { x: 1040, y: 450 });
  });

  test("takes its height from a container lower than the window, without a size container", async ({
    page,
  }) => {
    await openHost(page);
    await place(page, { left: 300, top: 120, width: 800, height: 600 });
    await openDialog(page);

    await page.locator(".cd-shell-dialog-body").evaluate((element) => {
      element.style.height = "auto";
      const content = document.createElement("div");
      content.style.height = "1200px";
      element.append(content);
    });

    await expect.poll(async () => (await dialogBox(page)).height).toBe(600 - 2 - 32);
    await expectCentre(page, { x: 700, y: 420 });
  });

  test("follows the container's content box while it is open", async ({ page }) => {
    await openHost(page);
    await place(page, { left: 300, top: 120, width: 800, height: 600 });
    await openDialog(page);
    expect((await dialogBox(page)).width).toBe(560);

    await place(page, { left: 300, top: 120, width: 400, height: 600 }, { padding: "0 20px" });

    await expect.poll(async () => (await dialogBox(page)).width).toBe(400 - 2 - 40 - 32);
    await expectCentre(page, { x: 500, y: 420 });
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

  test("follows a move of the container that changes no size", async ({ page }) => {
    await openHost(page);
    await place(page, { left: 300, top: 120, width: 800, height: 600 });
    await openDialog(page);
    await expectCentre(page, { x: 700, y: 420 });

    await place(page, { left: 100, top: 120, width: 800, height: 600 });

    await expectCentre(page, { x: 500, y: 420 });
  });

  test("follows content that lands above the container in a page as high as the window", async ({
    page,
  }) => {
    await openHost(page);
    await page.addStyleTag({
      content:
        "html, body { height: 100%; } .host-page { min-height: 0; } .host-spacer { display: none; }",
    });
    await page.locator("#modeler").evaluate((element) => {
      Object.assign(element.style, {
        position: "static",
        margin: "120px 0 0 300px",
        width: "800px",
        height: "600px",
      });
    });
    await openDialog(page);
    await expectCentre(page, { x: 700, y: 420 });

    await page.evaluate(() => {
      const banner = document.createElement("div");
      banner.style.height = "100px";
      document.querySelector(".host-page")!.prepend(banner);
    });

    await expectCentre(page, { x: 700, y: 520 });
  });

  test("follows a scroll of the page", async ({ page }) => {
    await openHost(page);
    await place(page, { left: 300, top: 200, width: 800, height: 600 });
    await openDialog(page);
    await expectCentre(page, { x: 700, y: 500 });

    await page.evaluate(() => window.scrollTo(0, 120));

    await expectCentre(page, { x: 700, y: 380 });
  });

  test("follows content that lands above the container and moves it down the page", async ({
    page,
  }) => {
    await openHost(page);
    await page.locator("#modeler").evaluate((element) => {
      Object.assign(element.style, {
        position: "static",
        margin: "120px 0 0 300px",
        width: "800px",
        height: "600px",
      });
    });
    await openDialog(page);
    await expectCentre(page, { x: 700, y: 420 });

    await page.evaluate(() => {
      const banner = document.createElement("div");
      banner.style.height = "100px";
      document.querySelector(".host-page")!.prepend(banner);
    });

    await expectCentre(page, { x: 700, y: 520 });
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

  test("follows a panel around the container that shrinks and clips more of it", async ({
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
        top: "120px",
        width: "1100px",
        height: "620px",
        overflow: "hidden",
      });
      modeler.replaceWith(panel);
      panel.append(modeler);
    });
    await place(page, { left: 0, top: 0, width: 1100, height: 600 }, { position: "relative" });
    await openDialog(page);
    await expectCentre(page, { x: 650, y: 420 });

    await page.locator("#panel").evaluate((element) => {
      element.style.width = "700px";
    });

    await expectCentre(page, { x: 450, y: 420 });
  });

  test("is not clipped by an unpositioned element around a container that is absolutely positioned", async ({
    page,
  }) => {
    await openHost(page);
    await wrapModeler(page, "static");
    await place(page, { left: 300, top: 120, width: 800, height: 600 });

    await openDialog(page);

    await expectCentre(page, { x: 700, y: 420 });
  });

  test("is clipped by the element around the container that positions it", async ({ page }) => {
    await openHost(page);
    await wrapModeler(page, "relative");
    await place(page, { left: 300, top: 120, width: 800, height: 600 });

    await openDialog(page);

    await expectCentre(page, WINDOW_CENTRE);
  });

  test("never outgrows the window, whatever the container is: its Close stays reachable", async ({
    page,
  }) => {
    await openHost(page);
    await place(page, { left: 100, top: 100, width: 800, height: 2000 }, { containerType: "size" });
    await openDialog(page);
    await page.locator(".cd-shell-dialog-body").evaluate((element) => {
      element.style.height = "1800px";
      const content = document.createElement("div");
      content.style.height = "1800px";
      element.append(content);
    });

    await expect
      .poll(async () => {
        const { top, height } = await dialogBox(page);
        return { top, bottom: top + height };
      })
      .toEqual({ top: 16, bottom: WINDOW.height - 16 });
    const close = await page.locator(".cd-shell-dialog-close").boundingBox();
    expect(close!.y).toBeGreaterThanOrEqual(16);
    expect(
      await page
        .locator(".cd-shell-dialog-body")
        .evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true);

    await page.setViewportSize({ width: 400, height: WINDOW.height });
    await expect.poll(async () => (await dialogBox(page)).width).toBe(400 - 2 * 16);
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

  test("centres over a container in a page that zooms with CSS", async ({ page }) => {
    await openHost(page);
    await page.addStyleTag({ content: "html { zoom: 1.25; }" });
    await place(page, { left: 200, top: 100, width: 800, height: 500 });

    await openDialog(page);

    // The container's rect on the screen: x 250 to 1250, y 125 to 750.
    await expectCentre(page, { x: 750, y: 437.5 });
  });

  test("fits a size container in a page that zooms out with CSS", async ({ page }) => {
    await openHost(page);
    await page.addStyleTag({ content: "html { zoom: 0.8; }" });
    await place(page, { left: 700, top: 400, width: 500, height: 400 }, { containerType: "size" });

    await openDialog(page);

    // The container's rect on the screen: x 560 to 960, y 320 to 640.
    await expectCentre(page, { x: 760, y: 480 });
  });

  test("centres over the container in a page without a doctype, in quirks mode", async ({
    page,
  }) => {
    await page.setViewportSize(WINDOW);
    await page.route("**/host.html", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/^\s*<!doctype html>/i, "");
      await route.fulfill({ response, body });
    });
    await page.goto("/host.html");
    await page.waitForFunction(() => window.__hostDemo?.ready === true);
    expect(await page.evaluate(() => document.compatMode)).toBe("BackCompat");
    await place(page, { left: 300, top: 120, width: 800, height: 600 });

    await openDialog(page);

    await expectCentre(page, { x: 700, y: 420 });
  });

  for (const [name, rules] of [
    [
      "places every dialog",
      "dialog { position: absolute; inset: auto; top: 50%; left: 50%; margin: 0; translate: 40px 40px; transform: translate(-50%, -50%); }",
    ],
    [
      "scales and turns an open dialog",
      "dialog[open] { position: absolute; scale: 0.9; rotate: 2deg; transition: translate 1s, width 1s; }",
    ],
    ["stretches every dialog over the window", "dialog { min-width: 100%; min-height: 100%; }"],
    ["makes every dialog wider", "dialog { min-width: 700px; }"],
    [
      "sizes an open modal dialog",
      "dialog:modal { width: 90vw; max-width: 1000px; min-height: 100%; max-height: none; }",
    ],
  ] as const) {
    test(`holds against a foreign page that ${name}`, async ({ page }) => {
      await openHost(page);
      await page.addStyleTag({ content: rules });
      await place(page, { left: 300, top: 120, width: 800, height: 600 });
      await openDialog(page);

      await expectCentre(page, { x: 700, y: 420 });
      const { width, height } = await dialogBox(page);
      expect(width).toBe(560);
      expect(height).toBeLessThan(600 - 32);

      await place(page, { left: 300, top: 700, width: 800, height: 600 });
      await expectCentre(page, WINDOW_CENTRE);
    });
  }
});
