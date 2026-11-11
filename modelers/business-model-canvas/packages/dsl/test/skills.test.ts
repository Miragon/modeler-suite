import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { validateDocument } from "@miragon/business-model-canvas-schema-model";
import { parseText, serializeText } from "../src/index.js";

const PLUGIN = fileURLToPath(
  new URL("../../../plugins/business-model-canvas-modeler/", import.meta.url),
);

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

/** The ```bmc blocks of a Markdown file. */
function bmcBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^```bmc\n([\s\S]*?)^```$/gm)].map((match) => match[1]!);
}

const examples = markdownFiles(PLUGIN).flatMap((file) =>
  bmcBlocks(readFileSync(file, "utf8")).map((text, index) => ({
    name: `${relative(PLUGIN, file)} #${index + 1}`,
    text,
  })),
);

describe("the plugin's skills", () => {
  test("show .bmc examples", () => {
    expect(examples.length).toBeGreaterThanOrEqual(3);
  });

  test.each(examples)("$name parses without findings, validates and is canonical", ({ text }) => {
    const { document, diagnostics } = parseText(text);
    expect(diagnostics).toEqual([]);
    expect(() => validateDocument(document)).not.toThrow();
    expect(serializeText(document)).toBe(text);
  });

  test("carry an exact version in plugin.json", () => {
    const manifest = JSON.parse(
      readFileSync(join(PLUGIN, ".claude-plugin/plugin.json"), "utf8"),
    ) as { name: string; version: string };
    expect(manifest.name).toBe("business-model-canvas-modeler");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
