/**
 * Dependabot's auto-merge, in the suite and in the modeler-kit template. GitHub merges in the name
 * of whoever enabled auto-merge, and a merge made with GITHUB_TOKEN starts no workflow on main (no
 * ci-ok, CodeQL or release-please), so auto-merge is enabled with the release-please app's token. A
 * run Dependabot starts on `pull_request` sees only Dependabot secrets, so the work is split: the
 * eligibility workflow decides on `pull_request` with GITHUB_TOKEN and labels the update, and the
 * merge workflow runs on its `workflow_run`, with the Actions secrets, and must never run code of
 * the pull request. Only npm updates are auto-merged: a GitHub Actions update changes
 * .github/workflows, which GitHub merges only for a token with the `workflows` permission, and an
 * ecosystem added later starts manual.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "plugins/modeler-kit/skills/new-modeler/assets/template");
const ELIGIBILITY = ".github/workflows/dependabot-automerge-eligibility.yml";
const AUTO_MERGE = ".github/workflows/dependabot-automerge.yml";
const RELEASE = ".github/workflows/release-please.yml";
const LABEL = "auto-merge";
const APP_TOKEN_ACTION = "actions/create-github-app-token";
const DEPENDABOT_ONLY =
  "github.event.pull_request.user.login == 'dependabot[bot]' && github.actor == 'dependabot[bot]'";
const AFTER_DEPENDABOT_ELIGIBILITY =
  "github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.actor.login == 'dependabot[bot]' && github.event.workflow_run.pull_requests[0]";
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
  name: string;
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
const labelStep = (workflow: Workflow): Step | undefined =>
  stepsOf(workflow).find((step) => /\bgh pr edit\b/.test(step.run ?? ""));
const mergeStep = (workflow: Workflow): Step | undefined =>
  stepsOf(workflow).find((step) => /\bgh pr merge --auto\b/.test(step.run ?? ""));
const expectNoCodeOfThePullRequest = (workflow: Workflow, actions: string[]) => {
  expect(stepsOf(workflow).map(actionOf).filter(Boolean).sort()).toEqual(actions);
  for (const step of stepsOf(workflow)) {
    const script = step.run ?? "";
    expect(script, `${step.name}: event data reaches the shell through env only`).not.toContain(
      "${{",
    );
    expect(script, step.name).not.toMatch(/\b(git|npm|npx|node)\s|gh pr checkout/);
  }
};

describe.each([
  ["the suite", ROOT, [NPM_ONLY, PATCH_OR_MINOR]],
  ["the modeler-kit template", TEMPLATE, [NPM_ONLY, NOT_MODELER_PLATFORM, PATCH_OR_MINOR]],
])("Dependabot auto-merge in %s", (_, root, mergedUpdates) => {
  const eligibility = readWorkflow(root, ELIGIBILITY);
  const workflow = readWorkflow(root, AUTO_MERGE);

  describe("the eligibility workflow", () => {
    it("runs on pull_request only, with GITHUB_TOKEN, which may write labels and nothing else", () => {
      expect(eventsOf(eligibility)).toEqual(["pull_request"]);
      expect(eligibility.permissions).toEqual({ "pull-requests": "write" });
      expect(jobsOf(eligibility).map((job) => job.permissions)).toEqual(
        jobsOf(eligibility).map(() => undefined),
      );
    });

    it("runs only for a pull request Dependabot opened, on an event Dependabot started", () => {
      for (const job of jobsOf(eligibility)) expect(job.if).toBe(DEPENDABOT_ONLY);
    });

    it("never checks out, fetches or runs code of the pull request", () => {
      expectNoCodeOfThePullRequest(eligibility, ["dependabot/fetch-metadata"]);
    });

    it(`labels only npm patch and minor updates ${LABEL}, never GitHub Actions or another ecosystem`, () => {
      const label = labelStep(eligibility);
      expect(label?.if).toBe(mergedUpdates.join(" && "));
      expect(label?.run).toContain(`--add-label ${LABEL}`);
      expect(label?.env?.GH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
    });
  });

  describe("the merge workflow", () => {
    it("runs on the eligibility workflow's workflow_run only, so it gets the Actions secrets", () => {
      expect(eventsOf(workflow)).toEqual(["workflow_run"]);
      expect(workflow.on).toEqual({
        workflow_run: { workflows: [eligibility.name], types: ["completed"] },
      });
    });

    it("gives GITHUB_TOKEN no permission at all", () => {
      expect(workflow.permissions).toEqual({});
      expect(jobsOf(workflow).map((job) => job.permissions)).toEqual(
        jobsOf(workflow).map(() => undefined),
      );
    });

    it("runs only after an eligibility run Dependabot started for a pull request succeeded", () => {
      for (const job of jobsOf(workflow)) expect(job.if).toBe(AFTER_DEPENDABOT_ELIGIBILITY);
    });

    it("never checks out, fetches or runs code of the pull request", () => {
      expectNoCodeOfThePullRequest(workflow, [APP_TOKEN_ACTION]);
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

    it(`enables auto-merge with that token only, and only for a pull request labelled ${LABEL}`, () => {
      const token = appTokenStep(workflow);
      const merge = mergeStep(workflow);
      expect(merge?.env?.GH_TOKEN).toBe(`\${{ steps.${token?.id}.outputs.token }}`);
      expect(merge?.run).toContain(`grep -qx ${LABEL} || exit 0`);
    });
  });
});

describe("the template's Dependabot auto-merge", () => {
  it("works as the suite's: same triggers, permissions, guards, app token and merge token", () => {
    // Each copy pins the token action as its own release-please.yml does (checked above).
    const unpinned = (step: Step | undefined) => ({ ...step, uses: step && actionOf(step) });
    for (const path of [ELIGIBILITY, AUTO_MERGE]) {
      const suite = readWorkflow(ROOT, path);
      const template = readWorkflow(TEMPLATE, path);
      expect(template.name, path).toBe(suite.name);
      expect(template.on, path).toEqual(suite.on);
      expect(template.permissions, path).toEqual(suite.permissions);
      expect(
        jobsOf(template).map((job) => job.if),
        path,
      ).toEqual(jobsOf(suite).map((job) => job.if));
    }
    const suite = readWorkflow(ROOT, AUTO_MERGE);
    const template = readWorkflow(TEMPLATE, AUTO_MERGE);
    expect(unpinned(appTokenStep(template))).toEqual(unpinned(appTokenStep(suite)));
    expect(mergeStep(template)?.env).toEqual(mergeStep(suite)?.env);
  });
});
