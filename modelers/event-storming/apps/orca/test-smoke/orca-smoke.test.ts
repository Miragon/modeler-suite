import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ORCA_SMOKE_AGENT_LABEL, runOrcaSmoke } from "@miragon/modeler-shell/testing/orca-electron";
import { expect, it } from "vitest";

const orcaApp = fileURLToPath(new URL("..", import.meta.url));
const results = fileURLToPath(new URL("../../../test-results/orca-smoke", import.meta.url));
const checksMerge = process.env.ORCA_SMOKE_MERGE === "1";

/** An agent adds a policy inside the board's bounds, so the fitted view stays as it was. */
function addOutside(text: string, count: number): string {
  const x = count === 1 ? 440 : 160;
  return `${text.trimEnd()}\npolicy ${ORCA_SMOKE_AGENT_LABEL} ${count} [${x}, 380]\n`;
}

/** An agent moves the actor, which the smoke deletes on the canvas at the same time. */
function changeOutside(text: string): string {
  return text.replace("actor Customer [80, 200]", "actor Customer [80, 260]");
}

it(
  "loads, edits, saves, undoes and merges a board in a real Orca",
  { timeout: 300_000 },
  async () => {
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
      // Where a click hits them in the fitted 1200 × 800 editor: interior elements first, so the
      // fit stays, the actor last.
      deletions: [
        { at: [380, 320], label: "Place Order" },
        { at: [760, 320], label: "Order Placed" },
        { at: [220, 320], label: "Customer" },
      ],
      addOutside,
      changeOutside,
      merge: checksMerge,
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
      ...(checksMerge ? ["merge", "conflict"] : []),
      "logs",
      "close",
    ]);
  },
);
