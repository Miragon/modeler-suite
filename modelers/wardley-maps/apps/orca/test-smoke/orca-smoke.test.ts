import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ORCA_SMOKE_AGENT_LABEL, runOrcaSmoke } from "@miragon/modeler-shell/testing/orca-electron";
import { expect, it } from "vitest";

const orcaApp = fileURLToPath(new URL("..", import.meta.url));
const results = fileURLToPath(new URL("../../../test-results/orca-smoke", import.meta.url));

/** An agent adds a component inside the plot, which the fitted view always shows whole. */
function addOutside(text: string): string {
  return `${text.trimEnd()}\ncomponent ${ORCA_SMOKE_AGENT_LABEL} [0.3, 0.3]\n`;
}

it(
  "loads, edits, saves and undoes a Wardley map in a real Orca",
  { timeout: 300_000 },
  async () => {
    if (process.platform === "darwin" && !process.env.ORCA_APP) {
      throw new Error(
        "test:orca opens Orca's window on a Mac: run npm run wardley-maps test:orca:docker instead",
      );
    }
    const prebuiltPlugin = process.env.ORCA_SMOKE_PLUGIN;
    if (!prebuiltPlugin) {
      await promisify(execFile)(process.execPath, ["build.mjs"], { cwd: orcaApp });
    }
    const result = await runOrcaSmoke({
      plugin: prebuiltPlugin ?? fileURLToPath(new URL("../plugin", import.meta.url)),
      document: {
        name: "smoke.owm",
        text: readFileSync(new URL("smoke.owm", import.meta.url), "utf8"),
      },
      // Where a click hits it in the fitted 1200 × 800 editor; the plot is the content, so a
      // delete keeps the fit.
      deletion: { at: [474, 346], label: "Cart" },
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
  },
);
