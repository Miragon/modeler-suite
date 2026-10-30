/**
 * Drift guard of the modeler-kit plugin (plugins/modeler-kit): the new-modeler skill and its
 * template must name what the packages of THIS workspace export, pin their current versions and
 * compile against their current sources, so a release or a rename here fails `npm test` instead of
 * a new modeler repository later.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { devNull, tmpdir } from "node:os";
import { basename, dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { getFileInfo as getPrettierFileInfo } from "prettier";
import ts from "typescript";
import { afterAll, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  ENGLISH_MODELER_RULES_OFF,
  ignoredByBrandLint,
  lintedByBrandLint,
  readBrandLintConfig,
  writtenByToolsOrTestData,
} from "./support/brand-lint";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(ROOT, "plugins/modeler-kit");
const SKILL = join(PLUGIN, "skills/new-modeler");
const TEMPLATE = join(SKILL, "assets/template");
const SCRIPT = join(SKILL, "scripts/new-modeler.mjs");
/** Links of the skill to this repository's docs: they must resolve in this checkout. */
const OWN_GITHUB_URL =
  /^https:\/\/github\.com\/Miragon\/modeler-suite\/(?:blob|tree)\/main\/([^#?]*)(?:#(.*))?$/;

type Json = Record<string, unknown>;
type Manifest = Json & Partial<Record<DependencyField, Record<string, string>>>;
type DependencyField = (typeof DEPENDENCY_FIELDS)[number];

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"] as const;

const readText = (path: string): string => readFileSync(path, "utf8");
const readJson = <T = Json>(path: string): T => JSON.parse(readText(path)) as T;
const fromRoot = (path: string): string => relative(ROOT, path).split(sep).join("/");

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const templateFiles = filesUnder(TEMPLATE);
const templateManifests = templateFiles.filter((file) => basename(file) === "package.json");
const markdownFiles = filesUnder(PLUGIN).filter((file) => file.endsWith(".md"));
const skillDocuments = [join(SKILL, "SKILL.md"), ...filesUnder(join(SKILL, "references"))];

// ---------------------------------------------------------------------------------------------
// The workspace packages and what they export
// ---------------------------------------------------------------------------------------------

interface WorkspacePackage {
  name: string;
  dir: string;
  version: string;
  /** export subpath ("@miragon/modeler-shell/core") → its source entry */
  entries: Map<string, string>;
}

const workspacePackages: WorkspacePackage[] = ["packages/api", "packages/shell"].map((dir) => {
  const manifest = readJson<{ name: string; version: string; exports: Record<string, unknown> }>(
    join(ROOT, dir, "package.json"),
  );
  const entries = new Map<string, string>();
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    const built = (target as { import?: { default?: string } }).import?.default;
    const source = built && /^\.\/dist\/(.+)\.js$/.exec(built)?.[1];
    if (source)
      entries.set(posix.join(manifest.name, subpath), join(ROOT, dir, "src", `${source}.ts`));
  }
  return { name: manifest.name, dir, version: manifest.version, entries };
});
const workspacePackage = (name: string) => workspacePackages.find((pkg) => pkg.name === name);

/**
 * The template's VS Code smoke step runs on the shell's `./testing/vscode-electron` entry, whose
 * optional peers the template's VS Code app installs.
 */
const SMOKE_DRIVER_ENTRY = "@miragon/modeler-shell/testing/vscode-electron";
const SMOKE_DRIVER_PEERS = ["playwright-core", "@vscode/test-electron"];
const SMOKE_STEP = "apps/vscode/test-smoke/";

// ---------------------------------------------------------------------------------------------
// One TypeScript program: the template's sources against the workspace's sources
// ---------------------------------------------------------------------------------------------

/** The template's vendored theme JSON is copied in from the design system after instantiation. */
const TEMPLATE_TOKENS = join(TEMPLATE, "packages/renderer/src/theme/cd-tokens.generated.json");
const VENDORED_TOKENS = join(ROOT, "packages/shell/fixtures/tokens/cd-tokens.generated.json");

/**
 * Template files that import tooling this workspace does not install, with that tooling; the
 * template's own `npm run lint` checks them. Every other TypeScript file of the template is checked
 * here, the build configs included (the web app's Vite config calls the shell's `webHeadMarkup`).
 */
const NOT_TYPE_CHECKED_HERE = new Map([
  ["packages/renderer/vite.config.ts", "vite-plugin-dts"],
  ["vitest.config.ts", "@vitest/browser-playwright"],
]);
const fromTemplate = (path: string): string => relative(TEMPLATE, path).split(sep).join("/");
const typeCheckedTemplateFiles = templateFiles.filter(
  (file) => file.endsWith(".ts") && !NOT_TYPE_CHECKED_HERE.has(fromTemplate(file)),
);

/**
 * The template packages' entry points at their sources, as the template's tsconfig paths map them:
 * every `exports` entry with an `import` condition (`./dist/themes.js` is `src/themes.ts`).
 */
function templateEntryPaths(): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  for (const name of ["schema-model", "dsl", "renderer"]) {
    const directory = join(TEMPLATE, "packages", name);
    const { exports } = readJson<{ exports: Record<string, string | { import?: string }> }>(
      join(directory, "package.json"),
    );
    for (const [subpath, target] of Object.entries(exports)) {
      if (typeof target !== "object" || target.import === undefined) continue;
      const source = target.import.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts");
      paths[`@miragon/__NOTATION__-${name}${subpath.slice(1)}`] = [join(directory, source)];
    }
  }
  return paths;
}

function templateProgram(): ts.Program {
  const paths = templateEntryPaths();
  for (const pkg of workspacePackages) {
    for (const [specifier, source] of pkg.entries) paths[specifier] = [source];
  }
  const base = readJson<{ compilerOptions: Json }>(join(TEMPLATE, "tsconfig.base.json"));
  const { options, errors } = ts.convertCompilerOptionsFromJson(
    {
      ...base.compilerOptions,
      // the web app's Vite config imports the renderer's `src/themes.ts` (tsconfig.config.json)
      allowImportingTsExtensions: true,
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      types: ["node", "vscode"],
      noEmit: true,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      paths,
    },
    TEMPLATE,
  );
  expect(errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))).toEqual(
    [],
  );
  const host = ts.createCompilerHost(options);
  const original = { fileExists: host.fileExists, readFile: host.readFile };
  host.fileExists = (file) => file === TEMPLATE_TOKENS || original.fileExists(file);
  host.readFile = (file) => original.readFile(file === TEMPLATE_TOKENS ? VENDORED_TOKENS : file);
  const entrySources = workspacePackages.flatMap((pkg) => [...pkg.entries.values()]);
  return ts.createProgram([...typeCheckedTemplateFiles, ...entrySources], options, host);
}

let cachedProgram: ts.Program | undefined;
const program = (): ts.Program => (cachedProgram ??= templateProgram());

interface ApiIndex {
  /** entry specifier → its exported names */
  exports: Map<string, Set<string>>;
  /** every exported name of every entry */
  allExports: Set<string>;
  /** every property and method name of the exported types and values, nested ones included */
  members: Set<string>;
  /** property name → the member names of its object type (`legend` → `render`, `open`, `onToggle`) */
  shapes: Map<string, Set<string>>;
}

let cachedIndex: ApiIndex | undefined;

