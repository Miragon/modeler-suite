import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "vite";
import { describe, expect, it } from "vitest";
import { esbuildAlias, sourceAliases } from "../build/aliases.mjs";
import { cssBaseAliases, cssBaseOnce } from "../build/css-base.mjs";
import { prebundle } from "../build/prebundle.mjs";

/**
 * The three build helpers every bundler config of the board takes (Vitest, the web app's Vite,
 * later esbuild): the other modelers from their sources, what Vite pre-bundles, and the shared
 * sheet base once. A config has no test of its own, so what the helpers promise is held here.
 */

const MODELERS = fileURLToPath(new URL("../../../../", import.meta.url));
const EDITORS = fileURLToPath(new URL("../", import.meta.url));

const packageFolders = readdirSync(MODELERS)
  .map((modeler) => join(MODELERS, modeler, "packages"))
  .filter((packages) => existsSync(packages))
  .flatMap((packages) => readdirSync(packages).map((name) => join(packages, name)))
  .filter((folder) => existsSync(join(folder, "package.json")));

const nameOf = (folder: string): string =>
  (JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { name: string }).name;

/** The seven sheets of the suite's diagram-js renderers; the board's own has no such base. */
const rendererSheets = readdirSync(MODELERS)
  .filter((modeler) => modeler !== "board")
  .map((modeler) => join(MODELERS, modeler, "packages/renderer/src/assets"))
  .filter((assets) => existsSync(assets))
  .flatMap((assets) =>
    readdirSync(assets)
      .filter((file) => file.endsWith(".css"))
      .map((file) => join(assets, file)),
  );

const importsOf = (sheet: string): string[] =>
  [...readFileSync(sheet, "utf8").matchAll(/@import\s+"([^"]+)"/g)].map((match) => match[1]!);

const caughtByBase = (specifier: string): boolean =>
  cssBaseAliases.some(({ find }) => find.test(specifier));

describe("sourceAliases", () => {
  it("names every package of every modeler, as its src/index.ts", () => {
    expect(packageFolders.length).toBeGreaterThanOrEqual(27);
    for (const folder of packageFolders) {
      const entry = sourceAliases.find(({ find }) => find === nameOf(folder));
      expect(entry?.replacement, folder).toBe(join(folder, "src/index.ts"));
      expect(existsSync(entry!.replacement), entry!.replacement).toBe(true);
    }
  });

  it("names each package once, and nothing that is no package of a modeler", () => {
    const finds = sourceAliases.map(({ find }) => find);
    expect(new Set(finds).size).toBe(finds.length);
    const names = packageFolders.map(nameOf);
    const strangers = finds.filter(
      (find) => !names.some((name) => find === name || find.startsWith(`${name}/`)),
    );
    expect(strangers).toEqual([]);
  });

  // A bundler takes the first entry that starts the import, so a subpath after its package would
  // be read as a file below the package's src/index.ts.
  it("puts every subpath of a package before the package", () => {
    const finds = sourceAliases.map(({ find }) => find);
    const late = finds.filter((find, index) =>
      finds.slice(0, index).some((earlier) => find.startsWith(`${earlier}/`)),
    );
    expect(late).toEqual([]);
  });

  it("maps every renderer's sheet to its source, and the board host's", () => {
    const sheets = Object.fromEntries(
      sourceAliases
        .filter(({ find }) => find.endsWith(".css"))
        .map(({ find, replacement }) => [find, replacement.slice(MODELERS.length)]),
    );
    expect(sheets).toMatchObject({
      "@miragon/wardley-renderer/assets/wardley.css":
        "wardley-maps/packages/renderer/src/assets/wardley.css",
      "@miragon/event-storming-renderer/assets/event-storming.css":
        "event-storming/packages/renderer/src/assets/event-storming.css",
      "@miragon/team-topologies-renderer/assets/team-topologies.css":
        "team-topologies/packages/renderer/src/assets/team-topologies.css",
      "@miragon/context-maps-renderer/assets/context-maps.css":
        "context-maps/packages/renderer/src/assets/context-maps.css",
      "@miragon/value-chain-renderer/assets/value-chain.css":
        "value-chain/packages/renderer/src/assets/value-chain.css",
      "@miragon/c4-renderer/assets/c4.css": "c4/packages/renderer/src/assets/c4.css",
      "@miragon/business-model-canvas-renderer/assets/business-model-canvas.css":
        "business-model-canvas/packages/renderer/src/assets/business-model-canvas.css",
      "@miragon/board-renderer/assets/board.css": "board/packages/renderer/src/assets/board.css",
      "@miragon/board-host/assets/embed.css": "board/packages/host/src/assets/embed.css",
    });
  });

  it("is the same list for esbuild, as a record", () => {
    expect(Object.entries(esbuildAlias)).toEqual(
      sourceAliases.map(({ find, replacement }) => [find, replacement]),
    );
  });
});

