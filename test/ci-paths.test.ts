/**
 * The path decisions of CI (`.github/scripts/ci-paths.sh affected`), run on a throwaway repository,
 * and the skips `ci-ok` accepts on their word (`.github/scripts/ci-gate.sh`). A path that reaches a
 * check must start the job that runs it: a job the script leaves out is skipped, and `ci-ok`
 * accepts that skip, so a change that breaks the check merges on green CI.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CI_PATHS = join(ROOT, ".github/scripts/ci-paths.sh");
const CI_GATE = join(ROOT, ".github/scripts/ci-gate.sh");
const CI_WORKFLOW = ".github/workflows/ci.yml";
const MODELERS = ["event-storming", "wardley-maps"];

/** `repositoryTests` starts shared-test, the job of `npm run test:plugin`, which `shared` implies. */
interface Reach {
  shared: boolean;
  repositoryTests: boolean;
  template: boolean;
  modelers: string[];
}

const NOTHING: Reach = { shared: false, repositoryTests: false, template: false, modelers: [] };
const SHARED: Reach = { ...NOTHING, shared: true, repositoryTests: true };
const EVERYTHING: Reach = {
  shared: true,
  repositoryTests: true,
  template: true,
  modelers: MODELERS,
};
const modelerOnly = (modeler: string): Reach => ({ ...NOTHING, modelers: [modeler] });
const modelerAndRepositoryTests = (modeler: string): Reach => ({
  ...modelerOnly(modeler),
  repositoryTests: true,
});

/** Edits only: the base commit holds each of these files, as adding one to a modeler reaches more. */
const REACH_OF_AN_EDIT: [string, Reach][] = [
  ["docs/guide.md", NOTHING],
  ["README.md", NOTHING],
  ["LICENSE", NOTHING],
  [".husky/pre-commit", SHARED],
  ["modelers/wardley-maps/docs/guide.md", NOTHING],
  ["modelers/wardley-maps/README.md", NOTHING],
  ["modelers/wardley-maps/packages/dsl/src/index.ts", modelerOnly("wardley-maps")],
  ["modelers/wardley-maps/packages/dsl/README.md", modelerOnly("wardley-maps")],
  ["modelers/wardley-maps/vitest.config.ts", modelerOnly("wardley-maps")],
  ["modelers/wardley-maps/packages/renderer/src/plugins/index.ts", modelerOnly("wardley-maps")],
  ["modelers/wardley-maps/packages/schema-model/src/index.ts", modelerOnly("wardley-maps")],
  ["modelers/event-storming/.claude/rules/rule.md", modelerOnly("event-storming")],
  [
    "modelers/wardley-maps/plugins/wardley-maps-modeler/.claude-plugin/plugin.json",
    modelerAndRepositoryTests("wardley-maps"),
  ],
  [
    "modelers/event-storming/plugins/event-storming-modeler/skills/storm-dsl/SKILL.md",
    modelerAndRepositoryTests("event-storming"),
  ],
  ["modelers/wardley-maps/package.json", modelerAndRepositoryTests("wardley-maps")],
  ["modelers/wardley-maps/packages/dsl/package.json", modelerAndRepositoryTests("wardley-maps")],
  ["modelers/event-storming/apps/vscode/package.json", modelerAndRepositoryTests("event-storming")],
  ["modelers/event-storming/apps/webapp/package.json", modelerAndRepositoryTests("event-storming")],
  ["modelers/wardley-maps/e2e/package.json", modelerAndRepositoryTests("wardley-maps")],
  [
    "modelers/wardley-maps/packages/renderer/test/fixtures/package.json",
    modelerOnly("wardley-maps"),
  ],
  ["modelers/wardley-maps/eslint.config.js", modelerAndRepositoryTests("wardley-maps")],
  ["modelers/event-storming/eslint.config.mjs", modelerAndRepositoryTests("event-storming")],
  [
    "modelers/wardley-maps/packages/dsl/eslint.config.js",
    modelerAndRepositoryTests("wardley-maps"),
  ],
  ["modelers/wardley-maps/.dependency-cruiser.cjs", modelerAndRepositoryTests("wardley-maps")],
  ["modelers/wardley-maps/packages/dsl/.dependency-cruiser.cjs", modelerOnly("wardley-maps")],
  ["modelers/event-storming/.miragon/brand.json", modelerAndRepositoryTests("event-storming")],
  [
    "modelers/wardley-maps/packages/renderer/.miragon/brand.json",
    modelerAndRepositoryTests("wardley-maps"),
  ],
  [
    "modelers/event-storming/packages/renderer/src/theme/cd-canvas.css",
    { ...modelerOnly("event-storming"), template: true },
  ],
  ["modelers/wardley-maps/packages/renderer/src/theme/cd-canvas.css", modelerOnly("wardley-maps")],
  ["plugins/modeler-kit/README.md", { ...SHARED, template: true }],
  ["test/release-config.test.ts", SHARED],
  [".claude-plugin/marketplace.json", SHARED],
  ["extensions/modeler-collection/package.json", SHARED],
  ["packages/api/src/index.ts", EVERYTHING],
  [".github/workflows/ci.yml", EVERYTHING],
  ["package-lock.json", EVERYTHING],
  ["modelers/capability-map/src/index.ts", EVERYTHING],
];

