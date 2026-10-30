import { expect, test, type Page } from "@playwright/test";

/*
 * Typography and host hygiene of the chrome (guide §5.4, §5.6, §5.8, §5.14, §13.5) in the demo's
 * stubbed VS Code webview, whose default stylesheet sits in @layer vscode-default as in VS Code.
 * The conformance kit measures boxes; these are the computed styles it does not look at.
 */

async function open(page: Page, query = ""): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/?host=ide${query}`);
  await page.waitForFunction(() => window.__demo?.ready === true);
}

function styleOf(page: Page, selector: string, properties: readonly string[]) {
  return page.evaluate(
    ({ selector, properties }) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`no ${selector}`);
      const style = getComputedStyle(element);
      return Object.fromEntries(
        properties.map((property) => [property, style.getPropertyValue(property)]),
      );
    },
    { selector, properties },
  );
}

const GEIST = /^"Geist Variable"/;
const GEIST_MONO = /^"Geist Mono Variable"/;

test.describe("chrome typography and host hygiene", () => {
  test("the own-document reset beats VS Code's default webview styles", async ({ page }) => {
    await open(page);
    const body = await styleOf(page, "body", [
      "padding-left",
      "margin-left",
      "font-family",
      "font-size",
    ]);
    expect(body["padding-left"]).toBe("0px");
    expect(body["margin-left"]).toBe("0px");
    expect(body["font-family"]).toMatch(GEIST);
    expect(body["font-size"]).toBe("13px");
  });

  test("the zoom readout is 13px/600 with tabular numbers, the buttons use the chrome font", async ({
    page,
  }) => {
    await open(page);
    const readout = await styleOf(page, ".cd-shell-zoom-readout", [
      "font-family",
      "font-size",
      "font-weight",
      "font-variant-numeric",
    ]);
    expect(readout).toEqual({
      "font-family": expect.stringMatching(GEIST),
      "font-size": "13px",
      "font-weight": "600",
      "font-variant-numeric": "tabular-nums",
    });
    const trigger = await styleOf(page, '[data-chrome="menu"]', ["font-family", "font-size"]);
    expect(trigger["font-family"]).toMatch(GEIST);
    expect(trigger["font-size"]).toBe("13px");
  });

  test("menu entries are 13px/400 and at least 36px high", async ({ page }) => {
    await open(page);
    await page.locator('[data-chrome="menu"]').click();
    const entry = await styleOf(page, ".cd-shell-menu-item", [
      "font-size",
      "font-weight",
      "min-height",
    ]);
    expect(entry).toEqual({ "font-size": "13px", "font-weight": "400", "min-height": "36px" });
  });

  test("the tooltip's shortcut chip keeps the guide's kbd, not the host's", async ({ page }) => {
    await open(page);
    await page.locator('[data-zoom="in"]').hover();
    await expect(page.locator(".cd-shell-tooltip")).toBeVisible();
    const tooltip = await styleOf(page, ".cd-shell-tooltip", [
      "font-size",
      "line-height",
      "font-weight",
    ]);
    expect(tooltip).toEqual({ "font-size": "13px", "line-height": "20px", "font-weight": "400" });
    const chip = await styleOf(page, ".cd-shell-tooltip .cd-shell-kbd", [
      "font-family",
      "box-shadow",
      "vertical-align",
      "padding-left",
    ]);
    expect(chip).toEqual({
      "font-family": expect.stringMatching(GEIST_MONO),
      "box-shadow": "none",
      "vertical-align": "baseline",
      "padding-left": "6px",
    });
  });

  test("the empty-file hint's Insert example is a 36px ghost button at 600", async ({ page }) => {
    await open(page, "&empty");
    const action = await styleOf(page, ".cd-shell-hint-action", [
      "font-weight",
      "height",
      "font-family",
    ]);
    expect(action["font-weight"]).toBe("600");
    expect(action.height).toBe("36px");
    expect(action["font-family"]).toMatch(GEIST);
  });
});

test.describe("the chrome in a foreign page", () => {
  // Plain element rules of the host page (specificity 0,0,1) must not reach into the chrome (§5.1, §5.14).
  const HOSTILE_PAGE_CSS = `
    button { font-family: serif; text-transform: uppercase; line-height: 2.5; letter-spacing: 3px; }
    p { font-size: 18px; line-height: 2; color: rgb(255, 0, 0); }
    span { font-size: 21px; text-transform: uppercase; }
    section { font-family: serif; }
  `;

  async function openEmbedded(page: Page, query: string): Promise<void> {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/?host=embedded&${query}`);
    await page.waitForFunction(() => window.__demo?.ready === true);
    await page.addStyleTag({ content: HOSTILE_PAGE_CSS });
  }

  test("keeps readout, menu trigger, status text and Insert example in the chrome's type", async ({
    page,
  }) => {
    await openEmbedded(page, "empty&status=danger&legend=open");
    const readout = await styleOf(page, ".cd-shell-zoom-readout", [
      "font-family",
      "font-size",
      "font-weight",
      "text-transform",
      "letter-spacing",
    ]);
    expect(readout).toEqual({
      "font-family": expect.stringMatching(GEIST),
      "font-size": "13px",
      "font-weight": "600",
      "text-transform": "none",
      "letter-spacing": "normal",
    });
    const trigger = await styleOf(page, '[data-chrome="menu"]', ["font-family", "line-height"]);
    expect(trigger).toEqual({
      "font-family": expect.stringMatching(GEIST),
      "line-height": "19.5px",
    });
    const status = await styleOf(page, ".cd-shell-status-text", [
      "font-size",
      "line-height",
      "color",
    ]);
    expect(status["font-size"]).toBe("13px");
    expect(status["line-height"]).toBe("19.5px");
    expect(status.color).not.toBe("rgb(255, 0, 0)");
    const action = await styleOf(page, ".cd-shell-hint-action", [
      "text-transform",
      "font-weight",
      "font-family",
    ]);
    expect(action).toEqual({
      "text-transform": "none",
      "font-weight": "600",
      "font-family": expect.stringMatching(GEIST),
    });
    const legendTitle = await styleOf(page, ".cd-shell-legend-title", ["font-family", "font-size"]);
    expect(legendTitle).toEqual({
      "font-family": expect.stringMatching(GEIST),
      "font-size": "13px",
    });

    await page.locator('[data-zoom="in"]').hover();
    await expect(page.locator(".cd-shell-tooltip")).toBeVisible();
    const label = await styleOf(page, ".cd-shell-tooltip-label", ["font-size", "text-transform"]);
    expect(label).toEqual({ "font-size": "13px", "text-transform": "none" });
  });

  test("stays light under a dark host page and takes its high contrast over", async ({ page }) => {
    await openEmbedded(page, "theme=dark&kontrast=hoch");
    const root = await page.evaluate(() => {
      const element = document.querySelector(".cd-shell")!;
      return {
        theme: element.getAttribute("data-cd-theme"),
        kontrast: element.getAttribute("data-cd-kontrast"),
        colorScheme: getComputedStyle(element).colorScheme,
        page: getComputedStyle(document.querySelector(".demo-foreign-page")!).colorScheme,
      };
    });
    expect(root).toEqual({ theme: "light", kontrast: "hoch", colorScheme: "light", page: "dark" });
  });
});

