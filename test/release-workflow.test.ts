/**
 * The shape of the release workflow: every target is built and checked without an environment,
 * then published from a job that needs every build, so all environments ask for approval at once
 * and one "Review deployments" approves them. npm's trusted publishing is bound to this file name
 * and to the environment `npm` of the job that runs `npm publish`.
 *
 * And what its plan lists: the three publish jobs take their matrices from the plan script alone,
 * so a modeler the script holds back reaches no registry, marketplace or catalog.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE = join(ROOT, ".github/workflows/release-please.yml");

interface Job {
  needs?: string | string[];
  environment?: string;
  steps?: { run?: string }[];
}

const jobs = (parseYaml(readFileSync(RELEASE, "utf8")) as { jobs: Record<string, Job> }).jobs;
const ids = Object.keys(jobs);
const buildJobs = ids.filter((id) => id.startsWith("build-"));
const publishJobs = ids.filter((id) => id.startsWith("publish-"));

describe("the release workflow", () => {
  it("is the file npm's trusted publishers name", () => {
    expect(existsSync(RELEASE)).toBe(true);
  });

  it("plans, builds and publishes, with nothing in between", () => {
    expect(ids).toEqual(["plan", ...buildJobs, ...publishJobs]);
    expect(buildJobs).toEqual(["build-npm", "build-vscode", "build-orca"]);
    expect(publishJobs).toEqual(["publish-npm", "publish-vscode", "publish-orca"]);
  });

  it("builds without an environment, so nothing waits for an approval before it is checked", () => {
    for (const id of buildJobs) {
      expect(jobs[id]?.environment, id).toBeUndefined();
      expect(jobs[id]?.needs, id).toBe("plan");
    }
  });

  it("publishes from jobs that each need every build, so their approvals come at once", () => {
    for (const id of publishJobs) {
      expect(jobs[id]?.environment, id).toBeDefined();
      expect(jobs[id]?.needs, id).toEqual(["plan", ...buildJobs]);
    }
  });

  it("runs npm publish in the environment npm only", () => {
    const publishing = ids.filter((id) =>
      jobs[id]?.steps?.some((step) => /\bnpm publish\b/.test(step.run ?? "")),
    );
    expect(publishing).toEqual(["publish-npm"]);
    expect(jobs["publish-npm"]?.environment).toBe("npm");
  });
});

const PLAN = join(ROOT, ".github/scripts/release-plan.mjs");
const MATRICES = ["npm", "vscode", "orca"] as const;

type Plan = Record<(typeof MATRICES)[number], { modeler: string; name: string }[]>;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;
}

/**
 * The three matrices the plan writes for a release of these paths, in the suite at `root`: run by
 * hand, or in a workflow run whose event is the file at `eventPath`.
 */
function plan(argument: string, root = ROOT, eventPath = ""): Plan {
  const printed = execFileSync(process.execPath, [PLAN, argument], {
    cwd: root,
    encoding: "utf8",
    // CI sets both for the step that runs this test: the plan would write its matrices into that
    // run's output and read that run's event.
    env: { ...process.env, GITHUB_OUTPUT: "", GITHUB_EVENT_PATH: eventPath },
  });
  const matrix = (key: string): Plan["npm"] => {
    const line = new RegExp(`^${key}=(.*)$`, "m").exec(printed)?.[1];
    if (line === undefined) throw new Error(`The plan printed no ${key} matrix:\n${printed}`);
    return JSON.parse(line) as Plan["npm"];
  };
  return { npm: matrix("npm"), vscode: matrix("vscode"), orca: matrix("orca") };
}

function names(planned: Plan): Record<(typeof MATRICES)[number], string[]> {
  const namesIn = (key: (typeof MATRICES)[number]): string[] =>
    planned[key].map(({ name }) => name);
  return { npm: namesIn("npm"), vscode: namesIn("vscode"), orca: namesIn("orca") };
}

