import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The webview test page as a test drives it: `webview/webview-test.html`, which runs the
 * extension's webview inside the shell's VS Code stub. With `host` the extension's own editor
 * options run in the page as well, against the shell's stand-in for VS Code and a repository in
 * memory that holds the example folder.
 */

export const WIDE = { width: 1280, height: 900 } as const;

/** The first visit loads the seven renderers from their sources through the dev server. */
export const MODELS_READY_MS = 90_000;

const EXAMPLE_FOLDER = fileURLToPath(new URL("../../../../example/", import.meta.url));

/** The example's board file, the document the page opens. */
export const EXAMPLE_BOARD = readFileSync(join(EXAMPLE_FOLDER, "example.board"), "utf8");

/** A model of the example by its repository-relative path, as the folder has it. */
export const exampleText = (path: string): string =>
  readFileSync(join(EXAMPLE_FOLDER, path), "utf8");

/** Every model of the example, repository-relative. */
export const EXAMPLE_MODELS: readonly string[] = readdirSync(join(EXAMPLE_FOLDER, "models"))
  .map((name) => `models/${name}`)
  .sort();

/** The board file's own path in the repository in memory, which holds it like every other file. */
export const BOARD_FILE = "example.board";

export const TEA = "models/tea.owm";
export const WARDLEY_NODE = "n_wardley_map";

export interface OpenOptions {
  size?: { width: number; height: number } | undefined;
  /** The board file's first text: the example (default) or a file somebody just created. */
  board?: "example" | "empty" | undefined;
  /** Run the extension's plumbing in the page: a real document and a repository in memory. */
  host?: boolean | undefined;
}

/** Opens the webview as VS Code would and resolves once the first `init` import has settled. */
export async function openWebview(page: Page, options: OpenOptions = {}): Promise<void> {
  await page.setViewportSize(options.size ?? WIDE);
  const search = new URLSearchParams({ theme: "light" });
  if (options.board) search.set("board", options.board);
  if (options.host) search.set("host", "");
  await page.goto(`/webview-test.html?${search.toString()}`);
  await page.waitForFunction(() => window.webviewReady === true, undefined, {
    timeout: MODELS_READY_MS,
  });
}

/** The model nodes' editors in the state `ready`. */
export const readyEngines = (page: Page): Locator =>
  page.locator('.board-engine[data-embed-state="ready"]');

export async function modelsReady(page: Page, count = 7): Promise<void> {
  await expect(readyEngines(page)).toHaveCount(count, { timeout: MODELS_READY_MS });
}

// Chromium's line for a ResizeObserver that could not deliver in one frame: no error of the page.
const RESIZE_OBSERVER = "ResizeObserver loop completed with undelivered notifications.";

/** Uncaught errors and console.error lines of the page, collected from before it loads. */
export function problemsOf(page: Page): string[] {
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

/** What the VS Code stub recorded since it was installed, without Chromium's ResizeObserver line. */
export async function stubFailures(page: Page): Promise<{ csp: unknown[]; errors: string[] }> {
  const { csp, errors } = await page.evaluate(() => {
    const stub = window.__modelerShellVsCodeStub;
    if (!stub) throw new Error("the page has no VS Code stub");
    return { csp: [...stub.cspViolations()], errors: [...stub.errors()] };
  });
  return { csp, errors: errors.filter((error) => !error.includes(RESIZE_OBSERVER)) };
}

/**
 * The sheets the webview's entry loads, each by what it does to the page: the shell's puts its
 * zoom panel into the window's bottom right corner and its menu trigger into the top left one;
 * the three rules of the board under the shell start the board's toolbar beside that trigger and
 * take the board's own zoom control away; the base's preview rule hides the chrome of an editor
 * whose model is not armed.
 */
export async function expectPageSheets(page: Page): Promise<void> {
  const boxOf = async (selector: string) => {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`nothing visible matches ${selector}`);
    return box;
  };
  const view = page.viewportSize() ?? WIDE;
  const zoom = await boxOf('.cd-shell [data-chrome="zoom"]');
  expect(view.width - (zoom.x + zoom.width)).toBe(12);
  expect(view.height - (zoom.y + zoom.height)).toBe(12);
  const trigger = await boxOf('.cd-shell [data-chrome="menu"]');
  const toolbar = await boxOf(".board-toolbar");
  expect([trigger.x, trigger.y]).toEqual([12, 12]);
  expect(toolbar.x).toBe(trigger.x + trigger.width + 12);
  await expect(page.locator('.board-toolbar__group[aria-label="Zoom"]')).toBeHidden();
  await expect(toolbarButton(page, "Group")).toBeVisible();

  const chrome = page.locator(
    '.board-engine[data-armed="false"] .djs-container > :not(svg):not(.djs-overlay-container)',
  );
  expect(await chrome.count()).toBeGreaterThan(0);
  expect(
    await chrome.evaluateAll(
      (parts) => parts.filter((part) => getComputedStyle(part).display !== "none").length,
    ),
  ).toBe(0);
}

