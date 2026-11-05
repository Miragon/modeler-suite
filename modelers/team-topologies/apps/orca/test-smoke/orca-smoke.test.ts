import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ORCA_SMOKE_AGENT_LABEL, runOrcaSmoke } from "@miragon/modeler-shell/testing/orca-electron";
import { expect, it } from "vitest";

const orcaApp = fileURLToPath(new URL("..", import.meta.url));
const results = fileURLToPath(new URL("../../../test-results/orca-smoke", import.meta.url));

/** An agent adds a team inside the diagram's bounds, so the fitted view stays as it was. */
function addOutside(text: string): string {
  const document = JSON.parse(text) as { nodes: unknown[] };
  document.nodes.push({
    id: "team_agent",
    type: "stream-aligned",
    label: ORCA_SMOKE_AGENT_LABEL,
    position: { x: 300, y: 200 },
    size: { width: 200, height: 60 },
  });
  return `${JSON.stringify(document, null, 2)}\n`;
}

it(
  "loads, edits, saves and undoes a team topology in a real Orca",
  { timeout: 300_000 },
  async () => {
    if (process.platform === "darwin" && !process.env.ORCA_APP) {
      throw new Error(
        "test:orca opens Orca's window on a Mac: run npm run team-topologies test:orca:docker instead",
      );
    }
    const prebuiltPlugin = process.env.ORCA_SMOKE_PLUGIN;
    if (!prebuiltPlugin) {
      await promisify(execFile)(process.execPath, ["build.mjs"], { cwd: orcaApp });
    }
    const result = await runOrcaSmoke({
      plugin: prebuiltPlugin ?? fileURLToPath(new URL("../plugin", import.meta.url)),
      document: {
        name: "smoke.tt",
        text: readFileSync(new URL("smoke.tt", import.meta.url), "utf8"),
      },
      // Where a click hits it in the fitted 1200 × 800 editor: a team between the first and the
      // last, so a delete keeps the fit.
      deletion: { at: [361, 297], label: "Cart" },
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
