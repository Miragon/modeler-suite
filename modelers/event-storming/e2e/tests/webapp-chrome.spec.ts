import { expect, test, type Page } from "@playwright/test";
import { EXAMPLE_BOARD } from "../../apps/webapp/src/example.js";
import { encodeMapCompressed } from "../../apps/webapp/src/share.js";
import {
  ANNOTATED_BOARD,
  delayGeist,
  expectFittedToContentBounds,
  geistDrawsAnnotations,
} from "./support/shell-kit.js";
import {
  closeDialog,
  exportBoard,
  exportDSL,
  openExample,
  openMenu,
  startScreen,
  waitForViewer,
} from "./support/viewer.js";
import { codeEditors, pressIn } from "./support/code-editors.js";
import {
  PNG_GROUND,
  decodePng,
  lastDrawnSvg,
  readDownload,
  recordImageSources,
} from "./support/png.js";

/**
 * The web app's side of the shell's web chrome: what it hands the shell (menu groups, primary
 * action, legal links, start screen, drop zone) and its own handlers behind them (share link,
 * replace with undo, open, drop, exports, app keys, problems). What the shell guarantees itself
 * runs in webapp-shell-conformance.spec.ts.
 */

const BROKEN_BOARD = [
  "title Broken",
  "event A [100, 100]",
  "event B [abc, 20]",
  "A -> Nowhere",
].join("\n");

/** Issue #50: valid in every field, but `event_b` lies beyond what the canvas can draw. */
const HUGE_BOARD =
  '{"schemaVersion":1,"config":{"title":"Huge"},"elements":[' +
  '{"id":"event_a","label":"Near","position":{"x":100,"y":100},"elementType":"event"},' +
  '{"id":"event_b","label":"Far","position":{"x":1e39,"y":100},"elementType":"event"}' +
  '],"edges":[]}';

async function linkTo(dsl: string): Promise<string> {
  return `/#mz=${await encodeMapCompressed(dsl)}`;
}

async function openLink(page: Page, dsl: string): Promise<void> {
  await page.goto(await linkTo(dsl));
  await waitForViewer(page);
}

function toast(page: Page, text: string | RegExp) {
  return page.locator('[data-chrome="toasts"] .cd-shell-toast').filter({ hasText: text });
}

/** The shell's dialog behind the Help entry (`cd-shell-dialog`), in the chrome's root. */
function shortcutsDialog(page: Page) {
  return page.locator(".cd-shell dialog.cd-shell-shortcuts");
}

function fileInput(page: Page) {
  return page.locator('body > input[type="file"]');
}

async function menuLayout(page: Page): Promise<Array<string | null>> {
  const dropdown = await openMenu(page);
  return dropdown.evaluate((menu) =>
    [...menu.children].map((child) =>
      child.getAttribute("role") === "separator" ? "|" : child.getAttribute("data-menu-id"),
    ),
  );
}

/** A file drag and drop on the page, as the browser delivers one (the drop zone listens on window). */
async function dropFile(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    ({ name, text }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], name, { type: "" }));
      for (const type of ["dragenter", "dragover", "drop"]) {
        document.body.dispatchEvent(
          new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }),
        );
      }
    },
    { name, text },
  );
}

