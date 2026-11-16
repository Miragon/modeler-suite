import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseBoardText } from "@miragon/board-schema-model";
import type { VsCodeSmokeContext } from "@miragon/modeler-shell/testing/vscode-electron";
import type { Locator, Page } from "playwright-core";

/**
 * What the smoke does on the board in a real VS Code, in place of the driver's defaults: those
 * look for a diagram-js canvas and its palette, and the board's canvas is React Flow with a
 * toolbar of its own.
 */

const POLL_MS = 100;

/** Polls until `met`; the failure says what was there in its place. */
export async function until(
  met: () => Promise<boolean>,
  instead: () => Promise<string>,
  timeoutMs: number,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    if (await met().catch(() => false)) return;
    if (performance.now() >= deadline) {
      throw new Error(`${await instead().catch(String)} (after ${timeoutMs / 1000} s)`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

interface EngineFacts {
  /** `data-embed-state`, or `none` while the editor has not said one */
  state: string;
  /** what a node prints where its editor could not open */
  message: string;
  /** the shapes its modeler drew that have a box in the window */
  drawn: number;
}

const enginesOf = ({ webview }: VsCodeSmokeContext): Promise<EngineFacts[]> =>
  webview.locator(".board-engine").evaluateAll((engines) =>
    engines.map((engine) => ({
      state: (engine as HTMLElement).dataset.embedState ?? "none",
      message: engine.querySelector(".board-host-state")?.textContent?.trim() ?? "",
      drawn: [...engine.querySelectorAll(".djs-element.djs-shape")].filter((shape) => {
        const box = shape.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }).length,
    })),
  );

const describeEngines = (engines: readonly EngineFacts[]): string =>
  engines
    .map(({ state, message, drawn }) => `${state}${message ? ` "${message}"` : ""}, ${drawn} drawn`)
    .join("; ") || "no model node";

/** The board's toolbar is there and every model node's editor has its file: `models` of them. */
export async function boardReady(context: VsCodeSmokeContext, models: number): Promise<void> {
  const { webview, timeoutMs } = context;
  await webview.locator(".board-toolbar").waitFor({ state: "visible", timeout: timeoutMs });
  await until(
    async () => {
      const engines = await enginesOf(context);
      return engines.length === models && engines.every(({ state }) => state === "ready");
    },
    async () =>
      `the board should show ${models} models that are ready, it shows: ` +
      describeEngines(await enginesOf(context)),
    timeoutMs,
  );
}

/** One change of the board file through the canvas: a click on the toolbar's Group button. */
export async function addGroup(context: VsCodeSmokeContext): Promise<void> {
  const { webview, timeoutMs } = context;
  const groups = webview.locator(".board-group");
  const before = await groups.count();
  await webview
    .locator(".board-toolbar button")
    .filter({ hasText: /^\s*Group\s*$/ })
    .click();
  await until(
    async () => (await groups.count()) === before + 1,
    async () =>
      `a click on Group should add one group to ${before}, the board shows ${await groups.count()}`,
    timeoutMs,
  );
}

/**
 * Every model is drawn by its own modeler, and the picture's bytes arrived: both come through
 * the files of the workspace, which only a real VS Code serves from a real folder.
 */
export async function modelsDrawnAndPictureLoaded(
  context: VsCodeSmokeContext,
  models: number,
): Promise<void> {
  const { webview, timeoutMs } = context;
  await until(
    async () => {
      const engines = await enginesOf(context);
      return engines.length === models && engines.every(({ drawn }) => drawn > 0);
    },
    async () =>
      `each of the ${models} models should be drawn, the board shows: ` +
      describeEngines(await enginesOf(context)),
    timeoutMs,
  );
  const picture = webview.locator('.board-image[data-missing="false"] img');
  const loaded = (): Promise<number[]> =>
    picture.evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).naturalWidth),
    );
  await until(
    async () => {
      const widths = await loaded();
      return widths.length === 1 && widths.every((width) => width > 0);
    },
    async () =>
      `the board should show its one picture loaded, it shows ${(await loaded()).length} ` +
      `with the widths ${(await loaded()).join(", ") || "none"}`,
    timeoutMs,
  );
}

const pickerModels = ({ webview }: VsCodeSmokeContext): Promise<string[]> =>
  webview
    .locator("select.board-toolbar__models option:not([disabled])")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));

