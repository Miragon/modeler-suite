import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Drift guard for the chip of hidden relationships, as `breadcrumbs.style` is for the breadcrumb:
 * roles both modes define and the shell's measures only, the canvas layer of guide §5.13, the info
 * state in its role and icon (§3.3), and system colours under forced colours.
 */
const css = readFileSync(
  new URL("../src/navigation/hiddenRelationships.css", import.meta.url),
  "utf8",
);
const tokens = JSON.parse(
  readFileSync(new URL("../src/theme/cd-tokens.generated.json", import.meta.url), "utf8"),
) as { hell: Record<string, string>; dunkel: Record<string, string> };

const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = withoutComments(css);

describe("hiddenRelationships.css", () => {
  it("declares no colour literal", () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it("reads only roles both modes define, a radius, the easing and the shell's measures", () => {
    const used = [...rules.matchAll(/var\((--cd-[\w-]+)/g)].map((match) => match[1]!);
    expect(used.length).toBeGreaterThan(0);
    for (const token of used) {
      expect(token).toMatch(/^--cd-(ui-[\w-]+|radius-sm|ease|shell-(rand|frei))$/);
      if (token.startsWith("--cd-ui-")) {
        expect(Object.keys(tokens.hell), token).toContain(token);
        expect(Object.keys(tokens.dunkel), token).toContain(token);
      }
    }
  });

  it("shows the info state by its border and icon, the words in the text role", () => {
    expect(rules).toMatch(/border: 1px solid var\(--cd-ui-info\);/);
    expect(rules).toMatch(/background: var\(--cd-ui-info-flaeche\);/);
    expect(rules).toMatch(/\.c4-hidden-relationships-icon \{[^}]*color: var\(--cd-ui-info\);/);
    expect(rules).toMatch(/\.c4-hidden-relationships \{[^}]*color: var\(--cd-ui-text\);/);
  });

  it("lies in the canvas layer, below the context pad and the label editor (guide §5.13)", () => {
    const layers = [...rules.matchAll(/z-index:\s*(\d+)/g)].map((match) => Number(match[1]));
    expect(layers).toEqual([10]);
  });

  it("keeps the chip legible under forced colours", () => {
    const forced = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(rules)?.[1] ?? "";
    expect(forced).toMatch(/color:\s*ButtonText;/);
    expect(forced).toMatch(/background:\s*ButtonFace;/);
    expect(forced).toMatch(/outline-color:\s*Highlight;/);
  });
});
