import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { openWebviewBundle } from "@miragon/modeler-shell/testing/webview-bundle";
import { boardEditorOptions } from "../../../apps/vscode/src/boardEditorOptions.js";
import {
  arm,
  centreAtRest,
  EXAMPLE_BOARD,
  EXAMPLE_MODELS,
  exampleText,
  expectPageSheets,
  MODELS_READY_MS,
  pickerModels,
  postedMessages,
  postFromHost,
  problemsOf,
  readyEngines,
  stubFailures,
  TEA,
  WARDLEY_NODE,
  WIDE,
  type PostedMessage,
} from "./support/webview.js";

/**
 * The webview as the VSIX ships it: apps/vscode built for production, its one script, one sheet
 * and its font files behind the document and the policy the extension writes
 * (`renderWebviewHtml` with the editor's own options). No dev server and no plumbing in the
 * page: the test answers what the page posts, as the extension would.
 */

const APP = fileURLToPath(new URL("../../../apps/vscode", import.meta.url));
const EXAMPLE_FOLDER = fileURLToPath(new URL("../../../example/", import.meta.url));
const PICTURE = "assets/miragon-komet-blau.svg";
const OPTIONS = boardEditorOptions(() => undefined);

// One build for the file, and its tests one after the other in one worker: two builds at once
// would write the same dist.
test.describe.configure({ mode: "serial", timeout: 2 * MODELS_READY_MS });

test.beforeAll(async () => {
  await promisify(execFile)(process.execPath, ["esbuild.config.mjs", "--production"], {
    cwd: APP,
  });
});

async function openShipped(page: Page): Promise<void> {
  await page.setViewportSize(WIDE);
  await openWebviewBundle(page, {
    dist: join(APP, "dist"),
    title: OPTIONS.title,
    requested: { theme: "light" },
    themes: OPTIONS.themes,
    script: OPTIONS.script,
    styles: OPTIONS.styles,
    inlineStyles: OPTIONS.inlineStyles,
  });
}

/** What the extension answers a message of the page with, for the example folder. */
function answerTo(message: PostedMessage): PostedMessage | undefined {
  const { requestId, path } = message;
  switch (message.type) {
    case "ready":
      return { type: "init", text: EXAMPLE_BOARD };
    case "board.hello":
      return { type: "board.paths", paths: [PICTURE, ...EXAMPLE_MODELS] };
    case "board.text.open":
      return {
        type: "board.text.opened",
        requestId,
        path,
        text: exampleText(String(path)),
        readOnly: false,
        version: 1,
      };
    case "board.bytes.read":
      return {
        type: "board.bytes",
        requestId,
        path,
        base64: readFileSync(join(EXAMPLE_FOLDER, String(path))).toString("base64"),
        mime: "image/svg+xml",
      };
    default:
      return undefined;
  }
}

/** Answers every message the page posted since the last call, in the page's order. */
function extensionFor(page: Page): () => Promise<void> {
  let answered = 0;
  return async () => {
    const posted = await postedMessages(page);
    for (const message of posted.slice(answered)) {
      const answer = answerTo(message);
      if (answer) await postFromHost(page, answer);
    }
    answered = posted.length;
  };
}

async function allModelsReady(page: Page, answer: () => Promise<void>): Promise<void> {
  await expect
    .poll(
      async () => {
        await answer();
        return readyEngines(page).count();
      },
      { timeout: MODELS_READY_MS },
    )
    .toBe(7);
}

test("the shipped bundle comes up without an answer, and shows the board with its seven models under the extension's policy", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openShipped(page);

  // Before the extension said a word: the shell and the board stand, and the page asked for
  // its document and its files, once each.
  await expect(page.locator(".cd-shell .cd-shell-canvas .board-root")).toHaveCount(1);
  await expect
    .poll(async () => (await postedMessages(page)).map((message) => message.type).sort())
    .toEqual(["board.hello", "ready"]);
  await expect(page.locator(".board-engine")).toHaveCount(0);

  await allModelsReady(page, extensionFor(page));

  // every notation's own canvas, drawn by code that came in the one script
  for (const engine of await readyEngines(page).all()) {
    await expect(engine.locator(".djs-container > svg")).toHaveCount(1);
  }
  // the picker offers the models the answer to the hello listed
  expect(await pickerModels(page)).toEqual([...EXAMPLE_MODELS]);
  // the picture, from bytes that came as a message: the policy has no connect-src
  const picture = page.locator('.board-image[data-missing="false"] img');
  await expect(picture).toHaveCount(1);
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  // the shell's font, from a file beside the bundle
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.fonts].some(
          (face) => face.status === "loaded" && face.family.includes("Geist"),
        ),
      ),
    )
    .toBe(true);
  // the two chromes as one picture, and no editor's chrome over a preview: the bundle's one
  // sheet holds the shell's, the three rules and the shared base
  await expectPageSheets(page);

  const { csp, errors } = await stubFailures(page);
  expect(csp).toEqual([]);
  expect(errors).toEqual([]);
  expect(problems).toEqual([]);
});

test("an edit in the shipped bundle is one message for that model's file, and none for the board file", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openShipped(page);
  await allModelsReady(page, extensionFor(page));

  const engine = await arm(page, WARDLEY_NODE);
  const water = engine.locator('.djs-shape[data-element-id="cmp_water"]');
  const at = await centreAtRest(water.locator(".djs-hit"));
  await page.mouse.click(at.x, at.y);
  await expect(engine.locator(".djs-shape.selected")).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect(water).toHaveCount(0);

  await expect
    .poll(async () =>
      (await postedMessages(page)).filter((message) => message.type === "board.text.edit"),
    )
    .toHaveLength(1);
  const posted = await postedMessages(page);
  const [edit] = posted.filter((message) => message.type === "board.text.edit");
  expect(edit).toMatchObject({ type: "board.text.edit", path: TEA, version: 1 });
  expect(String(edit?.text)).not.toContain("component Water");
  expect(posted.filter((message) => message.type === "edit")).toEqual([]);

  const { csp, errors } = await stubFailures(page);
  expect(csp).toEqual([]);
  expect(errors).toEqual([]);
  expect(problems).toEqual([]);
});