export interface PostedMessage {
  type: string;
  [key: string]: unknown;
}

/** Everything the webview posted to the extension host so far. */
export function postedMessages(page: Page): Promise<PostedMessage[]> {
  return page.evaluate(
    () => [...(window.__modelerShellVsCodeStub?.posted ?? [])] as PostedMessage[],
  );
}

/** Delivers a host message the way VS Code does: a `message` event on the webview's window. */
export async function postFromHost(page: Page, message: PostedMessage): Promise<void> {
  await page.evaluate((data) => window.postMessage(data, "*"), message);
}

/** One replacement VS Code applied to the board file's document. */
export interface AppliedEdit {
  path: string;
  start: { line: number; character: number };
  end: { line: number; character: number };
  text: string;
}

/** Every edit the extension applied to a document of the stand-in for VS Code, in order. */
export function appliedEdits(page: Page): Promise<AppliedEdit[]> {
  return page.evaluate(() =>
    (window.vscodeHost?.host.appliedEdits ?? []).map((edit) => ({
      path: edit.uri.path,
      start: { line: edit.range.start.line, character: edit.range.start.character },
      end: { line: edit.range.end.line, character: edit.range.end.character },
      text: edit.text,
    })),
  );
}

/** The board file as VS Code's document has it. */
export const documentText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    if (!window.vscodeHost) throw new Error("the page runs without the host's plumbing");
    return window.vscodeHost.document.getText();
  });

/** The board file as the canvas would write it now. */
export const canvasText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    if (!window.editor) throw new Error("the editor is not mounted");
    return window.editor.modeler.exportText();
  });

/** A file of the repository in memory, as the place that keeps the files has it. */
export const fileText = (page: Page, path: string): Promise<string | undefined> =>
  page.evaluate((file) => window.vscodeHost?.backend.textOf(file), path);

/** The path of every write a page made into the repository in memory, in order. */
export const fileWrites = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window.vscodeHost?.backend.writes ?? []).map((write) => write.path));

/** Everything the repository in memory lists. */
export const listedFiles = (page: Page): Promise<string[]> =>
  page.evaluate(() => [...(window.vscodeHost?.backend.list() ?? [])]);

export const toolbarButton = (page: Page, label: string): Locator =>
  page.locator(".board-toolbar button").filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) });

/** The files the toolbar's picker offers as models, repository-relative. */
export const pickerModels = (page: Page): Promise<string[]> =>
  page
    .locator("select.board-toolbar__models option:not([disabled])")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));

/** The id of the model that is armed, empty while none is. */
export const armedNode = (page: Page): Promise<string | null> =>
  page.locator("[data-board-done]").getAttribute("data-board-done");

/** The middle of an element once two looks in a row find it in the same place. */
export async function centreAtRest(target: Locator): Promise<{ x: number; y: number }> {
  let last = "";
  let centre = { x: 0, y: 0 };
  await expect
    .poll(async () => {
      const box = await target.boundingBox();
      if (!box) return false;
      const now = [box.x, box.y, box.width, box.height].join();
      const rests = now === last;
      last = now;
      centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      return rests;
    })
    .toBe(true);
  return centre;
}

/**
 * Arms a model by a real double-click on its preview and returns its editor's element, which
 * the board then holds in its overlay layer.
 */
export async function arm(page: Page, nodeId: string): Promise<Locator> {
  const body = page.locator(`.react-flow__node[data-id="${nodeId}"] .board-node__body`);
  const at = await centreAtRest(body);
  await page.mouse.dblclick(at.x, at.y);
  await expect.poll(() => armedNode(page)).toBe(nodeId);
  const engine = page.locator(".board-overlay-layer > .board-engine");
  await expect(engine).toHaveCount(1);
  return engine;
}

/** A point that shows the board's bare pane: beside every node and under no chrome. */
export function panePoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    for (let y = window.innerHeight - 120; y > 80; y -= 40) {
      for (let x = 120; x < window.innerWidth - 240; x += 40) {
        if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) {
          return { x, y };
        }
      }
    }
    throw new Error("no point of the board shows its pane");
  });
}
