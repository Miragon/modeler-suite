import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseBoardText } from "@miragon/board-schema-model";
import { formatVsCodeSmoke, runVsCodeSmoke } from "@miragon/modeler-shell/testing/vscode-electron";
import { createVSIX } from "@vscode/vsce";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  addGroup,
  boardReady,
  editInPlaceLeavesTheModelDirty,
  modelsDrawnAndPictureLoaded,
  pickerFollowsTheFolder,
} from "./board-steps.js";

const extensionRoot = fileURLToPath(new URL("..", import.meta.url));
const boardRoot = fileURLToPath(new URL("../../..", import.meta.url));
const exampleRoot = join(boardRoot, "example");

// The release passes the VSIX it is about to publish, so the file users get is the one tested.
const prebuiltVsix = process.env.VSCODE_SMOKE_VSIX;

let packageDirectory: string;

async function packVsix(directory: string): Promise<string> {
  const vsix = join(directory, "board-modeler.vsix");
  await createVSIX({ cwd: extensionRoot, dependencies: false, packagePath: vsix });
  return vsix;
}

/** The files of a folder of the example by their path in the workspace, each as a text. */
async function exampleFiles(folder: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const name of (await readdir(join(exampleRoot, folder))).sort()) {
    files[`${folder}/${name}`] = await readFile(join(exampleRoot, folder, name), "utf8");
  }
  return files;
}

// VS Code runs the extension unpacked from the VSIX, without node_modules: a module the bundle
// requires but does not contain fails to activate there, while the workspace folder would find it.
beforeAll(async () => {
  packageDirectory = await mkdtemp(join(tmpdir(), "board-vsix-"));
  const vsix = prebuiltVsix ? resolve(prebuiltVsix) : await packVsix(packageDirectory);
  await promisify(execFile)("unzip", ["-q", vsix, "extension/*", "-d", packageDirectory]);
}, 120_000);

afterAll(async () => {
  if (packageDirectory) await rm(packageDirectory, { recursive: true, force: true });
});

it(
  "opens a board with its models, edits, saves, undoes and themes it in a real VS Code",
  { timeout: 600_000 },
  async () => {
    const board = await readFile(join(exampleRoot, "example.board"), "utf8");
    const models = await exampleFiles("models");
    const modelCount = Object.keys(models).length;
    const result = await runVsCodeSmoke({
      extensionPath: join(packageDirectory, "extension"),
      // The workspace is the example folder: it has no `.git`, so the folder VS Code opens is
      // the board's root, and the models and the picture are the files the board names. The
      // picture is an SVG, which the driver writes as the text it is.
      fixture: {
        fileName: "example.board",
        text: board,
        files: { ...models, ...(await exampleFiles("assets")) },
      },
      parse: (text) => {
        const parsed = parseBoardText(text);
        if (!parsed.ok) throw new Error(parsed.reason);
        return parsed.snapshot;
      },
      themes: ["light"],
      // The board has a toolbar of its own and no palette of the shell's.
      chrome: ["menu", "zoom"],
      ready: (context) => boardReady(context, modelCount),
      edit: addGroup,
      // What only a real VS Code with a real folder shows: the files of the workspace reach
      // the board, the list follows the folder, and an edit in place lands in the model's own
      // document, which the person saves.
      custom: async (context) => {
        await modelsDrawnAndPictureLoaded(context, modelCount);
        await pickerFollowsTheFolder(context, Object.keys(models));
        await editInPlaceLeavesTheModelDirty(context, {
          node: "n_wardley_map",
          shape: "cmp_water",
          file: "models/tea.owm",
          text: models["models/tea.owm"] ?? "",
          board: "example.board",
        });
      },
      // Off: the step focuses the first diagram-js canvas of the page and selects and copies
      // its elements. On a board that canvas is the preview of a model, which is inert; the
      // board's own canvas is React Flow.
      keys: false,
      // Off: the step reads the view and the selection of a diagram-js canvas across a redo
      // and an undo. A change of the board moves neither in any model's preview, so it would
      // hold whatever the board does.
      history: false,
      // Off: motion, hidden and reload read a diagram-js view as well, and the reload expects
      // the view back, which the board does not keep across a reload yet.
      workbench: false,
      name: "board",
      screenshotDir: join(boardRoot, "test-results/vscode-smoke"),
      vscodeVersion: process.env.VSCODE_VERSION || undefined,
      keepTemporaryFiles: process.env.VSCODE_SMOKE_KEEP === "1",
      log: (line) => console.log(`[vscode-smoke] ${line}`),
    });
    console.log(formatVsCodeSmoke(result));
    expect(result.failures, result.failures.join("\n")).toEqual([]);
  },
);