test.describe("the canvas slot", () => {
  test("keeps its layout over a renderer's container class, and the renderer's paper", async ({
    page,
  }) => {
    await open(page);
    const style = await page.evaluate(() => {
      // a renderer stylesheet, loaded before shell.css as the stylesheet order says
      const renderer = document.createElement("style");
      renderer.textContent = `.demo-renderer-paper {
        position: relative;
        background-color: rgb(8, 10, 32);
        background-image: radial-gradient(rgb(255, 255, 255) 1px, transparent 1px);
      }`;
      document.head.prepend(renderer);
      const canvas = document.querySelector(".cd-shell-canvas")!;
      canvas.classList.add("demo-renderer-paper");
      const computed = getComputedStyle(canvas);
      return {
        position: computed.position,
        backgroundColor: computed.backgroundColor,
        backgroundImage: computed.backgroundImage,
      };
    });
    expect(style.position).toBe("absolute");
    expect(style.backgroundColor).toBe("rgb(8, 10, 32)");
    expect(style.backgroundImage).toContain("radial-gradient");
  });

  test("rings the focused canvas in --cd-ui-fokus, inside the slot; 3px in high contrast", async ({
    page,
  }) => {
    for (const [query, width, offset] of [
      ["", "2px", "-2px"],
      ["&theme=dark&kontrast=hoch", "3px", "-3px"],
    ] as const) {
      await open(page, query);
      for (let step = 0; step < 3; step++) await page.keyboard.press("Tab");
      const ring = await page.evaluate(() => {
        const svg = document.activeElement;
        if (!svg?.matches(".djs-container > svg")) return null;
        const style = getComputedStyle(svg);
        const fokus = getComputedStyle(document.documentElement)
          .getPropertyValue("--cd-ui-fokus")
          .trim();
        const probe = document.createElement("span");
        probe.style.color = fokus;
        document.body.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return {
          style: style.outlineStyle,
          width: style.outlineWidth,
          offset: style.outlineOffset,
          sameColour: style.outlineColor === expected,
          role: svg.getAttribute("role"),
          name: svg.getAttribute("aria-label"),
        };
      });
      expect(ring).toEqual({
        style: "solid",
        width,
        offset,
        sameColour: true,
        role: "application",
        name: "Diagram",
      });
    }
  });
});

