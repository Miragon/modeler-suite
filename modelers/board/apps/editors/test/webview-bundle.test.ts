import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { build, type Message, type OutputFile } from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";
import { webviewBundle } from "../build/esbuild.mjs";

/**
 * `webviewBundle`, the options the VS Code webview is bundled with, held on one build of a page
 * that loads what such a page loads: the fonts, the board with its sheet, the shared base and the
 * eight notation modules through the registry (the suite's seven and BPMN). The build stays in
 * memory; nothing is written.
 */

const BOARD = fileURLToPath(new URL("../../../", import.meta.url));
/** The workspace that bundles with these options: the page's imports are resolved from there. */
const WEBVIEW_APP = join(BOARD, "apps/vscode");
const OUTPUT = join(BOARD, "apps/vscode/dist");

const PAGE = `
import "board-suite-editors/zod-jitless";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@miragon/board-renderer/assets/board.css";
import "board-suite-editors/base";
import { createCollaborativeModeler } from "@miragon/board-renderer";
import { SUITE_EDITORS } from "board-suite-editors";

(globalThis as Record<string, unknown>).page = {
  createCollaborativeModeler,
  editors: Promise.all(SUITE_EDITORS.map((entry) => entry.load())),
};
`;

const ROOT_CLASSES = [
  ".wardley-container",
  ".event-storming-container",
  ".tt-djs-container",
  ".cm-djs-container",
  ".vc-container",
  ".c4-container",
  ".business-model-canvas-container",
];
const BASE_PAD_RULE = "\n.djs-context-pad.open {";
const CONTEXT_MAPS_PAD_RULE = ":where(.cm-djs-container) .djs-context-pad.open {";
const CANVAS_MAPPING_RULE = ".cd-c-fill-grund {";
const SINGLE_COPIES = ["react", "react-dom", "yjs", "@xyflow/react", "diagram-js"];

const offsetsOf = (text: string, part: string): number[] => {
  const offsets: number[] = [];
  for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + 1)) offsets.push(at);
  return offsets;
};