function modelersIn(planned: Plan): string[] {
  const modelers = MATRICES.flatMap((key) => planned[key].map(({ modeler }) => modeler));
  return [...new Set(modelers)].filter((modeler) => modeler !== "").sort();
}

/**
 * A suite of its own in a temporary folder, as far as the plan reads one: per modeler a public
 * package, an extension and an Orca plugin, each a component.
 */
function suiteOf(modelers: string[]): { root: string; components: string[] } {
  const root = mkdtempSync(join(tmpdir(), "release-plan-"));
  const write = (path: string, content: object): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), JSON.stringify(content));
  };
  const components = modelers.flatMap((modeler) => {
    const folder = `modelers/${modeler}`;
    write(`${folder}/packages/renderer/package.json`, { name: `@miragon/${modeler}-renderer` });
    write(`${folder}/apps/vscode/package.json`, {
      name: `${modeler}-modeler`,
      private: true,
      engines: { vscode: "^1.96.0" },
    });
    write(`${folder}/apps/orca/package.json`, { name: `${modeler}-orca`, private: true });
    write(`${folder}/apps/orca/orca-plugin.json`, { id: `${modeler}-modeler`, version: "0.1.0" });
    return [`${folder}/packages/renderer`, `${folder}/apps/vscode`, `${folder}/apps/orca`];
  });
  const keyed = (paths: string[]): Record<string, object> =>
    Object.fromEntries(paths.map((path) => [path, {}]));
  write("release-please-config.json", { packages: keyed(components) });
  write("package-lock.json", { packages: keyed(["", ...components]) });
  return { root, components };
}

interface ExtensionManifest {
  name: string;
  publisher: string;
  extensionPack?: string[];
}

const everyComponent = Object.keys(
  readJson<{ packages: Record<string, object> }>("release-please-config.json").packages,
);

function componentsOf(modeler: string): string[] {
  const folder = `modelers/${modeler}`;
  return everyComponent.filter((path) => path === folder || path.startsWith(`${folder}/`));
}

function extensionOf(modeler: string): ExtensionManifest {
  return readJson<ExtensionManifest>(`modelers/${modeler}/apps/vscode/package.json`);
}

/**
 * The modelers `HELD_BACK` of the plan script names. The pull request that makes one public takes
 * it off both lists, and the cases that run once per held modeler go with it.
 */
const HELD_BACK: string[] = [];

