import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/third-party-notices.mjs", import.meta.url));

// The VSIX bundles Lucide, the Geist fonts and every npm package esbuild pulls in; their
// licenses must ship with it, so a dependency added or bumped without regenerating fails here.
describe("THIRD_PARTY_NOTICES.md", () => {
  it("lists the license of everything the bundles contain", async () => {
    await expect(promisify(execFile)(process.execPath, [script, "--check"])).resolves.toBeDefined();
  }, 30_000);

  // Estonian sorts z between s and t, so a locale's order would put zod before tiny-svg.
  it("lists them in the same order whatever the language of the machine that builds it", async () => {
    await expect(
      promisify(execFile)(process.execPath, [script, "--check"], {
        env: { ...process.env, LC_ALL: "et_EE.UTF-8" },
      }),
    ).resolves.toBeDefined();
  }, 30_000);
});
