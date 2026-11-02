import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Drift guard for the breadcrumb's stylesheet, as `theme.sync` is for c4.css: roles and the
 * shell's measures only, the canvas layer of guide §5.13, and system colours under forced colours.
 */
const css = readFileSync(new URL("../src/navigation/breadcrumbs.css", import.meta.url), "utf8");
const tokens = JSON.parse(
  readFileSync(new URL("../src/theme/cd-tokens.generated.json", import.meta.url), "utf8"),
) as { hell: Record<string, string>; dunkel: Record<string, string> };

const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = withoutComments(css);

describe("breadcrumbs.css", () => {
  it("declares no colour literal", () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it("reads only roles both modes define, a radius and the shell's measures", () => {
    const used = [...rules.matchAll(/var\((--cd-[\w-]+)/g)].map((match) => match[1]!);
    expect(used.length).toBeGreaterThan(0);
    for (const token of used) {
      expect(token).toMatch(/^--cd-(ui-[\w-]+|radius-sm|shell-(rand|zeile|frei))$/);
      if (token.startsWith("--cd-ui-")) {
        expect(Object.keys(tokens.hell), token).toContain(token);
        expect(Object.keys(tokens.dunkel), token).toContain(token);
      }
    }
  });

  it("lies in the canvas layer, below the context pad and the label editor (guide §5.13)", () => {
    const layers = [...rules.matchAll(/z-index:\s*(\d+)/g)].map((match) => Number(match[1]));
    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) expect(layer).toBeLessThan(100);
  });

  it("underlines a link at rest in high contrast, as the shell's legal line does", () => {
    const highContrast = [
      ...rules.matchAll(/:is\(\[data-cd-kontrast="hoch"\][^{]*\{([^}]*)\}/g),
    ].filter((match) => !match[0].includes(":focus-visible"));
    expect(highContrast.map((match) => match[1])).toEqual([
      expect.stringMatching(/text-decoration:\s*underline;/),
    ]);
  });

  it("keeps every part legible under forced colours", () => {
    const forced = /@media \(forced-colors: active\) \{([\s\S]*)\}\s*$/.exec(rules)?.[1] ?? "";
    expect(forced).toMatch(/background:\s*Canvas;/);
    expect(forced).toMatch(/color:\s*LinkText;/);
    expect(forced).toMatch(/text-decoration:\s*underline;/);
    expect(forced).toMatch(/outline-color:\s*Highlight;/);
    expect(forced).toMatch(/color:\s*CanvasText;/);
  });
});