/**
 * The colour at `at` of a PNG of the viewport, decoded in a blank page of the same browser: the
 * demo's webview stub may refuse the data: image this needs.
 */
async function pixelOf(page: Page, png: Buffer, at: { x: number; y: number }): Promise<number[]> {
  const viewportWidth = page.viewportSize()!.width;
  const scratch = await page.context().newPage();
  try {
    return await scratch.evaluate(
      async ({ base64, at, viewportWidth }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const scale = image.naturalWidth / viewportWidth;
        const data = context.getImageData(Math.floor(at.x * scale), Math.floor(at.y * scale), 1, 1);
        return [...data.data.slice(0, 3)];
      },
      { base64: png.toString("base64"), at, viewportWidth },
    );
  } finally {
    await scratch.close();
  }
}

test.describe("the palette", () => {
  test("keeps the focus ring whole beside a pressed neighbour, which paints after it (guide §5.14)", async ({
    page,
  }) => {
    await open(page);
    const palette = page.locator('[data-chrome="palette"]');
    const lasso = palette.locator('[data-action="lasso-tool"]');
    const hand = palette.locator('[data-action="hand-tool"]');
    await page.locator('[data-chrome="menu"]').focus();
    await page.keyboard.press("Tab");
    await expect(lasso).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowLeft");
    await expect(lasso).toBeFocused();
    await expect(hand).toHaveAttribute("aria-pressed", "true");
    expect(await lasso.evaluate((entry) => entry.matches(":focus-visible"))).toBe(true);

    const roles = await palette.evaluate((element) => {
      const probe = document.createElement("span");
      element.append(probe);
      const colourOf = (role: string) => {
        probe.style.color = `var(${role})`;
        return getComputedStyle(probe).color;
      };
      const colours = { hover: colourOf("--cd-ui-hover"), fokus: colourOf("--cd-ui-fokus") };
      probe.remove();
      return colours;
    });
    await expect
      .poll(() => hand.evaluate((entry) => getComputedStyle(entry).backgroundColor))
      .toBe(roles.hover);

    const box = (await lasso.boundingBox())!;
    const png = await page.screenshot({ animations: "disabled" });
    const ring = await pixelOf(page, png, { x: box.x + box.width + 3, y: box.y + box.height / 2 });
    expect(ring).toEqual((roles.fokus.match(/\d+/g) ?? []).slice(0, 3).map(Number));
  });
});

test.describe("the demo's own dialog and note prompt", () => {
  /** Shadow and border of `selector`, and whether its border is the `kontur` role. */
  function frameOf(page: Page, selector: string) {
    return page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!element?.parentElement) throw new Error(`no ${selector}`);
      const probe = document.createElement("span");
      probe.style.color = "var(--cd-ui-kontur)";
      element.parentElement.append(probe);
      const kontur = getComputedStyle(probe).color;
      probe.remove();
      const style = getComputedStyle(element);
      return { shadow: style.boxShadow, kontur: style.borderTopColor === kontur };
    }, selector);
  }

  // A modeler draws them itself, so the shell's high-contrast rules do not reach them (guide §5.3).
  test("drop their shadow and take the kontur border in high contrast", async ({ page }) => {
    await open(page, "&kontrast=hoch");
    await page.locator(".djs-shape").first().click();
    await page.locator('.djs-context-pad .entry[data-action="note"]').click();
    expect(await frameOf(page, ".demo-note-prompt")).toEqual({ shadow: "none", kontur: true });
    await page.keyboard.press("Escape");

    // from the keyboard, so the dialog's first focus, Close, shows its ring
    await page.locator('[data-chrome="menu"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await frameOf(page, ".demo-dialog")).toEqual({ shadow: "none", kontur: true });
    const close = await page.evaluate(() => ({
      focused: document.activeElement?.className,
      width: getComputedStyle(document.querySelector(".demo-dialog-close")!).outlineWidth,
    }));
    expect(close).toEqual({ focused: "demo-dialog-close", width: "3px" });
  });
});
