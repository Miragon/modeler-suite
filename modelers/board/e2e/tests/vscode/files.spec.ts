import { expect, test, type Page } from "@playwright/test";
import {
  appliedEdits,
  arm,
  armedNode,
  BOARD_FILE,
  canvasText,
  centreAtRest,
  documentText,
  EXAMPLE_BOARD,
  EXAMPLE_MODELS,
  exampleText,
  fileText,
  fileWrites,
  listedFiles,
  modelsReady,
  MODELS_READY_MS,
  openWebview,
  panePoint,
  pickerModels,
  postedMessages,
  problemsOf,
  readyEngines,
  TEA,
  toolbarButton,
  WARDLEY_NODE,
} from "./support/webview.js";

/**
 * The files of the repository between the webview and the place that keeps them, through the
 * extension's real plumbing: the board editor's own options serve a repository in memory over
 * the panel the board file's sync uses. A model is edited in place and written into its own
 * file, never into the board file, whose document is VS Code's.
 */

test.describe.configure({ timeout: 2 * MODELS_READY_MS });

const TEA_TEXT = exampleText(TEA);
const WATER = "component Water [0.38, 0.82]";
const WATER_LINK = "Hot Water -> Water";
const withoutWater = (text: string | undefined): string =>
  (text ?? "")
    .split("\n")
    .filter((line) => line !== WATER && line !== WATER_LINK)
    .join("\n");
const sortedLines = (text: string | undefined): string[] => (text ?? "").split("\n").sort();
/** the Wardley file as its modeler writes it once the Water component is deleted */
const TEA_WITHOUT_WATER = withoutWater(TEA_TEXT);

const water = (page: Page) => page.locator('.djs-shape[data-element-id="cmp_water"]');

/** Deletes the Water component of the armed Wardley map by a real click and a real key. */
async function deleteWater(page: Page): Promise<void> {
  const engine = await arm(page, WARDLEY_NODE);
  const at = await centreAtRest(engine.locator('.djs-shape[data-element-id="cmp_water"] .djs-hit'));
  await page.mouse.click(at.x, at.y);
  await expect(engine.locator(".djs-shape.selected")).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect(water(page)).toHaveCount(0);
}

/**
 * Counts the undo key where VS Code listens for it: a bubbling listener on the window, which a
 * key that was stopped on its way never reaches.
 */
async function countUndoKeysAtWindow(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    document.documentElement.dataset.undoKeysAtWindow = "";
    window.addEventListener("keydown", (event) => {
      if (!event.ctrlKey || event.key.toLowerCase() !== "z") return;
      document.documentElement.dataset.undoKeysAtWindow += event.defaultPrevented
        ? "prevented,"
        : "unprevented,";
    });
  });
  return () =>
    page.evaluate(() =>
      (document.documentElement.dataset.undoKeysAtWindow ?? "").split(",").filter(Boolean),
    );
}

test.beforeAll(() => {
  // the fixture has the two lines the edit of these tests removes
  expect(TEA_TEXT.split("\n")).toEqual(expect.arrayContaining([WATER, WATER_LINK]));
  expect(EXAMPLE_MODELS).toContain(TEA);
});

test("a real edit of an armed model is one write of that model's file and none of the board file", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);

  await deleteWater(page);

  await expect.poll(() => fileText(page, TEA)).toBe(TEA_WITHOUT_WATER);
  // once, and into no other file
  expect(await fileWrites(page)).toEqual([TEA]);
  const edits = (await postedMessages(page)).filter(
    (message) => message.type === "board.text.edit",
  );
  expect(edits).toEqual([
    { type: "board.text.edit", path: TEA, text: TEA_WITHOUT_WATER, version: 1 },
  ]);
  for (const model of EXAMPLE_MODELS.filter((path) => path !== TEA)) {
    expect(await fileText(page, model), model).toBe(exampleText(model));
  }
  // the board file stores where a file sits, never what is in it
  expect(await documentText(page)).toBe(EXAMPLE_BOARD);
  expect(await canvasText(page)).toBe(EXAMPLE_BOARD);
  expect(await appliedEdits(page)).toEqual([]);
  expect((await postedMessages(page)).filter((message) => message.type === "edit")).toEqual([]);

  await page.locator("[data-board-done]").click();
  await expect.poll(() => armedNode(page)).toBe("");
  expect(await fileWrites(page)).toEqual([TEA]);
  expect(problems).toEqual([]);
});

