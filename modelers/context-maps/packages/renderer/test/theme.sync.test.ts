/// <reference types="node" />
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CD_TOKENS, MIRAGON } from "../src/theme/palette.js";

/**
 * Drift guard for the design system (the `miragon-brand:modeler-tool-design` skill; CLAUDE.md
 * § "Design system"): the three files in `src/theme/` are unchanged copies of one release, the TS
 * mirror `MIRAGON` holds their values, and `assets/context-maps.css` takes every colour from the
 * roles. Re-copying the files from a new release fails here until the hashes, the mirror and the
 * CSS follow.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const css = readSource("../src/assets/context-maps.css");
const vendored = {
  "cd-tokens.generated.css": readSource("../src/theme/cd-tokens.generated.css"),
  "cd-tokens.generated.json": readSource("../src/theme/cd-tokens.generated.json"),
  "cd-canvas.css": readSource("../src/theme/cd-canvas.css"),
};

/** SHA-256 of the files as published in design system 1.27.0, the token files unchanged since 1.12.0. */
const RELEASE_1_27_0: Record<keyof typeof vendored, string> = {
  "cd-tokens.generated.css": "36ccd5bbcb732c57143e32f13172967467dd574ae1ac5d84d6c601d0ab0847a1",
  "cd-tokens.generated.json": "549a244fba0951e9b77fed0f5d2172cb793191913326f08749e167ac7fdbb127",
  "cd-canvas.css": "b49da7068bcbc95a682d93e19267c1d8308033ef421f6c120ce30eeb62eeb13a",
};

interface VendoredTokens {
  hell: Record<string, string>;
  fest: Record<string, string>;
  shell: Record<string, string>;
}
const tokens = JSON.parse(vendored["cd-tokens.generated.json"]) as VendoredTokens;

/** Compare colours by meaning, not bytes: hex case and whitespace inside `rgba(…)` do not count. */
function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

/** The `--name: value;` declarations of the `:root` block of the token CSS. */
function rootDeclarations(): Record<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(vendored["cd-tokens.generated.css"]);
  if (!block) throw new Error("no :root block in cd-tokens.generated.css");
  const declarations: Record<string, string> = {};
  for (const match of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    declarations[match[1]!] = norm(match[2]!);
  }
  return declarations;
}