describe("the paths a change reaches in CI", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "ci-paths-"));
  const work = join(sandbox, "work");
  const outputFile = join(sandbox, "github-output");
  // A hook or `git rebase --exec` exports GIT_DIR and GIT_INDEX_FILE of the repository it runs in;
  // inherited, they would point the sandbox's commits and resets at that repository.
  const environment = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: work,
      encoding: "utf8",
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  mkdirSync(work);
  git("init", "-q", "-b", "main");
  const commit = (files: Record<string, string | null>) => {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) {
        rmSync(join(work, path));
        continue;
      }
      mkdirSync(dirname(join(work, path)), { recursive: true });
      writeFileSync(join(work, path), text);
    }
    git("add", "-A");
    git(
      "-c",
      "user.name=ci",
      "-c",
      "user.email=ci@example.invalid",
      "commit",
      "-q",
      "-m",
      "change",
    );
    return git("rev-parse", "HEAD");
  };
  const base = commit({
    ...Object.fromEntries(REACH_OF_AN_EDIT.map(([path]) => [path, "a"])),
    ...Object.fromEntries(MODELERS.map((modeler) => [`modelers/${modeler}/package.json`, "{}"])),
    "modelers/event-storming/packages/dsl/src/index.ts": "a",
  });
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  const affected = (event: string, baseVariable: string, baseSha: string) => {
    writeFileSync(outputFile, "");
    execFileSync("bash", [CI_PATHS, "affected"], {
      cwd: work,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...environment,
        EVENT_NAME: event,
        PULL_REQUEST_BASE_SHA: "",
        PUSH_BEFORE_SHA: "",
        MERGE_GROUP_BASE_SHA: "",
        [baseVariable]: baseSha,
        GITHUB_OUTPUT: outputFile,
      },
    });
    const outputs = new Map(
      readFileSync(outputFile, "utf8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
    expect(JSON.parse(outputs.get("all-modelers") ?? "null")).toEqual(MODELERS);
    // A job whose condition reads a missing output is skipped, and ci-ok rejects that skip.
    const flag = (name: string) => {
      expect(outputs.get(name), name).toMatch(/^(true|false)$/);
      return outputs.get(name) === "true";
    };
    return {
      shared: flag("shared"),
      repositoryTests: flag("repository-tests"),
      template: flag("template"),
      modelers: JSON.parse(outputs.get("modelers") ?? "null") as string[],
    } satisfies Reach;
  };
  const afterCommitting = (files: Record<string, string | null>) => {
    git("reset", "-q", "--hard", base);
    commit(files);
    return affected("pull_request", "PULL_REQUEST_BASE_SHA", base);
  };
  const afterChanging = (...paths: string[]) =>
    afterCommitting(Object.fromEntries(paths.map((path) => [path, "b"])));

  it.each(REACH_OF_AN_EDIT)("a change to %s", (path, reach) => {
    expect(afterChanging(path)).toEqual(reach);
  });

  it.each<[string, Reach]>([
    [
      "modelers/wardley-maps/packages/renderer/src/Legend.spec.tsx",
      modelerAndRepositoryTests("wardley-maps"),
    ],
    [
      "modelers/event-storming/apps/vscode/scripts/licence.txt",
      modelerAndRepositoryTests("event-storming"),
    ],
    ["modelers/wardley-maps/docs/added.md", NOTHING],
    ["modelers/wardley-maps/ADDED.md", NOTHING],
    ["docs/added.md", NOTHING],
  ])("adding %s", (path, reach) => {
    expect(afterChanging(path)).toEqual(reach);
  });

  it.each<[string, Reach]>([
    [
      "modelers/wardley-maps/packages/schema-model/src/index.ts",
      modelerAndRepositoryTests("wardley-maps"),
    ],
    ["modelers/wardley-maps/docs/guide.md", NOTHING],
  ])("deleting %s", (path, reach) => {
    expect(afterCommitting({ [path]: null })).toEqual(reach);
  });

  it("moving a file of a modeler", () => {
    expect(
      afterCommitting({
        "modelers/wardley-maps/packages/dsl/src/index.ts": null,
        "modelers/wardley-maps/packages/dsl/src/main.ts": "a",
      }),
    ).toEqual(modelerAndRepositoryTests("wardley-maps"));
  });

  it("joins what every changed path reaches", () => {
    expect(
      afterChanging(
        "modelers/wardley-maps/plugins/wardley-maps-modeler/skills/wardley-maps/SKILL.md",
        "modelers/event-storming/packages/dsl/src/index.ts",
        "docs/guide.md",
      ),
    ).toEqual({ shared: false, repositoryTests: true, template: false, modelers: MODELERS });
  });

  it.each([
    ["push", "PUSH_BEFORE_SHA"],
    ["merge_group", "MERGE_GROUP_BASE_SHA"],
  ])("compares a %s with its base too", (event, baseVariable) => {
    afterChanging("modelers/wardley-maps/plugins/wardley-maps-modeler/.claude-plugin/plugin.json");
    expect(affected(event, baseVariable, base)).toEqual(modelerAndRepositoryTests("wardley-maps"));
  });

  it.each([
    ["a push with a zero base (a new branch)", "push", "0".repeat(40)],
    ["a pull request without a base", "pull_request", ""],
    ["a base that cannot be fetched", "pull_request", "1".repeat(40)],
    ["a run started by hand", "workflow_dispatch", base],
  ])("runs everything for %s", (_, event, baseSha) => {
    afterChanging("docs/guide.md");
    const baseVariable = event === "push" ? "PUSH_BEFORE_SHA" : "PULL_REQUEST_BASE_SHA";
    expect(affected(event, baseVariable, baseSha)).toEqual(EVERYTHING);
  });
});

