import { expect, test, type Locator, type Page } from "@playwright/test";
import { parse } from "yaml";
import { ICONS, type ShellIconName } from "@miragon/modeler-shell";
import { EMPTY_DOCUMENT, EXAMPLE_DOCUMENT } from "../../../apps/ide-editor/src/examples.js";
import { PNG_GROUND, pixelOf } from "../support/png.js";
import {
  LIGHT,
  WIDE,
  countOf,
  openShippedWebview,
  openWebview,
  postFromHost,
  postedMessages,
  waitForPosted,
} from "./support/webview.js";
import { openMenu } from "../support/webapp.js";

/**
 * The webview's side of the protocol with the extension host and the chrome it configures in the
 * shell: menu groups, palette names and keys, keyboard create, the title dialog, the colour popup,
 * Command Palette commands, the read-only lock of an invalid file and the PNG export. What
 * the shell guarantees itself is covered by shell-conformance.spec.ts.
 */

/** The icon of a menu entry as Lucide nodes, to compare with the shell's `ICONS`. */
function iconNodesOf(entry: Locator): Promise<Array<[string, Record<string, string>]>> {
  return entry.evaluate((element) =>
    [...(element.querySelector(".cd-shell-menu-item-icon svg")?.children ?? [])].map(
      (child): [string, Record<string, string>] => [
        child.tagName,
        Object.fromEntries(
          [...child.attributes].map((attribute) => [attribute.name, attribute.value]),
        ),
      ],
    ),
  );
}

function lucideNodes(name: ShellIconName): Array<[string, Record<string, string>]> {
  return ICONS[name].map(([tag, attributes]) => [tag, { ...attributes }]);
}

function stickyIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window
      .modeler!.diagram.get<{ getAll(): Array<{ id: string; elementKind?: string }> }>(
        "elementRegistry",
      )
      .getAll()
      .filter((element) => element.elementKind === "sticky")
      .map((element) => element.id)
      .sort(),
  );
}

function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window
      .modeler!.diagram.get<{ get(): Array<{ id: string }> }>("selection")
      .get()
      .map((element) => element.id)
      .sort(),
  );
}

function lastEdit(page: Page): Promise<string | undefined> {
  return postedMessages(page).then(
    (messages) => messages.filter((message) => message.type === "edit").at(-1)?.["text"] as string,
  );
}

const INVALID = JSON.stringify({
  channels: {
    items: [
      { id: "twice", text: "Shop" },
      { id: "twice", text: "Fair" },
    ],
  },
});