test("the undo key inside an armed editor undoes there and never reaches the window; on the board's pane it goes on to VS Code", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  await deleteWater(page);
  await expect.poll(() => fileText(page, TEA)).toBe(TEA_WITHOUT_WATER);
  const undoKeysAtWindow = await countUndoKeysAtWindow(page);

  // inside the armed editor: its own history, and its file follows
  await page.keyboard.press("Control+z");
  await expect(water(page)).toHaveCount(1);
  // The notation's own text rules write the file: the component and its link are back, on the
  // lines Wardley's patch puts a new element on, and every other line stands where it stood.
  await expect
    .poll(async () => sortedLines(await fileText(page, TEA)))
    .toEqual(sortedLines(TEA_TEXT));
  const undone = await fileText(page, TEA);
  expect(withoutWater(undone)).toBe(TEA_WITHOUT_WATER);
  expect(await fileWrites(page)).toEqual([TEA, TEA]);
  expect(await undoKeysAtWindow()).toEqual([]);
  // VS Code heard nothing, so the board file's document has nothing undone
  expect(await documentText(page)).toBe(EXAMPLE_BOARD);
  expect(await appliedEdits(page)).toEqual([]);

  // on the board's pane the key is VS Code's: it reaches the window, and nobody prevented it
  await page.locator("[data-board-done]").click();
  await expect.poll(() => armedNode(page)).toBe("");
  const pane = await panePoint(page);
  await page.mouse.click(pane.x, pane.y);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className ?? ""))
    .toContain("react-flow__pane");
  await page.keyboard.press("Control+z");
  await expect.poll(undoKeysAtWindow).toEqual(["unprevented"]);
  // the board undid nothing by itself, and the model keeps what its editor undid
  expect(await canvasText(page)).toBe(EXAMPLE_BOARD);
  expect(await fileText(page, TEA)).toBe(undone);
  expect(await fileWrites(page)).toEqual([TEA, TEA]);
  expect(problems).toEqual([]);
});

test("a change of a model from outside shows in its node, and nothing is written back", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  await expect(water(page)).toHaveCount(1);

  // a text editor beside the board, a formatter, a checkout
  await page.evaluate(([path, text]) => window.vscodeHost?.backend.outside(path, text), [
    TEA,
    TEA_WITHOUT_WATER,
  ] as const);

  await expect(water(page)).toHaveCount(0);
  await expect(readyEngines(page)).toHaveCount(7);
  expect(await fileText(page, TEA)).toBe(TEA_WITHOUT_WATER);
  expect(await fileWrites(page)).toEqual([]);
  expect(await appliedEdits(page)).toEqual([]);
  expect(await documentText(page)).toBe(EXAMPLE_BOARD);
  expect(problems).toEqual([]);
});

