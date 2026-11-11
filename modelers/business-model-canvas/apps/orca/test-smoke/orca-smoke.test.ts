import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ORCA_SMOKE_AGENT_LABEL, runOrcaSmoke } from "@miragon/modeler-shell/testing/orca-electron";
import { expect, it } from "vitest";

const orcaApp = fileURLToPath(new URL("..", import.meta.url));
const results = fileURLToPath(new URL("../../../test-results/orca-smoke", import.meta.url));
const checksMerge = process.env.ORCA_SMOKE_MERGE === "1";

/**
 * An agent adds a sticky to Cost Structure, whose one row has room for it, so neither the canvas
 * nor the fitted view changes.
 */
function addOutside(text: string, count: number): string {
  return text.replace(
    "cost-structure:\n  items:\n",
    `cost-structure:\n  items:\n    - id: agent-${count}\n      text: ${ORCA_SMOKE_AGENT_LABEL} ${count}\n`,
  );
}

/** An agent gives a colour to the sticky the smoke deletes on the canvas at the same time. */
function changeOutside(text: string): string {
  return text.replace(
    "      text: Write the Claude skills\n",
    "      text: Write the Claude skills\n      color: sun\n",
  );
}

it(
  "loads, edits, saves, undoes and merges a canvas in a real Orca",
  { timeout: 300_000 },
  async () => {
    if (process.platform === "darwin" && !process.env.ORCA_APP) {
      throw new Error(
        "test:orca opens Orca's window on a Mac: run npm run business-model-canvas test:orca:docker instead",
      );
    }
    const prebuiltPlugin = process.env.ORCA_SMOKE_PLUGIN;
    if (!prebuiltPlugin) {
      await promisify(execFile)(process.execPath, ["build.mjs"], { cwd: orcaApp });
    }
    const result = await runOrcaSmoke({
      plugin: prebuiltPlugin ?? fileURLToPath(new URL("../plugin", import.meta.url)),
      document: {
        name: "smoke.bmc",
        text: readFileSync(new URL("../../../example/miragon.bmc", import.meta.url), "utf8"),
      },
      // Where a click hits them in the 1200 × 800 editor that fits the canvas at about 80 %:
      // stickies of the top row whose deletes leave every row as high as it was.
      deletions: [
        { at: [191, 220], label: "Orca team" },
        { at: [92, 220], label: "bpmn.io community" },
        { at: [407, 220], label: "Write the Claude skills" },
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
