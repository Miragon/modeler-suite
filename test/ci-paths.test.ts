/**
 * The path decisions of CI (`.github/scripts/ci-paths.sh`), run on a throwaway repository, and the
 * verdict of `ci-ok` (`.github/scripts/ci-gate.sh`). A path that reaches a check must start the job
 * that runs it: a job the script leaves out is skipped, and `ci-ok` passes a skip, so a change that
 * breaks the check merges on green CI.
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
const MODELERS_WITH_ORCA_PLUGIN = ["event-storming"];

interface Reach {
  shared: boolean;
  template: boolean;
  modelers: string[];
  orcaModelers: string[];
}

const NOTHING: Reach = { shared: false, template: false, modelers: [], orcaModelers: [] };
const TEMPLATE_ONLY: Reach = { ...NOTHING, template: true };
const EVERYTHING: Reach = {
  shared: true,
  template: true,
  modelers: MODELERS,
  orcaModelers: MODELERS_WITH_ORCA_PLUGIN,
};
const modeler = (name: string): Reach => ({
  ...NOTHING,
  modelers: [name],
  orcaModelers: MODELERS_WITH_ORCA_PLUGIN.filter((withPlugin) => withPlugin === name),
});

/** Edits only: the base commit holds each of these files. */
const REACH_OF_AN_EDIT: [string, Reach][] = [
  ["docs/guide.md", NOTHING],
  ["docs/.miragon/brand.json", NOTHING],
  ["README.md", NOTHING],
  ["LICENSE", NOTHING],
  [".husky/pre-commit", NOTHING],
  ["test/release-config.test.ts", NOTHING],
  [".claude-plugin/marketplace.json", NOTHING],
  ["extensions/modeler-collection/package.json", NOTHING],
  [".github/CODEOWNERS", NOTHING],
  [".github/dependabot.yml", NOTHING],
  [".github/ISSUE_TEMPLATE/bug.yml", NOTHING],
  [".github/workflows/release-please.yml", NOTHING],
  [".github/workflows/pr-title.yml", NOTHING],
  ["plugins/modeler-kit/README.md", TEMPLATE_ONLY],
  ["modelers/wardley-maps/docs/guide.md", NOTHING],
  ["modelers/wardley-maps/README.md", NOTHING],
  ["modelers/wardley-maps/packages/dsl/src/index.ts", modeler("wardley-maps")],
  ["modelers/wardley-maps/packages/dsl/README.md", modeler("wardley-maps")],
  ["modelers/wardley-maps/vitest.config.ts", modeler("wardley-maps")],
  ["modelers/wardley-maps/package.json", modeler("wardley-maps")],
  ["modelers/wardley-maps/eslint.config.js", modeler("wardley-maps")],
  [
    "modelers/wardley-maps/plugins/wardley-maps-modeler/.claude-plugin/plugin.json",
    modeler("wardley-maps"),
  ],
  ["modelers/event-storming/apps/ide-editor/src/editor.ts", modeler("event-storming")],
  ["modelers/event-storming/apps/orca/src/main.ts", modeler("event-storming")],
  ["modelers/event-storming/.claude/rules/rule.md", modeler("event-storming")],
  [
    "modelers/event-storming/packages/renderer/src/theme/cd-canvas.css",
    { ...modeler("event-storming"), template: true },
  ],
  ["modelers/wardley-maps/packages/renderer/src/theme/cd-canvas.css", modeler("wardley-maps")],
  ["packages/api/src/index.ts", EVERYTHING],
  ["packages/shell/README.md", EVERYTHING],
  [".github/workflows/ci.yml", EVERYTHING],
  [".github/workflows/vscode-smoke.yml", EVERYTHING],
  [".github/workflows/orca-smoke.yml", EVERYTHING],
  [".github/scripts/ci-gate.sh", EVERYTHING],
  [".github/actions/setup/action.yml", EVERYTHING],
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
    ...Object.fromEntries(MODELERS.map((name) => [`modelers/${name}/package.json`, "{}"])),
    ...Object.fromEntries(
      MODELERS_WITH_ORCA_PLUGIN.map((name) => [
        `modelers/${name}/apps/orca/orca-plugin.json`,
        "{}",
      ]),
    ),
  });
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  const run = (command: string, event: string, baseVariable: string, baseSha: string) => {
    writeFileSync(outputFile, "");
    execFileSync("bash", [CI_PATHS, command], {
      cwd: work,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...environment,
        EVENT_NAME: event,
        PULL_REQUEST_BASE_SHA: "",
        PUSH_BEFORE_SHA: "",
        [baseVariable]: baseSha,
        GITHUB_OUTPUT: outputFile,
      },
    });
    return new Map(
      readFileSync(outputFile, "utf8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
  };
  const affected = (event: string, baseVariable: string, baseSha: string): Reach => {
    const outputs = run("affected", event, baseVariable, baseSha);
    // A job whose condition reads a missing output is skipped, and ci-ok passes that skip.
    const flag = (name: string) => {
      expect(outputs.get(name), name).toMatch(/^(true|false)$/);
      return outputs.get(name) === "true";
    };
    const list = (name: string) => JSON.parse(outputs.get(name) ?? "null") as string[];
    return {
      shared: flag("shared"),
      template: flag("template"),
      modelers: list("modelers"),
      orcaModelers: list("orca-modelers"),
    };
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

  it("moving a file of a modeler", () => {
    expect(
      afterCommitting({
        "modelers/wardley-maps/packages/dsl/src/index.ts": null,
        "modelers/wardley-maps/packages/dsl/src/main.ts": "a",
      }),
    ).toEqual(modeler("wardley-maps"));
  });

  it("joins what every changed path reaches", () => {
    expect(
      afterChanging(
        "modelers/wardley-maps/packages/dsl/src/index.ts",
        "modelers/event-storming/apps/orca/src/main.ts",
        "docs/guide.md",
      ),
    ).toEqual({
      ...NOTHING,
      modelers: MODELERS,
      orcaModelers: MODELERS_WITH_ORCA_PLUGIN,
    });
  });

  it("compares a push with its base too", () => {
    afterChanging("modelers/wardley-maps/packages/dsl/src/index.ts");
    expect(affected("push", "PUSH_BEFORE_SHA", base)).toEqual(modeler("wardley-maps"));
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

  it("lists every modeler, and those with an Orca plugin, for the weekly smokes", () => {
    const outputs = run("modelers", "schedule", "PUSH_BEFORE_SHA", "");
    expect(JSON.parse(outputs.get("all-modelers") ?? "null")).toEqual(MODELERS);
    expect(JSON.parse(outputs.get("orca-modelers") ?? "null")).toEqual(MODELERS_WITH_ORCA_PLUGIN);
  });
});

describe("the verdict of ci-ok", () => {
  const workflow = parseYaml(readFileSync(join(ROOT, CI_WORKFLOW), "utf8")) as {
    jobs: Record<string, { if?: string; needs?: string | string[] }>;
  };
  const otherJobs = Object.keys(workflow.jobs).filter((job) => job !== "ci-ok");

  it("lets a job need changes alone, so a skip after a failure comes with that failure", () => {
    for (const job of otherJobs.filter((name) => workflow.jobs[name]?.needs !== undefined)) {
      expect(workflow.jobs[job]?.needs, job).toBe("changes");
    }
  });

  const verdict = (results: Record<string, string>, leftOut: string[] = []) => {
    const needs = Object.fromEntries(
      otherJobs
        .filter((job) => !leftOut.includes(job))
        .map((job) => [job, { result: results[job] ?? "success", outputs: {} }]),
    );
    try {
      execFileSync("bash", [CI_GATE], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NEEDS: JSON.stringify(needs), WORKFLOW_FILE: CI_WORKFLOW },
      });
      return "accepts";
    } catch {
      return "rejects";
    }
  };

  it("accepts every job succeeding", () => {
    expect(verdict({})).toBe("accepts");
  });
  it("accepts a skip", () => {
    expect(verdict({ "shared-e2e": "skipped", "orca-smoke": "skipped" })).toBe("accepts");
  });
  it.each(["failure", "cancelled"])("rejects a job that ended in %s", (result) => {
    expect(verdict({ "modeler-e2e": result })).toBe("rejects");
  });
  it("rejects a job of the workflow that ci-ok does not need", () => {
    expect(verdict({}, ["template"])).toBe("rejects");
  });
});
