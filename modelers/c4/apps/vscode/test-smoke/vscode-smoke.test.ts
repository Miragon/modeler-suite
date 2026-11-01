import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseWorkspace } from "@miragon/c4-dsl";
import { formatVsCodeSmoke, runVsCodeSmoke } from "@miragon/modeler-shell/testing/vscode-electron";
import { createVSIX } from "@vscode/vsce";
import { afterAll, beforeAll, expect, it } from "vitest";
import { THEMES } from "../../../packages/renderer/src/themes.js";
import { EXAMPLE_DIAGRAM } from "../src/examples.js";

const extensionRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

// The release passes the VSIX it is about to publish, so the file users get is the one tested.
const prebuiltVsix = process.env.VSCODE_SMOKE_VSIX;

let packageDirectory: string;

async function packVsix(directory: string): Promise<string> {
  const vsix = join(directory, "c4-modeler.vsix");
  await createVSIX({ cwd: extensionRoot, dependencies: false, packagePath: vsix });
  return vsix;
}

// VS Code runs the extension unpacked from the VSIX, without node_modules: a module the bundle
// requires but does not contain fails to activate there, while the workspace folder would find it.
beforeAll(async () => {
  packageDirectory = await mkdtemp(join(tmpdir(), "c4-vsix-"));
  const vsix = prebuiltVsix ? resolve(prebuiltVsix) : await packVsix(packageDirectory);
  await promisify(execFile)("unzip", ["-q", vsix, "extension/*", "-d", packageDirectory]);
}, 120_000);

afterAll(async () => {
  if (packageDirectory) await rm(packageDirectory, { recursive: true, force: true });
});

/*
 * What the stub of e2e cannot show: the webview inside VS Code's frames, a canvas edit that dirties
 * the tab, save and undo through VS Code's keybindings, and the theme bridge under VS Code's four
 * default themes, with a screenshot each. The driver also checks the zoom and selection keys, the
 * view and selection across a redo and an undo, reduced motion, a hidden tab and Developer: Reload
 * Window. The first run downloads VS Code into the OS's cache directory (about 350 MB, 0.9 GB
 * unpacked). VSCODE_VERSION picks the VS Code (`stable`, `1.96.0`; default the newest stable
 * release that satisfies engines.vscode), VSCODE_SMOKE_KEEP=1 keeps VS Code's profile and
 * VSCODE_SMOKE_SKIP names the steps to skip (keys, history, workbench).
 *
 * The fixture is the example both apps ship (SPEC 8.2, 9.6), as a `.c4` file, which opens in the
 * editor of priority `default`; the driver also associates the fixture's file name with that
 * editor in the profile's settings. The default edit (Enter on the palette's first creating entry,
 * then Escape on the name editor) is one document edit, one undo step.
 */
it(
  "opens, edits, saves, undoes and themes a C4 diagram in a real VS Code",
  { timeout: 600_000 },
  async () => {
    const result = await runVsCodeSmoke({
      extensionPath: join(packageDirectory, "extension"),
      fixture: { fileName: "workspace.c4", text: EXAMPLE_DIAGRAM },
      undoSteps: 1,
      parse(text) {
        const { ok, diagnostics } = parseWorkspace(text);
        if (!ok) {
          const rejections = diagnostics.filter((diagnostic) => diagnostic.rejects);
          throw new Error(rejections.map(({ line, message }) => `${line}: ${message}`).join("; "));
        }
      },
      themes: THEMES,
      name: "c4",
      screenshotDir: join(repositoryRoot, "test-results/vscode-smoke"),
      vscodeVersion: process.env.VSCODE_VERSION || undefined,
      keepTemporaryFiles: process.env.VSCODE_SMOKE_KEEP === "1",
      log: (line) => console.log(`[vscode-smoke] ${line}`),
    });
    console.log(formatVsCodeSmoke(result));
    expect(result.failures, result.failures.join("\n")).toEqual([]);
  },
);
