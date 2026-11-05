import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ORCA_SMOKE_AGENT_LABEL, runOrcaSmoke } from "@miragon/modeler-shell/testing/orca-electron";
import { expect, it } from "vitest";

const orcaApp = fileURLToPath(new URL("..", import.meta.url));
const results = fileURLToPath(new URL("../../../test-results/orca-smoke", import.meta.url));

/** An agent adds a policy inside the board's bounds, so the fitted view stays as it was. */
function addOutside(text: string): string {
  return `${text.trimEnd()}\npolicy ${ORCA_SMOKE_AGENT_LABEL} [440, 380]\n`;
}

it("loads, edits, saves and undoes a board in a real Orca", { timeout: 300_000 }, async () => {
  if (process.platform === "darwin" && !process.env.ORCA_APP) {
    throw new Error(
      "test:orca opens Orca's window on a Mac: run npm run event-storming test:orca:docker instead",
    );
  }
  const prebuiltPlugin = process.env.ORCA_SMOKE_PLUGIN;
  if (!prebuiltPlugin) {
    await promisify(execFile)(process.execPath, ["build.mjs"], { cwd: orcaApp });
  }
  const result = await runOrcaSmoke({
    plugin: prebuiltPlugin ?? fileURLToPath(new URL("../plugin", import.meta.url)),
    document: {
      name: "smoke.storm",
      text: readFileSync(new URL("smoke.storm", import.meta.url), "utf8"),
    },
    // Where a click hits it in the fitted 1200 × 800 editor: an interior sticky, so the fit stays.
    deletion: { at: [380, 320], label: "Place Order" },
    addOutside,
    results,
  });
  expect(result.steps).toEqual([
    "resolve",
    "launch",
    "validate",
    "load",
    "open",
    "themes",
    "undo",
    "edit",
    "external",
    "logs",
    "close",
  ]);
});