describe("prebundle", () => {
  const require = createRequire(join(EDITORS, "build/prebundle.mjs"));

  it("is sorted, without a repeat, and names third-party modules only", () => {
    expect(prebundle).toEqual([...new Set(prebundle)].sort());
    const own = prebundle.filter(
      (specifier) =>
        /^[./]|^node:|\.css$|\?/.test(specifier) ||
        sourceAliases.some(({ find }) => specifier === find || specifier.startsWith(`${find}/`)),
    );
    expect(own).toEqual([]);
  });

  // The list the browser project named by hand before the other modelers' sources came in.
  it("names what the board loads, the lazy note parts and the JSX runtimes included", () => {
    expect(prebundle).toEqual(
      expect.arrayContaining([
        "@miragon/modeler-api",
        "@xyflow/react",
        "dompurify",
        "lucide-react",
        "markdown-it",
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-dev-runtime",
        "react/jsx-runtime",
        "yjs",
      ]),
    );
  });

  it("names what the diagram-js renderers load", () => {
    expect(prebundle).toEqual(
      expect.arrayContaining(["diagram-js/lib/Diagram", "tiny-svg", "yaml", "zod"]),
    );
    expect(
      prebundle.filter((specifier) => specifier.startsWith("diagram-js/")).length,
    ).toBeGreaterThan(40);
  });

  // An entry Vite cannot resolve is a warning on every start and a module it pre-bundles late.
  // A package with no export for `require` (`@miragon/bpmn-modeler`) is resolved as an import.
  it("names only modules this workspace can resolve", () => {
    const resolves = (resolve: (specifier: string) => string, specifier: string): boolean => {
      try {
        resolve(specifier);
        return true;
      } catch {
        return false;
      }
    };
    const unresolved = prebundle.filter(
      (specifier) =>
        !resolves(require.resolve, specifier) &&
        !resolves((one) => import.meta.resolve(one), specifier),
    );
    expect(unresolved).toEqual([]);
  });
});

