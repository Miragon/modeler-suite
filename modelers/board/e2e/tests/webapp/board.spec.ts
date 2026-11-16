import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { dragFile, panePoint } from "../support/input.js";

/**
 * The web app as a page: the start screen of the shell's web column, the example repository on
 * the board with every model drawn by its own modeler, a board of its own, and what only a real
 * page has: the browser's own storage, a reload, the browser's file dialog, a download that
 * lands on a disk, and a window of another size.
 */

// The first visit loads the seven renderers from their sources through the dev server.
const MODELS_READY_MS = 90_000;

test.describe.configure({ timeout: 2 * MODELS_READY_MS });

// Chromium's line for a ResizeObserver that could not deliver in one frame: no error of the page.
const RESIZE_OBSERVER = "ResizeObserver loop completed with undelivered notifications.";

const TEAM_BOARD = [
  '{"format":"structured-model","meta":{"title":"Team board","version":1},"version":1}',
  '{"height":160,"id":"n_note","kind":"node","text":"From a disk","type":"text","width":240,"x":0,"y":0,"z":"a"}',
  '{"file":"models/tea.owm","height":540,"id":"n_tea","kind":"node","type":"model","width":800,"x":320,"y":0,"z":"b"}',
  "",
].join("\n");

/** uncaught errors and console.error lines of the page, collected from before it loads */
function problemsOf(page: Page): string[] {
  const problems: string[] = [];
  const report = (problem: string): void => {
    if (!problem.includes(RESIZE_OBSERVER)) problems.push(problem);
  };
  page.on("pageerror", (error) => report(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") report(`console.error: ${message.text()}`);
  });
  return problems;
}

const startScreen = (page: Page): Locator => page.locator('[data-chrome="empty-state"]');
const toast = (page: Page, text: string): Locator =>
  page.locator(".cd-shell-toast-text", { hasText: text });

/** a fresh page: the start screen, with the board's own chrome out of sight behind it */
async function freshPage(page: Page): Promise<void> {
  await page.goto("/");
  await expect(startScreen(page)).toBeVisible({ timeout: MODELS_READY_MS });
}

async function modelsReady(page: Page): Promise<void> {
  await expect(page.locator('.board-engine[data-embed-state="ready"]')).toHaveCount(7, {
    timeout: MODELS_READY_MS,
  });
  await expect(page.locator(".board-engine")).toHaveCount(7);
}

async function showExample(page: Page): Promise<void> {
  await freshPage(page);
  await page.getByRole("button", { name: "Show example" }).click();
  await modelsReady(page);
}

async function chooseFromMenu(page: Page, entry: string): Promise<void> {
  await page.locator('[data-chrome="menu"]').click();
  await page.getByRole("menuitem", { name: entry }).click();
}

/** the open board's text, as the page's app hands it out for the console and for this suite */
const boardText = (page: Page): Promise<string> =>
  page.evaluate(() =>
    (
      globalThis as unknown as {
        __boardApp: { editor(): { modeler: { exportText(): string } } };
      }
    ).__boardApp
      .editor()
      .modeler.exportText(),
  );

interface BoardView {
  x: number;
  y: number;
  zoom: number;
}

/** the open board's view; undefined in the moment between two documents */
const boardView = (page: Page): Promise<BoardView | undefined> =>
  page.evaluate(() => {
    const { __boardApp: app } = globalThis as unknown as {
      __boardApp: { editor(): { modeler: { getViewState(): unknown } } };
    };
    try {
      return app.editor().modeler.getViewState() as { x: number; y: number; zoom: number };
    } catch {
      return undefined;
    }
  });

/** what the page keeps of the open document's view in the browser's storage */
const keptView = (page: Page): Promise<unknown> =>
  page.evaluate(() => {
    const kept = window.localStorage.getItem("miragon-board:open-state");
    return kept === null ? undefined : (JSON.parse(kept) as { boardView?: unknown }).boardView;
  });

async function addNote(page: Page, text: string): Promise<void> {
  const notes = page.locator(".board-text");
  const before = await notes.count();
  await page.getByRole("button", { name: "Text" }).click();
  await expect(notes).toHaveCount(before + 1);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
  await expect(page.locator(".board-text__body", { hasText: text })).toHaveCount(1);
}

