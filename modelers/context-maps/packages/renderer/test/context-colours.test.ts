/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_SUBDOMAIN_SPECS } from "@miragon/context-maps-schema-model";
import {
  contextEditorColour,
  contextFill,
  contextNameColour,
  contextStroke,
  contextTeamColour,
  contrastRatio,
  readableTextColour,
} from "../src/draw/contextColours.js";
import { INK, INK_SOFT, NEUTRAL_FILL, NEUTRAL_STROKE } from "../src/draw/styles.js";
import { MIRAGON } from "../src/theme/palette.js";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../src");

function typeScriptSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => relative(sourceRoot, join(entry.parentPath, entry.name)));
}

/** The fills a context gets without a fill of its own: the three subdomain types and none. */
const DEFAULT_FILLS = [
  ...ALL_SUBDOMAIN_SPECS.map((spec) => ({ name: spec.label, fill: spec.fill })),
  { name: "unclassified", fill: NEUTRAL_FILL },
];

describe("context colours: the renderer's own colours come from the tokens", () => {
  it("draws no colour literal outside the token mirror (theme/palette.ts)", () => {
    const sources = typeScriptSources(sourceRoot).filter((path) => path !== "theme/palette.ts");
    expect(sources).toContain("draw/ContextMapsRenderer.ts");
    for (const path of sources) {
      const source = readFileSync(join(sourceRoot, path), "utf8");
      expect(source, path).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    }
  });

  it("draws an unclassified context white with a contour that keeps 3:1 on the canvas", () => {
    expect(NEUTRAL_FILL).toBe(MIRAGON.weiss);
    expect(NEUTRAL_STROKE).toBe(MIRAGON.kontur);
    expect(contextFill({})).toBe(MIRAGON.weiss);
    expect(contextStroke({})).toBe(MIRAGON.kontur);
    expect(contrastRatio(NEUTRAL_STROKE, MIRAGON.grau)).toBeGreaterThanOrEqual(3);
  });

  it("captions the team in --cd-text-leise, at least 4.5:1 on every default fill", () => {
    expect(INK_SOFT).toBe(MIRAGON.textLeise);
    for (const { name, fill } of DEFAULT_FILLS) {
      expect(contrastRatio(INK_SOFT, fill), name).toBeGreaterThanOrEqual(4.5);
    }
    for (const spec of ALL_SUBDOMAIN_SPECS) {
      expect(contextTeamColour({ subdomainType: spec.type }), spec.label).toBe(INK_SOFT);
    }
    expect(contextTeamColour({})).toBe(INK_SOFT);
  });
});

describe("context colours: text on a fill is black or white (guide §10.6)", () => {
  it("takes whichever of schwarz and weiss has more contrast", () => {
    expect(readableTextColour("#333333")).toBe(MIRAGON.weiss);
    expect(readableTextColour("#000")).toBe(MIRAGON.weiss);
    // Either side of the crossover, where neither reaches 4.5:1.
    expect(readableTextColour("#777777")).toBe(MIRAGON.weiss);
    expect(readableTextColour("#808080")).toBe(INK);
    expect(readableTextColour("#FFF")).toBe(INK);
  });

  it("keeps schwarz for a value it cannot read", () => {
    expect(readableTextColour("navy")).toBe(INK);
  });

  it("names a context in schwarz on every default fill", () => {
    for (const { name, fill } of DEFAULT_FILLS) {
      expect(readableTextColour(fill), name).toBe(INK);
      expect(contrastRatio(INK, fill), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("lets an editor over the box write as the canvas does, in the role on the renderer's fill", () => {
    expect(contextEditorColour({}, "name")).toBe("var(--cd-ui-text)");
    expect(contextEditorColour({}, "team")).toBe("var(--cd-ui-text-leise)");
    expect(contextEditorColour({ stroke: "#333333" }, "name")).toBe("var(--cd-ui-text)");
    expect(contextEditorColour({ subdomainType: "core" }, "name")).toBe(INK);
    expect(contextEditorColour({ subdomainType: "core" }, "team")).toBe(INK_SOFT);
    expect(contextEditorColour({ fill: "#333333" }, "name")).toBe(MIRAGON.weiss);
    expect(contextEditorColour({ fill: "#333333" }, "team")).toBe(MIRAGON.weiss);
  });

  it("follows a fill the author set, for the name and for the team", () => {
    const dark = { subdomainType: "core" as const, fill: "#333333" };
    expect(contextNameColour(dark)).toBe(MIRAGON.weiss);
    expect(contextTeamColour(dark)).toBe(MIRAGON.weiss);
    const light = { subdomainType: "core" as const, fill: "#FFFFFF" };
    expect(contextNameColour(light)).toBe(INK);
    expect(contextTeamColour(light)).toBe(INK);
  });
});
