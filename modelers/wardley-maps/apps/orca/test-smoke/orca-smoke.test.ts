import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ORCA_SMOKE_AGENT_LABEL, runOrcaSmoke } from "@miragon/modeler-shell/testing/orca-electron";
import { expect, it } from "vitest";

const orcaApp = fileURLToPath(new URL("..", import.meta.url));
const results = fileURLToPath(new URL("../../../test-results/orca-smoke", import.meta.url));
const checksMerge = process.env.ORCA_SMOKE_MERGE === "1";

/** An agent adds a component inside the plot, which the fitted view always shows whole. */
function addOutside(text: string, count: number): string {
  const evolution = count === 1 ? 0.3 : 0.45;
  return `${text.trimEnd()}\ncomponent ${ORCA_SMOKE_AGENT_LABEL} ${count} [0.3, ${evolution}]\n`;
}

/** An agent moves the component the smoke deletes on the canvas at the same time. */
function changeOutside(text: string): string {
  return text.replace("component Payments [0.6, 0.75]", "component Payments [0.4, 0.75]");
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
      // Where a click hits them in the fitted 1200 × 800 editor; the plot is the content, so a
      // delete keeps the fit.
      deletions: [
        { at: [474, 346], label: "Cart" },
        { at: [654, 346], label: "Checkout" },
        { at: [834, 346], label: "Payments" },
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