/** the px² two elements share on screen */
async function overlap(first: Locator, second: Locator): Promise<number> {
  const [a, b] = [await first.boundingBox(), await second.boundingBox()];
  if (!a || !b) throw new Error("an element that is measured has no box");
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

test("a fresh page starts on the start screen, with the legal line and nothing kept", async ({
  page,
}) => {
  const problems = problemsOf(page);

  await freshPage(page);

  await expect(startScreen(page).getByRole("heading", { level: 1 })).toHaveText("Modeler Board");
  await expect(startScreen(page).getByRole("button")).toHaveText([
    "New diagram",
    "Show example",
    "Open a file…",
  ]);
  // the mark is a file of the public folder: it is served, and drawn
  const mark = startScreen(page).locator("img");
  await expect
    .poll(() => mark.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator(".board-toolbar")).toBeHidden();
  await expect(page.locator('[data-chrome="menu"]')).toBeHidden();
  await expect(page.locator('[data-chrome="legal"]').getByRole("link")).toHaveText([
    /^© \d{4} Miragon GmbH$/,
    "Impressum",
    "Datenschutz",
    "GitHub",
  ]);
  await expect(page).toHaveTitle("Modeler Board");
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  // the page's icon is a file of the public folder as well
  expect((await page.request.get("/favicon.svg")).headers()["content-type"]).toContain("image/svg");
  // the mode markup the build writes is the dev server's too
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    /^#[0-9A-F]{6}$/,
  );
  expect(problems).toEqual([]);
});

test("the example opens with its seven models ready, its picture drawn and no page error", async ({
  page,
}) => {
  const problems = problemsOf(page);

  await showExample(page);

  // one editor per notation of the suite, each on its own canvas
  await expect(page.locator(".board-engine svg")).not.toHaveCount(0);
  const kinds = await page.locator(".board-node__notation").allTextContents();
  expect([...kinds].sort()).toEqual([
    "Business Model Canvas",
    "C4 model",
    "Context Map",
    "Event Storming",
    "Team Topology",
    "Value Chain",
    "Wardley Map",
  ]);
  const picture = page.locator('.board-image[data-missing="false"] img');
  await expect(picture).toHaveCount(1);
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator(".board-text")).toHaveCount(2);
  await expect(page.locator(".board-group")).toHaveCount(1);
  await expect(page).toHaveTitle("example.board · Modeler Board");
  expect(problems).toEqual([]);
});

test("a change is there after a reload, and the reset brings the example back", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await showExample(page);
  await expect(page.locator(".board-text")).toHaveCount(2);

  await page.getByRole("button", { name: "Text" }).click();
  await expect(page.locator(".board-text")).toHaveCount(3);

  // the example was open when the page went: it is open again, without the start screen
  await page.reload();
  await modelsReady(page);
  await expect(startScreen(page)).toBeHidden();
  await expect(page.locator(".board-text")).toHaveCount(3);

  await chooseFromMenu(page, "Reset the example");
  await expect(toast(page, "Example reset")).toBeVisible();
  await modelsReady(page);
  await expect(page.locator(".board-text")).toHaveCount(2);

  // what the reset took is offered back
  await page.getByRole("button", { name: "Undo" }).click();
  await modelsReady(page);
  await expect(page.locator(".board-text")).toHaveCount(3);

  // the reset by the page's address, as a link from outside asks for it
  await page.goto("/?reset");
  await modelsReady(page);
  await expect(page.locator(".board-text")).toHaveCount(2);
  // the request is taken out of the address: another reload must not reset again
  expect(new URL(page.url()).search).toBe("");
  expect(problems).toEqual([]);
});

test("New diagram gives an empty board, and a reload keeps it once it holds a note", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await freshPage(page);

  await page.getByRole("button", { name: "New diagram" }).click();

  await expect(startScreen(page)).toBeHidden();
  await expect(page.locator(".board-toolbar")).toBeVisible();
  await expect(page.locator(".cd-shell-hint")).toHaveText(
    "Add a note or a group from the toolbar to start.",
  );
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  // an empty board is not kept: a reload starts over
  await page.reload();
  await expect(startScreen(page)).toBeVisible({ timeout: MODELS_READY_MS });

  await page.getByRole("button", { name: "New diagram" }).click();
  await addNote(page, "Kept over a reload");
  await page.reload();

  await expect(page.locator(".board-text__body", { hasText: "Kept over a reload" })).toHaveCount(
    1,
    {
      timeout: MODELS_READY_MS,
    },
  );
  await expect(startScreen(page)).toBeHidden();
  // a board without a repository: its model picker has nothing, and the page says why
  await page.locator(".board-toolbar__models").focus();
  await expect(toast(page, "This board has no repository behind it")).toBeVisible();
  expect(problems).toEqual([]);
});