function apiIndex(): ApiIndex {
  if (cachedIndex) return cachedIndex;
  const checker = program().getTypeChecker();
  const exports = new Map<string, Set<string>>();
  const members = new Set<string>();
  const shapes = new Map<string, Set<string>>();
  const visited = new Set<ts.Type>();
  const fromWorkspace = (type: ts.Type) =>
    (type.getSymbol() ?? type.aliasSymbol)?.declarations?.some((declaration) =>
      declaration.getSourceFile().fileName.startsWith(join(ROOT, "packages")),
    ) ?? false;
  // Every type reachable from an export, walked once; only the workspace's own types contribute
  // members (a DOM type's properties are not this API).
  const collect = (type: ts.Type, depth: number): void => {
    if (visited.has(type)) return;
    visited.add(type);
    const parts = type.isUnionOrIntersection() ? type.types : [type];
    for (const part of parts) {
      for (const signature of part.getCallSignatures()) {
        collect(signature.getReturnType(), depth + 1);
        for (const parameter of signature.getParameters()) {
          const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];
          if (declaration)
            collect(checker.getTypeOfSymbolAtLocation(parameter, declaration), depth + 1);
        }
      }
      // element types of arrays, promises and other generics (`foreignTexts: Array<{ mustSurvive }>`)
      if ((part as ts.TypeReference).target) {
        for (const argument of checker.getTypeArguments(part as ts.TypeReference))
          collect(argument, depth + 1);
      }
      if (depth > 0 && !fromWorkspace(part)) continue;
      for (const property of part.getProperties()) {
        members.add(property.getName());
        const declaration = property.valueDeclaration ?? property.declarations?.[0];
        if (!declaration) continue;
        const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
        const objectParts = (propertyType.isUnion() ? propertyType.types : [propertyType]).filter(
          (candidate) => fromWorkspace(candidate) && candidate.getCallSignatures().length === 0,
        );
        for (const objectPart of objectParts) {
          const shape = shapes.get(property.getName()) ?? new Set<string>();
          for (const member of objectPart.getProperties()) shape.add(member.getName());
          if (shape.size > 0) shapes.set(property.getName(), shape);
        }
        collect(propertyType, depth + 1);
      }
    }
  };
  for (const pkg of workspacePackages) {
    for (const [specifier, source] of pkg.entries) {
      const file = program().getSourceFile(source);
      const moduleSymbol = file && checker.getSymbolAtLocation(file);
      if (!moduleSymbol) throw new Error(`no module for ${specifier} (${source})`);
      const names = new Set<string>();
      for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
        names.add(symbol.getName());
        const resolved =
          symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        const declaration = resolved.valueDeclaration ?? resolved.declarations?.[0];
        if (!declaration) continue;
        collect(checker.getDeclaredTypeOfSymbol(resolved), 0);
        if (resolved.valueDeclaration)
          collect(checker.getTypeOfSymbolAtLocation(resolved, declaration), 0);
      }
      exports.set(specifier, names);
    }
  }
  cachedIndex = {
    exports,
    allExports: new Set([...exports.values()].flatMap((names) => [...names])),
    members,
    shapes,
  };
  return cachedIndex;
}

// ---------------------------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------------------------

const FENCE = /^```[^\n]*\n[\s\S]*?^```/gm;

/** GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens, repeats numbered. */
function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const [, heading] of markdown.replace(FENCE, "").matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = heading!
      .replace(/`/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  return anchors;
}

/** Link targets outside code: inline links, images and reference definitions. */
function linkTargets(markdown: string): string[] {
  const prose = markdown.replace(FENCE, "").replace(/`[^`\n]*`/g, "");
  return [
    ...[...prose.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map(
      (match) => match[1]!,
    ),
    ...[...prose.matchAll(/^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*$/gm)].map(
      (match) => match[1]!,
    ),
  ];
}

/** Where a link points in this checkout, or undefined for a link to elsewhere. */
function localTarget(
  from: string,
  target: string,
): { path: string; anchor: string | undefined } | undefined {
  const own = OWN_GITHUB_URL.exec(target);
  if (own) return { path: join(ROOT, decodeURIComponent(own[1]!)), anchor: own[2] };
  if (/^[a-z][a-z+.-]*:/i.test(target)) return undefined;
  const [path = "", anchor] = target.split("#");
  return {
    path: path === "" ? from : resolve(dirname(from), decodeURIComponent(path.split("?")[0]!)),
    anchor,
  };
}

// ---------------------------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------------------------

interface Pin {
  file: string;
  field: DependencyField;
  name: string;
  version: string;
}

const templatePins: Pin[] = templateManifests.flatMap((file) => {
  const manifest = readJson<Manifest>(file);
  return DEPENDENCY_FIELDS.flatMap((field) =>
    Object.entries(manifest[field] ?? {}).map(([name, version]) => ({
      file: fromRoot(file),
      field,
      name,
      version,
    })),
  );
});
const platformPins = templatePins.filter((pin) => workspacePackage(pin.name));

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
/** Consumer-shared runtime libraries: the only ranged peers (one copy, or instanceof and DI break). */
const SHARED_PEERS = new Set(["zod", "diagram-js", "didi", "tiny-svg"]);

/** `^x.y.z` and `a || b` (what the template's peers use): same major (same minor while 0.x), not below. */
function satisfies(version: string, range: string): boolean {
  return range.split("||").some((alternative) => {
    const caret = /^\s*\^(\d+)\.(\d+)\.(\d+)\s*$/.exec(alternative);
    if (!caret) throw new Error(`unsupported range "${range}"`);
    const [major, minor, patch] = caret.slice(1).map(Number) as [number, number, number];
    const [vMajor, vMinor, vPatch] = version.split(".").map(Number) as [number, number, number];
    if (vMajor !== major || (major === 0 && vMinor !== minor)) return false;
    return vMinor > minor || (vMinor === minor && vPatch >= patch);
  });
}

describe("the template pins the modeler platform's current releases", () => {
  it("pins @miragon/modeler-api and @miragon/modeler-shell at this workspace's versions", () => {
    expect(platformPins.map((pin) => `${pin.file}: ${pin.name}@${pin.version}`)).toEqual(
      platformPins.map((pin) => `${pin.file}: ${pin.name}@${workspacePackage(pin.name)!.version}`),
    );
  });

  it("pins the contract in the renderer and the shell in both apps and e2e", () => {
    expect(
      platformPins
        .map((pin) => `${dirname(pin.file).split("/assets/template/")[1] ?? "."} ${pin.name}`)
        .sort(),
    ).toEqual([
      "apps/vscode @miragon/modeler-shell",
      "apps/webapp @miragon/modeler-shell",
      "e2e @miragon/modeler-shell",
      "packages/renderer @miragon/modeler-api",
    ]);
  });

  it("has release-please rewrite every such pin on a release of the package (extra-files)", () => {
    const config = readJson<{ packages: Record<string, { "extra-files"?: unknown[] }> }>(
      join(ROOT, "release-please-config.json"),
    );
    for (const pin of platformPins) {
      const extraFiles = config.packages[workspacePackage(pin.name)!.dir]?.["extra-files"] ?? [];
      expect(extraFiles, `${pin.file} ${pin.field}`).toContainEqual({
        type: "json",
        path: `/${pin.file}`,
        jsonpath: `$.${pin.field}['${pin.name}']`,
      });
    }
  });
});

describe("the template's package.json files and workflows", () => {
  it("pin every dependency and devDependency exactly, with no file:, link: or tarball references", () => {
    const loose = templatePins.filter(
      (pin) =>
        pin.field !== "peerDependencies" &&
        (!EXACT_VERSION.test(pin.version) || /file:|link:|\.tgz|\/tmp/.test(pin.version)),
    );
    expect(loose).toEqual([]);
  });

  it("range only the consumer-shared peers, each mirrored by an exact devDependency in range", () => {
    for (const file of templateManifests) {
      const manifest = readJson<Manifest>(file);
      for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
        expect(SHARED_PEERS.has(name), `${fromRoot(file)}: peer ${name}`).toBe(true);
        const mirror = manifest.devDependencies?.[name];
        expect(
          mirror && EXACT_VERSION.test(mirror) && satisfies(mirror, range),
          `${fromRoot(file)}: ${name} ${range} mirrored by ${mirror}`,
        ).toBe(true);
      }
    }
  });

  it("pin the internal packages at their current template version", () => {
    const versions = new Map(
      templateManifests.map((file) => [
        readJson<{ name: string }>(file).name,
        readJson<{ version: string }>(file).version,
      ]),
    );
    const internal = templatePins.filter((pin) => versions.has(pin.name));
    expect(internal.length).toBeGreaterThan(0);
    for (const pin of internal)
      expect(`${pin.file}: ${pin.name}@${pin.version}`).toBe(
        `${pin.file}: ${pin.name}@${versions.get(pin.name)}`,
      );
  });

  it("run the CI's Playwright image at the version e2e's @playwright/test resolves to", () => {
    const root = readJson<Manifest>(join(TEMPLATE, "package.json"));
    const e2e = readJson<Manifest>(join(TEMPLATE, "e2e/package.json"));
    expect(root.devDependencies?.playwright).toBe(e2e.devDependencies?.["@playwright/test"]);
  });

  it("run only actions pinned to a commit SHA, with the tag as a comment", () => {
    const loose = filesUnder(join(TEMPLATE, ".github")).flatMap((file) =>
      [...readText(file).matchAll(/^\s*-?\s*uses:\s*(\S+)(.*)$/gm)]
        .filter(
          ([, action, rest]) =>
            !action!.startsWith("./") &&
            (!/@[0-9a-f]{40}$/.test(action!) || !/^ # v\d/.test(rest!)),
        )
        .map(([line]) => `${fromTemplate(file)}: ${line!.trim()}`),
    );
    expect(loose).toEqual([]);
  });

  it("define every script the template's workflows run", () => {
    const scripts = (dir: string) =>
      Object.keys(readJson<{ scripts?: Json }>(join(TEMPLATE, dir, "package.json")).scripts ?? {});
    const workflows = filesUnder(join(TEMPLATE, ".github/workflows"));
    const missing = workflows.flatMap((workflow) =>
      [...readText(workflow).matchAll(/npm run ([\w:-]+)(?: -w ([\w/-]+))?/g)]
        .filter(([, script, workspace]) => !scripts(workspace ?? ".").includes(script!))
        .map(([command]) => `${basename(workflow)}: ${command}`),
    );
    expect(missing).toEqual([]);
  });

  it("define every script the skill's and the template's documents run", () => {
    const scripts = (dir: string) =>
      Object.keys(readJson<{ scripts?: Json }>(join(TEMPLATE, dir, "package.json")).scripts ?? {});
    const documents = [...skillDocuments, ...templateFiles.filter((file) => file.endsWith(".md"))];
    const missing = documents.flatMap((document) =>
      [...readText(document).matchAll(/npm run ([\w:-]+)(?: -w ([\w/-]+))?/g)]
        .filter(([, script, workspace]) => !scripts(workspace ?? ".").includes(script!))
        .map(([command]) => `${fromRoot(document)}: ${command}`),
    );
    expect(missing).toEqual([]);
  });

  it("give the vendored design-system files the same header line in the skill and the template", () => {
    const HEADER =
      /\/\* Vendored unchanged from Miragon\/corporate-identity \(design system \d+\.\d+\.\d+, [^)]+\)\. Do not edit; re-copy to update\. \*\//g;
    const headers = [
      join(SKILL, "references/design-system.md"),
      join(TEMPLATE, "packages/renderer/src/theme/README.md"),
    ].map((file) => [...readText(file).matchAll(HEADER)].map(([line]) => line));
    expect(headers[0]).toHaveLength(1);
    expect(headers[1]).toEqual(headers[0]);
  });
});

