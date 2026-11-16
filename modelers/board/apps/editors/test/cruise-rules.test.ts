import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The reach of the board's own dependency-cruiser rules for its packages and apps. Each rule
 * names paths and package names, so a workspace it does not name is one that may import unseen:
 * `npm run board depcruise` says whether an import crosses a line, this test says whether the
 * line is drawn around every workspace the suite has today. dependency-cruiser names a target
 * by its path from the modeler's folder, or by the specifier where it resolves to nothing (a
 * modeler that was not built).
 */
interface Rule {
  name: string;
  from: { path: string; pathNot?: string | undefined };
  to: { path: string | string[] };
}

const require = createRequire(import.meta.url);
const config = require("../../../.dependency-cruiser.cjs") as {
  forbidden: Rule[];
  options: { exclude?: { path: string } | undefined };
};

const BOARD = fileURLToPath(new URL("../../../", import.meta.url));
const MODELERS = join(BOARD, "..");

function ruleNamed(name: string): Rule {
  const rule = config.forbidden.find((candidate) => candidate.name === name);
  if (!rule) throw new Error(`the board's dependency-cruiser config has no rule '${name}'`);
  return rule;
}

const starts = (rule: Rule, file: string): boolean =>
  new RegExp(rule.from.path).test(file) &&
  !(rule.from.pathNot !== undefined && new RegExp(rule.from.pathNot).test(file));

const forbids = (rule: Rule, target: string): boolean =>
  [rule.to.path].flat().some((path) => new RegExp(path).test(target));

/** both ways dependency-cruiser names a package: resolved through node_modules, and unresolved */
const spellings = (name: string): string[] => [`../../node_modules/${name}/src/index.ts`, name];

function packageNames(modeler: string): string[] {
  const packages = join(MODELERS, modeler, "packages");
  return readdirSync(packages)
    .map((folder) => join(packages, folder, "package.json"))
    .map((manifest) => (JSON.parse(readFileSync(manifest, "utf8")) as { name: string }).name);
}

/** a file of every package of a modeler as a relative import from the board resolves to it */
const sources = (modeler: string): string[] =>
  readdirSync(join(MODELERS, modeler, "packages")).map(
    (folder) => `../${modeler}/packages/${folder}/src/index.ts`,
  );