test.describe("VS Code webview: protocol and chrome", () => {
  test("posts ready exactly once and no edit for an import", async ({ page }) => {
    await openWebview(page);
    const messages = await postedMessages(page);
    expect(countOf(messages, "ready")).toBe(1);
    expect(countOf(messages, "edit")).toBe(0);
  });

  test("the menu holds Model (Canvas title, Stickies side by side, Notes and the legend), Export (PNG before SVG) and Help", async ({
    page,
  }) => {
    await openWebview(page);
    const dropdown = await openMenu(page);

    const layout = await dropdown.evaluate((menu) =>
      [...menu.children].map((child) =>
        child.getAttribute("role") === "separator" ? "|" : child.getAttribute("data-menu-id"),
      ),
    );
    expect(layout).toEqual([
      "canvas-title",
      "sticky-columns",
      "notes",
      "legend",
      "|",
      "export-png",
      "export-svg",
      "|",
      "keyboard-shortcuts",
    ]);
    await expect(dropdown.locator('[data-menu-id="canvas-title"]')).toHaveText("Canvas title…");
    const exportPng = dropdown.locator('[data-menu-id="export-png"]');
    await expect(exportPng).toHaveText("Export as PNG");
    expect(await iconNodesOf(exportPng)).toEqual(lucideNodes("file-image"));
    expect(await iconNodesOf(dropdown.locator('[data-menu-id="keyboard-shortcuts"]'))).toEqual(
      lucideNodes("keyboard"),
    );
  });

  test("the palette names its tools and keys, Lasso first, then the sticky", async ({ page }) => {
    await openWebview(page);
    const facts = await page
      .locator('[data-chrome="palette"] .entry')
      .evaluateAll((elements) =>
        elements.map((element) => [
          element.getAttribute("data-action"),
          element.getAttribute("aria-label"),
          element.getAttribute("aria-keyshortcuts"),
        ]),
      );
    expect(facts).toEqual([
      ["lasso-tool", "Lasso", "L"],
      ["hand-tool", "Hand", "H"],
      ["create.sticky", "Sticky", null],
    ]);
  });

  test("Enter on Sticky adds one sticky in the block in the middle, posts it and opens its editor", async ({
    page,
  }) => {
    await openWebview(page, { diagram: "empty" });
    await page.locator('[data-chrome="palette"] [data-action="create.sticky"]').focus();
    await page.keyboard.press("Enter");

    await expect(page.locator("textarea.diagram-label-editor")).toBeFocused();
    await page.keyboard.type("Pay per seat");
    await page.keyboard.press("Enter");
    await expect
      .poll(() => lastEdit(page))
      .toMatch(/\n {4}- id: sticky_[a-z0-9]{8}\n {6}text: Pay per seat\n/);
    expect(await stickyIds(page)).toHaveLength(1);
    expect(await selectedIds(page)).toEqual(await stickyIds(page));
  });

  test("Canvas title writes the title as one edit", async ({ page }) => {
    await openWebview(page);
    const dropdown = await openMenu(page);
    await dropdown.locator('[data-menu-id="canvas-title"]').click();
    const dialog = page.getByRole("dialog", { name: "Canvas title" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Title").fill("Bikes");
    await dialog.getByRole("button", { name: "Apply" }).click();

    await expect(dialog).toBeHidden();
    await expect.poll(() => lastEdit(page)).toContain("\n  title: Bikes\n");
    expect(countOf(await postedMessages(page), "edit")).toBe(1);
  });

  test("the pad's colour popup gives the selected sticky a tape colour", async ({ page }) => {
    await openWebview(page);
    await page.locator('.djs-shape[data-element-id="design-system"]').click();
    await page.locator('.djs-context-pad [data-action="color"]').click();
    await page.locator('.djs-popup [data-id="color-peach"]').click();

    await expect
      .poll(async () => {
        const text = await lastEdit(page);
        const canvas = text === undefined ? {} : (parse(text) as Record<string, unknown>);
        const resources = canvas["key-resources"] as { items: { id: string }[] } | undefined;
        return resources?.items.find((item) => item.id === "design-system");
      })
      .toMatchObject({ color: "peach" });
  });

  test("an empty file opens with every block and no empty-file hint, its blocks explain themselves", async ({
    page,
  }) => {
    await openWebview(page, { diagram: "empty" });
    await expect(page.locator(".layer-bmc-frame .bmc-hint").first()).toBeVisible();
    await expect(page.locator(".cd-shell-hint")).toHaveCount(0);
  });

  test("a blank file opens as an empty canvas and is written only on the first edit", async ({
    page,
  }) => {
    await openWebview(page, { diagram: "blank" });
    expect(await stickyIds(page)).toEqual([]);
    await expect(page.locator(".layer-bmc-frame .bmc-hint").first()).toBeVisible();
    expect(countOf(await postedMessages(page), "edit")).toBe(0);
  });

  test("an invalid file locks the canvas with a status box until the text is valid again", async ({
    page,
  }) => {
    await openWebview(page);
    await postFromHost(page, { type: "update", text: INVALID });
    const status = page.locator('[data-chrome="status"]');
    await expect(status).toBeVisible();
    await expect(status).toContainText("business model canvas");
    await expect(page.locator(".cd-shell")).toHaveAttribute("data-readonly", "");

    const sticky = page.locator('.djs-shape[data-element-id="consultants"]');
    await sticky.click();
    await page.keyboard.press("Delete");
    await sticky.dblclick();
    await expect(page.locator("textarea.diagram-label-editor")).toHaveCount(0);
    expect(await stickyIds(page)).toContain("consultants");
    expect(countOf(await postedMessages(page), "edit")).toBe(0);

    await postFromHost(page, { type: "update", text: EXAMPLE_DOCUMENT });
    await expect(status).toBeHidden();
    await expect(page.locator(".cd-shell")).not.toHaveAttribute("data-readonly", "");
  });

  test("the PNG export lies on the canvas ground, #F9F7F7, with no font fallback (guide §10.7)", async ({
    page,
  }) => {
    await openWebview(page);
    await postFromHost(page, { type: "command", name: "exportPng" });

    const exported = await waitForPosted(page, "export");
    expect(exported).toMatchObject({ format: "png" });
    expect(exported).not.toHaveProperty("fontFallback");
    const png = Buffer.from(exported["data"] as string, "base64");
    expect(await pixelOf(page, png)).toEqual(PNG_GROUND);
  });

  test("the SVG export carries the attribution and no hint of an empty block", async ({ page }) => {
    await openWebview(page, { diagram: "empty" });
    await postFromHost(page, { type: "command", name: "exportSvg" });

    const svg = (await waitForPosted(page, "export"))["data"] as string;
    expect(svg).toContain("Strategyzer AG, strategyzer.com, CC BY-SA 3.0");
    expect(svg).not.toContain("bmc-hint");
  });

  test("the shipped bundle exports a PNG under its content security policy", async ({ page }) => {
    test.setTimeout(90_000);
    await openShippedWebview(page, { size: WIDE, requested: LIGHT });
    await postFromHost(page, { type: "command", name: "exportPng" });

    const exported = await waitForPosted(page, "export");
    expect(exported).not.toHaveProperty("fontFallback");
    const png = Buffer.from(exported["data"] as string, "base64");
    expect(await pixelOf(page, png)).toEqual(PNG_GROUND);
    expect(await page.evaluate(() => window.__modelerShellVsCodeStub!.cspViolations())).toEqual([]);
    expect(await page.evaluate(() => window.__modelerShellVsCodeStub!.errors())).toEqual([]);
  });

  test("a dark VS Code theme keeps the canvas and its chrome light", async ({ page }) => {
    await openWebview(page, { requested: { theme: "dark" } });
    await expect(page.locator("html")).toHaveAttribute("data-cd-theme", "light");
    const paper = await page.evaluate(
      () => getComputedStyle(document.querySelector(".cd-shell-canvas")!).backgroundColor,
    );
    expect(paper).toBe("rgb(249, 247, 247)");
  });
});

test.describe("VS Code webview: empty documents", () => {
  test("the empty canvas of New Empty Business Model Canvas imports without edits", async ({
    page,
  }) => {
    await openWebview(page, { diagram: "empty" });
    expect(await page.evaluate(() => window.modeler!.exportText())).toBe(EMPTY_DOCUMENT);
    expect(countOf(await postedMessages(page), "edit")).toBe(0);
  });
});
