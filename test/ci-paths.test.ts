/**
 * The path decisions of CI (`.github/scripts/ci-paths.sh affected`), run on a throwaway repository.
 * A path that reaches a check must start the job that runs it: a job the script leaves out is
 * skipped, and `ci-ok` accepts that skip, so a change that breaks the check merges on green CI.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CI_PATHS = join(ROOT, ".github/scripts/ci-paths.sh");
const MODELERS = ["event-storming", "wardley-maps"];

interface Reach {
  shared: boolean;
  template: boolean;
  modelers: string[];
}

const NOTHING: Reach = { shared: false, template: false, modelers: [] };
const SHARED: Reach = { shared: true, template: false, modelers: [] };
const EVERYTHING: Reach = { shared: true, template: true, modelers: MODELERS };
const modelerOnly = (modeler: string): Reach => ({ ...NOTHING, modelers: [modeler] });
const modelerAndShared = (modeler: string): Reach => ({ ...modelerOnly(modeler), shared: true });

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
  const commit = (files: Record<string, string>) => {
    for (const [path, text] of Object.entries(files)) {
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
    ...Object.fromEntries(MODELERS.map((modeler) => [`modelers/${modeler}/package.json`, "{}"])),
    "README.md": "a",
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
    return {
      shared: outputs.get("shared") === "true",
      template: outputs.get("template") === "true",
      modelers: JSON.parse(outputs.get("modelers") ?? "null") as string[],
    } satisfies Reach;
  };
  const afterChanging = (...paths: string[]) => {
    git("reset", "-q", "--hard", base);
    commit(Object.fromEntries(paths.map((path) => [path, "b"])));
    return affected("pull_request", "PULL_REQUEST_BASE_SHA", base);
  };

  it.each<[string, Reach]>([
    ["docs/guide.md", NOTHING],
    ["README.md", NOTHING],
    ["LICENSE", NOTHING],
    [".husky/pre-commit", NOTHING],
    ["modelers/wardley-maps/docs/guide.md", NOTHING],
    ["modelers/wardley-maps/README.md", NOTHING],
    ["modelers/wardley-maps/packages/dsl/src/index.ts", modelerOnly("wardley-maps")],
    ["modelers/wardley-maps/packages/dsl/README.md", modelerOnly("wardley-maps")],
    ["modelers/wardley-maps/vitest.config.ts", modelerOnly("wardley-maps")],
    ["modelers/wardley-maps/packages/renderer/src/plugins/index.ts", modelerOnly("wardley-maps")],
    ["modelers/event-storming/.claude/rules/rule.md", modelerOnly("event-storming")],
    [
      "modelers/wardley-maps/plugins/wardley-maps-modeler/.claude-plugin/plugin.json",
      modelerAndShared("wardley-maps"),
    ],
    [
      "modelers/event-storming/plugins/event-storming-modeler/skills/storm-dsl/SKILL.md",
      modelerAndShared("event-storming"),
    ],
    ["modelers/wardley-maps/package.json", modelerAndShared("wardley-maps")],
    ["modelers/wardley-maps/packages/dsl/package.json", modelerAndShared("wardley-maps")],
    ["modelers/event-storming/apps/vscode/package.json", modelerAndShared("event-storming")],
    ["modelers/event-storming/apps/webapp/package.json", modelerAndShared("event-storming")],
    ["modelers/wardley-maps/e2e/package.json", modelerAndShared("wardley-maps")],
    [
      "modelers/wardley-maps/packages/renderer/test/fixtures/package.json",
      modelerOnly("wardley-maps"),
    ],
    ["modelers/wardley-maps/eslint.config.js", modelerAndShared("wardley-maps")],
    ["modelers/event-storming/eslint.config.mjs", modelerAndShared("event-storming")],
    ["modelers/wardley-maps/packages/dsl/eslint.config.js", modelerAndShared("wardley-maps")],
    ["modelers/wardley-maps/.dependency-cruiser.cjs", modelerAndShared("wardley-maps")],
    ["modelers/wardley-maps/packages/dsl/.dependency-cruiser.cjs", modelerOnly("wardley-maps")],
    ["modelers/event-storming/.miragon/brand.json", modelerAndShared("event-storming")],
    [
      "modelers/wardley-maps/packages/renderer/.miragon/brand.json",
      modelerAndShared("wardley-maps"),
    ],
    [
      "modelers/event-storming/packages/renderer/src/theme/cd-canvas.css",
      { ...modelerOnly("event-storming"), template: true },
    ],
    [
      "modelers/wardley-maps/packages/renderer/src/theme/cd-canvas.css",
      modelerOnly("wardley-maps"),
    ],
    ["plugins/modeler-kit/README.md", { ...SHARED, template: true }],
    ["test/release-config.test.ts", SHARED],
    [".claude-plugin/marketplace.json", SHARED],
    ["extensions/modeler-collection/package.json", SHARED],
    ["packages/api/src/index.ts", EVERYTHING],
    [".github/workflows/ci.yml", EVERYTHING],
    ["package-lock.json", EVERYTHING],
    ["modelers/capability-map/src/index.ts", EVERYTHING],
  ])("a change to %s", (path, reach) => {
    expect(afterChanging(path)).toEqual(reach);
  });

  it("joins what every changed path reaches", () => {
    expect(
      afterChanging(
        "modelers/wardley-maps/plugins/wardley-maps-modeler/skills/wardley-maps/SKILL.md",
        "modelers/event-storming/packages/dsl/src/index.ts",
        "docs/guide.md",
      ),
    ).toEqual({ shared: true, template: false, modelers: MODELERS });
  });

  it.each([
    ["push", "PUSH_BEFORE_SHA"],
    ["merge_group", "MERGE_GROUP_BASE_SHA"],
  ])("compares a %s with its base too", (event, baseVariable) => {
    afterChanging("modelers/wardley-maps/plugins/wardley-maps-modeler/.claude-plugin/plugin.json");
    expect(affected(event, baseVariable, base)).toEqual(modelerAndShared("wardley-maps"));
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
