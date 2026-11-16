import { writeFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  appliedEdits,
  arm,
  armedNode,
  centreAtRest,
  dragFile,
  fileWrites,
  listedFiles,
  modelsReady,
  MODELS_READY_MS,
  openWebview,
  panePoint,
  postedMessages,
  problemsOf,
  SHIFT,
  WARDLEY_NODE,
} from "./support/webview.js";

/**
 * A file dragged onto the board in the webview. VS Code takes a dragged file for itself and
 * opens it in an editor, outside the webview's page, unless Shift is held: only then does the
 * page hear of the drag at all (read from the webview's own script and the workbench of VS Code
 * 1.96.0 and 1.146.0; nothing here runs them). So the drags of these tests hold Shift, as real
 * input: Chromium's own drag events with a file of the disk.
 */

test.describe.configure({ timeout: 2 * MODELS_READY_MS });

const SKETCH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30"/></svg>';

function sketchOnDisk(testInfo: TestInfo): string {
  const file = testInfo.outputPath("sketch.svg");
  writeFileSync(file, SKETCH);
  return file;
}

const pictures = (page: Page) => page.locator('.board-image[data-missing="false"] img');
const hint = (page: Page) => page.locator(".board-drop-hint");
const creates = async (page: Page) =>
  (await postedMessages(page))
    .filter((message) => message.type === "board.file.create")
    .map(({ path, mime }) => ({ path, mime }));

test("a picture dropped with Shift held is stored under assets/ over the pipe, and stands where it was dropped", async ({
  page,
}, testInfo) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  await expect(pictures(page)).toHaveCount(1);
  const before = await listedFiles(page);
  const at = await panePoint(page);
  const drag = await dragFile(page, sketchOnDisk(testInfo));

  // held over the board: the board says what a drop would do, and nothing is stored yet
  await drag.enter(at, SHIFT);
  await drag.over(at, SHIFT);
  await expect(hint(page)).toBeVisible();
  await expect(hint(page)).toContainText("Drop to add an image");
  expect(await creates(page)).toEqual([]);

  await drag.drop(at, SHIFT);

  await expect(pictures(page)).toHaveCount(2);
  await expect(hint(page)).toHaveCount(0);
  expect(await listedFiles(page)).toEqual([...before, "assets/sketch.svg"].sort());
  expect(await creates(page)).toEqual([{ path: "assets/sketch.svg", mime: "image/svg+xml" }]);
  // its node is one line more in the board file's document
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(1);
  const [edit] = await appliedEdits(page);
  expect(JSON.parse((edit?.text ?? "").split("\n")[0] ?? "")).toMatchObject({
    kind: "node",
    type: "image",
    file: "assets/sketch.svg",
  });
  expect(await fileWrites(page)).toEqual([]);
  // where the file was let go: the middle of the new picture is under the pointer
  const dropped = page.locator('.react-flow__node:has(img[alt="sketch.svg"])');
  const middle = await centreAtRest(dropped);
  expect(Math.abs(middle.x - at.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(middle.y - at.y)).toBeLessThanOrEqual(2);
  // the drop left the pointer's next gestures alone: a model is armed by a double-click
  await arm(page, WARDLEY_NODE);
  expect(problems).toEqual([]);
});

test("a file dropped into an armed editor is the editor's: the board shows no hint and stores nothing", async ({
  page,
}, testInfo) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  const engine = await arm(page, WARDLEY_NODE);
  const inside = await centreAtRest(engine);
  const drag = await dragFile(page, sketchOnDisk(testInfo));

  await drag.enter(inside, SHIFT);
  await drag.over(inside, SHIFT);
  await drag.over(inside, SHIFT);
  await expect(hint(page)).toHaveCount(0);
  await drag.drop(inside, SHIFT);

  // the page is still the board, with the model still armed, and nothing went to the extension
  await expect.poll(() => armedNode(page)).toBe(WARDLEY_NODE);
  await page.locator("[data-board-done]").click();
  await expect.poll(() => armedNode(page)).toBe("");
  await expect(pictures(page)).toHaveCount(1);
  expect(await creates(page)).toEqual([]);
  expect(await appliedEdits(page)).toEqual([]);
  expect(await fileWrites(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test("the board's shortcuts name the drop that reaches it in VS Code: with Shift held", async ({
  page,
}) => {
  await openWebview(page, { host: true });
  await page.locator('.cd-shell [data-chrome="menu"]').click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts…" }).click();
  const row = page.locator("dialog[open] tr", { hasText: "Add a picture" });
  await expect(row).toHaveCount(1);
  // a Mac names the key by its sign
  await expect(row).toHaveText(/^Add a picture(Ctrl\+V|⌘V)(Shift\+drop|⇧ drop)$/);
});
