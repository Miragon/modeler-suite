import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/third-party-notices.mjs", import.meta.url));
const notices = () => readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");

// The VSIX bundles Lucide, the Geist fonts and every npm package esbuild pulls in; their licenses
// must ship with it, so a dependency added or bumped without regenerating fails here.
describe("THIRD_PARTY_NOTICES.md", () => {
  it("lists the license of everything the bundles contain", async () => {
    await expect(promisify(execFile)(process.execPath, [script, "--check"])).resolves.toBeDefined();
  }, 60_000);

  it("lists graphlib, which dagre's build carries inside its own", async () => {
    const text = await notices();
    expect(text).toMatch(/^## @dagrejs\/dagre \S+ \(MIT\)$/m);
    expect(text).toMatch(/^## @dagrejs\/graphlib \S+ \(MIT\)$/m);
  });

  it("credits the renderer's Lucide icons and Feather's part in them", async () => {
    const text = await notices();
    const lucide = text.slice(text.indexOf("## Lucide"), text.indexOf("ISC License"));
    expect(lucide).toContain("`@miragon/c4-renderer`");
    expect(text).toContain("`zoom-in`");
    expect(text).toContain("`trash-2`");
  });

  // Estonian sorts z between s and t, so a locale's order would differ from the code points'.
  it("lists them in the same order whatever the language of the machine that builds it", async () => {
    await expect(
      promisify(execFile)(process.execPath, [script, "--check"], {
        env: { ...process.env, LC_ALL: "et_EE.UTF-8" },
      }),
    ).resolves.toBeDefined();
  }, 60_000);
});