interface DependabotGroup {
  "applies-to"?: string;
  "group-by"?: string;
  patterns?: string[];
  "update-types"?: string[];
}

interface DependabotUpdate {
  "package-ecosystem": string;
  directory?: string;
  directories?: string[];
  ignore?: { "dependency-name": string; "update-types"?: string[] }[];
  groups?: Record<string, DependabotGroup>;
}

const dependabotUpdates = (
  parseYaml(readText(join(ROOT, ".github/dependabot.yml"))) as { updates: DependabotUpdate[] }
).updates;
const dependabotDirectories = (update: DependabotUpdate): string[] =>
  update.directories ?? (update.directory ? [update.directory] : []);
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Dependabot's directory globs: `*` stands for one path segment, `**` for any number of them. */
const matchesDirectory = (pattern: string, directory: string): boolean =>
  new RegExp(
    `^${pattern
      .split("**")
      .map((part) => part.split("*").map(escapeRegExp).join("[^/]+"))
      .join(".*")}$`,
  ).test(directory);

describe("the suite's Dependabot config keeps the template's third-party pins current", () => {
  const templateDirectory = `/${fromRoot(TEMPLATE)}`;
  const entriesFor = (ecosystem: string, directory: string): DependabotUpdate[] =>
    dependabotUpdates.filter(
      (update) =>
        update["package-ecosystem"] === ecosystem &&
        dependabotDirectories(update).some((pattern) => matchesDirectory(pattern, directory)),
    );

  it("updates the template's package.json files in the suite's npm entry, and never its @miragon/* pins", () => {
    const entries = entriesFor("npm", templateDirectory);
    expect(entries.map(dependabotDirectories)).toEqual([
      expect.arrayContaining(["/", templateDirectory]),
    ]);
    expect(entries[0]?.ignore).toContainEqual({ "dependency-name": "@miragon/*" });
  });

  it("moves each npm major through the suite and the template in one pull request per dependency", () => {
    const [entry] = entriesFor("npm", templateDirectory);
    const versionGroups = Object.values(entry?.groups ?? {}).filter(
      (group) => (group["applies-to"] ?? "version-updates") === "version-updates",
    );
    const majorGroups = versionGroups.filter((group) =>
      (group["update-types"] ?? ["major"]).includes("major"),
    );
    expect(majorGroups).toEqual([
      {
        "applies-to": "version-updates",
        "group-by": "dependency-name",
        patterns: ["*"],
        "update-types": ["major"],
      },
    ]);
  });

  it("reaches every package.json of the template through its workspaces", () => {
    const { workspaces } = readJson<{ workspaces: string[] }>(join(TEMPLATE, "package.json"));
    expect(
      templateManifests
        .map((file) => fromTemplate(dirname(file)))
        .filter((directory) => directory !== "")
        .sort(),
    ).toEqual([...workspaces].sort());
  });

  it("updates the actions of every template workflow and composite action in the suite's github-actions entry", () => {
    const actionDirectories = [
      ...new Set(
        filesUnder(join(TEMPLATE, ".github"))
          .filter(
            (file) => /\.ya?ml$/.test(file) && /^\s*-?\s*uses:\s*[^.\s]/m.test(readText(file)),
          )
          .map((file) => `/${fromRoot(dirname(file))}`),
      ),
    ];
    expect(actionDirectories.length).toBeGreaterThan(1);
    for (const directory of actionDirectories) {
      const entries = entriesFor("github-actions", directory);
      expect(entries, directory).toHaveLength(1);
      expect(dependabotDirectories(entries[0]!), directory).toContain("/");
    }
    const templatePatterns = dependabotUpdates
      .flatMap(dependabotDirectories)
      .filter((pattern) => pattern.startsWith(`${templateDirectory}/`));
    expect(
      templatePatterns.filter(
        (pattern) => !actionDirectories.some((directory) => matchesDirectory(pattern, directory)),
      ),
    ).toEqual([]);
  });

  it("asks the code owners to review every github-actions update, the template's included", () => {
    const ownedDirectories = readText(join(ROOT, ".github/CODEOWNERS"))
      .split("\n")
      .map((line) => line.replace(/#.*/, "").trim().split(/\s+/))
      .map(([pattern, ...owners]) => [pattern === "*" ? "/" : pattern, ...owners])
      .filter(
        ([pattern, ...owners]) =>
          pattern?.startsWith("/") && pattern.endsWith("/") && owners.length > 0,
      )
      .map(([pattern]) => pattern!);
    const [actionsEntry] = dependabotUpdates.filter(
      (update) => update["package-ecosystem"] === "github-actions",
    );
    const unowned = dependabotDirectories(actionsEntry!)
      .map((pattern) =>
        pattern === "/" ? "/.github/workflows/" : pattern.split("*")[0]!.replace(/\/?$/, "/"),
      )
      .filter((directory) => !ownedDirectories.some((owned) => directory.startsWith(owned)));
    expect(unowned).toEqual([]);
  });
});

describe("the template's brand-lint config", () => {
  it("turns off exactly the German copy rules of an English modeler, as the suite does", () => {
    const config = readBrandLintConfig(TEMPLATE);
    expect([...config.aus].sort()).toEqual([...ENGLISH_MODELER_RULES_OFF].sort());
    expect(config.aus).toEqual(readBrandLintConfig(ROOT).aus);
  });

  it("ignores what the suite's config ignores, without the suite's own paths", () => {
    expect(readBrandLintConfig(TEMPLATE).ignorieren).toEqual(
      readBrandLintConfig(ROOT).ignorieren.filter(
        (pattern) => !pattern.startsWith("modelers/") && !pattern.startsWith("docs/"),
      ),
    );
  });

  it("ignores the template's tests, e2e suite and fixtures from its own root, and nothing else", () => {
    const config = readBrandLintConfig(TEMPLATE);
    const linted = templateFiles.map(fromTemplate).filter(lintedByBrandLint);
    expect(
      linted.filter((file) => ignoredByBrandLint(config, file) !== writtenByToolsOrTestData(file)),
    ).toEqual([]);
    expect(linted.filter((file) => file.startsWith("e2e/")).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Placeholders and the instantiation script
// ---------------------------------------------------------------------------------------------

const PLACEHOLDER = /__[A-Z][A-Z_]*__/g;
const HAS_PLACEHOLDER = /__[A-Z][A-Z_]*__/;
const SAMPLE = {
  notation: "capability-map",
  name: "Capability Map",
  ext: "capmap",
  repo: "capability-map-modeler",
};

describe("the template's placeholders", () => {
  const used = new Set(
    templateFiles.flatMap((file) =>
      [...`${fromRoot(file)}\n${readText(file)}`.matchAll(PLACEHOLDER)].map((match) => match[0]),
    ),
  );

  it("are exactly the ones SKILL.md documents and the script fills", () => {
    const documented = new Set(
      [...readText(join(SKILL, "SKILL.md")).matchAll(/^\| `(__[A-Z][A-Z_]*__)`/gm)].map(
        (match) => match[1]!,
      ),
    );
    const filled = new Set(
      [...readText(SCRIPT).matchAll(/^\s*(__[A-Z][A-Z_]*__): \{/gm)].map((match) => match[1]!),
    );
    expect([...used].sort()).toEqual([...documented].sort());
    expect([...used].sort()).toEqual([...filled].sort());
  });

  it("survive formatting: none was rewritten into Markdown emphasis", () => {
    const mangled = [...used].map((placeholder) => `**${placeholder.slice(2, -2)}**`);
    const hits = templateFiles.filter((file) =>
      mangled.some((form) => readText(file).includes(form)),
    );
    expect(hits.map(fromRoot)).toEqual([]);
  });

  it("stay out of the suite's pre-commit Prettier: the hook runs only the root lint-staged config, whose ignore file skips the template's Markdown", async () => {
    const lintStagedRuns = readText(join(ROOT, ".husky/pre-commit"))
      .split("\n")
      .filter((line) => /^\s*npx lint-staged\b/.test(line));
    expect(lintStagedRuns).toEqual(["npx lint-staged --config package.json"]);

    const formattedByTheSuite: string[] = [];
    for (const file of templateFiles.filter((path) => path.endsWith(".md"))) {
      const { ignored } = await getPrettierFileInfo(file, {
        ignorePath: join(ROOT, ".prettierignore"),
      });
      if (!ignored) formattedByTheSuite.push(fromRoot(file));
    }
    expect(formattedByTheSuite).toEqual([]);
  });

  it("are all filled by the script, which writes the whole template", () => {
    const target = mkdtempSync(join(tmpdir(), "new-modeler-"));
    try {
      execFileSync(
        process.execPath,
        [
          SCRIPT,
          join(target, "out"),
          ...Object.entries(SAMPLE).flatMap(([option, value]) => [`--${option}`, value]),
        ],
        { stdio: "pipe" },
      );
      const written = filesUnder(join(target, "out"));
      expect(written).toHaveLength(templateFiles.length);
      const leftovers = written.filter((file) =>
        HAS_PLACEHOLDER.test(`${file}\n${readText(file)}`),
      );
      expect(leftovers).toEqual([]);
      expect(
        readJson<{ name: string }>(join(target, "out/packages/renderer/package.json")).name,
      ).toBe("@miragon/capability-map-renderer");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("refuses a value of the wrong form", () => {
    const target = mkdtempSync(join(tmpdir(), "new-modeler-"));
    try {
      expect(() =>
        execFileSync(
          process.execPath,
          [
            SCRIPT,
            join(target, "out"),
            "--notation",
            "Capability Map",
            "--name",
            SAMPLE.name,
            "--ext",
            SAMPLE.ext,
            "--repo",
            SAMPLE.repo,
          ],
          { stdio: "pipe" },
        ),
      ).toThrow(/--notation \(__NOTATION__\) must be a kebab-case slug/);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Plugin and marketplace manifests
// ---------------------------------------------------------------------------------------------

/** plugin.json's top-level keys (code.claude.com/docs/en/plugins-reference#fields). */
const PLUGIN_KEYS = new Set(
  "$schema name displayName version description author homepage repository license keywords metadata icon documentationUrl supportUrl privacyPolicyUrl termsOfServiceUrl defaultEnabled dependencies settings userConfig types channels skills commands agents hooks mcpServers lspServers outputStyles workflows experimental".split(
    " ",
  ),
);
/** A marketplace entry takes the plugin's keys except the directory listing ones, plus its own. */
const ENTRY_KEYS = new Set(
  [...PLUGIN_KEYS, "source", "category", "tags", "strict"].filter(
    (key) =>
      !["icon", "documentationUrl", "supportUrl", "privacyPolicyUrl", "termsOfServiceUrl"].includes(
        key,
      ),
  ),
);
const MARKETPLACE_KEYS = new Set(
  "$schema name version description owner plugins metadata allowCrossMarketplaceDependenciesOn forceRemoveDeletedPlugins".split(
    " ",
  ),
);
/** SKILL.md frontmatter fields Claude Code and the Agent Skills standard document. */
const SKILL_KEYS = new Set(
  "name description license version metadata compatibility allowed-tools disallowed-tools disable-model-invocation user-invocable model effort context agent argument-hint arguments".split(
    " ",
  ),
);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface MarketplaceEntry extends Json {
  name: string;
  source: string;
  version?: string;
}
const marketplace = readJson<
  { name: string; owner?: { name?: string }; plugins: MarketplaceEntry[] } & Json
>(join(ROOT, ".claude-plugin/marketplace.json"));

describe("the plugin manifests", () => {
  it("make a valid marketplace", () => {
    expect(Object.keys(marketplace).filter((key) => !MARKETPLACE_KEYS.has(key))).toEqual([]);
    expect(marketplace.name).toMatch(KEBAB);
    expect(marketplace.owner?.name).toBeTruthy();
    expect(marketplace.plugins.map((entry) => entry.name)).toContain("modeler-kit");
  });

  for (const entry of marketplace.plugins) {
    describe(entry.name, () => {
      const directory = join(ROOT, entry.source);
      const manifest = readJson<
        Json & { name: string; version?: string; author?: { name?: string }; homepage?: string }
      >(join(directory, ".claude-plugin/plugin.json"));

      it("has a marketplace entry with known keys and a source inside the repository", () => {
        expect(Object.keys(entry).filter((key) => !ENTRY_KEYS.has(key))).toEqual([]);
        expect(entry.source).toMatch(/^\.\/[\w./-]+$/);
        expect(relative(ROOT, directory).startsWith("..")).toBe(false);
      });

      it("has a valid plugin.json under the entry's name", () => {
        expect(Object.keys(manifest).filter((key) => !PLUGIN_KEYS.has(key))).toEqual([]);
        expect(manifest.name).toBe(entry.name);
        expect(manifest.name).toMatch(KEBAB);
        expect(manifest.description).toBeTruthy();
        expect(manifest.author?.name).toBeTruthy();
        expect(() => new URL(manifest.homepage ?? "")).not.toThrow();
      });

      // plugin.json is the one place a plugin's version lives, so a release bumps one file and the
      // marketplace can never disagree with it.
      it("has no version in its marketplace entry", () => {
        expect(entry.version).toBeUndefined();
      });

      if (entry.name === "modeler-kit") {
        // A version holds every installed copy until someone changes it, and nobody changes it for
        // the template pins release-please rewrites in its release commit. Without one, Claude Code
        // versions a relative-path plugin by the commit of its directory, so every merged change
        // reaches `/plugin update`.
        it("has no version in plugin.json, so installs follow the commits", () => {
          expect(manifest.version).toBeUndefined();
        });
      } else {
        it("has an exact version in plugin.json, if it has one", () => {
          if (manifest.version !== undefined) expect(manifest.version).toMatch(EXACT_VERSION);
        });
      }

      it("has skills with a valid SKILL.md each", () => {
        const skills = readdirSync(join(directory, "skills"));
        expect(skills.length).toBeGreaterThan(0);
        for (const skill of skills) {
          const text = readText(join(directory, "skills", skill, "SKILL.md"));
          const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
          expect(frontmatter, `${skill}: frontmatter`).toBeDefined();
          // The modelers' skills fold their descriptions over several lines (`description: >-`).
          const fields = parseYaml(frontmatter!) as Record<string, unknown>;
          expect(Object.keys(fields).filter((key) => !SKILL_KEYS.has(key))).toEqual([]);
          expect(fields.name).toBe(skill);
          expect(skill).toMatch(KEBAB);
          expect(skill.length).toBeLessThanOrEqual(64);
          const description = typeof fields.description === "string" ? fields.description : "";
          expect(description.length).toBeGreaterThan(0);
          expect(description.length).toBeLessThanOrEqual(1024);
          // An XML tag is what the skill standard forbids; an arrow such as `->` in a DSL's
          // description is not one.
          expect(description).not.toMatch(/<\/?[A-Za-z][^<>]*>/);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Links and API names in the skill
// ---------------------------------------------------------------------------------------------

describe("the skill's links", () => {
  it("resolve: relative ones to files of the plugin, the repository's own GitHub links to this checkout, anchors to headings", () => {
    const broken: string[] = [];
    for (const file of markdownFiles) {
      for (const target of linkTargets(readText(file))) {
        const local = localTarget(file, target);
        if (!local) continue;
        const where = `${fromRoot(file)} → ${target}`;
        let exists = true;
        try {
          statSync(local.path);
        } catch {
          exists = false;
        }
        if (!exists) broken.push(`${where}: no such file`);
        else if (
          local.anchor &&
          local.path.endsWith(".md") &&
          !headingAnchors(readText(local.path)).has(local.anchor)
        ) {
          broken.push(`${where}: no heading #${local.anchor}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("never leave the plugin, except as absolute links", () => {
    const escaping = skillDocuments.flatMap((file) =>
      linkTargets(readText(file))
        .filter((target) => !/^[a-z][a-z+.-]*:/i.test(target) && !target.startsWith("#"))
        .filter((target) =>
          relative(PLUGIN, resolve(dirname(file), target.split("#")[0]!)).startsWith(".."),
        )
        .map((target) => `${fromRoot(file)} → ${target}`),
    );
    expect(escaping).toEqual([]);
  });
});

/**
 * Names the skill writes in code spans that are not API of @miragon/modeler-api or
 * @miragon/modeler-shell, with where they come from. A code span naming an identifier that is
 * neither exported (or a member of an exported type) nor listed here fails: a renamed export must
 * be renamed in the skill too, and a new foreign name is added here on purpose.
 */
const NON_API_NAMES = new Map<string, string>([
  ["createCollaborativeModeler", "the renderer's factory, a naming convention of the contract"],
  ["createCollaborativeViewer", "the renderer's factory, a naming convention of the contract"],
  ["NavigatedViewer", "the renderer's diagram-js viewer class"],
  ["additionalModules", "the renderer's own factory option"],
  ["createShortcutsDialog", "the template renderer's controller of the shortcuts dialog"],
  ["commandStack.changed", "diagram-js"],
  ["commandStack.clear", "diagram-js"],
  ["commandStack.preExecute", "diagram-js"],
  ["modeling.moveElements", "diagram-js"],
  ["canvas.viewbox.changing", "diagram-js"],
  ["dragging.cancel", "diagram-js"],
  ["drag.start", "diagram-js"],
  ["drag.move", "diagram-js"],
  ["drag.end", "diagram-js"],
  ["Dragging.move", "diagram-js"],
  ["drag.ended", "diagram-js"],
  ["drag.canceled", "diagram-js"],
  ["drag.cleanup", "diagram-js"],
  ["lasso.selection", "diagram-js, the drag of the armed lasso tool"],
  ["hand.move", "diagram-js, the drag of the hand tool's pan"],
  ["SelectionBehavior", "diagram-js"],
  ["canvas.viewbox.changed", "diagram-js"],
  ["deferUpdate", "diagram-js, the canvas option that debounces canvas.viewbox.changed"],
  ["holdAction", "the template renderer's gestures service"],
  ["tearDownAfterActivation", "the template renderer's gestures service"],
  ["THEMES", "the template renderer's themes constant"],
  ["import.parse.start", "the import events a diagram-js renderer fires (bpmn-js's names)"],
  ["import.render.start", "the import events a diagram-js renderer fires (bpmn-js's names)"],
  ["import.done", "the import events a diagram-js renderer fires (bpmn-js's names)"],
  ["canvasClassName", "Design IQ's renderer spec"],
  ["contractNotation", "Design IQ's renderer spec"],
  ["load", "Design IQ's renderer spec"],
  ["resolveCustomTextEditor", "VS Code"],
  ["context.subscriptions", "VS Code"],
  ["engines.vscode", "VS Code's package.json"],
  ["retainContextWhenHidden", "VS Code"],
  ["config", "zod"],
  ["looseObject", "zod"],
  ["var", "CSS"],
  ["CanvasText", "CSS, a system colour of forced colours"],
  ["Intl", "JavaScript"],
  ["comments.legal", "Vite's build options"],
  ["legalComments", "esbuild"],
  ["fileParallelism", "Vitest"],
  ["assetNames", "esbuild"],
  ["devDependencies", "package.json"],
  ["devDependency", "package.json"],
  ["peerDependencies", "package.json"],
  ["sideEffects", "package.json"],
  ["node_modules", "npm"],
  ["LICENSE", "npm and vsce"],
  ["E404", "npm"],
  ["EOTP", "npm"],
  ["allowTypeImports", "ESLint"],
  ["noUncheckedIndexedAccess", "tsconfig"],
  ["exactOptionalPropertyTypes", "tsconfig"],
  ["verbatimModuleSyntax", "tsconfig"],
  ["moduleResolution", "tsconfig"],
  ["VSCE_PUBLISH", "a GitHub secret"],
  ["OVSX_PUBLISH", "a GitHub secret"],
  ["RELEASE_PLEASE_APP_CLIENT_ID", "a GitHub variable"],
  ["RELEASE_PLEASE_APP_PRIVATE_KEY", "a GitHub secret"],
  ["GITHUB_TOKEN", "GitHub Actions' token of a workflow run"],
  ["pull_request", "a GitHub Actions event"],
  ["pull_request_target", "a GitHub Actions event"],
  ["dry_run", "the release workflow's input"],
  ["always", "GitHub Actions' status check function"],
  ["SKIPPED_BY_DESIGN", "the template's CI gate"],
  ["VSCODE_VERSION", "the template's VS Code smoke test"],
  ["VSCODE_SMOKE_EXTENSION", "the template's VS Code smoke test"],
  ["VSCODE_SMOKE_KEEP", "the template's VS Code smoke test"],
  ["VSCODE_SMOKE_SKIP", "the shell's VS Code smoke driver"],
  ["BEGIN_COMMIT_OVERRIDE", "release-please"],
  ["updatePeerDependencies", "release-please"],
  ["END_COMMIT_OVERRIDE", "release-please"],
  ["node_k3x9q2mf", "an example element id"],
]);
/** Variables the skill calls API on: `shell.fitInsets()`, `diagram.get('canvas')`. */
const RECEIVERS = new Set(["shell", "modeler", "diagram", "connection", "harness", "options"]);
/** Not names at all: template placeholders, law labels, Conventional Commit types with a scope. */
const NOT_A_NAME = [
  /^__[A-Z][A-Z_]*__$/,
  /^L[1-7]$/,
  /^(feat|fix|chore|docs|refactor|ci|build|test|revert)(\([^)]*\))?!?(:.*)?$/,
];
const CODE_TOKEN = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(\(.*\))?$/;
const FILE_NAME = /\.(ts|js|mjs|cjs|json|md|css|yml|yaml|html|svg|png|toml|vsix)$/;

/**
 * The names a code span mentions: the span itself when it is one name (`registerConformance`,
 * `shell.fitInsets()`), else every member path, call and camelCase, PascalCase or CONSTANT_CASE
 * identifier inside it (`freeArea: { insets: () => shell.fitInsets() }`). Plain lower-case words
 * (`feat`, `zod`, `ide`) and file names are no API names.
 */
function namesIn(span: string): string[] {
  const whole = CODE_TOKEN.exec(span);
  if (whole) {
    const name = whole[1]!;
    return FILE_NAME.test(name) || !/[A-Z_(.]/.test(span) ? [] : [name];
  }
  const names = new Set<string>();
  const code = span.replace(/(["'])(?:(?!\1).)*\1/g, " ");
  for (const [path] of code.matchAll(
    /(?<![\w$.-])[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)+(?![\w$/.])/g,
  )) {
    if (!FILE_NAME.test(path)) names.add(path.replace(/\?\./g, "."));
  }
  for (const [name] of code.matchAll(/(?<![\w$.:-])[A-Za-z_$][\w$]*(?=\()/g)) names.add(name);
  for (const [name] of code.matchAll(
    /(?<![\w$.-])(?:[a-z][a-z0-9]*[A-Z]|[A-Z][a-z0-9]+[A-Z]|[A-Z][A-Z0-9]*_)[\w$]*/g,
  )) {
    names.add(name);
  }
  return [...names].filter(
    (name) => ![...names].some((other) => other !== name && other.split(".").includes(name)),
  );
}

/** The keys of an object literal's body without nested braces: `render, open: true, onToggle()`. */
function objectLiteralKeys(body: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of body) {
    if (character === "(" || character === "[") depth++;
    if (character === ")" || character === "]") depth--;
    if (character === "," && depth === 0) {
      entries.push(current);
      current = "";
    } else current += character;
  }
  entries.push(current);
  return entries
    .map((entry) => /^\s*([A-Za-z_$][\w$]*)\s*(?::|\(|$)/.exec(entry)?.[1])
    .filter((key): key is string => key !== undefined);
}

describe("the API names the skill mentions", () => {
  it("are imported in code blocks only from the entry point that exports them", () => {
    const { exports } = apiIndex();
    const wrong: string[] = [];
    for (const file of skillDocuments) {
      for (const block of readText(file).match(FENCE) ?? []) {
        for (const [, names, specifier] of block.matchAll(
          /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](@miragon\/modeler-(?:api|shell)[^"']*)["']/g,
        )) {
          for (const name of names!
            .split(",")
            .map((part) =>
              part
                .replace(/^\s*type\s+/, "")
                .split(/\s+as\s+/)[0]!
                .trim(),
            )
            .filter(Boolean)) {
            if (!exports.get(specifier!)?.has(name))
              wrong.push(`${fromRoot(file)}: ${name} from ${specifier}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("exist: every name in a code span is an export, a member of an exported type, or a listed foreign name", () => {
    const { allExports, members } = apiIndex();
    const known = (name: string) => allExports.has(name) || members.has(name);
    const exists = (path: string): boolean => {
      if (NON_API_NAMES.has(path)) return true;
      const [first, ...rest] = path.split(".");
      return rest.length === 0
        ? known(first!)
        : (known(first!) || RECEIVERS.has(first!)) && rest.every(known);
    };
    const unknown: string[] = [];
    for (const file of skillDocuments) {
      const prose = readText(file).replace(FENCE, "");
      for (const [, raw] of prose.matchAll(/`([^`\n]+)`/g)) {
        const span = raw!.trim();
        if (NOT_A_NAME.some((pattern) => pattern.test(span))) continue;
        for (const name of namesIn(span)) {
          if (!exists(name)) unknown.push(`${fromRoot(file)}: ${name} in \`${span}\``);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("name in an `option: { … }` span only members of that option (`legend: { render, open, onToggle }`)", () => {
    const { shapes } = apiIndex();
    const misplaced: string[] = [];
    for (const file of skillDocuments) {
      const prose = readText(file).replace(FENCE, "");
      for (const [, raw] of prose.matchAll(/`([^`\n]+)`/g)) {
        for (const [shape, owner, body] of raw!.matchAll(
          /([A-Za-z_$][\w$]*)\s*:\s*\{([^{}]*)\}/g,
        )) {
          const known = shapes.get(owner!);
          for (const key of objectLiteralKeys(body!)) {
            if (!known?.has(key)) misplaced.push(`${fromRoot(file)}: ${key} in \`${shape}\``);
          }
        }
      }
    }
    expect(misplaced).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The VS Code smoke step
// ---------------------------------------------------------------------------------------------

describe("the template's VS Code smoke step", () => {
  const vscodeApp = readJson<Manifest>(join(TEMPLATE, "apps/vscode/package.json"));
  const smokeFiles = templateFiles.filter((file) => fromTemplate(file).startsWith(SMOKE_STEP));

  it("stays out of the VSIX and out of `npm test`, and runs Playwright's version", () => {
    expect(smokeFiles.map(fromTemplate).sort()).toEqual([
      `${SMOKE_STEP}vitest.config.ts`,
      `${SMOKE_STEP}vscode-smoke.test.ts`,
    ]);
    expect(readText(join(TEMPLATE, "apps/vscode/.vscodeignore")).split("\n")).toContain(
      "test-smoke/**",
    );
    expect(readText(join(TEMPLATE, "vitest.config.ts"))).not.toContain("test-smoke");
    const root = readJson<Manifest>(join(TEMPLATE, "package.json"));
    expect(root.scripts).toMatchObject({
      "test:vscode-smoke": `vitest run --config ${SMOKE_STEP}vitest.config.ts`,
    });
    expect(vscodeApp.devDependencies?.["playwright-core"]).toBe(root.devDependencies?.playwright);
  });

  it("runs in Docker through the shell's command, after building what it opens", () => {
    const { scripts = {} } = readJson<{ scripts?: Record<string, string> }>(
      join(TEMPLATE, "package.json"),
    );
    const shell = readJson<{ bin?: Record<string, string> }>(
      join(ROOT, "packages/shell/package.json"),
    );
    const [command] = (scripts["test:vscode:docker"] ?? "").split(" ");
    expect(Object.keys(shell.bin ?? {})).toContain(command);
    expect(scripts["test:vscode"]).toBe(
      "npm run build && npm run build:vscode && npm run test:vscode-smoke",
    );
  });

  it("imports the driver from the entry of the shell apps/vscode pins, and is type-checked against it", () => {
    const shell = workspacePackage("@miragon/modeler-shell")!;
    expect(vscodeApp.dependencies?.[shell.name]).toBe(shell.version);
    expect([...shell.entries.keys()]).toContain(SMOKE_DRIVER_ENTRY);
    expect(readText(join(TEMPLATE, `${SMOKE_STEP}vscode-smoke.test.ts`))).toContain(
      `from '${SMOKE_DRIVER_ENTRY}'`,
    );
    expect(
      smokeFiles
        .filter((file) => file.endsWith(".ts"))
        .every((file) => typeCheckedTemplateFiles.includes(file)),
    ).toBe(true);
  });

  it("pins the driver's optional peers in apps/vscode, exactly and inside the shell's ranges", () => {
    const shellPeers =
      readJson<Manifest>(join(ROOT, "packages/shell/package.json")).peerDependencies ?? {};
    for (const name of SMOKE_DRIVER_PEERS) {
      const range = shellPeers[name];
      const pin = vscodeApp.devDependencies?.[name];
      expect(
        range && pin && EXACT_VERSION.test(pin) && satisfies(pin, range),
        `${name} ${pin} in ${range}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The template's CI gate
// ---------------------------------------------------------------------------------------------

interface WorkflowStep {
  id?: string;
  if?: string;
  run?: string;
  shell?: string;
  env?: Record<string, string>;
  uses?: string;
  with?: Record<string, string>;
}
interface WorkflowJob {
  name?: string;
  if?: string;
  needs?: string | string[];
  uses?: string;
  strategy?: { matrix?: Record<string, unknown> };
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
  [key: string]: unknown;
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
}

/** A workflow of the template; an empty one when the file is missing, so each test names the gap. */
function workflow(name: string): Workflow {
  const file = join(TEMPLATE, ".github/workflows", name);
  return existsSync(file) ? (parseYaml(readText(file)) as Workflow) : { on: {}, jobs: {} };
}
const needsOf = (job: WorkflowJob): string[] => [job.needs ?? []].flat();
const SMOKE_WORKFLOW = "./.github/workflows/vscode-smoke.yml";
const MISSING_STEP = "echo 'the step is missing'; exit 1";

/** A step's script as `shell: bash` runs it (bash -eo pipefail), with only `env` set. */
function runScript(script: string, env: Record<string, string>, cwd = ROOT) {
  const result = spawnSync(
    "bash",
    ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script],
    {
      cwd,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
      encoding: "utf8",
    },
  );
  const lines = `${result.stdout}${result.stderr}`.split("\n").filter(Boolean);
  return {
    code: result.status,
    errors: lines.filter((line) => line.startsWith("::error::")),
    lines,
  };
}

/** Runs a step that writes `name=value` lines to GITHUB_OUTPUT and returns those outputs. */
function stepOutputs(script: string, env: Record<string, string>, cwd: string) {
  const directory = mkdtempSync(join(tmpdir(), "modeler-kit-step-"));
  try {
    const output = join(directory, "output");
    writeFileSync(output, "");
    const run = runScript(script, { ...env, GITHUB_OUTPUT: output }, cwd);
    expect(run.code, run.lines.join("\n")).toBe(0);
    return Object.fromEntries(
      readText(output)
        .split("\n")
        .filter(Boolean)
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("the template's CI gate", () => {
  const ci = workflow("ci.yml");
  const gate = ci.jobs["ci-ok"] ?? {};
  const others = Object.keys(ci.jobs).filter((id) => id !== "ci-ok");
  const gateStep = gate.steps?.[0] ?? {};

  it("has ci-ok need every other CI job, run after failures and check nothing out", () => {
    expect(gate).toMatchObject({
      name: "ci-ok",
      if: "always()",
      "runs-on": "ubuntu-latest",
      "timeout-minutes": 5,
    });
    expect(needsOf(gate).sort()).toEqual([...others].sort());
    expect(gate.steps?.map((step) => step.uses).filter(Boolean)).toEqual([]);
    expect(gateStep).toMatchObject({ shell: "bash", env: { NEEDS: "${{ toJSON(needs) }}" } });
  });

  it("accepts a skip only from the jobs whose own `if:` skips them on the event", () => {
    const conditional = others.filter((id) => ci.jobs[id]!.if !== undefined);
    expect(conditional).toEqual(["dependency-review"]);
    expect(ci.jobs["dependency-review"]!.if).toBe("github.event_name == 'pull_request'");
    expect(gateStep.env?.SKIPPED_BY_DESIGN).toBe(
      "${{ github.event_name != 'pull_request' && 'dependency-review' || '' }}",
    );
  });

  describe("fails on any job that did not succeed", () => {
    const verdict = (results: Record<string, string>, skippedByDesign = "", jobs = others) => {
      const needs = Object.fromEntries(
        jobs.map((id) => [id, { result: results[id] ?? "success", outputs: {} }]),
      );
      return runScript(gateStep.run ?? MISSING_STEP, {
        NEEDS: JSON.stringify(needs),
        SKIPPED_BY_DESIGN: skippedByDesign,
      });
    };

    it("passes when every job succeeded", () => {
      expect(verdict({})).toMatchObject({ code: 0, errors: [] });
    });
    it("passes when dependency-review is skipped outside a pull request", () => {
      expect(verdict({ "dependency-review": "skipped" }, "dependency-review")).toMatchObject({
        code: 0,
        errors: [],
      });
    });
    it("fails when dependency-review is skipped on a pull request", () => {
      expect(verdict({ "dependency-review": "skipped" })).toMatchObject({
        code: 1,
        errors: ["::error::dependency-review: skipped"],
      });
    });
    it("fails on a failed job", () => {
      expect(verdict({ test: "failure" })).toMatchObject({
        code: 1,
        errors: ["::error::test: failure"],
      });
    });
    it("fails on a cancelled job", () => {
      expect(verdict({ "vscode-smoke": "cancelled" })).toMatchObject({
        code: 1,
        errors: ["::error::vscode-smoke: cancelled"],
      });
    });
    it("fails on a failed lint and the jobs it skipped", () => {
      expect(verdict({ lint: "failure", "test-browser": "skipped", e2e: "skipped" })).toMatchObject(
        {
          code: 1,
          errors: [
            "::error::lint: failure",
            "::error::test-browser: skipped",
            "::error::e2e: skipped",
          ],
        },
      );
    });
    it("fails when it needs no job at all", () => {
      expect(verdict({}, "", [])).toMatchObject({
        code: 1,
        errors: ["::error::ci-ok needs no job"],
      });
    });
  });
});

describe("the template's VS Code smoke workflows", () => {
  const ci = workflow("ci.yml");
  const smoke = workflow("vscode-smoke.yml");
  const weekly = workflow("vscode-smoke-weekly.yml");
  const release = workflow("release-please.yml");
  const smokeJob = smoke.jobs["vscode-smoke"] ?? {};
  const step = (job: WorkflowJob | undefined, id: string) =>
    job?.steps?.find((candidate) => candidate.id === id) ?? {};

  it("are one reusable workflow that CI and the weekly run call, with no path filter", () => {
    expect(Object.keys(smoke.on).sort()).toEqual(["workflow_call", "workflow_dispatch"]);
    expect(smoke.permissions).toEqual({ contents: "read" });
    expect(ci.jobs["vscode-smoke"]).toEqual({ uses: SMOKE_WORKFLOW });
    expect(Object.keys(weekly.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
    expect(weekly.jobs["vscode-smoke"]).toEqual({ uses: SMOKE_WORKFLOW });
  });

  it("end in a job that succeeds when the smoke test is skipped, so CI never sees the skip", () => {
    expect(Object.keys(smoke.jobs)).toEqual(["changes", "vscode-smoke", "skipped"]);
    expect(smokeJob).toMatchObject({ needs: "changes", if: "needs.changes.outputs.run == 'true'" });
    expect(smoke.jobs.skipped).toMatchObject({
      needs: "changes",
      if: "needs.changes.outputs.run != 'true'",
    });
    expect(smoke.jobs.skipped!.steps?.map((candidate) => candidate.run)).toEqual([
      expect.stringMatching(/^echo "::notice title=VS Code smoke skipped::/),
    ]);
  });

  it("open or update the tracking issue from the weekly run only, the one job that writes issues", () => {
    expect(weekly.jobs.alert).toMatchObject({
      needs: "vscode-smoke",
      if: "failure()",
      permissions: { issues: "write" },
    });
    expect(weekly.jobs.alert!.steps?.[0]?.env?.TITLE).toBe("VS Code smoke: the weekly run failed");
    expect(Object.values(smoke.jobs).filter((job) => job.permissions !== undefined)).toEqual([]);
  });

  it("run stable and the engines floor, read from apps/vscode at run time", () => {
    const engines = readJson<{ engines: { vscode: string } }>(
      join(TEMPLATE, "apps/vscode/package.json"),
    ).engines.vscode;
    expect(smokeJob.strategy).toEqual({
      "fail-fast": false,
      matrix: { vscode: ["stable", "minimum"] },
    });
    expect(
      stepOutputs(
        step(smokeJob, "vscode").run ?? MISSING_STEP,
        { CHANNEL: "minimum", HOME: tmpdir() },
        TEMPLATE,
      ),
    ).toEqual({
      version: engines.replace(/^\^/, ""),
      cache: join(tmpdir(), ".cache/miragon-modeler-shell/vscode-test"),
    });
    const run = smokeJob.steps?.find((candidate) => candidate.run?.includes("test:vscode-smoke"));
    expect(run?.env).toEqual({
      VSCODE_VERSION: "${{ steps.vscode.outputs.version }}",
      VSCODE_SMOKE_KEEP: "1",
      TMPDIR: "${{ runner.temp }}",
    });
    expect(readText(join(TEMPLATE, `${SMOKE_STEP}vscode-smoke.test.ts`))).toContain(
      "vscodeVersion: process.env.VSCODE_VERSION",
    );
  });

  it("keep VS Code's profile in RUNNER_TEMP and upload its logs when a smoke fails", () => {
    expect(readText(join(TEMPLATE, `${SMOKE_STEP}vscode-smoke.test.ts`))).toContain(
      "keepTemporaryFiles: process.env.VSCODE_SMOKE_KEEP === '1'",
    );
    const logs = "${{ runner.temp }}/modeler-shell-vscode-*/user-data/logs/";
    expect(
      smokeJob.steps
        ?.filter((candidate) => candidate.with?.path === logs)
        .map((candidate) => candidate.if),
    ).toEqual(["failure()"]);
    const smoking = Object.entries(release.jobs).filter(([, job]) =>
      job.steps?.some((candidate) => candidate.run?.includes("npm run test:vscode-smoke")),
    );
    expect(smoking.map(([id]) => id).sort()).toEqual([
      "dry-run",
      "publish-open-vsx",
      "publish-vscode",
    ]);
    for (const [id, job] of smoking) {
      const smoked = job.steps!.find((candidate) =>
        candidate.run?.includes("npm run test:vscode-smoke"),
      );
      expect([id, smoked?.env?.VSCODE_SMOKE_KEEP, smoked?.env?.TMPDIR]).toEqual([
        id,
        "1",
        "${{ runner.temp }}",
      ]);
      const upload = job.steps!.find((candidate) => candidate.if === "failure()");
      expect([id, String(upload?.with?.path).split("\n").filter(Boolean)]).toEqual([
        id,
        ["test-results/vscode-smoke/", logs],
      ]);
    }
  });

  it("smoke-test the packed VSIX in every job that publishes it, before the upload", () => {
    const publishing = Object.entries(release.jobs).filter(([, job]) =>
      job.steps?.some((candidate) => /\b(vsce|ovsx) publish\b/.test(candidate.run ?? "")),
    );
    expect(publishing.map(([id]) => id).sort()).toEqual(["publish-open-vsx", "publish-vscode"]);
    for (const [id, job] of publishing) {
      const runs = job.steps!.map((candidate) => candidate.run ?? "");
      const packed = runs.findIndex((run) => run.includes("vsce package"));
      const smoked = runs.findIndex((run) => run.includes("xvfb-run -a npm run test:vscode-smoke"));
      const published = runs.findIndex((run) => /\b(vsce|ovsx) publish\b/.test(run));
      expect([id, packed < smoked && smoked < published && packed >= 0]).toEqual([id, true]);
      expect(job.steps![smoked]!.env).toMatchObject({
        VSCODE_VERSION: "stable",
        VSCODE_SMOKE_EXTENSION: "${{ runner.temp }}/vsix/extension",
      });
    }
    expect(readText(join(TEMPLATE, `${SMOKE_STEP}vscode-smoke.test.ts`))).toContain(
      "process.env.VSCODE_SMOKE_EXTENSION ||",
    );
  });

  describe("decide from the changed paths whether VS Code runs", () => {
    // A hook or `git rebase --exec` exports GIT_DIR and GIT_INDEX_FILE of the repository it runs in;
    // inherited, they would point the sandbox's commits, resets and pushes at that repository.
    const environment = () => ({
      ...Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
      ),
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_NOSYSTEM: "1",
    });
    const git = (cwd: string, ...args: string[]) =>
      execFileSync("git", args, { cwd, encoding: "utf8", env: environment() }).trim();
    const sandbox = mkdtempSync(join(tmpdir(), "modeler-kit-paths-"));
    const work = join(sandbox, "work");
    git(sandbox, "init", "-q", "--bare", "origin.git");
    git(sandbox, "init", "-q", "-b", "main", "work");
    git(work, "remote", "add", "origin", join(sandbox, "origin.git"));
    const commit = (files: Record<string, string>, remove: string[] = []) => {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(work, path)), { recursive: true });
        writeFileSync(join(work, path), text);
      }
      for (const path of remove) git(work, "rm", "-q", path);
      git(work, "add", "-A");
      git(
        work,
        "-c",
        "user.name=kit",
        "-c",
        "user.email=kit@example.invalid",
        "commit",
        "-q",
        "-m",
        "change",
      );
      git(work, "push", "-q", "origin", "main");
      return git(work, "rev-parse", "HEAD");
    };
    const base = commit({
      "README.md": "a",
      "docs/guide.md": "a",
      "apps/vscode/src/extension.ts": "a",
    });
    afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

    const baseOf: Record<string, string> = {
      pull_request: "PULL_REQUEST_BASE_SHA",
      push: "PUSH_BEFORE_SHA",
      merge_group: "MERGE_GROUP_BASE_SHA",
    };
    const decision = (event: string, baseSha: string) =>
      stepOutputs(
        step(smoke.jobs.changes, "decide").run ?? MISSING_STEP,
        {
          EVENT_NAME: event,
          PULL_REQUEST_BASE_SHA: "",
          PUSH_BEFORE_SHA: "",
          MERGE_GROUP_BASE_SHA: "",
          ...(baseOf[event] ? { [baseOf[event]]: baseSha } : {}),
        },
        work,
      ).run;
    const afterChanging = (files: Record<string, string>, remove: string[] = []) => {
      git(work, "reset", "-q", "--hard", base);
      git(work, "push", "-q", "--force", "origin", "main");
      commit(files, remove);
      return decision("pull_request", base);
    };

    it("skips when only paths outside the extension's inputs changed", () => {
      expect(afterChanging({ "README.md": "b", "docs/guide.md": "b" })).toBe("false");
    });
    it.each([
      "apps/vscode/src/extension.ts",
      "packages/dsl/src/index.ts",
      "package.json",
      "package-lock.json",
      "e2e/package.json",
      "tsconfig.base.json",
      ".github/workflows/ci.yml",
      ".github/workflows/vscode-smoke.yml",
      ".github/workflows/vscode-smoke-weekly.yml",
      ".github/actions/setup/action.yml",
    ])("runs when %s changed", (path) => {
      expect(afterChanging({ [path]: "b" })).toBe("true");
    });
    it("runs when a file moved out of apps/vscode", () => {
      expect(afterChanging({ "docs/extension.ts": "a" }, ["apps/vscode/src/extension.ts"])).toBe(
        "true",
      );
    });
    it("runs when only a file with a non-ASCII name changed in apps/vscode", () => {
      expect(afterChanging({ "apps/vscode/test/Übersicht.example": "b" })).toBe("true");
    });
    it("runs when only a file with a quote in its name changed in apps/vscode", () => {
      expect(afterChanging({ 'apps/vscode/test/a "quoted" name.example': "b" })).toBe("true");
    });
    it.each(["push", "merge_group"])("compares a %s with its base too", (event) => {
      afterChanging({ "README.md": "b" });
      expect(decision(event, base)).toBe("false");
    });
    it.each([
      ["a zero base (a new branch)", "0".repeat(40)],
      ["no base", ""],
      ["a base the remote does not have", "1".repeat(40)],
    ])("runs with %s", (_, baseSha) => {
      afterChanging({ "README.md": "b" });
      expect(decision("push", baseSha)).toBe("true");
    });
    it.each(["schedule", "workflow_dispatch"])("always runs on %s", (event) => {
      expect(decision(event, "")).toBe("true");
    });
    it("keeps the sandbox's commits out of the repository an inherited GIT_DIR names", () => {
      const elsewhere = join(sandbox, "elsewhere");
      git(sandbox, "init", "-q", "-b", "main", "elsewhere");
      vi.stubEnv("GIT_DIR", join(elsewhere, ".git"));
      try {
        expect(afterChanging({ "README.md": "c" })).toBe("false");
      } finally {
        vi.unstubAllEnvs();
      }
      expect(git(elsewhere, "rev-list", "--all")).toBe("");
    });
  });
});

// ---------------------------------------------------------------------------------------------
// The template compiles against the current packages
// ---------------------------------------------------------------------------------------------

describe("the template's TypeScript", () => {
  it("type-checks against the current @miragon/modeler-api and @miragon/modeler-shell sources", () => {
    expect(
      [...NOT_TYPE_CHECKED_HERE.keys()].filter(
        (file) => !templateFiles.includes(join(TEMPLATE, file)),
      ),
    ).toEqual([]);
    const checked = program();
    const files = typeCheckedTemplateFiles.map((file) => checked.getSourceFile(file)!);
    const diagnostics = [
      ...checked.getOptionsDiagnostics(),
      ...checked.getGlobalDiagnostics(),
      ...files.flatMap((file) => [
        ...checked.getSyntacticDiagnostics(file),
        ...checked.getSemanticDiagnostics(file),
      ]),
    ];
    expect(
      diagnostics.map((diagnostic) => {
        const where =
          diagnostic.file && diagnostic.start !== undefined
            ? `${fromRoot(diagnostic.file.fileName)}:${diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1} `
            : "";
        return `${where}${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
      }),
    ).toEqual([]);
  });

  it("parses under its own ESLint config in one run with the modelers' files, as the suite's pre-commit hook lints them", async () => {
    const modelerSources = readdirSync(join(ROOT, "modelers")).map((modeler) =>
      join(ROOT, "modelers", modeler, "packages/schema-model/src/index.ts"),
    );
    const templateSources = templateFiles.filter((file) => file.endsWith(".ts"));
    const results = await new ESLint({ cwd: ROOT, warnIgnored: false }).lintFiles([
      ...modelerSources,
      ...templateSources,
    ]);
    expect(
      results
        .filter((result) => result.fatalErrorCount > 0)
        .map((result) => `${fromRoot(result.filePath)}: ${result.messages[0]?.message}`),
    ).toEqual([]);
  });
});
