import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_DOCUMENT, serializeDocumentText } from "@miragon/context-maps-schema-model";
import {
  exportMap,
  mapLink,
  mapText,
  openExample,
  openMap,
  openMenu,
  startScreen,
  toast,
  waitForApp,
} from "./support/app.js";
import { codeEditors, pressIn } from "./support/code-editors.js";
import { CML_WITH_UNKNOWN_ROLE, MAP_WITH_FINDINGS } from "./support/maps.js";
import { PNG_GROUND, pngFacts, rasterisedSvgs, recordRasterisedSvgs } from "./support/png.js";

/**
 * The web app's side of the shell's web chrome: what it hands the shell (menu groups, primary
 * action, legal links, start screen, drop zone) and its own handlers behind them (share link,
 * replace with undo, open and import, drop, exports, app keys, problems, title, the browser's copy
 * of the map). What the shell guarantees itself runs in webapp-shell-conformance.spec.ts.
 */

const EXAMPLE_TITLE = SAMPLE_DOCUMENT.title;

function fileInput(page: Page) {
  return page.locator('body > input[type="file"]');
}

async function menuLayout(page: Page): Promise<Array<string | null>> {
  const dropdown = await openMenu(page);
  return dropdown.evaluate((menu) =>
    [...menu.querySelectorAll("[data-menu-id], [role='separator']")].map((entry) =>
      entry.getAttribute("role") === "separator" ? "|" : entry.getAttribute("data-menu-id"),
    ),
  );
}

/** A file drag and drop on the page, as the browser delivers one (the drop zone listens on window). */
async function dropFile(page: Page, name: string, type: string, text: string): Promise<void> {
  await page.evaluate(
    ({ name, type, text }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], name, { type }));
      for (const event of ["dragenter", "dragover", "drop"]) {
        document.body.dispatchEvent(
          new DragEvent(event, { dataTransfer: transfer, bubbles: true, cancelable: true }),
        );
      }
    },
    { name, type, text },
  );
}

async function readBytesDownload(
  page: Page,
  menuId: string,
): Promise<{ name: string; bytes: Buffer }> {
  const dropdown = await openMenu(page);
  const download = page.waitForEvent("download");
  await dropdown.locator(`[data-menu-id="${menuId}"]`).click();
  const file = await download;
  const chunks: Buffer[] = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
  return { name: file.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

async function readDownload(page: Page, menuId: string): Promise<{ name: string; text: string }> {
  const { name, bytes } = await readBytesDownload(page, menuId);
  return { name, text: bytes.toString("utf8") };
}

function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.__cmModeler
      .get<{ get(): Array<{ id: string }> }>("selection")
      .get()
      .map((selected) => selected.id),
  );
}

