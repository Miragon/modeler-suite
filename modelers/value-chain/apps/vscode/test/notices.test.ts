import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
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

  it("credits the renderer with no dialog icons, since it draws no dialog (#257, #471)", async () => {
    const notices = await readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
    const lucide = notices.slice(notices.indexOf("## Lucide"), notices.indexOf("ISC License"));
    expect(lucide).toContain("`@miragon/value-chain-renderer`");
    expect(lucide).not.toMatch(/dialog/i);
  });

  // Estonian sorts z between s and t, so a locale's order would put zod before tiny-svg.
  it("lists them in the same order whatever the language of the machine that builds it", async () => {
    await expect(
      promisify(execFile)(process.execPath, [script, "--check"], {
        env: { ...process.env, LC_ALL: "et_EE.UTF-8" },
      }),
    ).resolves.toBeDefined();
  }, 30_000);
});
