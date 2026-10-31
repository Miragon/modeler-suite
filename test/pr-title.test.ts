/**
 * The PR title check. Squash merges take the title as the one Conventional Commit on main, so the
 * title is checked, a single commit too, and a person's single commit must say what the title says.
 * Dependabot's grouped security updates commit a shorter headline than their title, which no
 * Dependabot setting changes: its pull requests are held to Conventional Commits only, or every
 * security update fails the required check.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TITLE_ACTION = "amannn/action-semantic-pull-request";
const AUTHOR_IS_NOT = /^\$\{\{ github\.event\.pull_request\.user\.login != '(?<login>[^']+)' \}\}$/;

interface Step {
  uses?: string;
  with?: Record<string, unknown>;
}
interface Workflow {
  jobs: Record<string, { steps?: Step[] }>;
}

const workflow = parseYaml(
  readFileSync(join(ROOT, ".github/workflows/pr-title.yml"), "utf8"),
) as Workflow;
const titleCheck = Object.values(workflow.jobs)
  .flatMap((job) => job.steps ?? [])
  .find((step) => step.uses?.split("@")[0] === TITLE_ACTION);
const inputs = titleCheck?.with ?? {};

/** What the input says for a pull request of this author, the way GitHub would evaluate it. */
const evaluateFor = (input: unknown, author: string): boolean => {
  if (typeof input === "boolean") return input;
  const login = typeof input === "string" ? AUTHOR_IS_NOT.exec(input)?.groups?.login : undefined;
  if (login === undefined) throw new Error(`unexpected input ${JSON.stringify(input)}`);
  return author.toLowerCase() !== login.toLowerCase();
};

describe("the PR title check", () => {
  it("checks the title as a Conventional Commit of the suite's types", () => {
    expect(String(inputs.types).trim().split(/\s+/)).toEqual([
      "feat",
      "fix",
      "chore",
      "docs",
      "refactor",
      "ci",
      "build",
      "test",
      "revert",
    ]);
  });

  it("checks a single commit as a Conventional Commit, Dependabot's too", () => {
    expect(inputs.validateSingleCommit).toBe(true);
  });

  it.each(["octocat", "github-actions[bot]", "renovate[bot]"])(
    "holds the single commit of %s to the title",
    (author) => {
      expect(evaluateFor(inputs.validateSingleCommitMatchesPrTitle, author)).toBe(true);
    },
  );

  it("lets the single commit of Dependabot's pull request differ from its title", () => {
    expect(evaluateFor(inputs.validateSingleCommitMatchesPrTitle, "dependabot[bot]")).toBe(false);
  });
});
