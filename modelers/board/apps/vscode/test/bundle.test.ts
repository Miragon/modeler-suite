import { readdirSync, readFileSync } from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFunction } from "node:vm";
import { PROTOCOL } from "@miragon/board-files";
import type { BuildOptions } from "esbuild";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as vscodeStub from "./__mocks__/vscode.js";
import { vscodeMock } from "./__mocks__/vscode.js";
import { fakeWebviewPanel } from "./support/panel.js";

interface Extension {
  activate(context: { extensionUri: unknown; subscriptions: { dispose(): unknown }[] }): void;
  deactivate(): void;
}

interface Provider {
  resolveCustomTextEditor(document: unknown, panel: unknown, token: unknown): unknown;
}

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  main: string;
  contributes: { customEditors: { viewType: string }[]; commands: { command: string }[] };
};

interface Built {
  code: string;
  path: string;
  /** every file the bundle was made of */
  inputs: string[];
}

/** The extension host bundle exactly as `vscode:prepublish` builds it for the VSIX. */
async function buildProductionHostBundle(): Promise<Built> {
  // A computed specifier: the config is untyped JavaScript, loaded by Node, not compiled by Vite.
  const configUrl = new URL("../esbuild.config.mjs", import.meta.url).href;
  const { bundleOptions } = (await import(/* @vite-ignore */ configUrl)) as {
    bundleOptions(mode: { production: boolean }): { host: BuildOptions };
  };
  const { host } = bundleOptions({ production: true });
  const esbuild = await import("esbuild");
  const result = await esbuild.build({ ...host, write: false, metafile: true, logLevel: "silent" });
  const [output] = result.outputFiles;
  if (!output) throw new Error("esbuild produced no extension host bundle");
  return { code: output.text, path: output.path, inputs: Object.keys(result.metafile.inputs) };
}

/** Runs the bundle the way VS Code does: `vscode` from the host, Node's built-ins, nothing else. */
function loadBundle({ code, path }: Built): { extension: Extension; required: string[] } {
  const nodeRequire = createRequire(path);
  const required: string[] = [];
  const require = (id: string): unknown => {
    required.push(id);
    if (id === "vscode") return vscodeStub;
    if (isBuiltin(id)) return nodeRequire(id);
    throw new Error(`the bundle requires "${id}" at runtime, which the VSIX does not ship`);
  };
  const module = { exports: {} };
  compileFunction(code, ["exports", "require", "module", "__filename", "__dirname"], {
    filename: path,
  })(module.exports, require, module, path, dirname(path));
  return { extension: module.exports as Extension, required };
}

const BOARD = "/work/repo/boards/a.board";

beforeEach(
  () =>
    void vscodeMock.reset(
      {
        "/work/repo/.git/HEAD": "",
        [BOARD]: "",
        "/work/repo/models/tea.owm": "title Tea\n",
        "/work/repo/models/sample.ttm.json": "{}",
        "/work/repo/readme.md": "# Repo\n",
      },
      { workspaceFolders: ["/work/repo"] },
    ),
);

