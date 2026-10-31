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

/** A selector list split at the commas outside parentheses, its whitespace collapsed. */
function selectorList(text: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if (character === "(") depth++;
    if (character === ")") depth--;
    if (character === "," && depth === 0) {
      selectors.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  selectors.push(current);
  return selectors.map((selector) =>
    selector.trim().replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")"),
  );
}

interface StyleRule {
  selectors: string[];
  declarations: string;
  /** The preludes of the at-rules around it, outermost first. */
  within: string[];
}

/** Every style rule of the sheet, with the at-rules it sits in. */
function styleRules(source: string): StyleRule[] {
  const rules: StyleRule[] = [];
  const open: string[] = [];
  let text = "";
  for (const character of withoutComments(source)) {
    if (character === "{") {
      open.push(text.trim().replace(/\s+/g, " "));
      text = "";
    } else if (character === "}") {
      const prelude = open.pop()!;
      if (!prelude.startsWith("@")) {
        rules.push({
          selectors: selectorList(prelude),
          declarations: text.trim(),
          within: open.filter((outer) => outer.startsWith("@")),
        });
      }
      text = "";
    } else if (character === ";" && open.length === 0) {
      text = "";
    } else {
      text += character;
    }
  }
  return rules;
}

const HIGH_CONTRAST_SCOPE =
  '@scope ([data-cd-kontrast="hoch"]) to ([data-cd-theme]:not([data-cd-kontrast="hoch"]))';
const IN_CONTAINER = ":where(.cm-djs-container) ";
/** The map's container in the high-contrast block: the scope's root itself or below it. */
const IN_CONTAINER_IN_HIGH_CONTRAST = ":is(:scope.cm-djs-container, :scope .cm-djs-container) ";
/** The same at no specificity, so a rule there weighs no more than the rule it answers. */
const WHERE_IN_CONTAINER_IN_HIGH_CONTRAST =
  ":where(:scope.cm-djs-container, :scope .cm-djs-container) ";

/** What a selector of the high-contrast block styles: its subjects without the scope's prefix. */
function highContrastSubjects(selector: string): string[] {
  const prefix = [IN_CONTAINER_IN_HIGH_CONTRAST, WHERE_IN_CONTAINER_IN_HIGH_CONTRAST].find(
    (container) => selector.startsWith(container),
  );
  const subject = prefix ? selector.slice(prefix.length) : selector.replace(/^:scope /, "");
  return subject.startsWith(":is(") && subject.endsWith(")")
    ? selectorList(subject.slice(":is(".length, -1))
    : [subject];
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

  it("takes the ground of a PNG export (guide §10.7) from the light roles", () => {
    expect(MIRAGON.grau).toBe(tokens.hell["--cd-ui-grund"]);
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
    expect(zIndexOf(':where(.cm-djs-container) .djs-palette:not([data-chrome="palette"])')).toBe(
      110,
    );
    expect(zIndexOf(".cm-djs-container .djs-direct-editing-parent")).toBeLessThanOrEqual(100);
    // The description prompt stays open through a pan or zoom, like the label editor.
    expect(zIndexOf(".cm-pad-prompt")).toBeLessThanOrEqual(100);
  });

  it("scopes every rule of its palette, context pad and popup menu to its container, at no extra specificity, and the palette away from the shell skin", () => {
    const unskinned = '.djs-palette:not([data-chrome="palette"])';
    const selectors = styleRules(css).flatMap((rule) =>
      rule.selectors
        .filter((selector) => /\.djs-(palette|context-pad|popup)(?![\w-])/.test(selector))
        .map((selector) => ({ selector, highContrast: rule.within.includes(HIGH_CONTRAST_SCOPE) })),
    );
    expect(selectors.filter(({ selector }) => selector.includes(".djs-palette")).length).toBe(26);
    expect(selectors.filter(({ selector }) => selector.includes(".djs-context-pad")).length).toBe(
      14,
    );
    expect(selectors.filter(({ selector }) => selector.includes(".djs-popup")).length).toBe(11);
    for (const { selector, highContrast } of selectors) {
      expect(selector.split(unskinned).join(""), selector).not.toMatch(/\.djs-palette(?![\w-])/);
      if (highContrast) {
        expect(selector.startsWith(WHERE_IN_CONTAINER_IN_HIGH_CONTRAST), selector).toBe(true);
      } else {
        // `cm-dragging` is the map's own class, on diagram-js's canvas container inside it.
        expect(
          selector.startsWith(IN_CONTAINER) || selector.startsWith(".cm-dragging "),
          selector,
        ).toBe(true);
      }
    }
  });

  it("keeps every high-contrast rule in one block that follows the nearest mode carrier (guide §13.3)", () => {
    const rules = styleRules(css);
    expect(withoutComments(css).match(/@scope/g)).toHaveLength(1);
    for (const selector of rules.flatMap((rule) => rule.selectors)) {
      expect(selector).not.toContain("data-cd-kontrast");
    }
    const highContrast = rules.filter((rule) => rule.within.includes(HIGH_CONTRAST_SCOPE));
    expect(highContrast.length).toBeGreaterThan(5);
    for (const selector of highContrast.flatMap((rule) => rule.selectors)) {
      expect(selector).toMatch(
        /^(:scope |:(is|where)\(:scope\.cm-djs-container, :scope \.cm-djs-container\) )/,
      );
    }
  });

  it("drops in high contrast every shadow it draws (guide §5.3, §6)", () => {
    const rules = styleRules(css);
    const shadowed = new Set(
      rules
        .filter((rule) => rule.within.length === 0)
        .filter((rule) => /box-shadow:\s*var\(--cd-shadow-\d\)/.test(rule.declarations))
        .flatMap((rule) => rule.selectors)
        .map((selector) => selector.replace(IN_CONTAINER, "").replace(/:(hover|active)$/, "")),
    );
    const dropped = new Set(
      rules
        .filter((rule) => rule.within.includes(HIGH_CONTRAST_SCOPE))
        .filter((rule) => /box-shadow:\s*none/.test(rule.declarations))
        .flatMap((rule) => rule.selectors.flatMap(highContrastSubjects)),
    );
    expect(shadowed.size).toBe(14);
    for (const subject of shadowed) expect(dropped, subject).toContain(subject);
  });

  it("keeps the focus rings of the editors, the palette and the legend in Highlight under forced colours", () => {
    // Chromium itself draws a ring with :focus-visible in Highlight there, so a browser test
    // cannot tell these rules apart from no rule; other engines need them.
    const highlighted = styleRules(css)
      .filter((rule) => rule.within.includes("@media (forced-colors: active)"))
      .filter((rule) => /outline-color:\s*Highlight/.test(rule.declarations))
      .flatMap((rule) => rule.selectors);
    expect(highlighted).toEqual(
      expect.arrayContaining([
        `${IN_CONTAINER}.djs-palette:not([data-chrome="palette"]) .entry:focus-visible`,
        ".cm-djs-container .djs-direct-editing-parent:focus-within",
        ".cm-djs-container .cm-pad-prompt__field:focus",
        ".cm-djs-container .cm-legend__close:focus-visible",
        ".cm-djs-container .cm-legend-toggle:focus-visible",
      ]),
    );
  });
});
