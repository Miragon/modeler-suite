import { expect, test } from "@playwright/test";
import {
  appliedEdits,
  canvasText,
  documentText,
  EXAMPLE_BOARD,
  EXAMPLE_MODELS,
  expectPageSheets,
  fileWrites,
  modelsReady,
  MODELS_READY_MS,
  openWebview,
  pickerModels,
  postedMessages,
  problemsOf,
  toolbarButton,
} from "./support/webview.js";

/**
 * The board file between the webview and VS Code's document, through the extension's real
 * plumbing: the shell's `registerModelerEditor` with the board editor's own options, in the page,
 * against the shell's stand-in for VS Code's documents. The board file is the document, so every
 * change on the canvas is one minimal edit of it, and VS Code's own changes (undo, a text editor
 * beside the board, Git) come back as updates.
 */

test.describe.configure({ timeout: 2 * MODELS_READY_MS });

const lines = (text: string): string[] => text.split("\n");

test("the init shows the example inside the shell, with its seven models ready and nothing written", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);

  // the board stands in the shell's canvas slot, and the shell's chrome around it
  await expect(page.locator(".cd-shell .cd-shell-canvas .board-root")).toHaveCount(1);
  await expect(page.locator('.cd-shell [data-chrome="menu"]')).toBeVisible();
  await expect(page.locator('.cd-shell [data-chrome="zoom"]')).toBeVisible();
  await expectPageSheets(page);

  // one editor per notation of the suite, each from its own file
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
  // the picker offers the repository's models: the list the extension told after the hello
  expect(await pickerModels(page)).toEqual([...EXAMPLE_MODELS]);
  // and the picture, whose bytes came over the same pipe
  const picture = page.locator('.board-image[data-missing="false"] img');
  await expect(picture).toHaveCount(1);
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  // one API, one hello and one ready: the page opened its files and its document once
  const posted = await postedMessages(page);
  expect(posted.filter((message) => message.type === "ready")).toHaveLength(1);
  expect(posted.filter((message) => message.type === "board.hello")).toHaveLength(1);
  expect(posted.filter((message) => message.type === "board.text.open")).toHaveLength(7);
  // opening writes nothing: neither the board file nor a model
  expect(await documentText(page)).toBe(EXAMPLE_BOARD);
  expect(await canvasText(page)).toBe(EXAMPLE_BOARD);
  expect(await appliedEdits(page)).toEqual([]);
  expect(await fileWrites(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test("a click on Group is one applied edit of one added line, and VS Code's undo brings the canvas back", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  await expect(page.locator(".board-group")).toHaveCount(1);

  await toolbarButton(page, "Group").click();
  await expect(page.locator(".board-group")).toHaveCount(2);
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(1);

  const [edit] = await appliedEdits(page);
  // an insertion of one whole line, nothing replaced
  expect(edit?.path).toBe("/repository/example.board");
  expect(edit?.start).toEqual(edit?.end);
  expect(edit?.start.character).toBe(0);
  expect(lines(edit?.text ?? "")).toHaveLength(2);
  expect(edit?.text.endsWith("\n")).toBe(true);
  expect(JSON.parse(lines(edit?.text ?? "")[0] ?? "")).toMatchObject({
    kind: "node",
    type: "group",
  });
  // the document has the fixture's lines and the new one
  const written = await documentText(page);
  expect(lines(written)).toHaveLength(lines(EXAMPLE_BOARD).length + 1);
  expect(lines(EXAMPLE_BOARD).filter((line) => !lines(written).includes(line))).toEqual([]);
  expect(await canvasText(page)).toBe(written);

  // VS Code's undo of the document: the canvas follows and writes nothing back
  expect(await page.evaluate(() => window.vscodeHost?.host.undo(window.vscodeHost.document))).toBe(
    true,
  );
  await expect(page.locator(".board-group")).toHaveCount(1);
  await expect.poll(() => canvasText(page)).toBe(EXAMPLE_BOARD);
  expect(await documentText(page)).toBe(EXAMPLE_BOARD);
  expect(await appliedEdits(page)).toHaveLength(1);
  // the models were never touched, and still stand
  await modelsReady(page);
  expect(await fileWrites(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test("an invalid text from VS Code locks the board and names the line, and a valid one unlocks it", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  const slot = page.locator(".cd-shell-canvas");
  const status = page.locator('[data-chrome="status"]');
  await expect(status).toBeHidden();

  const brokenLine = lines(EXAMPLE_BOARD).length;
  await page.evaluate(
    (text) => window.vscodeHost?.host.replaceText(window.vscodeHost.document, text),
    `${EXAMPLE_BOARD}{"id":"n_broken" "kind"}\n`,
  );
  await expect.poll(() => slot.evaluate((element: HTMLElement) => element.inert)).toBe(true);
  await expect(status).toBeVisible();
  await expect(status).toHaveText(
    "This file isn't a valid board right now. The board shows the last valid version and " +
      `is read-only until you fix the text. Line ${brokenLine} is no JSON.`,
  );
  // the last valid version stays in sight
  await expect(page.locator(".board-group")).toHaveCount(1);
  expect(await canvasText(page)).toBe(EXAMPLE_BOARD);
  // a real click where the Group button stands reaches nothing, and nothing is written over
  // the text somebody repairs
  const group = await toolbarButton(page, "Group").boundingBox();
  if (!group) throw new Error("the toolbar has no Group button");
  await page.mouse.click(group.x + group.width / 2, group.y + group.height / 2);
  await expect(page.locator(".board-group")).toHaveCount(1);
  expect(await appliedEdits(page)).toEqual([]);

  // the repair: the fixture with one more note, on the line a board file has it on (by its id)
  const note =
    '{"height":160,"id":"n_zz_repaired","kind":"node","text":"Repaired.","type":"text","width":280,"x":0,"y":1300,"z":"l"}';
  const repaired = `${EXAMPLE_BOARD}${note}\n`;
  await page.evaluate(
    (text) => window.vscodeHost?.host.replaceText(window.vscodeHost.document, text),
    repaired,
  );
  await expect.poll(() => slot.evaluate((element: HTMLElement) => element.inert)).toBe(false);
  await expect(status).toBeHidden();
  await expect(page.locator(".board-text")).toHaveCount(3);
  await expect.poll(() => canvasText(page)).toBe(repaired);

  // and the board writes again
  await toolbarButton(page, "Group").click();
  await expect(page.locator(".board-group")).toHaveCount(2);
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(1);
  expect(problems).toEqual([]);
});

test("a file somebody just created shows the empty-file hint, and its first note is one edit that writes the header too", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true, board: "empty" });
  const hint = page.getByText("Add a note, a group or a model from the toolbar to start.");
  await expect(hint).toBeVisible();
  // an empty board has the repository's models to start from
  await expect.poll(() => pickerModels(page)).toEqual([...EXAMPLE_MODELS]);
  expect(await documentText(page)).toBe("");
  expect(await appliedEdits(page)).toEqual([]);

  await toolbarButton(page, "Text").click();
  await expect(page.locator(".board-text")).toHaveCount(1);
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(1);
  await expect(hint).toBeHidden();
  const [edit] = await appliedEdits(page);
  expect([edit?.start, edit?.end]).toEqual([
    { line: 0, character: 0 },
    { line: 0, character: 0 },
  ]);
  const written = lines(edit?.text ?? "");
  expect(written).toHaveLength(3);
  expect(JSON.parse(written[0] ?? "")).toMatchObject({ format: "structured-model", version: 1 });
  expect(JSON.parse(written[1] ?? "")).toMatchObject({ kind: "node", type: "text" });
  expect(written[2]).toBe("");
  expect(await documentText(page)).toBe(edit?.text);
  expect(await canvasText(page)).toBe(edit?.text);

  // VS Code's undo empties the file again, and the board with it
  await page.evaluate(() => window.vscodeHost?.host.undo(window.vscodeHost.document));
  await expect(page.locator(".board-text")).toHaveCount(0);
  await expect(hint).toBeVisible();
  expect(await documentText(page)).toBe("");
  expect(await appliedEdits(page)).toHaveLength(1);
  expect(problems).toEqual([]);
});