test.describe("webapp: the shell web chrome and the app behind it", () => {
  test("the start screen hides the work chrome until a board starts", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);

    await expect(startScreen(page)).toBeVisible();
    await expect(startScreen(page).getByRole("heading", { level: 1 })).toHaveText(
      "Event Storming Modeler",
    );
    await expect(startScreen(page)).toContainText("Or drop a .storm, .json, or .txt file here");
    await expect(page).toHaveTitle("Event Storming Modeler");
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

  test("a shared link opens its board at once, without the start screen", async ({ page }) => {
    await openLink(page, EXAMPLE_BOARD);

    await expect(startScreen(page)).toBeHidden();
    expect((await exportBoard(page)).config.title).toBe("Order Checkout");
    await expect(page.locator('[data-chrome="primary"]')).toBeVisible();
  });

  test("a shared link opens fitted to the board, the fit insets its only margin", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openLink(page, EXAMPLE_BOARD);
    await expectFittedToContentBounds(page);
  });

  test("a shared link opens fitted to its arrow annotations, though Geist arrives late", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    const delayedFonts = await delayGeist(page);
    await openLink(page, ANNOTATED_BOARD);
    expect(delayedFonts()).toBeGreaterThan(0);
    expect(await geistDrawsAnnotations(page)).toBe(true);
    await expectFittedToContentBounds(page);
  });

  test("Fit to view frames the arrow annotations that reach past every sticky", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLink(page, ANNOTATED_BOARD);
    await page.locator('[data-chrome="zoom"] [data-zoom="in"]').click();
    await page.locator('[data-chrome="zoom"] [data-zoom="fit"]').click();
    await expect(() => expectFittedToContentBounds(page)).toPass();
  });

  test("a link cut off when it was copied shows a danger toast on the start screen", async ({
    page,
  }) => {
    await page.goto("/#mz=!!!not-a-board");
    await waitForViewer(page);

    await expect(startScreen(page)).toBeVisible();
    await expect(toast(page, "Check that you copied the whole link.")).toHaveAttribute(
      "data-status",
      "danger",
    );
  });

  test("the menu holds File, Model, Export and Help; no Appearance, no Undo", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);

    expect(await menuLayout(page)).toEqual([
      "new-diagram",
      "open",
      "show-example",
      "|",
      "level",
      "type-captions",
      "aggregates",
      "|",
      "export-png",
      "export-svg",
      "export-png-transparent",
      "export-json",
      "export-storm",
      "|",
      "keyboard-shortcuts",
    ]);
    const dropdown = page.locator('.cd-shell-menu[role="menu"]');
    await expect(dropdown.locator('[data-menu-id="open"]')).toHaveText(/Open…\s*(⌘|Ctrl\+)O/);
    await expect(dropdown.locator('[data-menu-id="export-storm"]')).toHaveText(
      /Export as \.storm\s*(⌘|Ctrl\+)S/,
    );
    await expect(dropdown.locator('[data-menu-group="appearance"]')).toHaveCount(0);
    await expect(dropdown.getByRole("menuitem", { name: /undo|redo/i })).toHaveCount(0);
  });

  test("Share copies the link, writes it into the address bar and confirms with a toast", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);

    await page.locator('[data-chrome="primary"]').click();

    await expect(toast(page, "Link copied")).toHaveAttribute("data-status", "success");
    // Screen readers hear it through the shell's polite live region.
    await expect(page.locator('.cd-shell-live [role="status"]')).toHaveText("Link copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/#mz=[\w-]+$/);
    expect(copied).toBe(page.url());

    const shared = await context.newPage();
    await shared.goto(copied);
    await waitForViewer(shared);
    expect(await exportDSL(shared)).toBe(await exportDSL(page));
  });

  test("a refused copy points at the address bar", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    await page.evaluate(() => {
      const refuse = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
      Object.assign(navigator.clipboard, { write: refuse, writeText: refuse });
    });

    await page.locator('[data-chrome="primary"]').click();

    await expect(
      toast(page, "Couldn't copy the link. Copy it from the address bar instead."),
    ).toHaveAttribute("data-status", "danger");
    expect(new URL(page.url()).hash).toMatch(/^#mz=/);
  });

  test("replacing a board offers Undo instead of asking first", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    const example = await exportDSL(page);

    const dropdown = await openMenu(page);
    await dropdown.locator('[data-menu-id="new-diagram"]').click();
    await expect.poll(async () => (await exportBoard(page)).elements.length).toBe(0);

    const offer = toast(page, "Board replaced");
    await expect(offer).toBeVisible();
    await offer.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => exportDSL(page)).toBe(example);
    await expect(offer).toBeHidden();
  });

  test("an edit after a replacement withdraws the undo offer", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await expect(toast(page, "Board replaced")).toBeVisible();

    await page.locator('.djs-palette [data-action="create.event"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");

    await expect(toast(page, "Board replaced")).toBeHidden();
    expect((await exportBoard(page)).elements).toHaveLength(1);
  });

  test("Open… reads a .storm file; its warnings go to the pill and its list", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);

    await fileInput(page).setInputFiles({
      name: "broken.storm",
      mimeType: "text/plain",
      buffer: Buffer.from(BROKEN_BOARD),
    });

    await expect.poll(async () => (await exportBoard(page)).config.title).toBe("Broken");
    await expect(
      toast(page, "Imported with 2 warnings. Details under “2 problems” bottom left."),
    ).toBeVisible();
    await expect(toast(page, "Board replaced")).toBeVisible();
    const pill = page.locator('[data-chrome="problems"]');
    await expect(pill).toHaveText("2 problems");

    await pill.click();
    const list = page.locator('[data-chrome="problems-popover"]');
    await expect(list).toBeVisible();
    await expect(list.locator(".cd-shell-problem-location")).toHaveText([
      "Line 3 · event B [abc, 20]",
      "Line 4 · A -> Nowhere",
    ]);
    await expect(list.locator(".cd-shell-problem-message")).toHaveText([
      "Couldn't read this line. It stays in the file unchanged.",
      "This arrow points to “Nowhere”, which isn't on the board.",
    ]);
    // Text rows take the focus too, so the keyboard reads the whole list (WCAG 2.1.1).
    await expect(list.locator(".cd-shell-problem").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(list.locator(".cd-shell-problem").nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(pill).toBeFocused();
  });

  test("a file that is no board shows a danger toast and keeps the board", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    const before = await exportDSL(page);

    await fileInput(page).setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{ "elements": '),
    });

    await expect(
      toast(page, "Couldn't read “bad.json”. Check that it contains a valid Event Storming board."),
    ).toHaveAttribute("data-status", "danger");
    expect(await exportDSL(page)).toBe(before);
  });

  test("a .json board beyond the canvas is refused whole: board and history stay", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    const stickies = async () => (await exportBoard(page)).elements.length;
    const example = await stickies();
    await page.locator('.djs-palette [data-action="create.event"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect.poll(stickies).toBe(example + 1);
    const before = await exportDSL(page);

    await fileInput(page).setInputFiles({
      name: "huge.json",
      mimeType: "application/json",
      buffer: Buffer.from(HUGE_BOARD),
    });

    await expect(
      toast(
        page,
        "Couldn't open “huge.json”. “event_b” lies beyond ±1e38 (position.x 1e+39), too far out for the canvas.",
      ),
    ).toHaveAttribute("data-status", "danger");
    expect(await exportDSL(page)).toBe(before);
    await expect(toast(page, "Board replaced")).toHaveCount(0);
    // The canvas was never cleared, so its own undo still takes back the sticky added above.
    await page.locator(".cd-shell-canvas svg[tabindex]").focus();
    await page.keyboard.press("ControlOrMeta+Z");
    await expect.poll(stickies).toBe(example);
  });

  test("an import that stops half-way puts the previous board and its view back", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    const before = await exportDSL(page);
    const view = () =>
      page.evaluate(() => {
        const box = window.__eventStormingApp!.connection.viewport.getViewbox()!;
        return [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 100));
      });
    const viewBefore = await view();
    // A canvas that gives up on the second sticky, after the import cleared the example away.
    await page.evaluate(() => {
      type Canvas = { addShape(shape: { id: string }, ...rest: unknown[]): unknown };
      const viewer = window.__eventStormingViewer as unknown as { get(name: string): Canvas };
      const canvas = viewer.get("canvas");
      const addShape = canvas.addShape.bind(canvas);
      canvas.addShape = (shape, ...rest) => {
        if (shape.id === "event_boom") throw new Error("The canvas gave up half-way.");
        return addShape(shape, ...rest);
      };
    });

    await fileInput(page).setInputFiles({
      name: "boom.storm",
      mimeType: "text/plain",
      buffer: Buffer.from("title Boom\nevent Fine [0, 0]\nevent Boom [200, 0]\n"),
    });

    await expect(
      toast(
        page,
        "Couldn't read “boom.storm”. Check that it contains a valid Event Storming board.",
      ),
    ).toHaveAttribute("data-status", "danger");
    expect(await exportDSL(page)).toBe(before);
    expect(await view()).toEqual(viewBefore);
    await expect(toast(page, "Board replaced")).toHaveCount(0);
    await expect(page).toHaveTitle("Order Checkout · Event Storming Modeler");
  });

  test("a .storm file dropped on the start screen opens", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);

    await dropFile(page, "checkout.storm", EXAMPLE_BOARD);

    await expect(startScreen(page)).toBeHidden();
    await expect.poll(async () => (await exportBoard(page)).config.title).toBe("Order Checkout");
    await expect(page.locator('[data-chrome="palette"]')).toBeVisible();
  });

  test("the exports download under the board’s name and confirm with a toast", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);

    const expected: ReadonlyArray<[string, string]> = [
      ["export-png", "order-checkout.png"],
      ["export-svg", "order-checkout.svg"],
      ["export-png-transparent", "order-checkout-transparent@4x.png"],
      ["export-json", "order-checkout.json"],
      ["export-storm", "order-checkout.storm"],
    ];
    for (const [id, fileName] of expected) {
      const dropdown = await openMenu(page);
      const download = page.waitForEvent("download");
      await dropdown.locator(`[data-menu-id="${id}"]`).click();
      expect((await download).suggestedFilename()).toBe(fileName);
      await expect(toast(page, `Exported ${fileName}.`)).toBeVisible();
    }
  });

  test("the .storm and JSON exports hold the board", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    const readDownload = async (id: string): Promise<string> => {
      const dropdown = await openMenu(page);
      const download = page.waitForEvent("download");
      await dropdown.locator(`[data-menu-id="${id}"]`).click();
      const stream = await (await download).createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString("utf8");
    };

    expect(await readDownload("export-storm")).toBe(await exportDSL(page));
    const json = JSON.parse(await readDownload("export-json")) as { config: { title: string } };
    expect(json.config.title).toBe("Order Checkout");
  });

  test("a JSON export opens again as the same board, overlapping stickies in their order", async ({
    page,
  }) => {
    // Zeta lies under Alpha; an export sorted by id would swap them.
    const overlapping = "title Overlap\nevent Zeta [300, 300]\nevent Alpha [330, 320]";
    await openLink(page, overlapping);
    const before = await exportDSL(page);
    const dropdown = await openMenu(page);
    const download = page.waitForEvent("download");
    await dropdown.locator('[data-menu-id="export-json"]').click();
    const stream = await (await download).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);

    await fileInput(page).setInputFiles({
      name: "overlap.json",
      mimeType: "application/json",
      buffer: Buffer.concat(chunks),
    });

    await expect(toast(page, "Exported overlap.json.")).toBeVisible();
    await expect.poll(() => exportDSL(page)).toBe(before);
    // Nothing changed, so there is nothing to undo.
    await expect(toast(page, "Board replaced")).toHaveCount(0);
    expect((await exportBoard(page)).elements.map((element) => element.id)).toEqual([
      "event_zeta",
      "event_alpha",
    ]);
  });

  test("Cmd/Ctrl+O opens the file picker and Cmd/Ctrl+S exports the .storm file", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);

    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("ControlOrMeta+O");
    expect((await chooser).isMultiple()).toBe(false);

    const download = page.waitForEvent("download");
    await page.keyboard.press("ControlOrMeta+S");
    expect((await download).suggestedFilename()).toBe("order-checkout.storm");
  });

  test("Cmd/Ctrl+S saves nothing on the start screen, and never reaches the browser", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForViewer(page);
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
    await waitForViewer(page);
    const open = startScreen(page).getByRole("button", { name: "Open a file…" });
    await expect(open).toHaveAttribute("aria-keyshortcuts", /^(Meta|Control)\+O$/);

    const chooser = page.waitForEvent("filechooser");
    await open.click();
    await (
      await chooser
    ).setFiles({
      name: "checkout.storm",
      mimeType: "text/plain",
      buffer: Buffer.from(EXAMPLE_BOARD),
    });

    await expect(startScreen(page)).toBeHidden();
    await expect.poll(async () => (await exportBoard(page)).config.title).toBe("Order Checkout");
  });

  test("Cmd/Ctrl+Z takes back a replaced board while the canvas has nothing to undo", async ({
    page,
  }) => {
    await openLink(page, EXAMPLE_BOARD);
    const example = await exportDSL(page);
    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await expect.poll(async () => (await exportBoard(page)).elements.length).toBe(0);
    await expect(toast(page, "Board replaced")).toBeVisible();

    await page.locator(".cd-shell-canvas svg[tabindex]").focus();
    await page.keyboard.press("ControlOrMeta+Z");

    await expect.poll(() => exportDSL(page)).toBe(example);
    await expect(toast(page, "Board replaced")).toBeHidden();
  });

  test("Cmd/Ctrl+Z in a code editor (EditContext, Monaco) leaves the replaced board alone", async ({
    page,
  }) => {
    await openLink(page, EXAMPLE_BOARD);
    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await expect.poll(async () => (await exportBoard(page)).elements.length).toBe(0);
    await expect(toast(page, "Board replaced")).toBeVisible();

    for (const editor of await codeEditors(page)) {
      expect(await pressIn(editor, "ControlOrMeta+Z")).toBe("free");
    }

    await expect(toast(page, "Board replaced")).toBeVisible();
    expect((await exportBoard(page)).elements).toHaveLength(0);
  });

  test("the tab names the board, and the app alone on the start screen", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await expect(page).toHaveTitle("Event Storming Modeler");

    await openExample(page);
    await expect(page).toHaveTitle("Order Checkout · Event Storming Modeler");

    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await expect(page).toHaveTitle("Event Storming Modeler");
  });

  test("the shell's shortcuts dialog lists the file keys first and returns the focus", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);

    await (await openMenu(page)).locator('[data-menu-id="keyboard-shortcuts"]').click();
    const dialog = shortcutsDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".cd-shell-shortcuts-title")).toHaveText([
      "File",
      "View",
      "Edit",
      "Tools",
    ]);
    await expect(dialog.getByRole("row", { name: /Open…/ })).toContainText(/(⌘|Ctrl\+)O/);
    await expect(dialog.getByRole("row", { name: /Export as .storm/ })).toContainText(
      /(⌘|Ctrl\+)S/,
    );
    // The zoom and fit keys are the chrome's four rows, once: the board's own View rows give way.
    await expect(dialog.locator("[data-chrome-key]")).toHaveCount(4);
    await expect(dialog.getByRole("row", { name: /^Fit/ })).toHaveCount(1);
    expect(await page.locator("dialog.event-storming-shortcuts").count()).toBe(0);

    await closeDialog(dialog, () => page.keyboard.press("Escape"));
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
  });

  test("the shortcuts dialog opens from the keyboard and hands the focus back to the menu", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    const trigger = page.locator('[data-chrome="menu"]');

    await trigger.focus();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator('[data-menu-id="keyboard-shortcuts"]')).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = shortcutsDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    await expect(page.locator('.cd-shell-menu[role="menu"]')).toBeHidden();

    await closeDialog(dialog, () => page.keyboard.press("Escape"));
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the PNG export draws on the paper of guide §10.7 with Geist inside", async ({ page }) => {
    await recordImageSources(page);
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);

    const dropdown = await openMenu(page);
    const download = page.waitForEvent("download");
    await dropdown.locator('[data-menu-id="export-png"]').click();
    const png = await decodePng(page, await readDownload(await download));

    expect(png.corner).toEqual([...PNG_GROUND]);
    await expect(toast(page, "Exported order-checkout.png.")).toBeVisible();
    const drawn = await lastDrawnSvg(page);
    expect(drawn).toMatch(/@font-face\{[^}]*Geist Variable[^}]*url\(["']?data:font\/woff2/);
    expect(await page.locator('[data-chrome="toasts"] [data-status="warning"]').count()).toBe(0);
  });

  test("the 4× transparent PNG has no ground and twice the pixels of the PNG", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    const exportAs = async (id: string) => {
      const download = page.waitForEvent("download");
      await (await openMenu(page)).locator(`[data-menu-id="${id}"]`).click();
      return decodePng(page, await readDownload(await download));
    };

    const plain = await exportAs("export-png");
    const transparent = await exportAs("export-png-transparent");

    expect(transparent.corner[3]).toBe(0);
    expect(transparent.width).toBe(plain.width * 2);
    expect(transparent.height).toBe(plain.height * 2);
  });

  test("a PNG whose Geist could not be embedded is saved and the toast warns about it", async ({
    page,
  }) => {
    await page.route("**/*.woff2", (route) => route.abort());
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);

    const download = page.waitForEvent("download");
    await (await openMenu(page)).locator('[data-menu-id="export-png"]').click();

    expect((await download).suggestedFilename()).toBe("order-checkout.png");
    await expect(
      toast(page, "Exported order-checkout.png in a system font. Geist couldn't be embedded."),
    ).toBeVisible();
    await expect(toast(page, /^Exported order-checkout\.png\.$/)).toHaveCount(0);
  });

  test("a PNG the browser cannot draw is refused with the app's own words", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
    });

    await (await openMenu(page)).locator('[data-menu-id="export-png"]').click();

    await expect(
      toast(page, "Couldn't export the board as PNG. Try again, or export it as SVG."),
    ).toBeVisible();
    await expect(toast(page, "@miragon")).toHaveCount(0);
  });

  // Guide §5.8 (modeler-shell 0.2.2): a pointer click on the chrome hands the keys back to the
  // board, so Event Storming's own keys act at once; Enter leaves the focus on the control.
  test("after a pointer click on + or a palette entry, Delete acts on the board", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    const stickies = () =>
      page.evaluate(() => window.__eventStormingViewer.exportMap().elements.length);
    const canvasHasFocus = () =>
      page.evaluate(
        () =>
          document.activeElement instanceof SVGSVGElement &&
          document.activeElement.closest(".event-storming-container") !== null,
      );
    const before = await stickies();
    await page.locator('.djs-element.djs-shape[data-element-id="event_order_placed"]').click();
    const zoomIn = page.locator('[data-chrome="zoom"] [data-zoom="in"]');
    await zoomIn.click();
    expect(await canvasHasFocus()).toBe(true);
    await page.keyboard.press("Delete");
    await expect.poll(stickies).toBe(before - 1);

    await zoomIn.focus();
    await page.keyboard.press("Enter");
    await expect(zoomIn).toBeFocused();

    await page.locator('[data-chrome="palette"] [data-action="create.event"]').click();
    const canvas = (await page.locator(".cd-shell-canvas").boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height - 160);
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height - 160);
    await expect.poll(stickies).toBe(before);
    expect(await canvasHasFocus()).toBe(true);
    await page.keyboard.press("Delete");
    await expect.poll(stickies).toBe(before - 1);
  });

  // Issue #91: Enter leaves the focus on the palette's Draw entry (guide §5.5), so the tool must
  // still take Escape there.
  test("Escape on the Draw entry cancels the tool that Enter on it started", async ({ page }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    const drawMode = page.locator(".event-storming-container.event-storming-draw-mode");
    const drawEntry = page.locator('[data-chrome="palette"] [data-action="draw-tool"]');

    await drawEntry.focus();
    await page.keyboard.press("Enter");
    await expect(drawMode).toHaveCount(1);
    await expect(drawEntry).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawMode).toHaveCount(0);
    await expect(drawEntry).toBeFocused();
  });

  // Issue #180: Enter on another palette entry is that entry's, so it ends the drawing first and
  // only one tool is on.
  for (const [entryName, action, createdEvents] of [
    ["the Lasso entry", "lasso-tool", 0],
    ["a creating entry", "create.event", 1],
  ] as const) {
    test(`Enter on ${entryName} commits the open line and ends the draw tool`, async ({ page }) => {
      await page.goto("/");
      await waitForViewer(page);
      await openExample(page);
      const countOf = async (elementType: string) =>
        (await exportBoard(page)).elements.filter((element) => element.elementType === elementType)
          .length;
      const drawingsBefore = await countOf("drawing");
      const eventsBefore = await countOf("event");
      const drawMode = page.locator(".event-storming-container.event-storming-draw-mode");
      const palette = page.locator('[data-chrome="palette"]');
      const drawEntry = palette.locator('[data-action="draw-tool"]');

      await drawEntry.focus();
      await page.keyboard.press("Enter");
      await expect(drawMode).toHaveCount(1);
      const canvas = (await page.locator(".cd-shell-canvas").boundingBox())!;
      const y = canvas.y + canvas.height - 160;
      await page.mouse.click(canvas.x + canvas.width / 2 - 60, y);
      await page.mouse.click(canvas.x + canvas.width / 2 + 60, y - 40);

      await palette.locator(`[data-action="${action}"]`).focus();
      await page.keyboard.press("Enter");
      await expect(drawMode).toHaveCount(0);
      await expect(drawEntry).toHaveAttribute("aria-pressed", "false");
      await expect.poll(() => countOf("drawing")).toBe(drawingsBefore + 1);
      await expect.poll(() => countOf("event")).toBe(eventsBefore + createdEvents);
      if (action === "lasso-tool") {
        await expect(palette.locator('[data-action="lasso-tool"]')).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      }
    });
  }

  // Issue #91: while a line is drawn, the chrome keeps its Escape and Enter, and the drawing
  // goes on; on the canvas, Enter still finishes it.
  test("while drawing, Escape closes the menu and the shortcuts dialog and Enter zooms", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForViewer(page);
    await openExample(page);
    const drawings = async () =>
      (await exportBoard(page)).elements.filter((element) => element.elementType === "drawing")
        .length;
    const before = await drawings();
    const drawMode = page.locator(".event-storming-container.event-storming-draw-mode");

    await page.locator('[data-chrome="palette"] [data-action="draw-tool"]').click();
    await expect(drawMode).toHaveCount(1);
    const canvas = (await page.locator(".cd-shell-canvas").boundingBox())!;
    const y = canvas.y + canvas.height - 160;
    await page.mouse.click(canvas.x + canvas.width / 2 - 60, y);
    await page.mouse.click(canvas.x + canvas.width / 2 + 60, y - 40);

    const dropdown = await openMenu(page);
    await page.keyboard.press("Escape");
    await expect(dropdown).toBeHidden();
    await expect(drawMode).toHaveCount(1);

    const zoom = page.locator('[data-chrome="zoom"] [data-zoom="actual"]');
    const zoomBefore = (await zoom.textContent()) ?? "";
    await page.locator('[data-chrome="zoom"] [data-zoom="in"]').focus();
    await page.keyboard.press("Enter");
    await expect(zoom).not.toHaveText(zoomBefore);
    await expect(drawMode).toHaveCount(1);

    await (await openMenu(page)).locator('[data-menu-id="keyboard-shortcuts"]').click();
    const dialog = page.locator(".cd-shell dialog.cd-shell-shortcuts");
    await expect(dialog).toBeVisible();
    await closeDialog(dialog, () => page.keyboard.press("Escape"));
    await expect(dialog).toBeHidden();
    await expect(drawMode).toHaveCount(1);
    expect(await drawings()).toBe(before);

    await page.locator(".cd-shell-canvas svg[tabindex]").focus();
    await page.keyboard.press("Enter");
    await expect(drawMode).toHaveCount(0);
    await expect.poll(drawings).toBe(before + 1);
  });

  test("the legal line names Miragon GmbH and keeps Impressum and Datenschutz German", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForViewer(page);

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
      "https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming",
    );
  });

  test("type captions stay off after a reload, outside the link", async ({ page }) => {
    await openLink(page, EXAMPLE_BOARD);
    const captions = page.locator(".cd-shell-canvas .event-storming-kind-caption");
    await expect(captions.first()).toBeVisible();

    await (await openMenu(page)).locator('[data-menu-id="type-captions"]').click();
    await expect(captions).toHaveCount(0);
    const link = page.url();

    await page.reload();
    await waitForViewer(page);
    expect(page.url()).toBe(link);
    await expect(captions).toHaveCount(0);
    await expect((await openMenu(page)).locator('[data-menu-id="type-captions"]')).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  test("a link pasted into the open tab replaces the board, with Undo", async ({ page }) => {
    await openLink(page, EXAMPLE_BOARD);
    const example = await exportDSL(page);

    const other = await linkTo("title Pasted\nevent Pasted Event [100, 100]");
    await page.evaluate((hash) => {
      location.hash = hash;
    }, other.slice(1));

    await expect.poll(async () => (await exportBoard(page)).config.title).toBe("Pasted");
    await toast(page, "Board replaced").getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => exportDSL(page)).toBe(example);
  });
});