test("Open takes a board file from the disk, from the start screen and from the menu", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await freshPage(page);

  const fromTheCard = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open a file…" }).click();
  const chooser = await fromTheCard;
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles({
    name: "team.board",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(TEAM_BOARD),
  });

  await expect(page.locator(".board-text__body", { hasText: "From a disk" })).toHaveCount(1);
  await expect(startScreen(page)).toBeHidden();
  await expect(page).toHaveTitle("team.board · Modeler Board");
  expect(await boardText(page)).toBe(TEAM_BOARD);
  // the model is a file of the repository the board came from: its node says so
  await expect(
    page.locator('.board-engine[data-embed-state="failed"] > .board-host-state'),
  ).toHaveText(
    "This file could not be opened. This board was opened as a single file. Its models are files of the repository it came from, and this page has only the board.",
    { timeout: MODELS_READY_MS },
  );
  await expect(toast(page, "“team.board” was opened as a single file")).toBeVisible();

  // a file that is no board leaves the board as it is
  const fromTheMenu = page.waitForEvent("filechooser");
  await chooseFromMenu(page, "Open…");
  await (
    await fromTheMenu
  ).setFiles({
    name: "tea.owm",
    mimeType: "text/plain",
    buffer: Buffer.from("title Tea Shop\n"),
  });

  await expect(
    toast(page, "Couldn't read “tea.owm”. Line 1 is no JSON. Check that it is a .board file."),
  ).toBeVisible();
  expect(await boardText(page)).toBe(TEAM_BOARD);
  await expect(page).toHaveTitle("team.board · Modeler Board");

  // the open board is there after a reload, with the name of its file
  await page.reload();
  await expect(page.locator(".board-text__body", { hasText: "From a disk" })).toHaveCount(1, {
    timeout: MODELS_READY_MS,
  });
  await expect(page).toHaveTitle("team.board · Modeler Board");
  expect(problems).toEqual([]);
});

test("the download's bytes are the board's text, from the menu and by the key", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await freshPage(page);
  const opening = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open a file…" }).click();
  await (
    await opening
  ).setFiles({
    name: "team.board",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(TEAM_BOARD),
  });
  await expect(page.locator(".board-text__body", { hasText: "From a disk" })).toHaveCount(1);
  await addNote(page, "Größe & Übergabe, “quoted”");
  const text = await boardText(page);
  expect(text).not.toBe(TEAM_BOARD);

  const fromTheMenu = page.waitForEvent("download");
  await chooseFromMenu(page, "Export as .board");
  const first = await fromTheMenu;

  expect(first.suggestedFilename()).toBe("team.board");
  expect((await readFile(await first.path())).equals(Buffer.from(text, "utf8"))).toBe(true);
  await expect(toast(page, "Exported team.board.")).toBeVisible();

  // the key the menu shows beside the entry
  const byTheKey = page.waitForEvent("download");
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 300 } });
  await page.keyboard.press("Control+s");
  const second = await byTheKey;

  expect(second.suggestedFilename()).toBe("team.board");
  expect((await readFile(await second.path())).toString("utf8")).toBe(await boardText(page));

  // the example leaves as a file too, under its own name
  await chooseFromMenu(page, "Show example");
  await modelsReady(page);
  const ofTheExample = page.waitForEvent("download");
  await chooseFromMenu(page, "Export as .board");
  const third = await ofTheExample;
  expect(third.suggestedFilename()).toBe("example.board");
  expect((await readFile(await third.path())).toString("utf8")).toBe(await boardText(page));
  expect(problems).toEqual([]);
});

