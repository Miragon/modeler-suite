/**
 * The shape of the release workflow: every target is built and checked without an environment,
 * then published from a job that needs every build, so all environments ask for approval at once
 * and one "Review deployments" approves them. npm's trusted publishing is bound to this file name
 * and to the environment `npm` of the job that runs `npm publish`.
 */
import { existsSync, readFileSync } from "node:fs";
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
