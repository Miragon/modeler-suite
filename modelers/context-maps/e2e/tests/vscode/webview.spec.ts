import { expect, test, type Page } from "@playwright/test";
import { EMPTY_MAP, EXAMPLE_MAP } from "../../../apps/vscode/src/examples.js";
import { EMBED_KEYWORD, decodeDoc, pngExtractText } from "../../../apps/vscode/src/png.js";
import { PNG_GROUND, pngFacts, rasterisedSvgs, recordRasterisedSvgs } from "../support/png.js";
import {
  INVALID_MAP,
  drawCanvasDark,
  failFontEmbeddingOfNextExport,
  openWebview,
  postFromHost,
  postedMessages,
  waitForPosted,
} from "./support/webview.js";

/**
 * The VS Code webview (apps/vscode/src/webview/main.ts) inside the shell's VS Code stub: its
 * protocol with the extension host and the chrome it mounts. The shell's own rules are the
 * conformance kit's (shell-conformance.spec.ts); these are the map's.
 */

async function zoom(page: Page): Promise<number> {
  return page.evaluate(() => window.modeler!.diagram.get<{ zoom(): number }>("canvas").zoom());
}

async function contextIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (JSON.parse(window.modeler!.exportText()) as { contexts: Array<{ id: string }> }).contexts.map(
      (context) => context.id,
    ),
  );
}

/** Records every keydown that reaches window, where VS Code's host page forwards keys. */
async function recordWindowKeys(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { windowKeys: string[] }).windowKeys = seen;
    window.addEventListener("keydown", (event) => {
      if (["Meta", "Control", "Shift", "Alt"].includes(event.key)) return;
      const modifiers = `${event.metaKey ? "Meta+" : ""}${event.ctrlKey ? "Control+" : ""}${event.shiftKey ? "Shift+" : ""}`;
      seen.push(`${modifiers}${event.key}${event.defaultPrevented ? " (prevented)" : ""}`);
    });
  });
}

function windowKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window as unknown as { windowKeys: string[] }).windowKeys]);
}

async function focusCanvas(page: Page): Promise<void> {
  await page.locator(".djs-container > svg").focus();
}