describe("the shared sheet base", () => {
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

  // The base once, through specifiers the helper leaves alone, then the seven sheets by name
  // with Context Maps in the middle: three renderers bring their base after its pad rule.
  const PAGE_IMPORTS = [
    "diagram-js/assets/diagram-js.css?base",
    join(MODELERS, "wardley-maps/packages/renderer/src/theme/cd-canvas.css"),
    "@miragon/wardley-renderer/assets/wardley.css",
    "@miragon/event-storming-renderer/assets/event-storming.css",
    "@miragon/team-topologies-renderer/assets/team-topologies.css",
    "@miragon/context-maps-renderer/assets/context-maps.css",
    "@miragon/value-chain-renderer/assets/value-chain.css",
    "@miragon/c4-renderer/assets/c4.css",
    "@miragon/business-model-canvas-renderer/assets/business-model-canvas.css",
  ];

  const ENTRY = "\0sheets-of-a-page";
  const pageOfSheets: Plugin = {
    name: "page-of-sheets",
    resolveId: (id) => (id === "sheets-of-a-page" ? ENTRY : undefined),
    load: (id) =>
      id === ENTRY
        ? PAGE_IMPORTS.map((specifier) => `import ${JSON.stringify(specifier)};`).join("\n")
        : undefined,
  };

  async function builtSheet(alias: Array<{ find: string | RegExp; replacement: string }>) {
    const result = await build({
      configFile: false,
      root: EDITORS,
      logLevel: "silent",
      publicDir: false,
      resolve: { alias },
      plugins: [pageOfSheets],
      build: {
        write: false,
        minify: false,
        cssMinify: false,
        rolldownOptions: { input: "sheets-of-a-page" },
      },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const sheets = outputs
      .flatMap((output) => ("output" in output ? output.output : []))
      .filter((file) => file.type === "asset" && file.fileName.endsWith(".css"))
      .map((file) => (file.type === "asset" ? String(file.source) : ""));
    expect(sheets).toHaveLength(1);
    return sheets[0]!;
  }

  const offsetsOf = (sheet: string, rule: string): number[] => {
    const offsets: number[] = [];
    for (let at = sheet.indexOf(rule); at !== -1; at = sheet.indexOf(rule, at + 1))
      offsets.push(at);
    return offsets;
  };

  it("finds the seven renderer sheets", () => {
    expect(rendererSheets).toHaveLength(7);
  });

  it("catches the two base imports of every renderer sheet, and its tokens not", () => {
    for (const sheet of rendererSheets) {
      const imports = importsOf(sheet);
      expect(imports.filter(caughtByBase), sheet).toEqual([
        "diagram-js/assets/diagram-js.css",
        "../theme/cd-canvas.css",
      ]);
      expect(
        imports.filter((specifier) => !caughtByBase(specifier)),
        sheet,
      ).toEqual(["../theme/cd-tokens.generated.css"]);
    }
  });

  it("leaves the specifiers a page loads the base through", () => {
    for (const specifier of PAGE_IMPORTS) expect(caughtByBase(specifier), specifier).toBe(false);
  });

  it("puts a sheet without a rule in their place", () => {
    for (const { replacement } of cssBaseAliases) {
      const sheet = readFileSync(replacement, "utf8");
      expect(sheet.replace(/\/\*[\s\S]*?\*\//g, "").trim()).toBe("");
    }
  });

  it("gives esbuild a plugin that empties the same two imports", () => {
    const resolvers: Array<{ filter: RegExp; resolve: (args: { path: string }) => unknown }> = [];
    const loaders: Array<{ namespace: string; load: () => unknown }> = [];
    cssBaseOnce.setup({
      onResolve: (options, resolve) => void resolvers.push({ filter: options.filter, resolve }),
      onLoad: (options, load) => void loaders.push({ namespace: options.namespace, load }),
    });
    expect(resolvers).toHaveLength(1);
    expect(loaders).toHaveLength(1);
    const { filter, resolve } = resolvers[0]!;
    for (const sheet of rendererSheets) {
      expect(importsOf(sheet).filter((specifier) => filter.test(specifier))).toEqual(
        importsOf(sheet).filter(caughtByBase),
      );
    }
    for (const specifier of PAGE_IMPORTS) expect(filter.test(specifier), specifier).toBe(false);
    expect(resolve({ path: "../theme/cd-canvas.css" })).toEqual({
      path: "../theme/cd-canvas.css",
      namespace: loaders[0]!.namespace,
    });
    expect(loaders[0]!.load()).toEqual({ contents: "", loader: "css" });
  });

  it("in a Vite build the base stands once, before every renderer's own rules", async () => {
    const sheet = await builtSheet([...cssBaseAliases, ...sourceAliases]);
    const firstOwnRule = Math.min(...ROOT_CLASSES.map((root) => sheet.indexOf(root)));
    for (const root of ROOT_CLASSES) expect(sheet.indexOf(root), root).toBeGreaterThan(-1);

    const basePad = offsetsOf(sheet, BASE_PAD_RULE);
    expect(basePad).toHaveLength(1);
    expect(basePad[0]).toBeLessThan(firstOwnRule);
    expect(offsetsOf(sheet, CONTEXT_MAPS_PAD_RULE)[0]).toBeGreaterThan(basePad[0]!);

    const mapping = offsetsOf(sheet, CANVAS_MAPPING_RULE);
    expect(mapping).toHaveLength(1);
    expect(mapping[0]).toBeLessThan(firstOwnRule);
  }, 60_000);

  // The reason the helper exists, kept as a test: the day a build puts the base once by itself,
  // this fails and the helper can go.
  it("without the helper every sheet brings the base, some after Context Maps' pad rule", async () => {
    const sheet = await builtSheet(sourceAliases);
    const basePad = offsetsOf(sheet, BASE_PAD_RULE);
    expect(basePad).toHaveLength(1 + rendererSheets.length);
    expect(basePad.at(-1)).toBeGreaterThan(offsetsOf(sheet, CONTEXT_MAPS_PAD_RULE)[0]!);
  }, 60_000);
});
