import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ORCA_SMOKE_AGENT_LABEL, runOrcaSmoke } from "@miragon/modeler-shell/testing/orca-electron";
import { expect, it } from "vitest";

const orcaApp = fileURLToPath(new URL("..", import.meta.url));
const results = fileURLToPath(new URL("../../../test-results/orca-smoke", import.meta.url));

/** An agent adds a step inside the diagram's bounds, so the fitted view stays as it was. */
function addOutside(text: string): string {
  const document = JSON.parse(text) as { elements: unknown[] };
  document.elements.push({
    id: "step_agent",
    elementType: "step",
    name: ORCA_SMOKE_AGENT_LABEL,
    bounds: { x: 100, y: 220, width: 160, height: 60 },
  });
  return `${JSON.stringify(document, null, 2)}\n`;
}

it(
  "loads, edits, saves and undoes a value chain in a real Orca",
  { timeout: 300_000 },
  async () => {
    if (process.platform === "darwin" && !process.env.ORCA_APP) {
      throw new Error(
        "test:orca opens Orca's window on a Mac: run npm run value-chain test:orca:docker instead",
      );
    }
    const prebuiltPlugin = process.env.ORCA_SMOKE_PLUGIN;
    if (!prebuiltPlugin) {
      await promisify(execFile)(process.execPath, ["build.mjs"], { cwd: orcaApp });
    }
    const result = await runOrcaSmoke({
      plugin: prebuiltPlugin ?? fileURLToPath(new URL("../plugin", import.meta.url)),
      document: {
        name: "smoke.vc.json",
        text: readFileSync(new URL("smoke.vc.json", import.meta.url), "utf8"),
      },
      // Where a click hits it in the fitted 1200 × 800 editor: a step between the first and the
      // last, so a delete keeps the fit.
      deletion: { at: [400, 312], label: "Pick" },
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