test("an edit made on a text the file no longer has is dropped whole: the file keeps the outside's text, the node shows it and says so once", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  const engine = await arm(page, WARDLEY_NODE);
  // what a node says of a change that is not in its file; no node says anything yet
  const said = page.locator(".board-host-notice:not([hidden])");
  await expect(said).toHaveCount(0);
  const spring = page.locator('.djs-shape[data-element-id="cmp_spring"]');
  const outside = `${TEA_TEXT}component Spring [0.25, 0.9]\n`;
  const edits = async () =>
    (await postedMessages(page)).filter((message) => message.type === "board.text.edit");
  const selectWater = async (): Promise<void> => {
    const at = await centreAtRest(
      engine.locator('.djs-shape[data-element-id="cmp_water"] .djs-hit'),
    );
    await page.mouse.click(at.x, at.y);
    await expect(engine.locator(".djs-shape.selected")).toHaveCount(1);
  };
  await selectWater();

  // A text editor beside the board changes the model, and the extension's word of it is still
  // on its way when the person presses the key: the edit is made on the text from before.
  await page.evaluate(
    ([path, text]) => {
      window.vscodeHost?.deliveries.hold();
      window.vscodeHost?.backend.outside(path, text);
    },
    [TEA, outside] as const,
  );
  await page.keyboard.press("Delete");
  await expect(water(page)).toHaveCount(0);
  await expect
    .poll(edits)
    .toEqual([{ type: "board.text.edit", path: TEA, text: TEA_WITHOUT_WATER, version: 1 }]);

  // The word arrives. The node shows what the file has: the outside's change is there, and the
  // person's own edit is gone with the canvas it was made on.
  await page.evaluate(() => window.vscodeHost?.deliveries.release());
  await expect(spring).toHaveCount(1);
  await expect(water(page)).toHaveCount(1);
  await expect(readyEngines(page)).toHaveCount(7);
  // The file never held the edit: nothing was written over the change from outside.
  expect(await fileText(page, TEA)).toBe(outside);
  expect(await fileWrites(page)).toEqual([]);
  expect(await armedNode(page)).toBe(WARDLEY_NODE);
  // The person is told in words, by the node whose change it was and by no other.
  await expect(said).toHaveCount(1);
  await expect(engine.locator(".board-host-notice")).toHaveAttribute("data-reason", "crossed");
  await expect(engine.locator(".board-host-notice")).toHaveText(
    "Your last change was dropped: this file changed elsewhere at the same time. " +
      "Make it again on what you see now.",
  );

  // And the next edit is made on the text the file has, so it lands, and the words go with it.
  await selectWater();
  await page.keyboard.press("Delete");
  await expect(water(page)).toHaveCount(0);
  await expect.poll(() => fileText(page, TEA)).toBe(withoutWater(outside));
  await expect(said).toHaveCount(0);
  expect(await fileWrites(page)).toEqual([TEA]);
  expect((await edits()).at(-1)).toEqual({
    type: "board.text.edit",
    path: TEA,
    text: withoutWater(outside),
    version: 2,
  });
  await expect(spring).toHaveCount(1);
  // the board file had no part in any of it
  expect(await documentText(page)).toBe(EXAMPLE_BOARD);
  expect(await appliedEdits(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test("the board file is in the repository and is never a file of the files: its text comes and goes through VS Code's document alone", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  // the repository holds the board file, and the page was told nothing of it
  expect(await listedFiles(page)).toContain(BOARD_FILE);
  expect(await fileText(page, BOARD_FILE)).toBe(EXAMPLE_BOARD);
  expect(await pickerModels(page)).toEqual([...EXAMPLE_MODELS]);

  // a change of the board is an edit of VS Code's document, and no write into the repository
  await toolbarButton(page, "Group").click();
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(1);
  expect((await appliedEdits(page))[0]?.path).toBe(`/repository/${BOARD_FILE}`);
  expect(await documentText(page)).not.toBe(EXAMPLE_BOARD);
  expect(await fileText(page, BOARD_FILE)).toBe(EXAMPLE_BOARD);
  expect(await fileWrites(page)).toEqual([]);
  // nothing the page posted for its files names the board file: it opened its seven models
  const ofTheFiles = (await postedMessages(page)).filter((message) =>
    message.type.startsWith("board."),
  );
  expect(ofTheFiles.filter((message) => message.type === "board.text.open")).toHaveLength(7);
  expect(ofTheFiles.filter((message) => String(message.path).endsWith(".board"))).toEqual([]);

  // Asked for all the same, it is refused by the extension's rule: the place that keeps the
  // files has it as a text and would have opened it.
  const refusals = await page.evaluate(async (path) => {
    const outcome = (asked: Promise<unknown> | undefined): Promise<string> =>
      (asked ?? Promise.resolve()).then(
        () => "answered",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
    return {
      text: await outcome(window.webview?.files.openText(path)),
      bytes: await outcome(window.webview?.files.readBytes(path)),
    };
  }, BOARD_FILE);
  expect(refusals).toEqual({
    text: `${BOARD_FILE} is no model a board shows here`,
    bytes: `${BOARD_FILE} is no picture a board shows here`,
  });
  expect(await fileWrites(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test("the picker follows the repository, and a picked model is one line more in the board file", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  expect(await pickerModels(page)).toEqual([...EXAMPLE_MODELS]);

  // a model that comes later: made beside the board, or by a checkout
  const second = "models/second.owm";
  await page.evaluate(([path, text]) => window.vscodeHost?.backend.outside(path, text), [
    second,
    "title Second\ncomponent Alone [0.5, 0.5]\n",
  ] as const);
  await expect.poll(() => pickerModels(page)).toEqual([...EXAMPLE_MODELS, second].sort());

  await page.locator("select.board-toolbar__models").selectOption(second);
  await modelsReady(page, 8);
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(1);
  const [edit] = await appliedEdits(page);
  expect(JSON.parse((edit?.text ?? "").split("\n")[0] ?? "")).toMatchObject({
    kind: "node",
    type: "model",
    file: second,
  });
  // the board file stores where the file sits: the file itself is not written
  expect(await fileWrites(page)).toEqual([]);
  expect(problems).toEqual([]);
});

/** the file of every node that shows one, by the node's id, as the canvas has it */
const nodeFiles = (page: Page): Promise<Record<string, string>> =>
  page.evaluate(() =>
    Object.fromEntries(
      (window.editor?.modeler.board.store.getSnapshot().nodes ?? [])
        .filter((node) => node.attrs.file !== undefined)
        .map((node) => [node.id, String(node.attrs.file)]),
    ),
  );

/** A file or a folder of the repository gets another path, as a rename in the Explorer gives it. */
const moveInRepository = (page: Page, from: string, to: string): Promise<void> =>
  page.evaluate(([old, next]) => window.vscodeHost?.backend.move(old, next), [from, to] as const);

/** the id of the element each applied edit of the board file wrote, one line each */
const editedIds = async (page: Page): Promise<string[]> =>
  (await appliedEdits(page)).map(
    (edit) => (JSON.parse(edit.text.split("\n")[0] ?? "") as { id: string }).id,
  );

test("files that move in the repository are followed: a picture's node and a model's node each get their new path in one edit of the board file", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  const pictures = page.locator('.board-image[data-missing="false"] img');
  await expect(pictures).toHaveCount(1);
  const before = await nodeFiles(page);
  const picture = Object.entries(before).find(([, file]) => file.startsWith("assets/"));
  if (!picture) throw new Error("the example shows no picture");
  const [pictureNode, picturePath] = picture;

  // a picture, renamed in the Explorer: the image node has no editor, the board follows for it
  await moveInRepository(page, picturePath, "assets/renamed-mark.svg");
  await expect
    .poll(() => nodeFiles(page))
    .toEqual({ ...before, [pictureNode]: "assets/renamed-mark.svg" });
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(1);
  await expect(pictures).toHaveCount(1);
  await expect
    .poll(() =>
      pictures.evaluateAll((all) => all.every((img) => (img as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);

  // a model, moved into another folder: its node follows through its own editor
  await moveInRepository(page, TEA, "maps/tea.owm");
  await expect
    .poll(() => nodeFiles(page))
    .toEqual({
      ...before,
      [pictureNode]: "assets/renamed-mark.svg",
      [WARDLEY_NODE]: "maps/tea.owm",
    });
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(2);
  await modelsReady(page);
  expect(await pickerModels(page)).toContain("maps/tea.owm");

  // each edit is the one line of the node that moved, and the document is what the canvas has
  expect(await editedIds(page)).toEqual([pictureNode, WARDLEY_NODE]);
  expect(await documentText(page)).toBe(await canvasText(page));
  // no file was written for it: a board stores where a file sits
  expect(await fileWrites(page)).toEqual([]);

  // the model is still edited in place, in the file it is now
  await deleteWater(page);
  await expect.poll(() => fileText(page, "maps/tea.owm")).toBe(TEA_WITHOUT_WATER);
  expect(await fileWrites(page)).toEqual(["maps/tea.owm"]);
  expect(problems).toEqual([]);
});

test("a renamed folder moves every node below it: one edit of the board file per node, none of them on the board's own history, and each one a step of VS Code's undo", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  const before = await nodeFiles(page);
  const models = Object.entries(before).filter(([, file]) => file.startsWith("models/"));
  expect(models.map(([, file]) => file).sort()).toEqual([...EXAMPLE_MODELS]);
  /** how many gestures the board's own history could take back */
  const boardHistory = (): Promise<number | undefined> =>
    page.evaluate(() => window.editor?.modeler.board.store.undo.undoStack.length);
  const groups = page.locator(".board-group");
  const failedEngines = page.locator('.board-engine[data-embed-state="failed"]');

  // a gesture of the person's first: the one thing the board's own undo may take back
  await expect(groups).toHaveCount(1);
  await toolbarButton(page, "Group").click();
  await expect(groups).toHaveCount(2);
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(1);
  expect(await boardHistory()).toBe(1);

  // the folder of the models gets another name in the Explorer
  await moveInRepository(page, "models", "diagrams");
  const after = {
    ...before,
    ...Object.fromEntries(models.map(([id, file]) => [id, file.replace(/^models\//, "diagrams/")])),
  };
  await expect.poll(() => nodeFiles(page)).toEqual(after);
  await modelsReady(page);
  await expect(failedEngines).toHaveCount(0);
  // one edit of the board file for each node that moved, each the one line of its node
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(1 + models.length);
  expect((await editedIds(page)).slice(1).sort()).toEqual(models.map(([id]) => id).sort());
  expect(await documentText(page)).toBe(await canvasText(page));
  expect((await pickerModels(page)).sort()).toEqual(
    EXAMPLE_MODELS.map((file) => file.replace(/^models\//, "diagrams/")),
  );
  // no file was written for it, and no move is a gesture the board's undo knows
  expect(await fileWrites(page)).toEqual([]);
  expect(await boardHistory()).toBe(1);

  // the board's own undo takes the gesture before the moves back and leaves every new path
  await page.evaluate(() => window.editor?.modeler.board.undo());
  await expect(groups).toHaveCount(1);
  expect(await nodeFiles(page)).toEqual(after);
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(2 + models.length);
  await expect.poll(() => documentText(page)).toBe(await canvasText(page));

  // VS Code's undo is the document's, and every edit of the document is a step of it. The
  // first step back is the group again, the second the last node's old path, whose file is no
  // longer there: its node says so, and the other six stay as they are.
  const undoInVsCode = (): Promise<boolean | undefined> =>
    page.evaluate(() => window.vscodeHost?.host.undo(window.vscodeHost.document));
  expect(await undoInVsCode()).toBe(true);
  await expect(groups).toHaveCount(2);
  expect(await nodeFiles(page)).toEqual(after);
  expect(await undoInVsCode()).toBe(true);
  await expect
    .poll(async () =>
      Object.values(await nodeFiles(page)).filter((file) => file.startsWith("models/")),
    )
    .toHaveLength(1);
  await expect(failedEngines).toHaveCount(1);
  await expect(failedEngines).toContainText("This file could not be opened.");
  await modelsReady(page, models.length - 1);
  // VS Code's redo brings the new path back, and the node its model
  expect(await page.evaluate(() => window.vscodeHost?.host.redo(window.vscodeHost.document))).toBe(
    true,
  );
  await expect.poll(() => nodeFiles(page)).toEqual(after);
  await modelsReady(page);
  await expect(failedEngines).toHaveCount(0);
  expect(await fileWrites(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test("a picked picture is stored under assets/ over the pipe, and its node is one edit of the board file", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  const pictures = page.locator('.board-image[data-missing="false"] img');
  await expect(pictures).toHaveCount(1);
  const before = await listedFiles(page);
  expect(before).not.toContain("assets/sketch.svg");

  const choosing = page.waitForEvent("filechooser");
  await toolbarButton(page, "Image").click();
  const chooser = await choosing;
  await chooser.setFiles({
    name: "sketch.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30"/></svg>',
    ),
  });

  await expect(pictures).toHaveCount(2);
  await expect
    .poll(() =>
      pictures.evaluateAll((all) => all.every((img) => (img as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);
  // the new file is in the repository, and nothing else changed there
  expect(await listedFiles(page)).toEqual([...before, "assets/sketch.svg"].sort());
  const creates = (await postedMessages(page)).filter(
    (message) => message.type === "board.file.create",
  );
  expect(creates.map(({ path, mime }) => ({ path, mime }))).toEqual([
    { path: "assets/sketch.svg", mime: "image/svg+xml" },
  ]);
  // and its node is one line more in the board file's document
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(1);
  const [edit] = await appliedEdits(page);
  expect(JSON.parse((edit?.text ?? "").split("\n")[0] ?? "")).toMatchObject({
    kind: "node",
    type: "image",
    file: "assets/sketch.svg",
  });
  expect(await fileWrites(page)).toEqual([]);
  expect(problems).toEqual([]);
});

/**
 * VS Code's own paste, as a real VS Code tells it to a webview: the event lands on the body
 * with the clipboard's file, whatever has the focus.
 */
const pasteAsVsCode = (page: Page, name: string): Promise<boolean> =>
  page.evaluate((fileName) => {
    const clipboard = new DataTransfer();
    clipboard.items.add(
      new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30"/></svg>',
        ],
        fileName,
        { type: "image/svg+xml" },
      ),
    );
    const paste = new ClipboardEvent("paste", {
      clipboardData: clipboard,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(paste);
    return paste.defaultPrevented;
  }, name);

test("a picture pasted as VS Code pastes, on the body, is the board's while the board has the focus, and nobody's otherwise", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  const pictures = page.locator('.board-image[data-missing="false"] img');
  await expect(pictures).toHaveCount(1);
  const before = await listedFiles(page);

  // nothing has the focus: a paste on the body is no paste on the board
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await pasteAsVsCode(page, "nobody.svg")).toBe(false);
  // the focus is on a control of the shell, beside the board: not the board's either
  await page.locator('.cd-shell [data-chrome="menu"]').focus();
  expect(await pasteAsVsCode(page, "menu.svg")).toBe(false);

  // the focus is on the board's pane, where a click leaves it
  const pane = await panePoint(page);
  await page.mouse.click(pane.x, pane.y);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className ?? ""))
    .toContain("react-flow__pane");
  expect(await pasteAsVsCode(page, "pasted.svg")).toBe(true);

  await expect(pictures).toHaveCount(2);
  expect(await listedFiles(page)).toEqual([...before, "assets/pasted.svg"].sort());
  const creates = (await postedMessages(page)).filter(
    (message) => message.type === "board.file.create",
  );
  // once, and only the paste that was aimed at the board
  expect(creates.map(({ path }) => path)).toEqual(["assets/pasted.svg"]);
  await expect.poll(async () => (await appliedEdits(page)).length).toBe(1);
  expect(problems).toEqual([]);
});

test("the teardown ends the board first: a label still being typed in is written, and every editor closes its file, while the files stand", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  const engine = await arm(page, WARDLEY_NODE);
  // a label that is open and not committed: its editor writes it when it goes
  const at = await centreAtRest(engine.locator('.djs-shape[data-element-id="cmp_water"] .djs-hit'));
  await page.mouse.dblclick(at.x, at.y);
  await expect(engine.locator("textarea.wardley-label-input")).toBeFocused();
  await page.keyboard.type("Spring");
  expect(await fileWrites(page)).toEqual([]);
  expect(
    (await postedMessages(page)).filter((message) => message.type === "board.text.close"),
  ).toEqual([]);

  await page.evaluate(() => window.webview?.destroy());

  // The label went through a port that was still there, and landed in the model's file. Files
  // that were disposed first would have dropped it without a word.
  await expect.poll(() => fileWrites(page)).toEqual([TEA]);
  expect(await fileText(page, TEA)).toContain("Spring");
  // Each of the seven editors then told the extension that it closed its file, the Wardley
  // map's after its last write.
  const posted = (await postedMessages(page)).filter((message) =>
    ["board.text.edit", "board.text.close"].includes(message.type),
  );
  const closed = posted.filter((message) => message.type === "board.text.close");
  expect(closed.map((message) => String(message.path)).sort()).toEqual([...EXAMPLE_MODELS]);
  const of = (type: string): number =>
    posted.findIndex((message) => message.type === type && message.path === TEA);
  expect(of("board.text.edit")).toBeGreaterThanOrEqual(0);
  expect(of("board.text.edit")).toBeLessThan(of("board.text.close"));
  // nothing of the page is left, and the board file was never written
  await expect(page.locator("#app > *")).toHaveCount(0);
  await expect(page.locator(".board-engine")).toHaveCount(0);
  expect(await appliedEdits(page)).toEqual([]);
  // and only then the files went: the page's port is closed
  expect(
    await page.evaluate(() =>
      window.webview?.files.openText("models/tea.owm").then(
        () => "opened",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      ),
    ),
  ).toBe("the files were closed");
  // a second call finds nothing left to end
  await page.evaluate(() => window.webview?.destroy());
  expect(problems).toEqual([]);
});

test("without an extension that answers, the board still opens: its notes drawn, its models waiting", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page);

  await expect(page.locator(".cd-shell .cd-shell-canvas .board-root")).toHaveCount(1);
  await expect(page.locator(".board-text")).toHaveCount(2);
  await expect(page.locator(".board-group")).toHaveCount(1);
  await expect(page.locator(".board-engine")).toHaveCount(7);
  await expect(readyEngines(page)).toHaveCount(0);
  // the page asked once, and waits
  const posted = await postedMessages(page);
  expect(posted.filter((message) => message.type === "board.hello")).toEqual([
    { type: "board.hello", protocol: 3 },
  ]);
  expect(problems).toEqual([]);
});

test("a page without the element to mount into says why, and keeps no files open", async ({
  page,
}) => {
  await page.goto("/webview-test.html?host&root=none");
  await page.waitForFunction(() => window.webview !== undefined);

  const outcomes = await page.evaluate(async () => {
    const outcome = (settles: Promise<unknown> | undefined): Promise<string> =>
      (settles ?? Promise.resolve()).then(
        () => "settled",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
    return {
      mounted: await outcome(window.webview?.mounted),
      files: await outcome(window.webview?.files.openText("models/tea.owm")),
      // the teardown of an editor that never stood ends as its mount did
      destroy: await outcome(window.webview?.destroy()),
    };
  });
  const noRoot = "board-ide-editor: the editor HTML has no #app root";
  expect(outcomes).toEqual({ mounted: noRoot, files: "the files were closed", destroy: noRoot });
});