describe("webviewBundle", () => {
  let outputs: OutputFile[];
  let warnings: Message[];
  /** every file the bundle was made of, as a path from the board's folder */
  let inputs: string[];

  const named = (suffix: string): OutputFile[] =>
    outputs.filter((file) => file.path.endsWith(suffix));
  const script = (): string => named(".js")[0]!.text;
  const sheet = (): string => named(".css")[0]!.text;

  beforeAll(async () => {
    const result = await build({
      ...webviewBundle,
      stdin: { contents: PAGE, resolveDir: WEBVIEW_APP, sourcefile: "page.ts", loader: "ts" },
      absWorkingDir: BOARD,
      outfile: join(OUTPUT, "webview.js"),
      format: "iife",
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    outputs = result.outputFiles;
    warnings = result.warnings;
    inputs = Object.keys(result.metafile.inputs);
  }, 60_000);

  // A warning here is a source of some modeler that esbuild reads another way than Vite does.
  it("bundles the seven modelers from their sources and BPMN without a warning", () => {
    expect(warnings.map((warning) => warning.text)).toEqual([]);
    expect(
      inputs.filter((input) => /^apps\/editors\/src\/notations\/[^/]+\.ts$/.test(input)),
    ).toHaveLength(8);
    expect(inputs).toContain("../wardley-maps/packages/renderer/src/index.ts");
    expect(inputs).toContain("packages/renderer/src/index.ts");
    // a modeler's dist is there only after that modeler was built
    expect(
      inputs.filter((input) => /^(\.\.\/[^./][^/]*\/)?packages\/[^/]+\/dist\//.test(input)),
    ).toEqual([]);
  });

  it("is one script and one sheet, the notations inside", () => {
    expect(named(".js").map((file) => file.path)).toEqual([join(OUTPUT, "webview.js")]);
    expect(named(".css").map((file) => file.path)).toEqual([join(OUTPUT, "webview.css")]);
    // a classic script, as a webview loads it: an import or export statement left over throws
    expect(() => new Script(script())).not.toThrow();
    for (const root of ROOT_CLASSES) expect(sheet().indexOf(root), root).toBeGreaterThan(-1);
    expect(sheet()).toContain(".board-root");
  });

  it("puts the font files beside the bundle, and none into the sheet", () => {
    const fonts = outputs.filter((file) => !/\.(js|css)$/.test(file.path));
    expect(fonts.length).toBeGreaterThan(0);
    const names = fonts.map((file) => file.path.slice(OUTPUT.length + 1));
    expect(names.filter((name) => !/^fonts\/[^/]+\.woff2$/.test(name))).toEqual([]);
    const linked = [...sheet().matchAll(/url\(([^)]+)\)/g)].map((match) =>
      match[1]!.replace(/["']/g, ""),
    );
    expect(linked.filter((url) => url.startsWith("data:font"))).toEqual([]);
    expect(names.filter((name) => !linked.includes(`./${name}`))).toEqual([]);
    expect(names.some((name) => name.startsWith("fonts/geist-latin-"))).toBe(true);
    expect(names.some((name) => name.startsWith("fonts/geist-mono-latin-"))).toBe(true);
  });

  it("holds the shared base once, before every renderer's own rules", () => {
    const firstOwnRule = Math.min(...ROOT_CLASSES.map((root) => sheet().indexOf(root)));

    const basePad = offsetsOf(sheet(), BASE_PAD_RULE);
    expect(basePad).toHaveLength(1);
    expect(basePad[0]).toBeLessThan(firstOwnRule);
    expect(offsetsOf(sheet(), CONTEXT_MAPS_PAD_RULE)[0]).toBeGreaterThan(basePad[0]!);

    const mapping = offsetsOf(sheet(), CANVAS_MAPPING_RULE);
    expect(mapping).toHaveLength(1);
    expect(mapping[0]).toBeLessThan(firstOwnRule);
  });

  it("holds the BPMN modeler's sheet, with its own copy of the base, to the BPMN editors", () => {
    const scope = offsetsOf(sheet(), "@scope ([data-notation=bpmn], .am-overlay-root) {");
    expect(scope).toHaveLength(1);
    // the modeler's own rules, its append menu and its properties panel, are all inside
    for (const rule of [".am-panel {", ".bio-properties-panel {"]) {
      const offsets = offsetsOf(sheet(), rule);
      expect(offsets.length, rule).toBeGreaterThan(0);
      for (const offset of offsets) expect(offset, rule).toBeGreaterThan(scope[0]!);
    }
    // its copy of diagram-js's rule is inside the scope, indented, and not at the top level
    expect(offsetsOf(sheet(), "\n  .djs-context-pad.open {").length).toBeGreaterThan(0);
    expect(offsetsOf(sheet(), BASE_PAD_RULE)).toHaveLength(1);
    // the font and the animations it names stay page-wide, where `@scope` cannot hold them
    expect(sheet().indexOf("@font-face {\n  font-family: bpmn;")).toBeLessThan(scope[0]!);
  });

  it("takes React's production build, whatever the caller minifies", () => {
    expect(script()).not.toContain("process.env.NODE_ENV");
    expect(
      inputs.some((input) => input.endsWith("/react-dom/cjs/react-dom-client.production.js")),
    ).toBe(true);
    expect(
      inputs.filter((input) => /\/node_modules\/react(-dom)?\/.*\.development\.js$/.test(input)),
    ).toEqual([]);
  });

  it("holds one copy of each library the board and its editors must share", () => {
    for (const name of SINGLE_COPIES) {
      const marker = `node_modules/${name}/`;
      const copies = new Set(
        inputs
          .filter((input) => input.includes(marker))
          .map((input) => input.slice(0, input.indexOf(marker) + marker.length)),
      );
      expect([...copies], name).toHaveLength(1);
    }
  });

  it("leaves the format, the entry and the output to its caller, and every tsconfig where it is", () => {
    expect(webviewBundle).toMatchObject({
      bundle: true,
      platform: "browser",
      target: "es2022",
      jsx: "automatic",
    });
    const left = [
      "format",
      "entryPoints",
      "outfile",
      "outdir",
      "minify",
      "sourcemap",
      "tsconfigRaw",
    ];
    expect(left.filter((key) => key in webviewBundle)).toEqual([]);
  });
});