describe("the release plan", () => {
  it("publishes the extension of a modeler whose component released", () => {
    expect(names(plan('["modelers/c4/apps/vscode"]'))).toEqual({
      npm: [],
      vscode: ["c4-modeler"],
      orca: [],
    });
  });

  it("holds back exactly the modelers this test names", () => {
    const listedForADryRun = modelersIn(plan("--all"));
    const listedForARelease = modelersIn(plan(JSON.stringify(everyComponent)));
    expect(listedForADryRun.filter((modeler) => !listedForARelease.includes(modeler))).toEqual(
      HELD_BACK,
    );
  });

  // A held modeler is on main before it is public: its components release, nothing of it leaves.
  it.each(HELD_BACK)("publishes nothing of %s, whichever of its components released", (modeler) => {
    const components = componentsOf(modeler);
    expect(components.length).toBeGreaterThan(0);
    expect(names(plan(JSON.stringify(components)))).toEqual({ npm: [], vscode: [], orca: [] });
    for (const component of components) {
      expect(modelersIn(plan(JSON.stringify([component]))), component).toEqual([]);
    }
  });

  it.each(HELD_BACK)("publishes the rest of a release %s is part of", (modeler) => {
    const released = JSON.stringify([...componentsOf(modeler), "modelers/c4/apps/vscode"]);
    expect(names(plan(released)).vscode).toEqual(["c4-modeler"]);
  });

  it.each(HELD_BACK)("lists %s for the dry run, which builds and smoke-tests it", (modeler) => {
    expect(names(plan("--all")).vscode).toContain(extensionOf(modeler).name);
  });

  // The workflow passes --all whenever the released paths come out empty, in a release as well.
  it.each(HELD_BACK)(
    "lifts the hold on %s inside a workflow run for the dry_run input alone",
    (modeler) => {
      const held = extensionOf(modeler).name;
      const folder = mkdtempSync(join(tmpdir(), "release-event-"));
      const extensionsListedFor = (event: object): string[] => {
        const eventPath = join(folder, "event.json");
        writeFileSync(eventPath, JSON.stringify(event));
        return names(plan("--all", ROOT, eventPath)).vscode;
      };
      try {
        expect(extensionsListedFor({ inputs: { dry_run: "true" } })).toContain(held);
        expect(extensionsListedFor({ inputs: { dry_run: true } })).toContain(held);
        const aPush = { ref: "refs/heads/main" };
        const startedByHandWithoutTheInput = { inputs: { dry_run: "false" } };
        for (const release of [aPush, startedByHandWithoutTheInput, { inputs: null }]) {
          const listed = extensionsListedFor(release);
          expect(listed, JSON.stringify(release)).not.toContain(held);
          expect(listed, JSON.stringify(release)).toContain("c4-modeler");
        }
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    },
  );

  // A held modeler may have no public package or no Orca plugin, so a suite that has both stands in.
  it.each(HELD_BACK)(
    "holds the packages and the Orca plugin of %s back with its extension",
    (modeler) => {
      const suite = suiteOf([modeler, "other"]);
      try {
        expect(names(plan(JSON.stringify(suite.components), suite.root))).toEqual({
          npm: ["@miragon/other-renderer"],
          vscode: ["other-modeler"],
          orca: ["other-orca"],
        });
        expect(names(plan("--all", suite.root))).toEqual({
          npm: [`@miragon/${modeler}-renderer`, "@miragon/other-renderer"],
          vscode: [`${modeler}-modeler`, "other-modeler"],
          orca: [`${modeler}-orca`, "other-orca"],
        });
      } finally {
        rmSync(suite.root, { recursive: true, force: true });
      }
    },
  );
});

/**
 * Where a modeler becomes public past the plan: a site Netlify builds from its netlify.toml and a
 * page of the docs site, both with the push to main; a plugin of the Claude marketplace, which is
 * read from main; and an entry of the extension pack, which a release of the pack publishes.
 */
function publicPastThePlan(modeler: string): string[] {
  const extension = extensionOf(modeler);
  const pack = readJson<ExtensionManifest>("extensions/modeler-collection/package.json");
  const marketplace = readJson<{ plugins: { source: string }[] }>(
    ".claude-plugin/marketplace.json",
  );
  const found = {
    "a Netlify site": existsSync(join(ROOT, `modelers/${modeler}/netlify.toml`)),
    "a page of the docs site": existsSync(join(ROOT, `docs/modelers/${modeler}.md`)),
    "a plugin of the Claude marketplace": marketplace.plugins.some(({ source }) =>
      source.startsWith(`./modelers/${modeler}/`),
    ),
    "an entry of the extension pack":
      pack.extensionPack?.includes(`${extension.publisher}.${extension.name}`) ?? false,
  };
  return Object.entries(found)
    .filter(([, isThere]) => isThere)
    .map(([place]) => place);
}

describe("a modeler the release plan holds back", () => {
  it.each(HELD_BACK)("%s is in none of the places the plan does not decide", (modeler) => {
    expect(publicPastThePlan(modeler)).toEqual([]);
  });

  it("would be found in each of those places, as a public modeler is", () => {
    expect(publicPastThePlan("wardley-maps")).toEqual([
      "a Netlify site",
      "a page of the docs site",
      "a plugin of the Claude marketplace",
      "an entry of the extension pack",
    ]);
  });
});
