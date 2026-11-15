import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { VsCodeSmokeContext } from "@miragon/modeler-shell/testing/vscode-electron";
import type { Locator } from "playwright-core";

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
  const { page, webview, timeoutMs } = context;
  const armed = (): Promise<string | null> =>
    webview.locator("[data-board-done]").getAttribute("data-board-done");
  const body = webview.locator(`.react-flow__node[data-id="${edit.node}"] .board-node__body`);
  const onBody = await centreAtRest(body, timeoutMs);
  await page.mouse.dblclick(onBody.x, onBody.y);
  await until(
    async () => (await armed()) === edit.node,
    async () => `a double-click should arm ${edit.node}, the armed node is "${await armed()}"`,
    timeoutMs,
  );
  const shape = webview.locator(
    `.board-overlay-layer > .board-engine .djs-shape[data-element-id="${edit.shape}"]`,
  );
  const onShape = await centreAtRest(shape.locator(".djs-hit").first(), timeoutMs);
  await page.mouse.click(onShape.x, onShape.y);
  await page.keyboard.press("Delete");
  await until(
    async () => (await shape.count()) === 0,
    () => Promise.resolve(`Delete should take ${edit.shape} off the armed model`),
    timeoutMs,
  );
  const name = edit.file.split("/").at(-1) ?? edit.file;
  const tabs = (): Promise<string[]> =>
    page
      .locator(".tabs-container .tab")
      .evaluateAll((all) =>
        all.map(
          (tab) =>
            `${tab.querySelector(".label-name")?.textContent ?? ""}${tab.classList.contains("dirty") ? " (dirty)" : ""}`,
        ),
      );
  await until(
    async () => {
      const now = await tabs();
      return now.includes(`${name} (dirty)`) && now.includes(edit.board);
    },
    async () =>
      `VS Code should show ${name} as a dirty tab and ${edit.board} as a clean one, ` +
      `its tabs are: ${(await tabs()).join(", ")}`,
    timeoutMs,
  );
  const onDisk = await readFile(join(context.workspaceDir, edit.file), "utf8");
  if (onDisk !== edit.text) {
    throw new Error(`${edit.file} was written to disk, and only its document should have changed`);
  }
  await webview.locator("[data-board-done]").click();
}