test("a reload comes back to the view the board was left at, and the example as it was starts fitted", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await showExample(page);
  // the first view is the fit: the example does not fit at 100 %
  await expect.poll(async () => (await boardView(page))?.zoom).toBeLessThan(1);
  const fitted = await boardView(page);
  expect(await keptView(page)).toBeUndefined();

  await page.locator('[data-zoom="actual"]').click();
  await expect.poll(async () => (await boardView(page))?.zoom).toBe(1);
  const left = await boardView(page);
  // kept with the board in the browser once it rested
  await expect.poll(() => keptView(page)).toEqual(left);

  await page.reload();
  await modelsReady(page);

  await expect.poll(() => boardView(page)).toEqual(left);
  await expect(page.locator('[data-zoom="actual"]')).toHaveText("100%");
  expect(await keptView(page)).toEqual(left);

  // the example as it was is another document: it starts fitted, and nothing is kept of a view
  await chooseFromMenu(page, "Reset the example");
  await modelsReady(page);
  await expect.poll(() => boardView(page)).toEqual(fitted);
  expect(await keptView(page)).toBeUndefined();
  expect(problems).toEqual([]);
});

test("a picture dropped onto the example is a file of its repository, and is there after a reload", async ({
  page,
}, testInfo) => {
  const problems = problemsOf(page);
  const sketch = testInfo.outputPath("sketch.svg");
  writeFileSync(
    sketch,
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30"/></svg>',
  );
  await showExample(page);
  const pictures = page.locator('.board-image[data-missing="false"] img');
  await expect(pictures).toHaveCount(1);
  const at = await panePoint(page);
  // a real drag of a file of the disk, with no key held: a browser hands the page every drop
  const drag = await dragFile(page, sketch);

  await drag.enter(at);
  await drag.over(at);
  await expect(page.locator(".board-drop-hint")).toContainText("Drop to add an image");
  await drag.drop(at);

  await expect(pictures).toHaveCount(2);
  await expect(page.locator(".board-drop-hint")).toHaveCount(0);
  await expect(page.locator(".board-notice", { hasText: "assets/sketch.svg" })).toHaveCount(1);
  // still the app: the browser did not leave the page for the dropped file
  await expect(page).toHaveTitle("example.board · Modeler Board");

  await page.reload();
  await modelsReady(page);
  await expect(pictures).toHaveCount(2);
  await expect
    .poll(() =>
      pictures.evaluateAll((all) => all.every((img) => (img as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);
  expect(problems).toEqual([]);
});

for (const width of [600, 400]) {
  test(`a window of ${width} px: no horizontal scroll, and the shell's column clear of the board's toolbar`, async ({
    page,
  }, testInfo) => {
    const problems = problemsOf(page);
    await page.setViewportSize({ width, height: 800 });
    await showExample(page);
    // the toast of the example has gone: nothing but the standing chrome is measured
    await expect(page.locator(".cd-shell-toast")).toHaveCount(0, { timeout: 15_000 });

    const scroll = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      window: window.innerWidth,
    }));
    expect(scroll).toEqual({ page: 0, body: 0, window: width });

    const toolbar = page.locator(".board-toolbar");
    const column = {
      menu: page.locator('[data-chrome="menu"]'),
      zoom: page.locator('[data-chrome="zoom"]'),
      legal: page.locator('[data-chrome="legal"]'),
      attribution: page.locator(".react-flow__attribution"),
    };
    for (const [name, island] of Object.entries(column)) {
      await expect(island, name).toBeVisible();
      expect([name, await overlap(toolbar, island)]).toEqual([name, 0]);
      const box = await island.boundingBox();
      expect([name, (box?.x ?? -1) >= 0, (box?.x ?? 0) + (box?.width ?? 0) <= width]).toEqual([
        name,
        true,
        true,
      ]);
    }
    // the islands of the bottom row stand clear of each other, however the row is stacked
    expect(await overlap(column.zoom, column.legal)).toBe(0);
    expect(await overlap(column.attribution, column.zoom)).toBe(0);
    expect(await overlap(column.attribution, column.legal)).toBe(0);
    const bar = await toolbar.boundingBox();
    expect((bar?.x ?? -1) >= 64 && (bar?.x ?? 0) + (bar?.width ?? 0) <= width).toBe(true);
    // every control of the toolbar is in the window, whatever row it wrapped into
    for (const control of await toolbar.locator("button:visible, select:visible").all()) {
      const box = await control.boundingBox();
      expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= width).toBe(true);
    }

    await page.screenshot({ path: testInfo.outputPath(`narrow-${width}.png`) });
    expect(problems).toEqual([]);
  });
}