// The VSIX ships dist/extension.cjs without node_modules: a require esbuild leaves in the bundle
// throws on activation, and VS Code then shows the board editor loading forever.
describe("the production extension host bundle", () => {
  let built: Built;

  it("is written where the manifest's main points", async () => {
    built = await buildProductionHostBundle();
    expect(built.path.endsWith(manifest.main.replace(/^\.\//, "/"))).toBe(true);
  }, 60_000);

  it("activates with only vscode and Node, and registers the custom editor and the commands of the manifest", () => {
    const { extension, required } = loadBundle(built);
    const subscriptions: { dispose(): unknown }[] = [];

    extension.activate({ extensionUri: vscodeStub.Uri.file("/ext"), subscriptions });

    expect(vscodeMock.registeredEditors().map((editor) => editor.viewType)).toEqual(
      manifest.contributes.customEditors.map((editor) => editor.viewType),
    );
    expect(vscodeMock.memory.registeredCommands().sort()).toEqual(
      manifest.contributes.commands.map((entry) => entry.command).sort(),
    );
    expect(subscriptions).toHaveLength(1);
    expect(required).toContain("vscode");
    extension.deactivate();
    // VS Code disposes the subscriptions of an extension it deactivates: the names are free again
    for (const subscription of subscriptions) subscription.dispose();
    expect(vscodeMock.memory.registeredCommands()).toEqual([]);
    expect(vscodeMock.registeredEditors().at(-1)?.disposed).toBe(true);
    expect(vscodeMock.memory.diagnostics.at(-1)?.disposed).toBe(true);
  });

  it("writes the example from inside the bundle: every file of the example folder, as it is there", async () => {
    const { extension } = loadBundle(built);
    extension.activate({ extensionUri: vscodeStub.Uri.file("/ext"), subscriptions: [] });
    vscodeMock.answerSaveDialog(vscodeStub.Uri.file("/work/repo/example.board"));

    await vscodeStub.commands.executeCommand("board.newBoardFromExample");

    const folder = fileURLToPath(new URL("../../../example/", import.meta.url));
    const models = readdirSync(join(folder, "models"));
    expect(models.length).toBeGreaterThan(0);
    // tea.owm was in the repository before, and is the repository's still
    for (const name of models.filter((model) => model !== "tea.owm")) {
      expect(vscodeMock.memory.disk.text(`/work/repo/models/${name}`), name).toBe(
        readFileSync(join(folder, "models", name), "utf8"),
      );
    }
    expect(vscodeMock.memory.disk.text("/work/repo/models/tea.owm")).toBe("title Tea\n");
    expect(vscodeMock.memory.disk.text("/work/repo/example.board")).toContain(
      '"file":"models/tea.owm"',
    );
  });

  it("serves a board's files from inside the bundle: the suffix table and the files server are in it", async () => {
    const { extension } = loadBundle(built);
    extension.activate({ extensionUri: vscodeStub.Uri.file("/ext"), subscriptions: [] });
    const provider = vscodeMock.lastRegisteredProvider<Provider>();
    const document = await vscodeMock.memory.vscode.workspace.openTextDocument(
      vscodeStub.Uri.file(BOARD),
    );
    const panel = fakeWebviewPanel();
    await provider.resolveCustomTextEditor(document, panel.panel, {});

    await panel.receive({ type: "board.hello", protocol: PROTOCOL });

    await vi.waitFor(() =>
      expect(panel.posted).toContainEqual({
        type: "board.paths",
        paths: ["models/sample.ttm.json", "models/tea.owm"],
      }),
    );
  });

  it("holds no code of a page: no React, no renderer, no diagram-js, none of the seven modelers", () => {
    const page = built.inputs.filter((input) =>
      /node_modules\/(react|react-dom|@xyflow|yjs|diagram-js|tiny-svg|min-dom|lucide-react|dompurify|markdown-it|zod)\/|packages\/(renderer|host)\/|apps\/(ide-editor|webapp)\/|modelers\/(?!board\/)/.test(
        input,
      ),
    );
    expect(page).toEqual([]);
    // and of the board's own workspaces what the host half is made of
    expect(built.inputs.some((input) => input.endsWith("apps/editors/src/suffixes.ts"))).toBe(true);
    expect(built.inputs.some((input) => input.endsWith("packages/files/src/server.ts"))).toBe(true);
    expect(built.inputs.some((input) => input.includes("memory-vscode"))).toBe(false);
    // the board's reader, for the Problems view, and the example folder, each file as a text
    expect(
      built.inputs.some((input) => input.endsWith("packages/schema-model/src/format.ts")),
    ).toBe(true);
    const example = fileURLToPath(new URL("../../../example/", import.meta.url));
    const shown = ["models", "assets"].flatMap((folder) => readdirSync(join(example, folder)));
    expect(shown.length).toBeGreaterThan(0);
    expect(
      built.inputs.filter((input) => /(^|\/)example\/(models|assets)\//.test(input)),
    ).toHaveLength(shown.length);
  });
});