test.describe("VS Code webview: protocol and chrome", () => {
  test("posts ready exactly once and no edit for the opening import", async ({ page }) => {
    await openWebview(page);
    await page.waitForTimeout(200);
    const types = (await postedMessages(page)).map((message) => message.type);
    expect(types.filter((type) => type === "ready")).toHaveLength(1);
    expect(types).not.toContain("edit");
  });

  test("the menu holds Map title…, Legend, Export (PNG, SVG, JSON, CML) and Keyboard shortcuts…", async ({
    page,
  }) => {
    await openWebview(page);
    await page.locator('[data-chrome="menu"]').click();
    const menu = page.locator(".cd-shell-menu[role='menu']");
    await expect(menu).toBeVisible();
    const labels = await menu
      .locator("[data-menu-id]")
      .evaluateAll((entries) =>
        entries.map(
          (entry) => `${entry.getAttribute("data-menu-group")}:${entry.textContent?.trim() ?? ""}`,
        ),
      );
    expect(labels).toEqual([
      "model:Map title…",
      "model:Legend",
      "export:Export as PNG",
      "export:Export as SVG",
      "export:Export as JSON",
      "export:Export as CML",
      "help:Keyboard shortcuts…",
    ]);
  });

  test("Enter on a creating palette entry adds one selected context and posts the edit", async ({
    page,
  }) => {
    await openWebview(page);
    const before = await contextIds(page);
    await page.locator('.djs-palette [data-action="context.core"]').focus();
    await page.keyboard.press("Enter");
    const edit = await waitForPosted(page, "edit");
    const after = (JSON.parse(edit.text as string) as { contexts: Array<{ id: string }> }).contexts;
    const created = after.filter((context) => !before.includes(context.id));
    expect(created).toHaveLength(1);
    expect((edit.text as string).endsWith("}\n")).toBe(true);
    const selected = await page.evaluate(() => window.modeler!.elements.selection());
    expect(selected).toEqual([created[0]!.id]);
    await expect(page.locator(".djs-direct-editing-content")).toBeFocused();
  });

  test("undo on the canvas belongs to the VS Code document, not to the canvas", async ({
    page,
  }) => {
    await openWebview(page);
    await page.locator('.djs-palette [data-action="context.generic"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    const edits = (await postedMessages(page)).filter((message) => message.type === "edit");
    await recordWindowKeys(page);
    await focusCanvas(page);
    const undo = process.platform === "darwin" ? "Meta+z" : "Control+z";
    await page.keyboard.press(undo);
    expect(await windowKeys(page)).toEqual([
      `${process.platform === "darwin" ? "Meta+" : "Control+"}z`,
    ]);
    // the canvas did not undo on its own: nothing new was written
    await page.waitForTimeout(100);
    expect((await postedMessages(page)).filter((message) => message.type === "edit")).toHaveLength(
      edits.length,
    );
  });

  test("Cmd+Z in the label editor stays in the field and never reaches VS Code", async ({
    page,
  }) => {
    await openWebview(page);
    await page.locator('[data-element-id="ctx_cfp"]').first().dblclick();
    const field = page.locator(".djs-direct-editing-content");
    await expect(field).toBeFocused();
    await recordWindowKeys(page);
    await page.keyboard.type("x");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
    expect(await windowKeys(page)).toEqual([]);
  });

  test("zoom keys, Shift+1 and select all act on the canvas and never reach VS Code", async ({
    page,
  }) => {
    await openWebview(page);
    await recordWindowKeys(page);
    await focusCanvas(page);
    const start = await zoom(page);
    await page.keyboard.press("Control+=");
    expect(await zoom(page)).toBeGreaterThan(start);
    await page.keyboard.press("Control+-");
    await page.keyboard.press("Control+0");
    expect(await zoom(page)).toBe(1);
    await page.keyboard.press("Shift+!");
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Meta+a");
    await page.keyboard.press("F1");
    expect(await windowKeys(page)).toEqual(["F1"]);
    const selected = await page.evaluate(() => window.modeler!.elements.selection().length);
    expect(selected).toBe(12);
  });

  test("a dark VS Code theme keeps the map light; high contrast passes at runtime", async ({
    page,
  }) => {
    await openWebview(page, { requested: { theme: "dark" } });
    const mode = () =>
      page.evaluate(() => [
        document.documentElement.getAttribute("data-cd-theme"),
        document.documentElement.getAttribute("data-cd-kontrast"),
      ]);
    expect(await mode()).toEqual(["light", null]);
    await page.evaluate(() => window.__modelerShellVsCodeStub!.setColorThemeKind(3));
    await expect.poll(mode).toEqual(["light", "hoch"]);
    const surround = await page.evaluate(
      () => getComputedStyle(document.querySelector(".cm-djs-container")!).backgroundColor,
    );
    expect(surround).toBe("rgb(249, 247, 247)");
  });

  test("an empty map opens at 100 % with the hint; Insert example asks the host", async ({
    page,
  }) => {
    await openWebview(page, { map: "empty" });
    expect(await zoom(page)).toBe(1);
    const hint = page.locator(".cd-shell-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("Pick a tool from the palette to start.");
    await hint.getByRole("button", { name: "Insert example" }).click();
    await waitForPosted(page, "insertExample");
    // the host writes the example as one edit and sends it back as an update, which fits
    await postFromHost(page, { type: "update", text: EXAMPLE_MAP });
    await expect(hint).toBeHidden();
    await expect.poll(() => zoom(page)).toBeLessThan(1);
    expect((await postedMessages(page)).some((message) => message.type === "edit")).toBe(false);
  });

  test("a problems message shows the pill; activating it asks for the Problems view", async ({
    page,
  }) => {
    await openWebview(page);
    await postFromHost(page, { type: "problems", count: 3, errors: 1 });
    const pill = page.locator('[data-chrome="problems"]');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("aria-label", "3 problems, 1 error");
    await pill.click();
    await waitForPosted(page, "showProblems");
  });

  test("the fitView command fits the map again after a zoom", async ({ page }) => {
    await openWebview(page);
    const fitted = await zoom(page);
    await focusCanvas(page);
    await page.keyboard.press("Control+0");
    expect(await zoom(page)).toBe(1);
    await postFromHost(page, { type: "command", name: "fitView" });
    await expect.poll(() => zoom(page)).toBeCloseTo(fitted, 2);
  });

  test("the fitView command frames the box the renderer reports as the map's content", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // The legend open, as a stored state restores it: its card settles once its font has loaded,
    // and the shell then fits once more, so the insets read below are the ones the fit used.
    await openWebview(page, { legend: "open" });
    await expect(page.locator(".cd-shell")).toHaveAttribute("data-legend", "open");
    // A box no context of the map spans: only the contract's contentBounds() names it.
    const reported = { x: 5000, y: 3000, width: 200, height: 100 };
    await page.evaluate((box) => {
      Object.assign(window.modeler!, { contentBounds: () => box });
    }, reported);

    await postFromHost(page, { type: "command", name: "fitView" });

    const framed = (box: typeof reported) => {
      const insets = window.shell!.fitInsets();
      const canvas = window.modeler!.diagram.get<{
        viewbox(): { x: number; y: number; scale: number };
        getSize(): { width: number; height: number };
      }>("canvas");
      const { x, y, scale } = canvas.viewbox();
      const { width, height } = canvas.getSize();
      return {
        scale,
        offsetX:
          (box.x + box.width / 2 - x) * scale -
          (insets.left + (width - insets.left - insets.right) / 2),
        offsetY:
          (box.y + box.height / 2 - y) * scale -
          (insets.top + (height - insets.top - insets.bottom) / 2),
      };
    };
    // Below 1px counts as centred, as in the web app's test; a miss shows its offset.
    const withinAPixel = (offset: number) => (Math.abs(offset) < 1 ? 0 : offset);
    await expect
      .poll(async () => {
        const { scale, offsetX, offsetY } = await page.evaluate(framed, reported);
        return {
          scale: Math.round(scale * 1000) / 1000,
          offsetX: withinAPixel(offsetX),
          offsetY: withinAPixel(offsetY),
        };
      })
      .toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  test("a map opened with the legend left open fits to the card's settled width", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWebview(page, { legend: "open" });
    await expect(page.locator(".cd-shell")).toHaveAttribute("data-legend", "open");
    // The first fit can measure the card before its font has loaded; once it has, and the
    // observer has reported the card's new width, the view must be the fit of that width.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const view = () =>
      page.evaluate(() => {
        const { x, y, scale } = window
          .modeler!.diagram.get<{ viewbox(): { x: number; y: number; scale: number } }>("canvas")
          .viewbox();
        return { scale, left: x * scale, top: y * scale };
      });
    const opened = await view();
    expect(await page.evaluate(() => window.connection!.viewport.isAutomatic())).toBe(true);

    await page.evaluate(() => window.connection!.viewport.fit({ animate: false }));

    const fitted = await view();
    expect(opened.scale).toBe(fitted.scale);
    expect(Math.abs(opened.left - fitted.left)).toBeLessThan(0.5);
    expect(Math.abs(opened.top - fitted.top)).toBeLessThan(0.5);
  });

  test("the export commands post the map as PNG, SVG, JSON and CML", async ({ page }) => {
    await openWebview(page);
    for (const name of ["exportPng", "exportSvg", "exportJson", "exportCml"]) {
      await postFromHost(page, { type: "command", name });
    }
    await expect
      .poll(
        async () =>
          (await postedMessages(page)).filter((message) => message.type === "export").length,
      )
      .toBe(4);
    const exports = Object.fromEntries(
      (await postedMessages(page))
        .filter((message) => message.type === "export")
        .map((message) => [message.format as string, message.data as string]),
    );
    expect(exports.png!.startsWith("iVBORw0KGgo")).toBe(true);
    expect(exports.svg).toContain("data-tt-document=");
    expect(exports.svg).not.toMatch(/<svg[^>]*role="application"/);
    expect(exports.json).toBe(EXAMPLE_MAP);
    expect(exports.cml).toContain("ContextMap");
  });

  test("a dark canvas posts the light SVG and PNG, byte for byte (guide §10.7, §13.4)", async ({
    page,
  }) => {
    await openWebview(page);
    const exported = async () => {
      const before = (await postedMessages(page)).length;
      await postFromHost(page, { type: "command", name: "exportSvg" });
      await postFromHost(page, { type: "command", name: "exportPng" });
      await expect
        .poll(async () =>
          (await postedMessages(page)).slice(before).filter((message) => message.type === "export"),
        )
        .toHaveLength(2);
      return Object.fromEntries(
        (await postedMessages(page))
          .slice(before)
          .filter((message) => message.type === "export")
          .map((message) => [message.format as string, message.data as string]),
      );
    };
    const light = await exported();

    await drawCanvasDark(page);

    expect(await exported()).toEqual(light);
    expect(light.png).toMatch(/^iVBORw0KGgo/);
    expect(light.svg).not.toMatch(/\b(cd-c-|cm-c-)/);
  });

  test("the PNG export lies on the light ground with Geist inside and keeps the embedded map", async ({
    page,
  }) => {
    expect(PNG_GROUND).toBe("#f9f7f7");
    await openWebview(page);
    await recordRasterisedSvgs(page);

    await postFromHost(page, { type: "command", name: "exportPng" });

    const exported = await waitForPosted(page, "export");
    expect(exported.format).toBe("png");
    expect(exported.fontFallback).toBe(false);
    const png = new Uint8Array(Buffer.from(exported.data as string, "base64"));
    expect((await pngFacts(page, png)).corners).toEqual([
      PNG_GROUND,
      PNG_GROUND,
      PNG_GROUND,
      PNG_GROUND,
    ]);
    expect(decodeDoc(pngExtractText(png, EMBED_KEYWORD)!)).toBe(EXAMPLE_MAP);
    const [drawn] = await rasterisedSvgs(page);
    expect(drawn).toContain("@font-face");
    expect(drawn).toContain("Geist Variable");
    expect(drawn).toMatch(/url\("data:font\/woff2;base64,/);
  });

  test("a PNG whose Geist could not be embedded still exports and tells the host", async ({
    page,
  }) => {
    await openWebview(page);
    await failFontEmbeddingOfNextExport(page);

    await postFromHost(page, { type: "command", name: "exportPng" });

    const exported = await waitForPosted(page, "export");
    expect(exported.format).toBe("png");
    expect(exported.fontFallback).toBe(true);
    const png = new Uint8Array(Buffer.from(exported.data as string, "base64"));
    expect((await pngFacts(page, png)).corners).toEqual([
      PNG_GROUND,
      PNG_GROUND,
      PNG_GROUND,
      PNG_GROUND,
    ]);
    expect(decodeDoc(pngExtractText(png, EMBED_KEYWORD)!)).toBe(EXAMPLE_MAP);

    await postFromHost(page, { type: "command", name: "exportPng" });
    await expect
      .poll(async () => (await postedMessages(page)).filter((m) => m.type === "export").length)
      .toBe(2);
    expect((await waitForPosted(page, "export")).fontFallback).toBe(false);
  });

  test("a picture the browser cannot draw reaches the host as the app's own text", async ({
    page,
  }) => {
    await openWebview(page);
    await page.evaluate(() => {
      window.modeler!.diagram.saveSVG = () => ({ svg: "this is no SVG" });
    });

    await postFromHost(page, { type: "command", name: "exportPng" });

    const error = await waitForPosted(page, "error");
    expect(error.message).toBe("Couldn't export the map as PNG. Try again, or export it as SVG.");
    expect((await postedMessages(page)).filter((message) => message.type === "export")).toEqual([]);
  });

  test("the keyboard shortcuts dialog is the shell's, opens from Help and closes on Escape", async ({
    page,
  }) => {
    await openWebview(page);
    await page.locator('[data-chrome="menu"]').click();
    await page.getByRole("menuitem", { name: "Keyboard shortcuts…" }).click();
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/cd-shell-dialog/);
    await expect(page.locator("dialog.cm-shortcuts")).toHaveCount(0);
    await expect(dialog.locator("h3")).toHaveText(["View", "Edit", "Tools"]);
    await expect(dialog.locator("[data-chrome-key]")).toHaveCount(4);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
  });

  test("the shortcuts dialog opens from the keyboard and keeps the focus inside", async ({
    page,
  }) => {
    await openWebview(page);
    const trigger = page.locator('[data-chrome="menu"]');
    await trigger.focus();

    await page.keyboard.press("Enter");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    for (let tab = 0; tab < 4; tab++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(
        true,
      );
    }
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Map title… renames the map in one edit and returns the focus to the menu", async ({
    page,
  }) => {
    await openWebview(page);
    await page.locator('[data-chrome="menu"]').click();
    await page.getByRole("menuitem", { name: "Map title…" }).click();
    const dialog = page.getByRole("dialog", { name: "Map title" });
    await expect(dialog).toBeVisible();
    const field = dialog.getByRole("textbox", { name: "Title" });
    await expect(field).toBeFocused();
    await field.fill("Renamed conference");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
    const edit = await waitForPosted(page, "edit");
    expect((JSON.parse(edit.text as string) as { title: string }).title).toBe("Renamed conference");
    const edits = (await postedMessages(page)).filter((message) => message.type === "edit");
    expect(edits).toHaveLength(1);
  });

  test("Map title… is locked while the text is no valid map", async ({ page }) => {
    await openWebview(page);
    await postFromHost(page, { type: "update", text: INVALID_MAP });
    await expect(page.locator('[data-chrome="status"]')).toBeVisible();
    await page.locator('[data-chrome="menu"]').click();
    await expect(page.locator('[data-menu-id="map-title"]')).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.locator('[data-menu-id="legend"]')).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("an open Map title… dialog closes when the text stops being a valid map", async ({
    page,
  }) => {
    await openWebview(page);
    await page.locator('[data-chrome="menu"]').click();
    await page.getByRole("menuitem", { name: "Map title…" }).click();
    const dialog = page.getByRole("dialog", { name: "Map title" });
    await dialog.getByRole("textbox", { name: "Title" }).fill("Typed before the text broke");

    await postFromHost(page, { type: "update", text: INVALID_MAP });

    await expect(dialog).toBeHidden();
    await page.waitForTimeout(200);
    expect((await postedMessages(page)).map((message) => message.type)).not.toContain("edit");
    expect(await page.evaluate(() => window.modeler!.diagram.getMeta()?.title)).not.toBe(
      "Typed before the text broke",
    );
  });

  test("palette entries carry their name, no native title", async ({ page }) => {
    await openWebview(page);
    const entries = await page
      .locator(".djs-palette .entry")
      .evaluateAll((elements) =>
        elements.map((entry) => [entry.getAttribute("aria-label"), entry.getAttribute("title")]),
      );
    expect(entries).toEqual([
      ["Lasso", null],
      ["Core domain", null],
      ["Supporting subdomain", null],
      ["Generic subdomain", null],
    ]);
  });

  test("the legend starts closed and its state lives in the webview state", async ({ page }) => {
    await openWebview(page);
    const legend = page.locator('[data-chrome="legend"]');
    const stored = () => page.evaluate(() => window.__modelerShellVsCodeStub!.state());
    await expect(legend).toBeHidden();

    await page.locator('[data-chrome="menu"]').click();
    await page.locator('[data-menu-id="legend"]').click();
    await expect(legend).toBeVisible();
    expect(await stored()).toMatchObject({ modelerShell: { legendOpen: true } });

    await page.locator(".cd-shell-legend-close").click();
    await expect(legend).toBeHidden();
    expect(await stored()).toMatchObject({ modelerShell: { legendOpen: false } });
  });
});

test.describe("VS Code webview: canvas", () => {
  test("with nothing focused, Delete and Backspace leave the map and post no edit", async ({
    page,
  }) => {
    await openWebview(page);
    await page.locator('[data-element-id="ctx_cfp"]').first().click();
    await expect(page.locator(".djs-context-pad.open")).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | SVGElement | null)?.blur());
    await page.keyboard.press("Delete");
    await page.keyboard.press("Backspace");
    expect(await contextIds(page)).toContain("ctx_cfp");
    expect((await postedMessages(page)).some((message) => message.type === "edit")).toBe(false);
  });

  test("Delete after a pointer on a context-pad entry acts on the canvas", async ({ page }) => {
    await openWebview(page);
    await page.evaluate(() => window.modeler!.elements.reveal("rel_evaluation_schedule"));
    await page.locator('.djs-context-pad.open [data-action="swap-ends"]').click();
    await waitForPosted(page, "edit");
    await page.keyboard.press("Delete");
    await expect
      .poll(() => page.evaluate(() => window.modeler!.elements.list().map((entry) => entry.id)))
      .not.toContain("rel_evaluation_schedule");
  });

  test("a failed import locks the canvas until the next valid one", async ({ page }) => {
    await openWebview(page);
    await postFromHost(page, { type: "update", text: INVALID_MAP });
    await expect(page.locator('[data-chrome="status"]')).toBeVisible();
    await expect(page.locator('[data-chrome="status"]')).toContainText(
      "This file isn't a valid context map right now.",
    );
    // the last valid map stays on the canvas, read-only
    expect(await contextIds(page)).toHaveLength(6);
    await page.locator('[data-element-id="ctx_cfp"]').first().click();
    await expect(page.locator(".djs-context-pad .entry")).toHaveCount(0);
    await page.keyboard.press("Delete");
    expect(await contextIds(page)).toContain("ctx_cfp");
    expect((await postedMessages(page)).some((message) => message.type === "edit")).toBe(false);

    await postFromHost(page, { type: "update", text: EXAMPLE_MAP });
    await expect(page.locator('[data-chrome="status"]')).toBeHidden();
    await page.locator('[data-element-id="ctx_cfp"]').first().click();
    await expect(page.locator(".djs-context-pad .entry").first()).toBeVisible();
  });

  test("an update of the same map keeps the view and the selection", async ({ page }) => {
    await openWebview(page);
    await page.evaluate(() => window.modeler!.elements.reveal("ctx_cfp"));
    await focusCanvas(page);
    await page.keyboard.press("Control+0");
    const view = await page.evaluate(() => window.modeler!.getViewState());
    await postFromHost(page, { type: "update", text: EXAMPLE_MAP.replace(/\n/g, "\r\n") });
    await postFromHost(page, {
      type: "update",
      text: EXAMPLE_MAP.replace('"label": "identity"', '"label": "sign-in"'),
    });
    await expect
      .poll(() => page.evaluate(() => window.modeler!.exportText()))
      .toContain('"label": "sign-in"');
    expect(await page.evaluate(() => window.modeler!.getViewState())).toEqual(view);
    expect(await page.evaluate(() => window.modeler!.elements.selection())).toEqual(["ctx_cfp"]);
  });

  test("an empty file stays empty: the opening import writes nothing", async ({ page }) => {
    await openWebview(page, { map: "empty" });
    expect(await page.evaluate(() => window.modeler!.exportText())).toBe(EMPTY_MAP);
    expect((await postedMessages(page)).some((message) => message.type === "edit")).toBe(false);
  });
});
