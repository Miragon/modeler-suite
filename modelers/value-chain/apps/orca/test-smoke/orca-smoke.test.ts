import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runOrcaSmoke } from "@miragon/modeler-shell/testing/orca-electron";
import { it } from "vitest";

const orcaApp = fileURLToPath(new URL("..", import.meta.url));
const results = fileURLToPath(new URL("../../../test-results/orca-smoke", import.meta.url));

it("loads and shows a value chain in a real Orca", { timeout: 300_000 }, async () => {
  if (process.platform === "darwin" && !process.env.ORCA_APP) {
    throw new Error(
      "test:orca opens Orca's window on a Mac: run npm run value-chain test:orca:docker instead",
    );
  }
  const prebuiltPlugin = process.env.ORCA_SMOKE_PLUGIN;
  if (!prebuiltPlugin) {
    await promisify(execFile)(process.execPath, ["build.mjs"], { cwd: orcaApp });
  }
  await runOrcaSmoke({
    plugin: prebuiltPlugin ?? fileURLToPath(new URL("../plugin", import.meta.url)),
    document: {
      name: "smoke.vc.json",
      text: readFileSync(new URL("smoke.vc.json", import.meta.url), "utf8"),
    },
    results,
  });
});