/** The CSS without comments: what the browser parses. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every selector of every rule (the text in front of a `{`, split at the commas). */
function ruleSelectors(source: string): string[] {
  return [...withoutComments(source).matchAll(/([^{};]+)\{/g)].flatMap((match) =>
    match[1]!.split(",").map((selector) => selector.trim()),
  );
}

function zIndexOf(selector: string): number {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(withoutComments(css));
  return Number(/z-index:\s*(\d+)/.exec(rule?.[1] ?? "")?.[1]);
}

describe("theme.sync — the vendored design-system files", () => {
  it("are unchanged copies of design system 1.27.0", () => {
    for (const [name, source] of Object.entries(vendored)) {
      const hash = createHash("sha256").update(source, "utf8").digest("hex");
      expect(hash, name).toBe(RELEASE_1_27_0[name as keyof typeof vendored]);
    }
  });

  it("agree with each other: the JSON's light roles, palette and shell sizes are the CSS :root", () => {
    const root = rootDeclarations();
    for (const group of [tokens.hell, tokens.fest, tokens.shell]) {
      for (const [name, value] of Object.entries(group)) {
        expect(root[name], name).toBe(norm(value));
      }
    }
  });
});

describe("theme.sync — MIRAGON mirrors the vendored tokens", () => {
  it("declares every mirrored --cd-* token with the vendored value", () => {
    const root = rootDeclarations();
    for (const [name, value] of Object.entries(CD_TOKENS)) {
      expect(root[name], `${name} in :root`).toBe(norm(value));
    }
  });

  it("takes the status layer, the line, the contour and the quiet text of the release", () => {
    expect(MIRAGON.success).toBe(tokens.fest["--cd-success"]);
    expect(MIRAGON.warning).toBe(tokens.fest["--cd-warning"]);
    expect(MIRAGON.danger).toBe(tokens.fest["--cd-danger"]);
    expect(MIRAGON.info).toBe(tokens.fest["--cd-info"]);
    expect(MIRAGON.linie).toBe(tokens.fest["--cd-linie"]);
    expect(MIRAGON.kontur).toBe(tokens.fest["--cd-kontur"]);
    expect(MIRAGON.textLeise).toBe(tokens.fest["--cd-text-leise"]);
  });
});

describe("theme.sync — context-maps.css", () => {
  it("loads the tokens (layered), diagram-js and cd-canvas (unlayered) first, in this order", () => {
    const statements = withoutComments(css)
      .split(/;|\{/)
      .map((statement) => statement.trim().replace(/\s+/g, " "));
    expect(statements.slice(0, 3)).toEqual([
      '@import "../theme/cd-tokens.generated.css" layer(context-maps-tokens)',
      '@import "diagram-js/assets/diagram-js.css"',
      '@import "../theme/cd-canvas.css"',
    ]);
    expect(css.match(/@import/g)).toHaveLength(3);
  });

  it("declares no colour literal: no hex, rgb() or hsl() value", () => {
    expect(withoutComments(css)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it("reads only roles and mode-independent tokens, never a fixed palette colour", () => {
    const used = [...withoutComments(css).matchAll(/var\((--cd-[\w-]+)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(20);
    for (const token of used) {
      expect(token).toMatch(
        /^--cd-(ui-[\w-]+|radius-\w+|shadow-\d|ease(-out)?|motion-\w+|blau|blau-link|weiss)$/,
      );
    }
  });

  it("fills only the primary dialog button with the fixed palette (guide §8)", () => {
    const fixed = /var\(--cd-(blau|blau-link|weiss)\)/;
    const rules = [...withoutComments(css).matchAll(/([^{};]+)\{([^{}]*)\}/g)];
    const fixedRules = rules.filter((rule) => fixed.test(rule[2]!));
    expect(fixedRules.length).toBeGreaterThan(0);
    for (const rule of fixedRules) {
      for (const selector of rule[1]!.split(",")) {
        expect(selector.trim()).toMatch(/^\.cm-dialog-button\[data-variant="primary"\]/);
      }
    }
  });

  it("draws the dot grid in --cd-ui-linie at 1px (guide §10.1)", () => {
    const container = /\.cm-djs-container\s*\{([^}]*)\}/.exec(withoutComments(css));
    expect(container?.[1]).toMatch(
      /background-image:\s*radial-gradient\(var\(--cd-ui-linie\) 1px, transparent 1px\);/,
    );
  });

  it("leaves the lasso fill, the resizers and the popup colours to cd-canvas.css (guide §10.3)", () => {
    expect(withoutComments(css)).not.toMatch(/--lasso-fill-color|--popup-[\w-]+\s*:/);
    expect(ruleSelectors(css).filter((selector) => selector.includes("djs-resizer"))).toEqual([]);
  });

  it("keeps its persistent canvas overlays at or below z-index 100 (guide §5.13)", () => {
    expect(zIndexOf('.djs-palette:not([data-chrome="palette"])')).toBe(110);
    expect(zIndexOf(".cm-djs-container .djs-direct-editing-parent")).toBeLessThanOrEqual(100);
    // The description prompt stays open through a pan or zoom, like the label editor.
    expect(zIndexOf(".cm-pad-prompt")).toBeLessThanOrEqual(100);
  });

  it("scopes every rule of its own palette away from the shell skin", () => {
    const paletteSelectors = ruleSelectors(css).filter((selector) =>
      /\.djs-palette(?![\w-])/.test(selector),
    );
    expect(paletteSelectors.length).toBeGreaterThan(5);
    for (const selector of paletteSelectors) {
      expect(selector).toMatch(/^\.djs-palette:not\(\[data-chrome="palette"\]\)($|[\s.:])/);
    }
  });
});
