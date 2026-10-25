import { expect, test, type Page } from "@playwright/test";

/*
 * Computed styles of the web column (guide §5.7, §5.10, §6, §8, §9, §12) on the web demo
 * (/web.html). The conformance kit measures boxes, states and roles; these are the colours, radii,
 * shadows and type it does not look at, plus spot checks under high contrast and forced colours.
 */

async function openWeb(page: Page, query = ""): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/web.html${query}`);
  await page.waitForFunction(() => window.__webDemo?.ready === true);
}

/** `value` for `property` as the browser computes it inside the shell root (tokens and system colours). */
function computed(page: Page, property: string, value: string): Promise<string> {
  return page.evaluate(
    ({ property, value }) => {
      const probe = document.createElement("div");
      probe.style.setProperty(property, value);
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      document.querySelector(".cd-shell")!.append(probe);
      const result = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return result;
    },
    { property, value },
  );
}

function styleOf(page: Page, selector: string, properties: readonly string[], pseudo?: string) {
  return page.evaluate(
    ({ selector, properties, pseudo }) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`no ${selector}`);
      const style = getComputedStyle(element, pseudo ?? null);
      const rect = element.getBoundingClientRect();
      return {
        ...Object.fromEntries(
          properties.map((property) => [property, style.getPropertyValue(property)]),
        ),
        boxTop: rect.top,
        boxWidth: rect.width,
        boxHeight: rect.height,
      } as Record<string, string> & { boxTop: number; boxWidth: number; boxHeight: number };
    },
    { selector, properties, pseudo },
  );
}

/**
 * Resolves once `selector` and everything in it have finished their animations and transitions,
 * however late a busy runner starts them. Mid-flight, a rise-in or a toast-in shifts its box by a
 * fraction of a pixel, and Chromium rounds the edges of a shifted box to float precision: the start
 * screen's buttons then measure 35.99997 or 36.00003 instead of 36, a toast's Close button 31.99994
 * or 32.00006 instead of 32.
 */
function animationsDone(page: Page, selector: string): Promise<void> {
  return page.evaluate(async (selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`no ${selector}`);
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  }, selector);
}

/** Dispatches a file drag (enter and over) on the page, as the conformance kit does. */
function dragFiles(page: Page, count: number): Promise<void> {
  return page.evaluate((count) => {
    const transfer = new DataTransfer();
    for (let index = 0; index < count; index++) {
      transfer.items.add(new File(["{}"], `board-${index}.json`, { type: "application/json" }));
    }
    for (const type of ["dragenter", "dragover"]) {
      document.body.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
    }
  }, count);
}

const TOAST_STATUSES = ["success", "info", "warning", "danger"] as const;

test.describe("web chrome styles", () => {
  test("the primary action is blue with white text and lifts on hover (guide §5.7, §8)", async ({
    page,
  }) => {
    await openWeb(page);
    const primary = '[data-chrome="primary"]';
    const properties = [
      "background-color",
      "color",
      "box-shadow",
      "border-top-left-radius",
      "font-size",
      "font-weight",
    ];
    const rest = await styleOf(page, primary, properties);
    expect(rest["background-color"]).toBe(
      await computed(page, "background-color", "var(--cd-blau)"),
    );
    expect(rest.color).toBe(await computed(page, "color", "var(--cd-weiss)"));
    expect(rest["box-shadow"]).toBe(await computed(page, "box-shadow", "var(--cd-shadow-1)"));
    expect(rest["border-top-left-radius"]).toBe("12px");
    expect(rest["font-size"]).toBe("13px");
    expect(rest["font-weight"]).toBe("600");
    expect(rest.boxHeight).toBe(40);

    await page.locator(primary).hover();
    await animationsDone(page, primary);
    const hovered = await styleOf(page, primary, properties);
    expect(hovered["background-color"]).toBe(
      await computed(page, "background-color", "var(--cd-blau-link)"),
    );
    expect(hovered["box-shadow"]).toBe(await computed(page, "box-shadow", "var(--cd-shadow-2)"));
    expect(hovered.boxTop).toBeCloseTo(rest.boxTop - 1, 1);
  });

  test("the legal line is 13px on a 20px line with its links in --cd-ui-link (guide §5.10)", async ({
    page,
  }) => {
    await openWeb(page);
    const legal = await styleOf(page, '[data-chrome="legal"]', [
      "font-size",
      "line-height",
      "border-top-left-radius",
      "box-shadow",
    ]);
    expect(legal["font-size"]).toBe("13px");
    expect(legal["line-height"]).toBe("20px");
    expect(legal["border-top-left-radius"]).toBe("6px");
    expect(legal["box-shadow"]).toBe("none");
    const link = await computed(page, "color", "var(--cd-ui-link)");
    const colours = await page.evaluate(() =>
      [...document.querySelectorAll('[data-chrome="legal"] a')].map(
        (anchor) => getComputedStyle(anchor).color,
      ),
    );
    expect(colours.length).toBeGreaterThanOrEqual(3);
    for (const colour of colours) expect(colour).toBe(link);
  });

  for (const status of TOAST_STATUSES) {
    test(`a ${status} toast has its 4px bar and 8px dot in --cd-ui-${status} (guide §8)`, async ({
      page,
    }) => {
      await openWeb(page);
      await page.evaluate(
        (status) => window.__webDemo?.toast({ status, text: `Styled ${status}` }),
        status,
      );
      const toast = `.cd-shell-toast[data-status="${status}"]`;
      await expect(page.locator(toast)).toBeVisible();
      await animationsDone(page, toast);
      const colour = await computed(page, "background-color", `var(--cd-ui-${status})`);
      const bar = await styleOf(page, toast, ["width", "background-color"], "::before");
      expect(bar.width).toBe("4px");
      expect(bar["background-color"]).toBe(colour);
      const dot = await styleOf(page, `${toast} .cd-shell-toast-dot`, ["background-color"]);
      expect([dot.boxWidth, dot.boxHeight, dot["background-color"]]).toEqual([8, 8, colour]);
      const card = await styleOf(page, toast, [
        "background-color",
        "color",
        "border-top-left-radius",
        "box-shadow",
        "font-size",
      ]);
      expect(card["background-color"]).toBe(
        await computed(page, "background-color", "var(--cd-ui-flaeche-hoch)"),
      );
      expect(card.color).toBe(await computed(page, "color", "var(--cd-ui-text)"));
      expect(card["border-top-left-radius"]).toBe("12px");
      expect(card["box-shadow"]).toBe(await computed(page, "box-shadow", "var(--cd-shadow-3)"));
      expect(card["font-size"]).toBe("13px");
      const close = await styleOf(page, `${toast} button[aria-label="Close"]`, []);
      expect([close.boxWidth, close.boxHeight]).toEqual([32, 32]);
    });
  }

  test("the drop zone shows drag-over and forbidden in the colours of guide §9", async ({
    page,
  }) => {
    await openWeb(page);
    const zone = '[data-chrome="drop-zone"]';
    const properties = [
      "background-color",
      "border-top-style",
      "border-top-width",
      "border-top-color",
      "border-top-left-radius",
    ];
    await dragFiles(page, 1);
    await expect(page.locator(zone)).toHaveAttribute("data-state", "over");
    const over = await styleOf(page, zone, properties);
    expect(over["background-color"]).toBe(
      await computed(page, "background-color", "var(--cd-ui-hover)"),
    );
    expect([over["border-top-style"], over["border-top-width"]]).toEqual(["dashed", "2px"]);
    expect(over["border-top-color"]).toBe(
      await computed(page, "color", "var(--cd-ui-interaktion)"),
    );
    expect(over["border-top-left-radius"]).toBe("16px");
    const chip = await styleOf(page, `${zone} .cd-shell-drop-zone-chip`, [
      "background-color",
      "font-size",
      "font-weight",
    ]);
    expect(chip["background-color"]).toBe(
      await computed(page, "background-color", "var(--cd-ui-flaeche-hoch)"),
    );
    expect([chip["font-size"], chip["font-weight"]]).toEqual(["13px", "600"]);

    await dragFiles(page, 2);
    await expect(page.locator(zone)).toHaveAttribute("data-state", "forbidden");
    const forbidden = await styleOf(page, zone, properties);
    expect(forbidden["background-color"]).toBe(
      await computed(page, "background-color", "var(--cd-ui-danger-flaeche)"),
    );
    expect(forbidden["border-top-style"]).toBe("dashed");
    // The not-allowed cursor comes from dropEffect "none" during the drag (the kit's dropZone case).
    expect(forbidden["border-top-color"]).toBe(
      await computed(page, "color", "var(--cd-ui-danger)"),
    );
  });

  test("the start screen card is glass with radius lg and shadow-2, Komet 64, title 21/600 (guide §8)", async ({
    page,
  }) => {
    await openWeb(page, "?empty");
    const card = '[data-chrome="empty-state"]';
    await animationsDone(page, card);
    const style = await styleOf(page, card, [
      "border-top-left-radius",
      "box-shadow",
      "backdrop-filter",
      "padding-top",
      "padding-left",
    ]);
    expect(style["border-top-left-radius"]).toBe("16px");
    expect(style["box-shadow"]).toBe(await computed(page, "box-shadow", "var(--cd-shadow-2)"));
    expect(style["backdrop-filter"]).toBe("blur(8px)");
    expect([style["padding-top"], style["padding-left"]]).toEqual(["32px", "40px"]);
    const komet = await styleOf(page, `${card} img`, []);
    expect([komet.boxWidth, komet.boxHeight]).toEqual([64, 64]);
    const title = await styleOf(page, `${card} h1`, ["font-size", "font-weight"]);
    expect([title["font-size"], title["font-weight"]]).toEqual(["21px", "600"]);
    const buttons = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-chrome="empty-state"] .cd-shell-empty-state-actions button',
        ),
      ].map((button) => ({
        variant: button.getAttribute("data-variant"),
        height: button.getBoundingClientRect().height,
        background: getComputedStyle(button).backgroundColor,
      })),
    );
    expect(buttons.map((button) => [button.variant, button.height])).toEqual([
      ["primary", 36],
      ["ghost", 36],
    ]);
    expect(buttons[0]?.background).toBe(await computed(page, "background-color", "var(--cd-blau)"));
    expect(buttons[1]?.background).toBe("rgba(0, 0, 0, 0)");
    // The File group's Open… as a text link in the hint: link colour, the hint's 13px, no button skin,
    // underlined at rest like a link in body text (guide §3.5, §8), a thicker line on hover.
    const link = `${card} .cd-shell-empty-state-open`;
    const open = await styleOf(page, link, [
      "color",
      "font-size",
      "background-color",
      "border-top-width",
      "text-decoration-line",
    ]);
    expect(open.color).toBe(await computed(page, "color", "var(--cd-ui-link)"));
    expect([
      open["font-size"],
      open["background-color"],
      open["border-top-width"],
      open["text-decoration-line"],
    ]).toEqual(["13px", "rgba(0, 0, 0, 0)", "0px", "underline"]);
    await page.locator(link).hover();
    const hovered = await styleOf(page, link, [
      "color",
      "text-decoration-line",
      "text-decoration-thickness",
    ]);
    expect([
      hovered.color,
      hovered["text-decoration-line"],
      hovered["text-decoration-thickness"],
    ]).toEqual([open.color, "underline", "2px"]);
  });

  test("high contrast drops the shadows and widens the focus ring to 3px (guide §5.3, §5.14)", async ({
    page,
  }) => {
    await page.emulateMedia({ contrast: "more" });
    await openWeb(page, "?empty");
    expect(
      await page.evaluate(() => document.documentElement.getAttribute("data-cd-kontrast")),
    ).toBe("hoch");
    expect((await styleOf(page, '[data-chrome="empty-state"]', ["box-shadow"]))["box-shadow"]).toBe(
      "none",
    );
    await page.locator('[data-chrome="empty-state"] button[data-variant="primary"]').click();
    await page.evaluate(() => window.__webDemo?.toast({ status: "info", text: "High contrast" }));
    await expect(page.locator(".cd-shell-toast")).toBeVisible();
    expect((await styleOf(page, ".cd-shell-toast", ["box-shadow"]))["box-shadow"]).toBe("none");
    expect((await styleOf(page, '[data-chrome="primary"]', ["box-shadow"]))["box-shadow"]).toBe(
      "none",
    );
    await page.locator('[data-chrome="menu"]').focus();
    await page.keyboard.press("Tab");
    const ring = await styleOf(page, '[data-chrome="primary"]', ["outline-style", "outline-width"]);
    expect([ring["outline-style"], ring["outline-width"]]).toEqual(["solid", "3px"]);
  });

  test("forced colours keep borders, bars and rings in system colours (guide §5.14, §12)", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openWeb(page);
    await page.locator('[data-chrome="menu"]').focus();
    await page.keyboard.press("Tab");
    const primary = await styleOf(page, '[data-chrome="primary"]', [
      "outline-color",
      "outline-style",
      "border-top-color",
    ]);
    expect(primary["outline-style"]).toBe("solid");
    expect(primary["outline-color"]).toBe(await computed(page, "color", "Highlight"));
    expect(primary["border-top-color"]).toBe(await computed(page, "color", "ButtonText"));
    await page.evaluate(() =>
      window.__webDemo?.toast({ status: "danger", text: "Forced colours" }),
    );
    await expect(page.locator(".cd-shell-toast")).toBeVisible();
    const bar = await styleOf(page, ".cd-shell-toast", ["background-color", "width"], "::before");
    expect(bar.width).toBe("4px");
    expect(bar["background-color"]).toBe(await computed(page, "color", "CanvasText"));
    await dragFiles(page, 1);
    await expect(page.locator('[data-chrome="drop-zone"]')).toHaveAttribute("data-state", "over");
    const zone = await styleOf(page, '[data-chrome="drop-zone"]', [
      "border-top-style",
      "border-top-width",
    ]);
    expect([zone["border-top-style"], zone["border-top-width"]]).toEqual(["dashed", "2px"]);
  });
});