/**
 * The toolbar's picker offers the models of the folder, and follows a folder another program
 * makes and removes. The first is VS Code's search of a real folder, the second its watcher,
 * which names such a folder and none of the files in it.
 */
export async function pickerFollowsTheFolder(
  context: VsCodeSmokeContext,
  models: readonly string[],
): Promise<void> {
  const { timeoutMs, workspaceDir } = context;
  const made = "made-later/one.owm";
  const listed = async (wanted: readonly string[], when: string): Promise<void> =>
    until(
      async () => (await pickerModels(context)).join() === [...wanted].sort().join(),
      async () =>
        `${when} the picker should offer ${[...wanted].sort().join(", ")}, it offers ` +
        ((await pickerModels(context)).join(", ") || "nothing"),
      timeoutMs,
    );
  await listed(models, "after the board opened");
  await mkdir(join(workspaceDir, "made-later"));
  await writeFile(join(workspaceDir, made), "title Made later\ncomponent New [0.5, 0.5]\n");
  await listed([...models, made], "after a folder with a model was made");
  await rm(join(workspaceDir, "made-later"), { recursive: true });
  await listed(models, "after that folder was removed");
}

/** The middle of an element, once two looks in a row find it in the same place. */
async function centreAtRest(target: Locator, timeoutMs: number): Promise<{ x: number; y: number }> {
  let last = "";
  let centre = { x: 0, y: 0 };
  await until(
    async () => {
      const box = await target.boundingBox();
      if (!box) return false;
      const now = [box.x, box.y, box.width, box.height].join();
      const rests = now === last;
      last = now;
      centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      return rests;
    },
    () => Promise.resolve("an element of the board never came to rest"),
    timeoutMs,
  );
  return centre;
}

/** VS Code's tabs by their names, an unsaved one with " (dirty)" behind it. */
const tabs = (page: Page): Promise<string[]> =>
  page
    .locator(".tabs-container .tab")
    .evaluateAll((all) =>
      all.map(
        (tab) =>
          `${tab.querySelector(".label-name")?.textContent ?? ""}${tab.classList.contains("dirty") ? " (dirty)" : ""}`,
      ),
    );

const exactly = (text: string): RegExp =>
  new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

/** Brings a tab to the front by a real click on it, which also hands its editor the keys. */
async function showTab(page: Page, name: string): Promise<void> {
  await page
    .locator(".tabs-container .tab")
    .filter({ has: page.locator(".label-name", { hasText: exactly(name) }) })
    .first()
    .click();
}

const exists = (file: string): Promise<boolean> =>
  access(file).then(
    () => true,
    () => false,
  );

