// @vitest-environment node
import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/third-party-notices.mjs", import.meta.url));
const notices = fileURLToPath(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url));
const rendererSources = fileURLToPath(new URL("../../../packages/renderer/src/", import.meta.url));

/** The icon sets the renderer copies into its sources, by the name its source comments give them. */
const COPIED_ICON_SETS = [
  { mention: "lucide-static", heading: "## Lucide (lucide-static" },
  { mention: "Material Icons", heading: "## Material Icons" },
];

function rendererSourceText(): string {
  return readdirSync(rendererSources, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts"))
    .map((path) => readFileSync(join(rendererSources, path), "utf8"))
    .join("\n");
}

function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const next = text.indexOf("\n## ", start + heading.length);
  return text.slice(start, next < 0 ? undefined : next);
}

// The VSIX bundles Lucide and Material icons, the Geist fonts and every npm package esbuild pulls
// in; their licenses must ship with it, so a dependency added or bumped without regenerating fails.
describe("THIRD_PARTY_NOTICES.md", () => {
  it("lists the license of everything the bundles contain", async () => {
    await expect(promisify(execFile)(process.execPath, [script, "--check"])).resolves.toBeDefined();
  }, 60_000);

  // Estonian sorts z between s and t, so a locale's order would put zod before tiny-svg.
  it("lists them in the same order whatever the language of the machine that builds it", async () => {
    await expect(
      promisify(execFile)(process.execPath, [script, "--check"], {
        env: { ...process.env, LC_ALL: "et_EE.UTF-8" },
      }),
    ).resolves.toBeDefined();
  }, 60_000);

  // Copied icon paths are no npm dependency, so the metafile cannot list them.
  it("has a section for every icon set the renderer copies into its sources", () => {
    const sources = rendererSourceText();
    const text = readFileSync(notices, "utf8");
    for (const { mention, heading } of COPIED_ICON_SETS) {
      if (sources.includes(mention)) expect(text, mention).toContain(heading);
    }
  });

  it("credits the renderer's one dialog, the title dialog, since its shortcuts dialog is gone (#466)", () => {
    const text = readFileSync(notices, "utf8");
    const lucide = text
      .slice(text.indexOf("## Lucide"), text.indexOf("ISC License"))
      .replace(/\s+/g, " ");
    expect(lucide).toContain("the title dialog's Close icon");
    expect(lucide).not.toMatch(/dialogs/i);
  });

  it("names the Material star and hand and carries the full Apache License 2.0", () => {
    const material = section(readFileSync(notices, "utf8"), "## Material Icons");
    expect(material).toContain("`star` and `pan_tool`");
    expect(material).toContain("Copyright Google LLC");
    expect(material).toContain("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION");
    expect(material).toContain("END OF TERMS AND CONDITIONS");
  });
});