describe("the skips ci-ok accepts on the word of the path decisions", () => {
  const workflow = parseYaml(readFileSync(join(ROOT, CI_WORKFLOW), "utf8")) as {
    jobs: Record<string, { if?: string; outputs?: Record<string, string> }>;
  };
  const SHARED_JOBS_BESIDE_THE_TESTS = ["shared-lint", "shared-test-browser", "shared-e2e"];
  const gatedBy = (output: string) => `needs.changes.outputs.${output} == 'true'`;

  it("starts shared-test on the repository-level tests and the other shared jobs on shared", () => {
    expect(workflow.jobs.changes?.outputs?.["repository-tests"]).toBe(
      "${{ steps.paths.outputs.repository-tests }}",
    );
    expect(workflow.jobs["shared-test"]?.if).toBe(gatedBy("repository-tests"));
    for (const job of SHARED_JOBS_BESIDE_THE_TESTS) {
      expect(workflow.jobs[job]?.if, job).toBe(gatedBy("shared"));
    }
  });

  /** ci-ok on a pull request whose jobs of ci.yml all succeeded, except the skipped ones. */
  const verdictOnSkipping = (skipped: string[], outputs: Record<string, string>) => {
    const needs = Object.fromEntries(
      Object.keys(workflow.jobs)
        .filter((job) => job !== "ci-ok")
        .map((job) => [
          job,
          {
            result: skipped.includes(job) ? "skipped" : "success",
            outputs: job === "changes" ? outputs : {},
          },
        ]),
    );
    try {
      execFileSync("bash", [CI_GATE], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NEEDS: JSON.stringify(needs),
          EVENT_NAME: "pull_request",
          WORKFLOW_FILE: CI_WORKFLOW,
        },
      });
      return "accepts";
    } catch {
      return "rejects";
    }
  };
  const aModelerChange = { shared: "false", template: "false", modelers: '["wardley-maps"]' };
  const theOtherSharedJobs = [...SHARED_JOBS_BESIDE_THE_TESTS, "template"];
  const sharedTestToo = [...theOtherSharedJobs, "shared-test"];

  it.each<["accepts" | "rejects", string, "true" | "false" | "missing", string[]]>([
    ["accepts", "the other shared jobs and the template", "true", theOtherSharedJobs],
    ["rejects", "shared-test", "true", sharedTestToo],
    ["accepts", "shared-test", "false", sharedTestToo],
    ["rejects", "shared-test", "missing", sharedTestToo],
  ])(
    "ci-ok %s a skip of %s for a modeler change, repository-tests %s",
    (verdict, _, repositoryTests, skipped) => {
      const outputs =
        repositoryTests === "missing"
          ? aModelerChange
          : { ...aModelerChange, "repository-tests": repositoryTests };
      expect(verdictOnSkipping(skipped, outputs)).toBe(verdict);
    },
  );
});