test.describe("webapp: the shell web chrome and the app behind it", () => {
  test("the start screen hides the work chrome until a map starts", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);

    await expect(startScreen(page)).toBeVisible();
    await expect(startScreen(page).getByRole("heading", { level: 1 })).toHaveText(
      "Context Maps Modeler",
    );
    await expect(startScreen(page)).toContainText("Or drop a .cm, .json, or .cml file here");
    await expect(page).toHaveTitle("Context Maps Modeler");
    for (const island of ["menu", "primary", "palette", "zoom"]) {
      await expect(page.locator(`[data-chrome="${island}"]`)).toBeHidden();
    }
    await expect(page.locator('[data-chrome="legal"]')).toBeVisible();

    await startScreen(page).getByRole("button", { name: "New diagram" }).click();
    await expect(startScreen(page)).toBeHidden();
    for (const island of ["menu", "primary", "palette", "zoom"]) {
      await expect(page.locator(`[data-chrome="${island}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-chrome="zoom"] [data-zoom="actual"]')).toHaveText("100%");
    expect(new URL(page.url()).hash).toBe("");
  });

  test("a shared link opens its map at once, without the start screen", async ({ page }) => {
    await openMap(page, SAMPLE_DOCUMENT);

    await expect(startScreen(page)).toBeHidden();
    expect((await exportMap(page)).title).toBe(EXAMPLE_TITLE);
    await expect(page.locator('[data-chrome="primary"]')).toBeVisible();
    await expect(page).toHaveTitle(`${EXAMPLE_TITLE} · Context Maps Modeler`);
  });

  test("Fit frames the box the renderer reports as the map's content", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openMap(page, SAMPLE_DOCUMENT);
    // A box no context of the map spans: only the renderer's contentBounds() names it.
    const reported = { x: 5000, y: 3000, width: 200, height: 100 };
    await page.evaluate((box) => {
      Object.assign(window.__cmModeler, { contentBounds: () => box });
    }, reported);

    await page.locator('[data-chrome="zoom"]').getByRole("button", { name: "Fit to view" }).click();

    const framed = await page.evaluate((box) => {
      const insets = window.__contextMapsApp!.shell.fitInsets();
      const canvas = window.__cmModeler.get<{
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
    }, reported);
    expect(framed.scale).toBeCloseTo(1, 3);
    expect(Math.abs(framed.offsetX)).toBeLessThan(1);
    expect(Math.abs(framed.offsetY)).toBeLessThan(1);
  });

  test("a link cut off when it was copied shows a danger toast on the start screen", async ({
    page,
  }) => {
    await page.goto("/#d=!!!not-a-map");
    await waitForApp(page);

    await expect(startScreen(page)).toBeVisible();
    await expect(toast(page, "Check that you copied the whole link.")).toHaveAttribute(
      "data-status",
      "danger",
    );
  });

  test("the menu holds File, Model, Export and Help; no Appearance, no Undo", async ({ page }) => {
    await openExample(page);

    expect(await menuLayout(page)).toEqual([
      "new-diagram",
      "open",
      "show-example",
      "import",
      "|",
      "map-title",
      "legend",
      "|",
      "export-png",
      "export-svg",
      "export-json",
      "export-cml",
      "|",
      "keyboard-shortcuts",
    ]);
    const dropdown = page.locator(".cd-shell-menu[role='menu']");
    await expect(dropdown.locator('[data-menu-id="open"]')).toHaveText(/Open…\s*(⌘|Ctrl\+)O/);
    await expect(dropdown.locator('[data-menu-id="export-json"]')).toHaveText(
      /Export as JSON\s*(⌘|Ctrl\+)S/,
    );
    await expect(dropdown.locator('[data-menu-group="appearance"]')).toHaveCount(0);
    await expect(dropdown.getByRole("menuitem", { name: /undo|redo/i })).toHaveCount(0);
  });

  test("Share copies the link, writes it into the address bar and confirms with a toast", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Playwright grants clipboard permissions in Chromium only",
    );
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openExample(page);

    await page.locator('[data-chrome="primary"]').click();

    await expect(toast(page, "Link copied")).toHaveAttribute("data-status", "success");
    // Screen readers hear it through the shell's polite live region.
    await expect(page.locator(".cd-shell-live [role='status']")).toHaveText("Link copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/#d=[\w$+-]+$/);
    expect(copied).toBe(page.url());

    const shared = await context.newPage();
    await shared.goto(copied);
    await waitForApp(shared);
    expect(await mapText(shared)).toBe(await mapText(page));
  });

  test("a refused copy points at the address bar", async ({ page }) => {
    await openExample(page);
    await page.evaluate(() => {
      const refuse = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: refuse, write: refuse },
      });
    });

    await page.locator('[data-chrome="primary"]').click();

    await expect(
      toast(page, "Couldn't copy the link. Copy it from the address bar instead."),
    ).toHaveAttribute("data-status", "danger");
    expect(new URL(page.url()).hash).toMatch(/^#d=/);
  });

  test("replacing a map offers Undo instead of asking first", async ({ page }) => {
    await openExample(page);
    const example = await mapText(page);

    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await expect.poll(async () => (await exportMap(page)).contexts.length).toBe(0);

    const offer = toast(page, "Map replaced");
    await expect(offer).toBeVisible();
    await offer.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => mapText(page)).toBe(example);
    await expect(offer).toBeHidden();
  });

  test("an edit after a replacement withdraws the undo offer", async ({ page }) => {
    await openExample(page);
    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await expect(toast(page, "Map replaced")).toBeVisible();

    await page.locator('.djs-palette [data-action="context.core"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");

    await expect(toast(page, "Map replaced")).toBeHidden();
    expect((await exportMap(page)).contexts).toHaveLength(1);
  });

  test("Cmd/Ctrl+Z takes back a replaced map while the canvas has nothing to undo", async ({
    page,
  }) => {
    await openMap(page, SAMPLE_DOCUMENT);
    const example = await mapText(page);
    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await expect.poll(async () => (await exportMap(page)).contexts.length).toBe(0);
    await expect(toast(page, "Map replaced")).toBeVisible();

    await page.locator(".cd-shell-canvas svg[tabindex]").focus();
    await page.keyboard.press("ControlOrMeta+Z");

    await expect.poll(() => mapText(page)).toBe(example);
    await expect(toast(page, "Map replaced")).toBeHidden();
  });

  test("Cmd/Ctrl+Z in a code editor (EditContext, Monaco) leaves the replaced map alone", async ({
    page,
  }) => {
    await openMap(page, SAMPLE_DOCUMENT);
    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await expect.poll(async () => (await exportMap(page)).contexts.length).toBe(0);
    await expect(toast(page, "Map replaced")).toBeVisible();

    for (const editor of await codeEditors(page)) {
      expect(await pressIn(editor, "ControlOrMeta+Z")).toBe("free");
    }

    await expect(toast(page, "Map replaced")).toBeVisible();
    expect((await exportMap(page)).contexts).toHaveLength(0);
  });

  test("Open… reads a .cm.json file and replaces the map", async ({ page }) => {
    await openMap(page, MAP_WITH_FINDINGS);

    await fileInput(page).setInputFiles({
      name: "conference.cm.json",
      mimeType: "application/json",
      buffer: Buffer.from(serializeDocumentText(SAMPLE_DOCUMENT)),
    });

    await expect.poll(async () => (await exportMap(page)).title).toBe(EXAMPLE_TITLE);
    await expect(toast(page, "Map replaced")).toBeVisible();
    await expect(page).toHaveTitle(`${EXAMPLE_TITLE} · Context Maps Modeler`);
  });

  test("a file that is no map shows a danger toast and keeps the map", async ({ page }) => {
    await openExample(page);
    const before = await mapText(page);

    await fileInput(page).setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{ "contexts": '),
    });

    await expect(
      toast(page, "Couldn't read “bad.json”. Check that it contains a valid context map."),
    ).toHaveAttribute("data-status", "danger");
    expect(await mapText(page)).toBe(before);
  });

  test("Import… reads Context Mapper CML; what it skips goes to the pill and its list", async ({
    page,
  }) => {
    await openExample(page);
    const dropdown = await openMenu(page);
    const chooser = page.waitForEvent("filechooser");
    await dropdown.locator('[data-menu-id="import"]').click();
    await (
      await chooser
    ).setFiles({
      name: "shop.cml",
      mimeType: "",
      buffer: Buffer.from(CML_WITH_UNKNOWN_ROLE),
    });

    await expect.poll(async () => (await exportMap(page)).title).toBe("Shop");
    await expect(
      toast(page, "Imported with 1 warning. Details under “1 problem” bottom left."),
    ).toHaveAttribute("data-status", "warning");
    const pill = page.locator('[data-chrome="problems"]');
    await expect(pill).toHaveText("1 problem");
    await pill.click();
    const list = page.locator('[data-chrome="problems-popover"]');
    await expect(list.locator(".cd-shell-problem-message")).toContainText(["BAD"]);
    await expect(list.locator(".cd-shell-problem-location")).toHaveText(["shop.cml"]);
  });

  test("the problems list names each finding's relationship and selects it", async ({ page }) => {
    await openMap(page, MAP_WITH_FINDINGS);
    const pill = page.locator('[data-chrome="problems"]');
    await expect(pill).toHaveText("3 problems");
    await expect(pill).toHaveAttribute("aria-label", "3 problems, 2 errors");

    await pill.click();
    const list = page.locator('[data-chrome="problems-popover"]');
    await expect(list.locator(".cd-shell-problem-location")).toHaveText([
      "“Ordering” → “Billing”",
      "“Ordering” → “Billing”",
      "“Billing” → “Shipping”",
    ]);
    await list.locator(".cd-shell-problem").nth(2).click();
    await expect(list).toBeHidden();
    expect(await selectedIds(page)).toEqual(["rel_bill_ship"]);
  });

  test("the pill follows the map: fixing a finding on the canvas takes it off", async ({
    page,
  }) => {
    await openMap(page, MAP_WITH_FINDINGS);
    await expect(page.locator('[data-chrome="problems"]')).toHaveText("3 problems");

    await page.evaluate(() => {
      const registry = window.__cmModeler.get<{ get(id: string): unknown }>("elementRegistry");
      window.__cmModeler
        .get<{ removeElements(elements: unknown[]): void }>("modeling")
        .removeElements([registry.get("rel_bill_ship")]);
    });

    await expect(page.locator('[data-chrome="problems"]')).toHaveText("2 problems");
  });

  test("a .cml file dropped on the start screen opens", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);

    await dropFile(page, "shop.cml", "", CML_WITH_UNKNOWN_ROLE);

    await expect(startScreen(page)).toBeHidden();
    await expect.poll(async () => (await exportMap(page)).title).toBe("Shop");
    await expect(page.locator('[data-chrome="palette"]')).toBeVisible();
  });

  test("the exports download under the map's name and confirm with a toast", async ({ page }) => {
    await openMap(page, { ...SAMPLE_DOCUMENT, title: "Conference Planner" });

    for (const [id, fileName] of [
      ["export-png", "conference-planner.png"],
      ["export-svg", "conference-planner.svg"],
      ["export-json", "conference-planner.cm.json"],
      ["export-cml", "conference-planner.cml"],
    ] as const) {
      const { name } = await readDownload(page, id);
      expect(name).toBe(fileName);
      await expect(toast(page, `Exported ${fileName}.`)).toBeVisible();
    }
  });

  test("Export as PNG lies on the light ground at 2× and carries Geist inside the image", async ({
    page,
  }) => {
    expect(PNG_GROUND).toBe("#f9f7f7");
    await openMap(page, { ...SAMPLE_DOCUMENT, title: "Conference Planner" });
    await recordRasterisedSvgs(page);
    const [width, height] = await page.evaluate(() => {
      const root = new DOMParser().parseFromString(
        window.__cmModeler.saveSVG().svg,
        "image/svg+xml",
      ).documentElement;
      return [Number(root.getAttribute("width")), Number(root.getAttribute("height"))];
    });

    const { name, bytes } = await readBytesDownload(page, "export-png");

    expect(name).toBe("conference-planner.png");
    const facts = await pngFacts(page, bytes);
    expect(facts.corners).toEqual([PNG_GROUND, PNG_GROUND, PNG_GROUND, PNG_GROUND]);
    expect({ width: facts.width, height: facts.height }).toEqual({
      width: width! * 2,
      height: height! * 2,
    });
    const [drawn] = await rasterisedSvgs(page);
    expect(drawn).toContain("@font-face");
    expect(drawn).toContain("Geist Variable");
    expect(drawn).toMatch(/url\("data:font\/woff2;base64,/);
    await expect(toast(page, "Exported conference-planner.png.")).toHaveAttribute(
      "data-status",
      "success",
    );
  });

  test("a dark canvas exports the light SVG and PNG, byte for byte (guide §10.7, §13.4)", async ({
    page,
  }) => {
    await openMap(page, {
      ...SAMPLE_DOCUMENT,
      title: "Conference Planner",
      contexts: SAMPLE_DOCUMENT.contexts.map((context, index) =>
        index === 0 ? { ...context, stroke: "#333333" } : context,
      ),
      relationships: [
        ...SAMPLE_DOCUMENT.relationships,
        { id: "rel_partnership", from: "ctx_cfp", to: "ctx_schedule", pattern: "partnership" },
      ],
    });
    // By keyboard: diagram-js adds an element's outline on its first hover, and the export carries
    // it, so a pointer crossing the canvas between two exports would change the second.
    const downloaded = async (menuId: string) => {
      await page.locator('[data-chrome="menu"]').press("Enter");
      const download = page.waitForEvent("download");
      await page.locator(`.cd-shell-menu[role='menu'] [data-menu-id="${menuId}"]`).press("Enter");
      const chunks: Buffer[] = [];
      for await (const chunk of await (await download).createReadStream()) {
        chunks.push(chunk as Buffer);
      }
      return Buffer.concat(chunks);
    };
    const exports = async () => ({
      svg: await downloaded("export-svg"),
      png: await downloaded("export-png"),
    });
    const container = page.locator(".cm-djs-container");
    const underlays = page.locator(".djs-visual > .cd-c-unterleger");
    const shown = () =>
      Promise.all([
        container.evaluate((element) => getComputedStyle(element).backgroundColor),
        underlays.evaluateAll((all) => [...new Set(all.map((u) => getComputedStyle(u).stroke))]),
      ]);
    expect(await underlays.count()).toBe(7);
    expect(await shown()).toEqual(["rgb(249, 247, 247)", ["none"]]);
    const light = await exports();

    await container.evaluate((element) => {
      element.dataset.cdTheme = "dark";
    });

    expect(await shown()).toEqual(["rgb(29, 29, 29)", ["rgb(143, 138, 138)"]]);
    const dark = await exports();
    expect(light.png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(dark.svg.toString("utf8")).toBe(light.svg.toString("utf8"));
    expect(dark.png.equals(light.png), "the PNG is byte-identical").toBe(true);
    expect(light.svg.toString("utf8")).not.toMatch(/\b(cd-c-|cm-c-)/);
  });

  test("a PNG whose Geist files cannot be read still downloads and warns", async ({ page }) => {
    await page.route(/\.woff2(\?.*)?$/, (route) => route.abort());
    await openMap(page, { ...SAMPLE_DOCUMENT, title: "Conference Planner" });

    const { name, bytes } = await readBytesDownload(page, "export-png");

    expect(name).toBe("conference-planner.png");
    expect((await pngFacts(page, bytes)).corners[0]).toBe(PNG_GROUND);
    await expect(
      toast(page, "Exported conference-planner.png in a system font. Geist couldn't be embedded."),
    ).toHaveAttribute("data-status", "warning");
    await expect(toast(page, "Exported conference-planner.png.")).toHaveCount(0);
  });

  test("a picture the browser cannot draw shows the app's own text and downloads nothing", async ({
    page,
  }) => {
    await openExample(page);
    await page.evaluate(() => {
      window.__cmModeler.saveSVG = () => ({ svg: "this is no SVG" });
    });
    const downloads: string[] = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));

    await (await openMenu(page)).locator('[data-menu-id="export-png"]').click();

    await expect(
      toast(page, "Couldn't export the map as PNG. Try again, or export it as SVG."),
    ).toHaveAttribute("data-status", "danger");
    await expect(toast(page, "@miragon/modeler-shell")).toHaveCount(0);
    expect(downloads).toEqual([]);
  });

  test("the JSON export is the canonical file and opens as the same map", async ({ page }) => {
    await openExample(page);
    const { text } = await readDownload(page, "export-json");
    expect(text).toBe(await mapText(page));
    const { text: cml } = await readDownload(page, "export-cml");
    expect(cml).toContain("ContextMap");

    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await fileInput(page).setInputFiles({
      name: "again.cm.json",
      mimeType: "application/json",
      buffer: Buffer.from(text),
    });
    await expect.poll(() => mapText(page)).toBe(text);
  });

  test("Cmd/Ctrl+O opens the file picker and Cmd/Ctrl+S exports the map as JSON", async ({
    page,
  }) => {
    await openMap(page, { ...SAMPLE_DOCUMENT, title: "Conference Planner" });

    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("ControlOrMeta+O");
    expect((await chooser).isMultiple()).toBe(false);

    const download = page.waitForEvent("download");
    await page.keyboard.press("ControlOrMeta+S");
    expect((await download).suggestedFilename()).toBe("conference-planner.cm.json");
  });

  test("Cmd/Ctrl+S saves nothing on the start screen, and never reaches the browser", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForApp(page);
    const downloads: string[] = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    const prevented = page.evaluate(
      () =>
        new Promise<boolean>((resolve) =>
          window.addEventListener("keydown", (event) => {
            if (event.key.toLowerCase() === "s") resolve(event.defaultPrevented);
          }),
        ),
    );

    await page.keyboard.press("ControlOrMeta+S");

    expect(await prevented).toBe(true);
    await page.waitForTimeout(300);
    expect(downloads).toEqual([]);
    await expect(page.locator('[data-chrome="toasts"] .cd-shell-toast')).toHaveCount(0);
    await expect(startScreen(page)).toBeVisible();
  });

  test("the start screen opens a file from its hint, without the hidden menu", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const open = startScreen(page).getByRole("button", { name: "Open a file…" });
    await expect(open).toHaveAttribute("aria-keyshortcuts", /^(Meta|Control)\+O$/);

    const chooser = page.waitForEvent("filechooser");
    await open.click();
    await (
      await chooser
    ).setFiles({
      name: "conference.cm",
      mimeType: "",
      buffer: Buffer.from(serializeDocumentText(SAMPLE_DOCUMENT)),
    });

    await expect(startScreen(page)).toBeHidden();
    await expect.poll(async () => (await exportMap(page)).title).toBe(EXAMPLE_TITLE);
  });

  test("Map title… renames the map; the tab, the link and the history follow", async ({ page }) => {
    await openExample(page);
    await (await openMenu(page)).locator('[data-menu-id="map-title"]').click();
    const dialog = page.getByRole("dialog", { name: "Map title" });
    await expect(dialog).toBeVisible();
    const field = dialog.getByRole("textbox", { name: "Title" });
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(EXAMPLE_TITLE);

    await field.fill("Conference Planner");
    await dialog.getByRole("button", { name: "Apply" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
    await expect(page).toHaveTitle("Conference Planner · Context Maps Modeler");
    expect((await exportMap(page)).title).toBe("Conference Planner");
    const link = page.url();
    expect(link).toContain("#d=");

    await page.locator(".cd-shell-canvas svg[tabindex]").focus();
    await page.keyboard.press("ControlOrMeta+Z");
    await expect.poll(async () => (await exportMap(page)).title).toBe(EXAMPLE_TITLE);

    const shared = await page.context().newPage();
    await shared.goto(link);
    await waitForApp(shared);
    expect((await exportMap(shared)).title).toBe("Conference Planner");
  });

  test("the browser keeps the map: a visit without a link restores it", async ({ page }) => {
    await openExample(page);
    await page.locator('.djs-palette [data-action="context.core"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    const edited = await mapText(page);

    await page.goto("/");
    await waitForApp(page);

    await expect(startScreen(page)).toBeHidden();
    expect(await mapText(page)).toBe(edited);
  });

  test("a copy the app cannot open stays in the browser, and a toast says so", async ({ page }) => {
    const newer = JSON.stringify({
      version: 2,
      title: "Saved by a newer modeler",
      contexts: [],
      relationships: [],
    });
    await page.goto("/");
    await waitForApp(page);
    await page.evaluate((text) => localStorage.setItem("cm-modeler:document:v1", text), newer);

    await page.reload();
    await waitForApp(page);

    await expect(startScreen(page)).toBeVisible();
    await expect(toast(page, "Couldn't open the map saved in this browser.")).toHaveAttribute(
      "data-status",
      "danger",
    );
    expect(await page.evaluate(() => localStorage.getItem("cm-modeler:document:v1"))).toBe(newer);
  });

  test("the legend starts closed and remembers whether it is open", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openExample(page);
    const legend = page.locator('[data-chrome="legend"]');
    await expect(legend).toBeHidden();

    await (await openMenu(page)).locator('[data-menu-id="legend"]').click();
    await expect(legend).toBeVisible();
    await page.reload();
    await waitForApp(page);
    await expect(legend).toBeVisible();

    await legend.getByRole("button", { name: "Close legend" }).click();
    await expect(legend).toBeHidden();
    await page.reload();
    await waitForApp(page);
    await expect(legend).toBeHidden();
  });

  test("the shortcuts dialog is the shell's: the file keys first, the chrome's zoom keys once", async ({
    page,
  }) => {
    await openExample(page);

    await (await openMenu(page)).locator('[data-menu-id="keyboard-shortcuts"]').click();
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/cd-shell-dialog/);
    await expect(page.locator("dialog.cm-shortcuts")).toHaveCount(0);
    await expect(dialog.locator("h3")).toHaveText(["File", "View", "Edit", "Tools"]);
    await expect(dialog.getByRole("row", { name: /Open…/ })).toContainText(/(⌘|Ctrl\+)O/);
    await expect(dialog.getByRole("row", { name: /Export as JSON/ })).toContainText(/(⌘|Ctrl\+)S/);
    await expect(dialog.locator("[data-chrome-key]")).toHaveCount(4);
    await expect(dialog.getByRole("table", { name: "View" }).getByRole("row")).toHaveCount(4);

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
  });

  test("the shortcuts dialog opens from the keyboard, keeps the focus inside and gives it back on Escape", async ({
    page,
  }) => {
    await openExample(page);
    const trigger = page.locator('[data-chrome="menu"]');
    await trigger.focus();

    await page.keyboard.press("Enter");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    for (let tab = 0; tab < 4; tab++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(
        true,
      );
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the legal line names Miragon GmbH and keeps Impressum and Datenschutz German", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForApp(page);

    const legal = page.locator('[data-chrome="legal"]');
    const year = new Date().getFullYear();
    await expect(legal.getByRole("link", { name: `© ${year} Miragon GmbH` })).toHaveAttribute(
      "href",
      "https://www.miragon.io/",
    );
    for (const [name, href] of [
      ["Impressum", "https://www.miragon.io/impressum/"],
      ["Datenschutz", "https://www.miragon.io/datenschutz/"],
    ] as const) {
      const link = legal.getByRole("link", { name });
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("lang", "de");
    }
    await expect(legal.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/Miragon/modeler-suite/tree/main/modelers/context-maps",
    );
  });

  test("a link pasted into the open tab replaces the map, with Undo", async ({ page }) => {
    await openMap(page, SAMPLE_DOCUMENT);
    const example = await mapText(page);

    const pasted = mapLink(MAP_WITH_FINDINGS);
    await page.evaluate(
      (hash) => {
        location.hash = hash;
      },
      pasted.slice(pasted.indexOf("#") + 1),
    );

    await expect.poll(async () => (await exportMap(page)).title).toBe("Findings");
    await toast(page, "Map replaced").getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => mapText(page)).toBe(example);
  });
});
