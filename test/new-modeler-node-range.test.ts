/**
 * Drift guard of the new-modeler template's Node version: the template declares the suite's range,
 * its CI installs the floor of that range, and every package it pins accepts the floor. A pinned
 * package's own range is read from the copy of that version this workspace installs or, once the
 * suite has moved past it, from the closest newer copy: an `engines` floor rises from release to
 * release, so what the newer copy accepts the pinned one accepts too, and an update of the suite
 * never waits for the template. A template pin that runs ahead of every installed copy cannot be
 * read and fails here instead of in a new modeler's `npm ci`: the suite takes a version first.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "plugins/modeler-kit/skills/new-modeler/assets/template");

interface Manifest {
  name: string;
  version: string;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
interface ActionStep {
  id?: string;
  run?: string;
  uses?: string;
  with?: Record<string, string>;
}
interface Action {
  inputs?: Record<string, { default?: string }>;
  runs: { steps: ActionStep[] };
}
interface Pin {
  name: string;
  version: string;
}

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const readText = (path: string): string => readFileSync(path, "utf8");
const readManifest = (path: string): Manifest => JSON.parse(readText(path)) as Manifest;
const fromTemplate = (path: string): string => relative(TEMPLATE, path).split(sep).join("/");

function manifestsUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (name === "node_modules") return [];
    if (statSync(path).isDirectory()) return manifestsUnder(path);
    return name === "package.json" ? [path] : [];
  });
}

const SUITE_RANGE = readManifest(join(ROOT, "package.json")).engines?.node ?? "";
const templateManifests = manifestsUnder(TEMPLATE);
const TEMPLATE_RANGE = readManifest(join(TEMPLATE, "package.json")).engines?.node ?? "";
const FLOOR = semver.minVersion(TEMPLATE_RANGE)?.version;
/** The lowest Node of each alternative of the range: every one is a Node a developer may run. */
const FLOORS = TEMPLATE_RANGE.split("||").map(
  (alternative) => semver.minVersion(alternative)?.version ?? alternative,
);

/** Template pins the suite never installs, so their own range cannot be read here. */
const NOT_INSTALLED_HERE = new Map([
  ["ovsx", "the suite publishes to Open VSX through npx, so only the template installs it"],
]);
/** Template pins that need Node 24, and why the template accepts that. */
const NEEDS_NODE_24 = new Map([
  [
    "portless",
    "only `npm run dev:webapp` runs it; README.md and CLAUDE.md say so, and `dev:webapp:plain` runs on Node 22",
  ],
]);

const templatePackages = new Set(templateManifests.map((file) => readManifest(file).name));
const pins: Pin[] = [
  ...new Map(
    templateManifests
      .flatMap((file) => {
        const manifest = readManifest(file);
        return Object.entries({ ...manifest.dependencies, ...manifest.devDependencies });
      })
      .filter(([name]) => !templatePackages.has(name))
      .map(([name, version]) => [`${name}@${version}`, { name, version }] as const),
  ).values(),
].sort((a, b) => byCodePoint(a.name, b.name) || byCodePoint(a.version, b.version));

const { packages: lockedPaths } = JSON.parse(readText(join(ROOT, "package-lock.json"))) as {
  packages: Record<string, unknown>;
};