const otherModelers = readdirSync(MODELERS).filter(
  (folder) => folder !== "board" && readdirSync(join(MODELERS, folder)).includes("packages"),
);
const folders = (parent: string): string[] =>
  readdirSync(join(BOARD, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

describe("packages-no-other-modeler", () => {
  const rule = ruleNamed("packages-no-other-modeler");

  it("forbids every package of every other modeler of the suite", () => {
    const names = otherModelers.flatMap(packageNames);
    expect(otherModelers.length).toBeGreaterThanOrEqual(7);
    expect(names.length).toBeGreaterThan(20);
    expect(names.flatMap(spellings).filter((target) => !forbids(rule, target))).toEqual([]);
  });

  it("forbids a relative import into any other modeler's folder, whatever lies there", () => {
    const targets = [
      ...otherModelers.flatMap(sources),
      ...otherModelers.map((modeler) => `../${modeler}/apps/webapp/src/main.ts`),
      ...otherModelers.map((modeler) => `../${modeler}/example/sample.txt`),
    ];
    expect(targets).toContain("../wardley-maps/packages/renderer/src/index.ts");
    expect(targets.length).toBeGreaterThan(30);
    expect(targets.filter((target) => !forbids(rule, target))).toEqual([]);
  });

  it("allows the board's own packages, the contract and the shell", () => {
    const allowed = [...packageNames("board"), "@miragon/modeler-api", "@miragon/modeler-shell"];
    expect(allowed).toContain("@miragon/board-host");
    expect(allowed.flatMap(spellings).filter((target) => forbids(rule, target))).toEqual([]);
  });

  it("allows what lies above the modelers and inside the board, by path", () => {
    const allowed = [
      "../../packages/api/dist/index.d.ts",
      "../../packages/shell/dist/index.js",
      "../../node_modules/react/index.js",
      "../../node_modules/diagram-js/lib/Diagram.js",
      "../../tooling/dependency-cruiser.cjs",
      ...folders("packages").map((folder) => `packages/${folder}/src/index.ts`),
      "apps/editors/src/registry.ts",
      "test-support/real-input.ts",
    ];
    expect(allowed.filter((target) => forbids(rule, target))).toEqual([]);
  });

  it("starts at every package and every app but apps/editors, their tests included", () => {
    const workspaces = [
      ...folders("packages").map((folder) => `packages/${folder}`),
      ...folders("apps").map((folder) => `apps/${folder}`),
    ];
    const free = workspaces.filter(
      (workspace) =>
        !starts(rule, `${workspace}/src/index.ts`) || !starts(rule, `${workspace}/test/a.test.ts`),
    );
    expect(workspaces).toContain("packages/host");
    expect(workspaces).toContain("apps/webapp");
    expect(free).toEqual(["apps/editors"]);
  });
});

describe("packages-no-apps", () => {
  const rule = ruleNamed("packages-no-apps");

  it("starts at every package and forbids every app workspace, by path and by name", () => {
    const apps = folders("apps").map(
      (folder) =>
        (
          JSON.parse(readFileSync(join(BOARD, "apps", folder, "package.json"), "utf8")) as {
            name: string;
          }
        ).name,
    );
    const targets = [
      ...folders("apps").map((folder) => `apps/${folder}/src/index.ts`),
      ...apps.flatMap(spellings),
      "../../node_modules/board-suite-editors/index.d.ts",
    ];
    expect(apps).toContain("board-suite-editors");
    expect(targets.filter((target) => !forbids(rule, target))).toEqual([]);
    expect(
      folders("packages").filter((folder) => !starts(rule, `packages/${folder}/src/index.ts`)),
    ).toEqual([]);
    expect(
      packageNames("board")
        .flatMap(spellings)
        .filter((t) => forbids(rule, t)),
    ).toEqual([]);
  });
});

describe("host-no-editor-libraries", () => {
  const rule = ruleNamed("host-no-editor-libraries");

  it("keeps diagram-js, React and React Flow out of the host package's sources", () => {
    const targets = [
      "../../node_modules/diagram-js/lib/Diagram.js",
      // a type of the library is an import of it too
      "../../node_modules/diagram-js/lib/core/Canvas.d.ts",
      "../../node_modules/react/index.js",
      "../../node_modules/react-dom/client.js",
      "../../node_modules/@xyflow/react/dist/esm/index.d.ts",
    ];
    expect(targets.filter((target) => !forbids(rule, target))).toEqual([]);
    const sourcesOfHost = readdirSync(join(BOARD, "packages/host/src"), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => `packages/host/src/${file.split("\\").join("/")}`);
    expect(sourcesOfHost).toContain("packages/host/src/embed/embed-modeler.ts");
    expect(sourcesOfHost.filter((file) => !starts(rule, file))).toEqual([]);
  });

  it("leaves the package's tests, the other packages and the board's own libraries alone", () => {
    // a test mounts the real board, and the renderer is React's
    expect(starts(rule, "packages/host/test/support/board.ts")).toBe(false);
    expect(starts(rule, "packages/renderer/src/index.ts")).toBe(false);
    expect(starts(rule, "apps/editors/src/notations/c4.ts")).toBe(false);
    const allowed = [
      ...spellings("@miragon/board-renderer"),
      ...spellings("@miragon/board-files"),
      ...spellings("@miragon/modeler-api"),
      "../../node_modules/react-flow-renderer-of-somebody/index.js",
      "../../node_modules/diagram-js-direct-editing/lib/index.js",
    ];
    expect(allowed.filter((target) => forbids(rule, target))).toEqual([]);
  });
});

describe("files-no-canvas-libraries", () => {
  const rule = ruleNamed("files-no-canvas-libraries");

  it("keeps the canvas libraries, the renderer and the host package out of files", () => {
    const targets = [
      "../../node_modules/react/index.js",
      "../../node_modules/react-dom/client.js",
      "../../node_modules/@xyflow/react/dist/esm/index.js",
      "../../node_modules/yjs/dist/src/index.d.ts",
      ...spellings("@miragon/board-renderer"),
      ...spellings("@miragon/board-host"),
      "packages/renderer/src/index.ts",
      "packages/host/src/index.ts",
    ];
    expect(starts(rule, "packages/files/src/client.ts")).toBe(true);
    expect(starts(rule, "packages/host/src/index.ts")).toBe(false);
    expect(targets.filter((target) => !forbids(rule, target))).toEqual([]);
    expect(forbids(rule, "packages/files/src/port.ts")).toBe(false);
  });
});

describe("ide-editor-no-suite-editors", () => {
  const rule = ruleNamed("ide-editor-no-suite-editors");

  it("keeps apps/editors out of the sources of apps/ide-editor, by name and by path", () => {
    const targets = [
      ...spellings("board-suite-editors"),
      // the declared face, which the cruiser resolves the bare name to
      "../../node_modules/board-suite-editors/index.d.ts",
      "../../node_modules/board-suite-editors/src/base.ts",
      "board-suite-editors/base",
      "board-suite-editors/suffixes",
      "apps/editors/src/registry.ts",
      "apps/editors/src/notations/wardley.ts",
    ];
    expect(targets.filter((target) => !forbids(rule, target))).toEqual([]);
    const sourcesOfIdeEditor = readdirSync(join(BOARD, "apps/ide-editor/src"), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => `apps/ide-editor/src/${file.split("\\").join("/")}`);
    expect(sourcesOfIdeEditor.length).toBeGreaterThan(0);
    expect(sourcesOfIdeEditor.filter((file) => !starts(rule, file))).toEqual([]);
  });

  it("leaves its tests, the webview, the shell and the board's packages alone", () => {
    // a test of the board inside the shell may take a real editor from the registry
    expect(starts(rule, "apps/ide-editor/test/browser/board-editor.browser.test.ts")).toBe(false);
    expect(starts(rule, "apps/vscode/src/webview/main.ts")).toBe(false);
    const allowed = [
      ...packageNames("board").flatMap(spellings),
      "../../node_modules/@miragon/modeler-shell/dist/ide.d.ts",
      "@miragon/modeler-shell/ide",
      "apps/ide-editor/src/zoom-target.ts",
    ];
    expect(allowed.filter((target) => forbids(rule, target))).toEqual([]);
  });
});

describe("vscode-host-no-page-code", () => {
  const rule = ruleNamed("vscode-host-no-page-code");
  const SHELL = "@miragon/modeler-shell";
  /** the entries of the shell an extension host loads: its own, the DOM-free core, the test kits */
  const HOST_ENTRY = /^\.\/(vscode\/extension|core|testing(\/.+)?|package\.json)$/;

  const shellEntries = Object.entries(
    (
      JSON.parse(readFileSync(join(BOARD, "../../packages/shell/package.json"), "utf8")) as {
        exports: Record<string, unknown>;
      }
    ).exports,
  );
  const filesOf = (target: unknown): string[] =>
    typeof target === "string" ? [target] : Object.values(target as object).flatMap(filesOf);
  /** an entry of the shell as the cruiser names it: by every file it resolves to, and unresolved */
  const namesOf = ([entry, target]: [string, unknown]): string[] => [
    `${SHELL}${entry.slice(1)}`,
    ...filesOf(target).map((file) => `../../node_modules/${SHELL}/${file.slice(2)}`),
  ];

  it("starts at every source of the extension but the webview's", () => {
    const host = [
      "apps/vscode/src/extension.ts",
      "apps/vscode/src/boardEditor.ts",
      "apps/vscode/src/boardEditorOptions.ts",
      "apps/vscode/src/files/backend.ts",
      "apps/vscode/src/files/memory-vscode.ts",
    ];
    expect(host.filter((file) => !starts(rule, file))).toEqual([]);
    const others = [
      "apps/vscode/src/webview/main.ts",
      "apps/vscode/src/webview/channel.ts",
      "apps/vscode/test/bundle.test.ts",
      "apps/ide-editor/src/board-editor.ts",
      "apps/webapp/src/app.ts",
    ];
    expect(others.filter((file) => starts(rule, file))).toEqual([]);
  });

  it("forbids the libraries of a page, the renderer, the host package and the other apps", () => {
    const targets = [
      "../../node_modules/react/index.js",
      "../../node_modules/react-dom/client.js",
      "../../node_modules/@xyflow/react/dist/esm/index.d.ts",
      "../../node_modules/yjs/dist/src/index.d.ts",
      "../../node_modules/diagram-js/lib/Diagram.js",
      "../../node_modules/tiny-svg/dist/index.js",
      "../../node_modules/min-dom/dist/index.js",
      "../../node_modules/lucide-react/dist/lucide-react.d.ts",
      "../../node_modules/dompurify/dist/purify.es.d.mts",
      "../../node_modules/markdown-it/dist/markdown-it.d.mts",
      ...spellings("@miragon/board-renderer"),
      "../../node_modules/@miragon/board-renderer/src/assets/board.css",
      ...spellings("@miragon/board-host"),
      "packages/renderer/src/index.ts",
      "packages/host/src/index.ts",
      ...spellings("board-ide-editor"),
      "board-ide-editor/app.css",
      "apps/ide-editor/src/index.ts",
      ...spellings("board-suite-editors"),
      "../../node_modules/board-suite-editors/index.d.ts",
      "../../node_modules/board-suite-editors/src/base.ts",
      "../../node_modules/board-suite-editors/src/zod-jitless.ts",
      "board-suite-editors/base",
      "apps/editors/src/registry.ts",
      "apps/editors/src/notations/c4.ts",
    ];
    expect(targets.filter((target) => !forbids(rule, target))).toEqual([]);
  });

  // The shell is one package with entries for a page and entries for a host. Read from its
  // export map, so that an entry the shell adds is decided here before a host imports it.
  it("forbids every entry of the shell but the host's own", () => {
    const pageEntries = shellEntries.filter(([entry]) => !HOST_ENTRY.test(entry));
    const hostEntries = shellEntries.filter(([entry]) => HOST_ENTRY.test(entry));
    expect(pageEntries.map(([entry]) => entry)).toEqual(
      expect.arrayContaining([".", "./ide", "./diagram-js", "./vscode/webview", "./shell.css"]),
    );
    expect(hostEntries.map(([entry]) => entry)).toEqual(
      expect.arrayContaining(["./vscode/extension", "./core", "./testing/vscode-stub"]),
    );
    expect(pageEntries.flatMap(namesOf).filter((name) => !forbids(rule, name))).toEqual([]);
    expect(hostEntries.flatMap(namesOf).filter((name) => forbids(rule, name))).toEqual([]);
  });

  it("allows what a host in Node reads: the files, the format, the suffix table, vscode", () => {
    const allowed = [
      ...spellings("@miragon/board-files"),
      ...spellings("@miragon/board-schema-model"),
      ...spellings("@miragon/modeler-api"),
      "../../node_modules/board-suite-editors/src/suffixes.ts",
      "board-suite-editors/suffixes",
      "apps/editors/src/suffixes.ts",
      "../../node_modules/@types/vscode/index.d.ts",
      "path",
      "apps/vscode/src/files/root.ts",
      // a name that only starts like a forbidden one
      "../../node_modules/react-is/index.js",
      "../../node_modules/diagram-js-direct-editing/lib/index.js",
    ];
    expect(allowed.filter((target) => forbids(rule, target))).toEqual([]);
  });
});

describe("what the cruise leaves out", () => {
  it("is the build output of the apps and of the published packages and nothing else", () => {
    const excluded = new RegExp(config.options.exclude?.path ?? "$^");
    expect(excluded.test("apps/webapp/dist/assets/index-CtaqJd8o.js")).toBe(true);
    expect(excluded.test("apps/vscode/dist/extension.cjs")).toBe(true);
    expect(excluded.test("apps/vscode/dist/webview.js")).toBe(true);
    expect(excluded.test("packages/renderer/dist/index.js")).toBe(true);
    expect(excluded.test("packages/renderer/dist/model-node-Ch9YOcao.js")).toBe(true);
    expect(excluded.test("packages/schema-model/dist/index.cjs")).toBe(true);
    const kept = [
      "apps/webapp/src/app.ts",
      "apps/vscode/src/extension.ts",
      "apps/editors/build/aliases.mjs",
      "packages/renderer/src/index.ts",
      // the contract's build, which dom-free-contract-types-only resolves to
      "../../node_modules/@miragon/modeler-api/dist/index.d.ts",
      "../../packages/api/dist/index.d.ts",
    ];
    expect(kept.filter((path) => excluded.test(path))).toEqual([]);
  });
});
