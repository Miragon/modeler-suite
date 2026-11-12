import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ORCA_SMOKE_AGENT_LABEL, runOrcaSmoke } from "./driver.js";

const FAKE_ORCA_CLI = `#!/usr/bin/env node
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const args = process.argv.slice(2);
const answer = (body) => process.stdout.write(JSON.stringify(body));
if (args[0] === "--version") {
  process.stdout.write("1.4.252");
} else if (args[0] === "status") {
  answer({ ok: true, result: { runtime: { reachable: true, state: "ready" } } });
} else if (args[0] === "plugin" && args[1] === "dev") {
  answer({ ok: true, result: { pluginKey: "local.fake-modeler" } });
} else if (args[0] === "plugin" && args[1] === "shot") {
  const option = (name) => args[args.indexOf(name) + 1];
  const step = option("--out").split("/").pop().replace(".png", "");
  const failedOnce = join(process.env.FAKE_ORCA_STATE, step);
  if (step === process.env.FAKE_ORCA_FAILING_STEP && !existsSync(failedOnce)) {
    writeFileSync(failedOnce, "");
    answer({ ok: false, error: { message: process.env.FAKE_ORCA_ERROR } });
    return;
  }
  const acts = args.includes("--act") ? JSON.parse(option("--act")) : [];
  const deletes = acts.some((act) => act.key === "Delete");
  const undoes = acts.some((act) => act.key === "z");
  if (deletes && !undoes) {
    const file = option("--editor");
    writeFileSync(file, readFileSync(file, "utf8").replace("first\\n", ""));
  }
  appendFileSync(join(process.env.FAKE_ORCA_STATE, "shots"), step + "\\n");
  answer({ ok: true, result: { subscribed: true, settled: true, width: 1200, height: 800 } });
} else {
  answer({ ok: true, result: { editors: [] } });
}
`;

let root: string;
let app: string;
let logLines: string[];

function writeExecutable(path: string, text: string): void {
  writeFileSync(path, text);
  chmodSync(path, 0o755);
}

function smokeFailingOnce(step: string, error: string) {
  process.env.FAKE_ORCA_FAILING_STEP = step;
  process.env.FAKE_ORCA_ERROR = error;
  return runOrcaSmoke({
    plugin: join(root, "plugin"),
    app,
    document: { name: "smoke.txt", text: "first\nsecond\nthird\n" },
    deletions: [
      { at: [10, 10], label: "first" },
      { at: [20, 20], label: "second" },
      { at: [30, 30], label: "third" },
    ],
    addOutside: (text) => `${text}${ORCA_SMOKE_AGENT_LABEL}\n`,
    changeOutside: (text) => text,
    results: join(root, "results"),
    log: (line) => logLines.push(line),
  });
}

describe("the Orca smoke when Orca destroys the window of a shot", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "orca-smoke-driver-"));
    app = join(root, "app");
    mkdirSync(join(app, "resources", "bin"), { recursive: true });
    mkdirSync(join(root, "state"));
    writeExecutable(join(app, "resources", "bin", "orca-ide"), FAKE_ORCA_CLI);
    writeExecutable(join(app, "AppRun"), "#!/bin/sh\nexec sleep 60\n");
    process.env.FAKE_ORCA_STATE = join(root, "state");
    logLines = [];
  });

  afterEach(() => {
    delete process.env.FAKE_ORCA_STATE;
    delete process.env.FAKE_ORCA_FAILING_STEP;
    delete process.env.FAKE_ORCA_ERROR;
    rmSync(root, { recursive: true, force: true });
  });

  it("checks the file and saves the edit once more", async () => {
    const result = await smokeFailingOnce("edit", "Object has been destroyed");

    expect(result.steps).toContain("edit");
    expect(logLines).toContain("edit: Orca destroyed the window of the shot");
    expect(logLines).toContain("edit: the delete did not reach the file, once more");
  });

  it("runs the undo once more", async () => {
    const result = await smokeFailingOnce("undo", "Object has been destroyed");

    expect(result.steps).toContain("undo");
    expect(logLines).toContain("undo: Orca destroyed the window of the shot");
  });

  it("still fails at once on any other error of an edit", async () => {
    await expect(smokeFailingOnce("edit", "the editor crashed")).rejects.toThrow(
      "the editor crashed",
    );
  });
});