/** The manifest of every copy of a package installed in this workspace, wherever npm put it. */
function installedCopies(name: string): Manifest[] {
  return Object.keys(lockedPaths)
    .filter((path) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
    .map((path) => join(ROOT, path, "package.json"))
    .filter((path) => existsSync(path))
    .map(readManifest);
}

/** The installed copy whose `engines` stand for a pin: that version, else the closest newer one. */
function copyReadFor(pin: Pin): Manifest | undefined {
  const copies = installedCopies(pin.name);
  return (
    copies.find((copy) => copy.version === pin.version) ??
    copies
      .filter((copy) => semver.gt(copy.version, pin.version))
      .sort((a, b) => semver.compare(a.version, b.version))[0]
  );
}

/** Runs an action's `bash` step with only `env` set; returns its exit code, log and outputs. */
function runStep(script: string, env: Record<string, string>, cwd: string) {
  const directory = mkdtempSync(join(tmpdir(), "modeler-kit-node-"));
  try {
    const output = join(directory, "output");
    writeFileSync(output, "");
    const result = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script],
      {
        cwd,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          ...env,
          GITHUB_OUTPUT: output,
        },
        encoding: "utf8",
      },
    );
    return {
      code: result.status,
      lines: `${result.stdout}${result.stderr}`.split("\n").filter(Boolean),
      outputs: Object.fromEntries(
        readText(output)
          .split("\n")
          .filter(Boolean)
          .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
      ),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const readAction = (root: string): Action =>
  parseYaml(readText(join(root, ".github/actions/setup/action.yml"))) as Action;
const floorStep = (action: Action): string =>
  action.runs.steps.find((step) => step.id === "node")?.run ?? "echo 'the step is missing'; exit 1";

describe("the template's Node range", () => {
  it("is the suite's range, in every engines field of the template", () => {
    const declared = templateManifests.flatMap((file) => {
      const range = readManifest(file).engines?.node;
      return range === undefined ? [] : [`${fromTemplate(file)}: ${range}`];
    });
    expect(SUITE_RANGE).not.toBe("");
    expect(declared).toContain(`package.json: ${SUITE_RANGE}`);
    expect(declared.filter((entry) => !entry.endsWith(`: ${SUITE_RANGE}`))).toEqual([]);
  });

  it("is named where a developer starts, with the floor CI runs and Node 24 for Portless", () => {
    const node24 = FLOORS.find((floor) => semver.major(floor) === 24);
    for (const document of ["README.md", "CLAUDE.md"]) {
      const text = readText(join(TEMPLATE, document)).replace(/\s+/g, " ");
      expect(text, document).toContain(`\`${TEMPLATE_RANGE}\``);
      expect(text, document).toContain(`CI runs the floor, Node ${FLOOR}`);
      expect(text, document).toContain(`Portless`);
      expect(text, document).toContain(`needs Node ${node24} or later`);
      expect(text, document).toContain("`npm run dev:webapp:plain`");
    }
  });
});

describe("the template's setup action", () => {
  const action = readAction(TEMPLATE);

  it("hands setup-node the version its first step picks, the floor unless a job names one", () => {
    expect(action.inputs?.["node-version"]?.default).toBe("");
    expect(action.runs.steps[0]?.id).toBe("node");
    const setupNode = action.runs.steps.filter((step) =>
      step.uses?.startsWith("actions/setup-node@"),
    );
    expect(setupNode.map((step) => step.with?.["node-version"])).toEqual([
      "${{ steps.node.outputs.version }}",
    ]);
  });

  it("picks the floor of the range, as the suite's setup action does for the suite", () => {
    expect(FLOOR).toBe(FLOORS[0]);
    const template = runStep(floorStep(action), { NODE_VERSION: "" }, TEMPLATE);
    const suite = runStep(floorStep(readAction(ROOT)), { NODE_VERSION: "", MODELER: "" }, ROOT);
    expect([template.code, template.outputs]).toEqual([0, { version: FLOOR }]);
    expect([suite.code, suite.outputs]).toEqual([0, { version: FLOOR }]);
  });

  it("picks the version a job names, as the publish jobs do with Node 24", () => {
    const run = runStep(floorStep(action), { NODE_VERSION: "24" }, TEMPLATE);
    expect([run.code, run.outputs]).toEqual([0, { version: "24" }]);
  });

  it("fails without a floor in package.json", () => {
    const directory = mkdtempSync(join(tmpdir(), "modeler-kit-node-"));
    try {
      writeFileSync(join(directory, "package.json"), "{}");
      const run = runStep(floorStep(action), { NODE_VERSION: "" }, directory);
      expect([run.code, run.lines]).toEqual([
        1,
        ["::error::No engines.node floor in package.json"],
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("the packages the template pins", () => {
  it("never run ahead of the versions this workspace installs, so their own range can be read", () => {
    const unread = pins.filter((pin) => !copyReadFor(pin));
    const whyUnread = (pin: Pin) => {
      const versions = installedCopies(pin.name).map((copy) => copy.version);
      return versions.length === 0
        ? `${pin.name}@${pin.version} is not installed here`
        : `${pin.name}@${pin.version} runs ahead of the suite (installed here: ${versions.join(", ")})`;
    };
    expect(
      unread.map((pin) => pin.name),
      unread.map(whyUnread).join("; "),
    ).toEqual([...NOT_INSTALLED_HERE.keys()]);
  });

  it("accept the floor of each alternative of the range", () => {
    const rejections = pins.flatMap((pin) => {
      const copy = copyReadFor(pin);
      const range = copy?.engines?.node;
      return copy === undefined || range === undefined
        ? []
        : FLOORS.filter((floor) => !semver.satisfies(floor, range)).map((floor) => ({
            pin,
            source: copy.version === pin.version ? range : `${range}, read from ${copy.version}`,
            floor,
          }));
    });
    expect(
      rejections.map(({ pin, floor }) => `${pin.name} rejects Node ${floor}`),
      rejections
        .map(({ pin, source, floor }) => `${pin.name}@${pin.version} (${source}) rejects ${floor}`)
        .join("; "),
    ).toEqual(
      [...NEEDS_NODE_24.keys()].flatMap((name) =>
        FLOORS.filter((floor) => semver.major(floor) < 24).map(
          (floor) => `${name} rejects Node ${floor}`,
        ),
      ),
    );
  });
});