/** Fails as soon as `met` is not: for what must stay as it is while something else happens. */
async function holds(
  met: () => Promise<boolean>,
  instead: () => Promise<string>,
  forMs: number,
): Promise<void> {
  const deadline = performance.now() + forMs;
  for (;;) {
    if (!(await met())) throw new Error(await instead().catch(String));
    if (performance.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

const armedNode = ({ webview }: VsCodeSmokeContext): Promise<string | null> =>
  webview.locator("[data-board-done]").getAttribute("data-board-done");

/** Arms a model node by a real double-click on its preview; resolves once the board says so. */
async function arm(context: VsCodeSmokeContext, node: string): Promise<void> {
  const { page, webview, timeoutMs } = context;
  const body = webview.locator(`.react-flow__node[data-id="${node}"] .board-node__body`);
  const onBody = await centreAtRest(body, timeoutMs);
  await page.mouse.dblclick(onBody.x, onBody.y);
  await until(
    async () => (await armedNode(context)) === node,
    async () =>
      `a double-click should arm ${node}, the armed node is "${await armedNode(context)}"`,
    timeoutMs,
  );
}

/** A shape of the armed model, by its `data-element-id`. */
const armedShape = ({ webview }: VsCodeSmokeContext, shape: string): Locator =>
  webview.locator(`.board-overlay-layer > .board-engine .djs-shape[data-element-id="${shape}"]`);

/** Takes a shape off the armed model: a real click on it, then the Delete key. */
async function deleteArmedShape(context: VsCodeSmokeContext, id: string): Promise<void> {
  const { page, timeoutMs } = context;
  const shape = armedShape(context, id);
  const onShape = await centreAtRest(shape.locator(".djs-hit").first(), timeoutMs);
  await page.mouse.click(onShape.x, onShape.y);
  await page.keyboard.press("Delete");
  await until(
    async () => (await shape.count()) === 0,
    () => Promise.resolve(`Delete should take ${id} off the armed model`),
    timeoutMs,
  );
}

async function done(context: VsCodeSmokeContext): Promise<void> {
  await context.webview.locator("[data-board-done]").click();
  await until(
    async () => (await armedNode(context)) === "",
    async () => `Done should end the editing, the armed node is "${await armedNode(context)}"`,
    context.timeoutMs,
  );
}

const nameOf = (path: string): string => path.split("/").at(-1) ?? path;

export interface EditInPlace {
  /** the model node to arm, by its id in the board file */
  node: string;
  /** the shape to delete in its editor, by its `data-element-id` */
  shape: string;
  /** the model's file, by its path in the workspace, and the text it had */
  file: string;
  text: string;
  /** the board file's name, as its tab shows it */
  board: string;
}

/**
 * A model edited in place is a dirty text document of its own, and neither the board's tab nor
 * the file on disk changes: the person saves it. A real double-click arms the model, a real
 * click and a real key change it. VS Code then opens a tab for the document that turned dirty
 * in the background, and that tab is what this step reads.
 */
export async function editInPlaceLeavesTheModelDirty(
  context: VsCodeSmokeContext,
  edit: EditInPlace,
): Promise<void> {
  const { page, timeoutMs } = context;
  await arm(context, edit.node);
  await deleteArmedShape(context, edit.shape);
  const name = nameOf(edit.file);
  await until(
    async () => {
      const now = await tabs(page);
      return now.includes(`${name} (dirty)`) && now.includes(edit.board);
    },
    async () =>
      `VS Code should show ${name} as a dirty tab and ${edit.board} as a clean one, ` +
      `its tabs are: ${(await tabs(page)).join(", ")}`,
    timeoutMs,
  );
  const onDisk = await readFile(join(context.workspaceDir, edit.file), "utf8");
  if (onDisk !== edit.text) {
    throw new Error(`${edit.file} was written to disk, and only its document should have changed`);
  }
  await done(context);
}

export interface UndoInPlace {
  /** the model node to arm, and a shape of it to delete and bring back */
  node: string;
  shape: string;
  /** the board file's name, as its tab shows it */
  board: string;
}

/** How long the board has to stay as it is after the undo key was pressed in a model. */
const UNDO_WATCH_MS = 500;

/**
 * The undo key inside an armed model is that model's. The board document has an unsaved change
 * of its own while the key is pressed, a group, so a key that reached VS Code would take the
 * group away. The same key on the board, after Done, does exactly that: it is VS Code's undo
 * of the board document, which is clean again.
 */
export async function undoKeyStaysInTheArmedModel(
  context: VsCodeSmokeContext,
  undo: UndoInPlace,
): Promise<void> {
  const { page, webview, keys, timeoutMs } = context;
  const groups = webview.locator(".board-group");
  // The fit first: a new group lands in the middle of what the board shows, and after an
  // editing that is the model that was edited.
  await webview.locator('[data-chrome="zoom"] [data-zoom="fit"]').click();
  const before = await groups.count();
  await addGroup(context);
  const boardIs = async (state: "dirty" | "clean"): Promise<boolean> =>
    (await tabs(page)).includes(state === "dirty" ? `${undo.board} (dirty)` : undo.board);
  await until(
    () => boardIs("dirty"),
    async () =>
      `a new group should leave ${undo.board} unsaved, the tabs are: ${(await tabs(page)).join(", ")}`,
    timeoutMs,
  );
  await arm(context, undo.node);
  await deleteArmedShape(context, undo.shape);
  await page.keyboard.press(keys.undo);
  const shape = armedShape(context, undo.shape);
  await until(
    async () => (await shape.count()) === 1,
    () =>
      Promise.resolve(`${keys.undo} inside the armed model should bring ${undo.shape} back to it`),
    timeoutMs,
  );
  await holds(
    async () => (await groups.count()) === before + 1 && (await boardIs("dirty")),
    async () =>
      `${keys.undo} inside the armed model should leave the board document alone: it shows ` +
      `${await groups.count()} groups where ${before + 1} were, and the tabs are: ` +
      (await tabs(page)).join(", "),
    UNDO_WATCH_MS,
  );
  await done(context);
  await page.keyboard.press(keys.undo);
  await until(
    async () => (await groups.count()) === before && (await boardIs("clean")),
    async () =>
      `${keys.undo} on the board should take the new group back and leave ${undo.board} saved: ` +
      `it shows ${await groups.count()} groups where ${before} were, and the tabs are: ` +
      (await tabs(page)).join(", "),
    timeoutMs,
  );
}

export interface SavedModel {
  /** the model's file, by its path in the workspace, and the text it had before the editing */
  file: string;
  text: string;
  /** a line the editing took out of the text, and one it left */
  gone: string;
  kept: string;
  /** the board file's name, as its tab shows it */
  board: string;
}

/**
 * A model that was edited in place is saved in its own tab, as a person saves it: the file
 * then has the edit, and the board document still has no unsaved change. Answers the saved text.
 */
export async function modelIsSavedInItsOwnTab(
  context: VsCodeSmokeContext,
  model: SavedModel,
): Promise<string> {
  const { page, keys, timeoutMs, workspaceDir } = context;
  const name = nameOf(model.file);
  const onDisk = (): Promise<string> => readFile(join(workspaceDir, model.file), "utf8");
  await showTab(page, name);
  await page.keyboard.press(keys.save);
  await until(
    async () => (await onDisk()) !== model.text && (await tabs(page)).includes(name),
    async () =>
      `${keys.save} in the tab of ${name} should write its file and leave the tab saved, ` +
      `the tabs are: ${(await tabs(page)).join(", ")}`,
    timeoutMs,
  );
  const saved = await onDisk();
  const lines = saved.split(/\r?\n/);
  if (lines.includes(model.gone) || !lines.includes(model.kept)) {
    throw new Error(
      `the saved ${model.file} should have lost the line "${model.gone}" and kept ` +
        `"${model.kept}", it is:\n${saved}`,
    );
  }
  await showTab(page, model.board);
  if (!(await tabs(page)).includes(model.board)) {
    throw new Error(
      `${model.board} should have no unsaved change after a model was edited and saved, ` +
        `the tabs are: ${(await tabs(page)).join(", ")}`,
    );
  }
  return saved;
}

export interface ReadAgain {
  /** the text a save wrote */
  text: string;
  /** where it is written a second time, for a node of its own */
  copy: string;
  /** shapes of the model as it was saved: one the editing left, one it took off */
  keptShape: string;
  goneShape: string;
}

/** The model nodes of the board that have an editor, by their ids. */
const modelNodes = ({ webview }: VsCodeSmokeContext): Promise<string[]> =>
  webview
    .locator(".react-flow__node")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => node.querySelector(".board-engine") !== null)
        .map((node) => node.getAttribute("data-id") ?? ""),
    );

/**
 * What a save wrote is a text its notation reads. The smoke has no reader of another modeler,
 * and the webview has every one: the saved text, written into a second file as another
 * program would, is picked onto the board, and that notation's own modeler draws it there
 * without the shape the editing took off.
 */
export async function savedTextIsReadAgain(
  context: VsCodeSmokeContext,
  saved: ReadAgain,
): Promise<void> {
  const { webview, timeoutMs, workspaceDir } = context;
  await writeFile(join(workspaceDir, saved.copy), saved.text);
  await until(
    async () => (await pickerModels(context)).includes(saved.copy),
    async () =>
      `the picker should offer ${saved.copy}, it offers ` +
      ((await pickerModels(context)).join(", ") || "nothing"),
    timeoutMs,
  );
  const before = await modelNodes(context);
  await webview.locator("select.board-toolbar__models").selectOption(saved.copy);
  let added: string | undefined;
  await until(
    async () => {
      added = (await modelNodes(context)).find((id) => !before.includes(id));
      return added !== undefined;
    },
    () => Promise.resolve(`picking ${saved.copy} should add a model node to the board`),
    timeoutMs,
  );
  const engine = webview.locator(`.react-flow__node[data-id="${added}"] .board-engine`);
  const shapes = (id: string): Promise<number> =>
    engine.locator(`.djs-shape[data-element-id="${id}"]`).count();
  await until(
    async () =>
      (await engine.getAttribute("data-embed-state")) === "ready" &&
      (await shapes(saved.keptShape)) === 1 &&
      (await shapes(saved.goneShape)) === 0,
    async () =>
      `the saved text should be drawn with ${saved.keptShape} and without ${saved.goneShape}: ` +
      `its node is ${await engine.getAttribute("data-embed-state")} and shows ` +
      `${await shapes(saved.keptShape)} and ${await shapes(saved.goneShape)} of them`,
    timeoutMs,
  );
}

export interface RenamedModel {
  /** the model node, by its id in the board file */
  node: string;
  /** the folder of its file in the Explorer, the file's name there, and its new name */
  folder: string;
  name: string;
  renamed: string;
  /** the board file's name, as its tab shows it */
  board: string;
}

/** Moves the Explorer's focus to a file by the arrow keys: a click on a file would open it. */
async function focusInExplorer(
  context: VsCodeSmokeContext,
  folder: string,
  name: string,
): Promise<void> {
  const { page, timeoutMs } = context;
  const explorer = page.locator(".explorer-folders-view");
  const row = (label: string): Locator =>
    explorer
      .locator(".monaco-list-row")
      .filter({ has: page.locator(".label-name", { hasText: exactly(label) }) })
      .first();
  const focused = (): Promise<string> =>
    explorer
      .locator(".monaco-list-row.focused .label-name")
      .first()
      .textContent({ timeout: 1_000 })
      .then(
        (label) => label ?? "",
        () => "",
      );
  const open = async (): Promise<boolean> =>
    (await row(folder).getAttribute("aria-expanded")) === "true";
  await row(folder).waitFor({ state: "visible", timeout: timeoutMs });
  // A click on a folder hands its row the keys and turns it over: one that was open is
  // closed by the first click and opened again by a second.
  await row(folder).click();
  if (!(await open())) await row(folder).click();
  await row(name).waitFor({ state: "visible", timeout: timeoutMs });
  const rows = await explorer.locator(".monaco-list-row").count();
  for (let step = 0; step < rows && (await focused()) !== name; step += 1) {
    await page.keyboard.press("ArrowDown");
  }
  if ((await focused()) !== name) {
    throw new Error(`the Explorer's focus should be on ${name}, it is on "${await focused()}"`);
  }
}

/**
 * A model file renamed in VS Code's Explorer, by F2 as a person renames it: the node keeps its
 * model and gets the new path, which is an unsaved change of the board document. Saved, the
 * board file names the new path and is a text the board's reader accepts.
 */
export async function renameInTheExplorerMovesTheNode(
  context: VsCodeSmokeContext,
  rename: RenamedModel,
): Promise<void> {
  const { page, webview, keys, timeoutMs, workspaceDir } = context;
  const from = `${rename.folder}/${rename.name}`;
  const to = `${rename.folder}/${rename.renamed}`;
  const models = (await modelNodes(context)).length;
  await focusInExplorer(context, rename.folder, rename.name);
  await page.keyboard.press("F2");
  const input = page.locator(".explorer-folders-view .monaco-inputbox input");
  await input.waitFor({ state: "visible", timeout: timeoutMs });
  await input.fill(rename.renamed);
  await page.keyboard.press("Enter");
  await until(
    async () => (await exists(join(workspaceDir, to))) && !(await exists(join(workspaceDir, from))),
    () => Promise.resolve(`F2 in the Explorer should rename ${from} to ${to} on disk`),
    timeoutMs,
  );
  await until(
    async () => (await tabs(page)).includes(`${rename.board} (dirty)`),
    async () =>
      `a renamed model should leave ${rename.board} unsaved, with the node's new path: ` +
      `the tabs are ${(await tabs(page)).join(", ")}`,
    timeoutMs,
  );
  const engines = await enginesOf(context);
  if (engines.length !== models || !engines.every(({ state }) => state === "ready")) {
    throw new Error(
      `after the rename each of the ${models} models should still be ready, the board shows: ` +
        describeEngines(engines),
    );
  }
  const shown = webview.locator(`.react-flow__node[data-id="${rename.node}"] .board-engine`);
  if ((await shown.locator(".djs-element.djs-shape").count()) === 0) {
    throw new Error(`${rename.node} should still draw its model after the rename`);
  }
  await showTab(page, rename.board);
  await page.keyboard.press(keys.save);
  const fileOfNode = async (): Promise<string> => {
    const parsed = parseBoardText(await readFile(join(workspaceDir, rename.board), "utf8"));
    if (!parsed.ok) return `a text the board cannot read (${parsed.reason})`;
    return String(parsed.snapshot.elements[rename.node]?.file);
  };
  await until(
    async () => (await fileOfNode()) === to,
    async () =>
      `the saved ${rename.board} should name ${to} for ${rename.node}, it names ` +
      (await fileOfNode()),
    timeoutMs,
  );
}
