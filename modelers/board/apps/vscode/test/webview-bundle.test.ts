import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import type { BuildOptions, OutputFile } from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The webview bundle exactly as `vscode:prepublish` builds it for the VSIX, from the extension's
 * own esbuild config and its real entry. Built in memory: nothing is written. What the bundle
 * does in a browser under the extension's policy is the e2e project's (`shipped-bundle.spec.ts`).
 */

const APP = fileURLToPath(new URL("../", import.meta.url));

interface Built {
  outputs: OutputFile[];
  /** every file the bundle was made of */
  inputs: string[];
}

async function buildProductionWebviewBundle(): Promise<Built> {
  // A computed specifier: the config is untyped JavaScript, loaded by Node, not compiled by Vite.
  const configUrl = new URL("../esbuild.config.mjs", import.meta.url).href;
  const { bundleOptions } = (await import(/* @vite-ignore */ configUrl)) as {
    bundleOptions(mode: { production: boolean }): { web: BuildOptions };
  };
  const { web } = bundleOptions({ production: true });
  const esbuild = await import("esbuild");
  const result = await esbuild.build({
    ...web,
    // the inputs are then named from the extension's folder, wherever the test runs from
    absWorkingDir: APP,
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  return { outputs: result.outputFiles, inputs: Object.keys(result.metafile.inputs) };
}

const RENDERER_ROOTS = [
  ".wardley-container",
  ".event-storming-container",
  ".tt-djs-container",
  ".cm-djs-container",
  ".vc-container",
  ".c4-container",
  ".business-model-canvas-container",
];
const SHELL_RULE = ".cd-shell{";
const BOARD_RULE = ".board-root";
const BASE_RULE = ".djs-context-pad.open{display:block}";
const PREVIEW_RULE = ".board-engine[data-armed=false][data-embed=diagram-js]";
const APP_RULE = ".cd-shell .board-root .board-toolbar{";

const count = (text: string, part: string): number => text.split(part).length - 1;

describe("the production webview bundle", () => {
  let built: Built;
  let script: string;
  let sheet: string;

  const named = (end: string): OutputFile[] =>
    built.outputs.filter((file) => file.path.endsWith(end));

  beforeAll(async () => {
    built = await buildProductionWebviewBundle();
    script = named("/dist/webview.js")[0]?.text ?? "";
    sheet = named("/dist/webview.css")[0]?.text ?? "";
  }, 120_000);

  it("is one classic script, one sheet and the font files, where the extension's HTML looks for them", () => {
    const names = built.outputs.map((file) => file.path.slice(file.path.indexOf("/dist/")));
    expect(names.filter((name) => !name.startsWith("/dist/fonts/")).sort()).toEqual([
      "/dist/webview.css",
      "/dist/webview.js",
    ]);
    const fonts = names.filter((name) => name.startsWith("/dist/fonts/"));
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.filter((name) => !/^\/dist\/fonts\/geist-[a-z0-9-]+\.woff2$/i.test(name))).toEqual(
      [],
    );
    // every font the sheet names is a file beside it, under the one local resource root
    const referenced = [...sheet.matchAll(/url\("?\.\/(fonts\/[^")]+)"?\)/g)].map(
      ([, file]) => `/dist/${String(file)}`,
    );
    expect([...new Set(referenced)].sort()).toEqual([...fonts].sort());
    expect(sheet).not.toMatch(/url\(data:font/);
    // The policy lets one script run, the nonce'd one: a module that imports or exports would
    // not parse as the classic script the HTML loads.
    expect(() => new Script(script)).not.toThrow();
  });

  it("acquires VS Code's API in one place", () => {
    expect(count(script, "acquireVsCodeApi")).toBe(1);
  });

  it("holds the page's sheets in their order: fonts, shell, board, the base once, the three rules, then each renderer's own", () => {
    for (const once of [SHELL_RULE, BASE_RULE, PREVIEW_RULE, APP_RULE]) {
      expect(count(sheet, once), once).toBe(1);
    }
    const order = [
      sheet.indexOf("@font-face"),
      sheet.indexOf(SHELL_RULE),
      sheet.indexOf(BOARD_RULE),
      sheet.indexOf(BASE_RULE),
      sheet.indexOf(PREVIEW_RULE),
      sheet.indexOf(APP_RULE),
    ];
    expect(order[0]).toBe(0);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const root of RENDERER_ROOTS) {
      expect(sheet.indexOf(root), root).toBeGreaterThan(sheet.indexOf(APP_RULE));
    }
  });

  it("holds one copy of each library its parts must share", () => {
    for (const library of ["zod", "react", "react-dom", "yjs", "@xyflow/react", "diagram-js"]) {
      const marker = `node_modules/${library}/`;
      const roots = new Set(
        built.inputs
          .filter((input) => input.includes(marker))
          .map((input) => input.slice(0, input.lastIndexOf(marker))),
      );
      expect([...roots], library).toHaveLength(1);
    }
  });

  it("is made of the webview's three sources and nothing of the extension host", () => {
    expect(built.inputs.filter((input) => input.startsWith("src/")).sort()).toEqual([
      "src/webview/channel.ts",
      "src/webview/main.ts",
      "src/webview/paste.ts",
    ]);
    expect(built.inputs.filter((input) => /node_modules\/(vscode|@types)\//.test(input))).toEqual(
      [],
    );
  });
});
