/**
 * Dependabot's auto-merge, in the suite and in the modeler-kit template. GitHub merges in the name
 * of whoever enabled auto-merge, and a merge made with GITHUB_TOKEN starts no workflow on main (no
 * ci-ok, CodeQL or release-please), so auto-merge is enabled with the release-please app's token. A
 * run Dependabot starts on `pull_request` sees only Dependabot secrets, so the workflow runs on
 * `pull_request_target`, with the Actions secrets: it must never run code of the pull request. Only
 * npm updates are auto-merged: a GitHub Actions update changes .github/workflows, which GitHub
 * merges only for a token with the `workflows` permission, and an ecosystem added later starts
 * manual.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "plugins/modeler-kit/skills/new-modeler/assets/template");
const AUTO_MERGE = ".github/workflows/dependabot-automerge.yml";
const RELEASE = ".github/workflows/release-please.yml";
const APP_TOKEN_ACTION = "actions/create-github-app-token";
const DEPENDABOT_ONLY =
  "github.event.pull_request.user.login == 'dependabot[bot]' && github.actor == 'dependabot[bot]'";
const NPM_ONLY = "steps.meta.outputs.package-ecosystem == 'npm_and_yarn'";
const NOT_MODELER_PLATFORM = "!contains(steps.meta.outputs.dependency-names, '@miragon/modeler-')";
const PATCH_OR_MINOR =
  "(steps.meta.outputs.update-type == 'version-update:semver-patch' || steps.meta.outputs.update-type == 'version-update:semver-minor')";

interface Step {
  id?: string;
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
}
interface Job {
  if?: string;
  permissions?: Record<string, string> | string;
  steps?: Step[];
}
interface Workflow {
  on: string | string[] | Record<string, unknown>;
  permissions?: Record<string, string> | string;
  jobs: Record<string, Job>;
}

const readWorkflow = (root: string, path: string): Workflow =>
  parseYaml(readFileSync(join(root, path), "utf8")) as Workflow;
const eventsOf = ({ on }: Workflow): string[] =>
  typeof on === "string" ? [on] : Array.isArray(on) ? on : Object.keys(on);
const jobsOf = (workflow: Workflow): Job[] => Object.values(workflow.jobs);
const stepsOf = (workflow: Workflow): Step[] => jobsOf(workflow).flatMap((job) => job.steps ?? []);
const actionOf = (step: Step): string | undefined => step.uses?.split("@")[0];
const appTokenStep = (workflow: Workflow): Step | undefined =>
  stepsOf(workflow).find((step) => actionOf(step) === APP_TOKEN_ACTION);
const mergeStep = (workflow: Workflow): Step | undefined =>
  stepsOf(workflow).find((step) => /\bgh pr merge --auto\b/.test(step.run ?? ""));

describe.each([
  ["the suite", ROOT, [NPM_ONLY, PATCH_OR_MINOR]],
  ["the modeler-kit template", TEMPLATE, [NPM_ONLY, NOT_MODELER_PLATFORM, PATCH_OR_MINOR]],
])("Dependabot auto-merge in %s", (_, root, mergedUpdates) => {
  const workflow = readWorkflow(root, AUTO_MERGE);

  it("runs on pull_request_target only, so a run Dependabot starts gets the Actions secrets", () => {
    expect(eventsOf(workflow)).toEqual(["pull_request_target"]);
  });

  it("lets GITHUB_TOKEN read the pull request and nothing else", () => {
    expect(workflow.permissions).toEqual({ "pull-requests": "read" });
    expect(jobsOf(workflow).map((job) => job.permissions)).toEqual(
      jobsOf(workflow).map(() => undefined),
    );
  });

  it("runs only for a pull request Dependabot opened, on an event Dependabot started", () => {
    for (const job of jobsOf(workflow)) expect(job.if).toBe(DEPENDABOT_ONLY);
  });

  it("never checks out, fetches or runs code of the pull request", () => {
    expect(stepsOf(workflow).map(actionOf).filter(Boolean).sort()).toEqual([
      APP_TOKEN_ACTION,
      "dependabot/fetch-metadata",
    ]);
    for (const step of stepsOf(workflow)) {
      const script = step.run ?? "";
      expect(script, `${step.name}: event data reaches the shell through env only`).not.toContain(
        "${{",
      );
      expect(script, step.name).not.toMatch(/\b(git|npm|npx|node)\s|gh pr checkout/);
    }
  });

  it("mints the release-please app's token as release-please does, for this repository's contents and pull requests only", () => {
    const release = appTokenStep(readWorkflow(root, RELEASE));
    const token = appTokenStep(workflow);
    expect(release?.uses).toMatch(/@[0-9a-f]{40}$/);
    expect(token?.uses).toBe(release?.uses);
    expect(token?.with).toEqual({
      "client-id": release?.with?.["client-id"],
      "private-key": release?.with?.["private-key"],
      "permission-contents": "write",
      "permission-pull-requests": "write",
    });
  });

  it("mints it only for npm patch and minor updates, never for GitHub Actions or another ecosystem", () => {
    expect(appTokenStep(workflow)?.if).toBe(mergedUpdates.join(" && "));
  });

  it("enables auto-merge with that token only, never with GITHUB_TOKEN", () => {
    const token = appTokenStep(workflow);
    const merge = mergeStep(workflow);
    expect(merge?.if).toBe(`steps.${token?.id}.outcome == 'success'`);
    expect(merge?.env?.GH_TOKEN).toBe(`\${{ steps.${token?.id}.outputs.token }}`);
  });
});

describe("the template's Dependabot auto-merge", () => {
  it("works as the suite's: same trigger, permissions, guard, app token and merge token", () => {
    const suite = readWorkflow(ROOT, AUTO_MERGE);
    const template = readWorkflow(TEMPLATE, AUTO_MERGE);
    // Each copy pins the token action as its own release-please.yml does (checked above).
    const unpinned = (step: Step | undefined) => ({
      ...step,
      if: undefined,
      uses: step && actionOf(step),
    });
    expect(template.on).toEqual(suite.on);
    expect(template.permissions).toEqual(suite.permissions);
    expect(jobsOf(template).map((job) => job.if)).toEqual(jobsOf(suite).map((job) => job.if));
    expect(unpinned(appTokenStep(template))).toEqual(unpinned(appTokenStep(suite)));
    expect(mergeStep(template)?.if).toBe(mergeStep(suite)?.if);
    expect(mergeStep(template)?.env).toEqual(mergeStep(suite)?.env);
  });
});
