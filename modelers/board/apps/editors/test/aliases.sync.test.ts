import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sourceAliases } from "../build/aliases.mjs";

/**
 * A bundler resolves the other modelers' packages through `build/aliases.mjs`, the type check of
 * this workspace through the `paths` of its tsconfig. One list is generated from the other; a
 * package or an exported subpath that a modeler adds must reach both, or the type check reads a
 * `dist` nobody built while the bundler reads the source.
 */

const EDITORS = fileURLToPath(new URL("../", import.meta.url));

const paths = (
  JSON.parse(readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8")) as {
    compilerOptions: { paths: Record<string, string[]> };
  }
).compilerOptions.paths;

describe("the paths of apps/editors/tsconfig.json", () => {
  it("name what the alias helper names, in its order", () => {
    expect(Object.keys(paths)).toEqual(sourceAliases.map(({ find }) => find));
  });

  it("point each name at the file the alias helper points it at", () => {
    expect(sourceAliases.length).toBeGreaterThan(0);
    for (const { find, replacement } of sourceAliases) {
      expect(paths[find], find).toEqual([relative(EDITORS, replacement)]);
    }
  });
});
