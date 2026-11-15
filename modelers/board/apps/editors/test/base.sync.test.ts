import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cssBaseAliases } from "../build/css-base.mjs";

/**
 * `src/base.ts` is the one place a page gets diagram-js's sheet and the canvas mapping from, once
 * the build has emptied both inside every renderer sheet. So its specifiers must be ones the
 * build does not empty, and the one copy of the mapping it takes must be every renderer's.
 */

const MODELERS = fileURLToPath(new URL("../../../../", import.meta.url));
const BASE = fileURLToPath(new URL("../src/base.ts", import.meta.url));

const imports = [...readFileSync(BASE, "utf8").matchAll(/^import "([^"]+)";$/gm)].map(
  (match) => match[1]!,
);

const emptied = (specifier: string): boolean =>
  cssBaseAliases.some(({ find }) => find.test(specifier));

const sha256 = (file: string): string =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

describe("src/base.ts", () => {
  it("loads diagram-js's sheet, then the canvas mapping, then the embed sheet", () => {
    expect(imports).toHaveLength(3);
    expect(imports[0]).toMatch(/^diagram-js\/assets\/diagram-js\.css\?/);
    expect(imports[1]).toMatch(/\/packages\/renderer\/src\/theme\/cd-canvas\.css$/);
    expect(imports[2]).toBe("@miragon/board-host/assets/embed.css");
  });

  it("names the base by specifiers the build does not empty", () => {
    expect(emptied("diagram-js/assets/diagram-js.css")).toBe(true);
    expect(emptied("../theme/cd-canvas.css")).toBe(true);
    for (const specifier of imports) expect(emptied(specifier), specifier).toBe(false);
  });

  it("takes a canvas mapping that is byte for byte every renderer's own", () => {
    const taken = resolve(dirname(BASE), imports[1]!);
    const copies = readdirSync(MODELERS)
      .map((modeler) => join(MODELERS, modeler, "packages/renderer/src/theme/cd-canvas.css"))
      .filter((copy) => existsSync(copy));
    expect(copies).toHaveLength(7);
    expect(copies).toContain(taken);
    expect(new Set(copies.map(sha256)).size).toBe(1);
  });
});
