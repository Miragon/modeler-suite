import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CHROME_SPACING, MIRAGON } from "../src/theme/palette.js";
import {
  COLORS,
  NOTE_STYLE,
  PROVISIONAL_STICKY,
  STICKY_SHADOW,
  STICKY_STYLES,
} from "../src/draw/styles.js";
import { textColorOn } from "../src/draw/contrast.js";

/**
 * Drift guard: `assets/event-storming.css` reads the design-system roles only, and `MIRAGON`
 * mirrors the design-system tokens vendored in `theme/`. This test fails the moment the CSS
 * declares a colour of its own, the TS source of truth drifts or a partial re-copy of the vendored
 * files diverges, so the "keep these in sync" contract is enforced instead of hoped for. See the
 * Miragon design system (the `miragon-brand:modeler-tool-design` skill; CLAUDE.md
 * § "Design system").
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const css = readSource("../src/assets/event-storming.css");
const vendoredTokensCss = readSource("../src/theme/cd-tokens.generated.css");
const vendoredCanvasCss = readSource("../src/theme/cd-canvas.css");
const vendoredTokensJson = readSource("../src/theme/cd-tokens.generated.json");

interface VendoredTokens {
  $description: string;
  hell: Record<string, string>;
  dunkel: Record<string, string>;
  hochkontrast: { hell: Record<string, string>; dunkel: Record<string, string> };
  fest: Record<string, string>;
  shell: Record<string, string>;
}
const tokens = JSON.parse(vendoredTokensJson) as VendoredTokens;

const VENDORED_HEADER =
  "/* Vendored unchanged from Miragon/corporate-identity (design system 1.27.0, plugins/miragon-brand/skills/modeler-tool-design/assets). Do not edit; re-copy to update. */";

function withoutVendoringHeader(source: string): string {
  return source.slice(source.indexOf("\n") + 1);
}

/**
 * sha256 of the files of design system 1.27.0, the token files unchanged since 1.12.0. The CSS
 * files are hashed without the vendoring header, which the release does not carry.
 */
const DESIGN_SYSTEM_1_27_0 = {
  "cd-tokens.generated.css": {
    source: withoutVendoringHeader(vendoredTokensCss),
    sha256: "36ccd5bbcb732c57143e32f13172967467dd574ae1ac5d84d6c601d0ab0847a1",
  },
  "cd-tokens.generated.json": {
    source: vendoredTokensJson,
    sha256: "549a244fba0951e9b77fed0f5d2172cb793191913326f08749e167ac7fdbb127",
  },
  "cd-canvas.css": {
    source: withoutVendoringHeader(vendoredCanvasCss),
    sha256: "b49da7068bcbc95a682d93e19267c1d8308033ef421f6c120ce30eeb62eeb13a",
  },
};

/**
 * Compare colours by meaning, not bytes: ignore hex case and `rgba(…)` whitespace (Prettier
 *  reformats the CSS, so a byte-exact match would be brittle). Real value drift still fails.
 */
function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pull `--name: value;` declarations out of the first rule whose selector list ends with
 * `selector` (tolerates combined lists like `a, b { … }`; assumes flat, un-nested token blocks).
 */
function readVars(source: string, selector: string, sourceName: string): Record<string, string> {
  const block = new RegExp(`${escapeForRegExp(selector)}\\s*\\{([^}]*)\\}`).exec(source);
  if (!block) throw new Error(`selector not found in ${sourceName}: ${selector}`);
  const vars: Record<string, string> = {};
  for (const match of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[match[1]!] = norm(match[2]!);
  }
  return vars;
}

function normalizedValues(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, norm(value)]));
}

/** Every `name: value` of `expected` is declared in `actual` with the same value. */
function expectDeclared(
  actual: Record<string, string>,
  expected: Record<string, string>,
  where: string,
): void {
  for (const [name, value] of Object.entries(expected)) {
    expect(actual[name], `${name} in ${where}`).toBe(norm(value));
  }
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

/** Every selector of every rule, split at the commas outside parentheses, spaces collapsed. */
function topLevelSelectors(source: string): string[] {
  return [...withoutComments(source).matchAll(/([^{};]+)\{/g)].flatMap((match) => {
    const selectors: string[] = [];
    let depth = 0;
    let current = "";
    for (const character of match[1]!) {
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
  });
}

describe("theme.sync — event-storming.css takes every colour from the roles", () => {
  it("declares no colour literal: no hex, rgb() or hsl() value", () => {
    expect(withoutComments(css)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it("reads only roles and mode-independent tokens, never a fixed palette colour", () => {
    const tokens = [...withoutComments(css).matchAll(/var\((--cd-[\w-]+)/g)].map((m) => m[1]!);
    expect(tokens.length).toBeGreaterThan(20);
    for (const token of tokens) {
      expect(token).toMatch(
        /^--cd-(ui-[\w-]+|radius-\w+|shadow-\d|ease(-out)?|motion-\w+|shell-(rand|zeile|ziel|frei))$/,
      );
    }
  });

  it("takes the narrow palette's second row and side edge from the shell tokens, not typed in (guide §5.1, §5.15)", () => {
    for (const token of ["--cd-shell-frei", "--cd-shell-rand"]) {
      expect(withoutComments(css)).toContain(`var(${token})`);
    }
  });

  it("never renders the DSL `style` directive (guide §10.7: no navy board)", () => {
    expect(
      ruleSelectors(css).filter((selector) => /event-storming-(dark|classic)/.test(selector)),
    ).toEqual([]);
    expect(withoutComments(css)).not.toMatch(/--event-storming-/);
  });

  it("keeps its own canvas overlays below the palette (guide §5.13)", () => {
    const zIndexOf = (selector: string): number => {
      const rule = new RegExp(`${escapeForRegExp(selector)}\\s*\\{([^}]*)\\}`).exec(
        withoutComments(css),
      );
      return Number(/z-index:\s*(\d+)/.exec(rule?.[1] ?? "")?.[1]);
    };
    expect(
      zIndexOf(':where(.event-storming-container) .djs-palette:not([data-chrome="palette"])'),
    ).toBe(110);
    for (const overlay of [
      ".event-storming-container .event-storming-note-toolbar",
      ".event-storming-container .event-storming-color-picker",
      ".event-storming-container .event-storming-label-input",
      ".event-storming-container .event-storming-label-suggestions",
      ".event-storming-container .event-storming-spelling-tooltip",
    ]) {
      expect(zIndexOf(overlay), overlay).toBeLessThanOrEqual(100);
    }
  });
});

describe("theme.sync — event-storming.css wires the vendored design-system files", () => {
  it("starts with the tokens (layered), diagram-js and cd-canvas (unlayered), in this order", () => {
    const statements = withoutComments(css)
      .split(/;|\{/)
      .map((statement) => statement.trim().replace(/\s+/g, " "));
    expect(statements.slice(0, 4)).toEqual([
      '@import "../theme/cd-tokens.generated.css" layer(event-storming-tokens)',
      '@import "diagram-js/assets/diagram-js.css"',
      '@import "../theme/cd-canvas.css"',
      ".event-storming-container",
    ]);
    expect(css.match(/@import/g)).toHaveLength(3);
  });

  it("leaves the lasso fill and the resizer handles to cd-canvas.css (guide §10.4)", () => {
    expect(withoutComments(css)).not.toMatch(/--lasso-fill-color/);
    expect(
      ruleSelectors(css).filter((selector) => selector.includes("djs-resizer-visual")),
    ).toEqual([]);
  });

  it("leaves the keyboard shortcuts dialog to the shell's stylesheet (guide §8)", () => {
    expect(ruleSelectors(css).filter((selector) => selector.includes("shortcuts"))).toEqual([]);
  });

  it("draws the dot grid in --cd-ui-linie at 1px (guide §10.1)", () => {
    const container = /\.event-storming-container\s*\{([^}]*)\}/.exec(withoutComments(css));
    expect(container?.[1]).toMatch(
      /background-image:\s*radial-gradient\(var\(--cd-ui-linie\) 1px, transparent 1px\);/,
    );
  });

  it("marks hover and selection by the outline only, never by a filter (guide §10.4)", () => {
    const rules = withoutComments(css);
    expect(rules).not.toMatch(/brightness\(/);
    expect(rules).not.toMatch(/--element-selected-outline-secondary-stroke-color/);
    expect(ruleSelectors(css)).toContain(
      ".event-storming-container .djs-shape.hover > .djs-outline",
    );
  });

  it("scopes every rule of its own palette and its tooltip to its container, at no extra specificity outside high contrast, away from the shell skin", () => {
    const unskinned = '.djs-palette:not([data-chrome="palette"])';
    const insideContainer =
      /^(:where\(\.event-storming-container\)|:is\(:scope\.event-storming-container, :scope \.event-storming-container\)) /;
    const selectors = topLevelSelectors(css).filter((selector) =>
      /\.djs-(palette|hover-tooltip)(?![\w-])/.test(selector),
    );
    expect(selectors.length).toBeGreaterThan(8);
    for (const selector of selectors) {
      expect(selector.split(unskinned).join(""), selector).not.toMatch(/\.djs-palette(?![\w-])/);
      expect(selector, selector).toMatch(insideContainer);
    }
  });
});

describe("theme.sync — the vendored files are complete, unchanged copies (design system 1.27.0)", () => {
  for (const [file, { source, sha256 }] of Object.entries(DESIGN_SYSTEM_1_27_0)) {
    it(`${file} is byte-identical to the release below its header`, () => {
      expect(createHash("sha256").update(source, "utf8").digest("hex")).toBe(sha256);
    });
  }

  it("both CSS files start with the vendoring header, followed by the generated banner", () => {
    for (const [name, source] of [
      ["cd-tokens.generated.css", vendoredTokensCss],
      ["cd-canvas.css", vendoredCanvasCss],
    ] as const) {
      const [header, banner] = source.split("\n");
      expect(header, name).toBe(VENDORED_HEADER);
      expect(banner, name).toMatch(/^\/\* AUTOMATISCH GENERIERT aus brand\/tokens\.json\./);
    }
  });

  it("the JSON is the generated file (no header of its own)", () => {
    expect(vendoredTokensJson.startsWith('{\n  "$description": "AUTOMATISCH GENERIERT')).toBe(true);
    expect(Object.keys(tokens)).toEqual([
      "$description",
      "hell",
      "dunkel",
      "hochkontrast",
      "fest",
      "shell",
    ]);
  });

  it('the JSON `hell` roles equal the light roles in the CSS (:root and [data-cd-theme="light"])', () => {
    const root = readVars(vendoredTokensCss, ":root", "cd-tokens.generated.css");
    const light = readVars(
      vendoredTokensCss,
      '[data-cd-theme="light"],\n[data-cd-theme="system"]',
      "cd-tokens.generated.css",
    );
    expect(Object.keys(tokens.hell).length).toBeGreaterThan(20);
    expectDeclared(root, tokens.hell, ":root");
    expect(light).toEqual(normalizedValues(tokens.hell));
  });

  it("the JSON `dunkel` roles equal the dark roles in the CSS", () => {
    const dark = readVars(vendoredTokensCss, '[data-cd-theme="dark"]', "cd-tokens.generated.css");
    expect(dark).toEqual(normalizedValues(tokens.dunkel));
  });

  it("the JSON `fest` and `shell` tokens equal the fixed tokens on :root", () => {
    const root = readVars(vendoredTokensCss, ":root", "cd-tokens.generated.css");
    expectDeclared(root, tokens.fest, ":root (fest)");
    expectDeclared(root, tokens.shell, ":root (shell)");
  });
});

/** `blauLink` -> `--cd-blau-link`; `undefined` for app-specific keys the design system lacks. */
function vendoredTokenFor(key: string): string | undefined {
  const name = `--cd-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  const value = readVars(vendoredTokensCss, ":root", "cd-tokens.generated.css")[name];
  return value;
}

describe("theme.sync — MIRAGON mirrors the vendored design-system tokens", () => {
  it("every MIRAGON value with a --cd-* counterpart equals it", () => {
    const compared = Object.entries(MIRAGON).filter(([key]) => vendoredTokenFor(key) !== undefined);
    expect(compared.map(([key]) => key)).toEqual(
      expect.arrayContaining([
        "blau",
        "gruen",
        "grau",
        "schwarz",
        "weiss",
        "linie",
        "kontur",
        "textLeise",
        "success",
        "warning",
        "danger",
        "info",
      ]),
    );
    for (const [key, value] of compared) {
      expect(norm(value), `MIRAGON.${key}`).toBe(vendoredTokenFor(key));
    }
  });

  it("the status colours are the 1.13.0 status layer", () => {
    expect(MIRAGON.success).toBe(tokens.fest["--cd-success"]);
    expect(MIRAGON.warning).toBe(tokens.fest["--cd-warning"]);
    expect(MIRAGON.danger).toBe(tokens.fest["--cd-danger"]);
    expect(MIRAGON.info).toBe(tokens.fest["--cd-info"]);
  });

  it("CHROME_SPACING is the shell group's edge, gap and side fit margin", () => {
    expect(`${CHROME_SPACING.rand}px`).toBe(tokens.shell["--cd-shell-rand"]);
    expect(`${CHROME_SPACING.luecke}px`).toBe(tokens.shell["--cd-shell-luecke"]);
    expect(`${CHROME_SPACING.einpassenSeite}px`).toBe(tokens.shell["--cd-shell-einpassen-seite"]);
  });
});

/** WCAG 2.x contrast ratio of two opaque hex colours. */
function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((index) => {
      const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

/** The canvas ground of both apps and of the PNG export, and the white of the plain export. */
const CANVAS_GROUNDS = [MIRAGON.grau, MIRAGON.weiss];

const STICKY_LOOKS = [
  ...Object.entries(STICKY_STYLES),
  ["note", NOTE_STYLE],
  ["provisional", PROVISIONAL_STICKY],
] as const;

/** The feedback-note colours the plugin's `event-storming` review skill writes onto boards. */
const REVIEW_NOTE_FILLS = ["#15803d", "#b45309", "#b91c1c", "#1d4ed8", "#7e22ce"];

describe("theme.sync — notation contrast (guide §3.6, §10.1, §10.6)", () => {
  it("draws edges in kontur and their annotation in text-leise, as the canvas table says", () => {
    expect(COLORS.arrow).toBe(MIRAGON.kontur);
    expect(COLORS.inkSoft).toBe(MIRAGON.textLeise);
  });

  it("takes the provisional sticky and the sticky shadow from the design-system colours", () => {
    expect(PROVISIONAL_STICKY.fill).toBe(MIRAGON.weiss);
    expect(PROVISIONAL_STICKY.stroke).toBe(MIRAGON.kontur);
    expect(STICKY_SHADOW.color).toBe(MIRAGON.schwarz);
  });

  it("sticky text reaches 4.5:1 on every fill the notation draws", () => {
    for (const [kind, look] of STICKY_LOOKS) {
      expect(contrast(textColorOn(look.fill), look.fill), kind).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("note text reaches 4.5:1 on the review skill's feedback colours", () => {
    for (const fill of REVIEW_NOTE_FILLS) {
      expect(contrast(textColorOn(fill), fill), fill).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the arrow annotation reaches 4.5:1 and the arrow 3:1 on the canvas ground", () => {
    for (const ground of CANVAS_GROUNDS) {
      expect(contrast(COLORS.inkSoft, ground), ground).toBeGreaterThanOrEqual(4.5);
      expect(contrast(COLORS.arrow, ground), ground).toBeGreaterThanOrEqual(3);
    }
  });

  it("every sticky border reaches 3:1 on the canvas ground, since the light fills barely do", () => {
    for (const [kind, look] of STICKY_LOOKS) {
      for (const ground of CANVAS_GROUNDS) {
        expect(contrast(look.stroke, ground), `${kind} on ${ground}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("keeps the colour literals in theme/palette.ts and the notation in draw/styles.ts", () => {
    const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
    const sources = readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
      .filter((path) => path.endsWith(".ts"))
      .map((path) => path.replaceAll("\\", "/"));
    expect(sources).toContain("draw/EventStormingRenderer.ts");
    const withLiterals = sources.filter((path) => {
      const code = readSource(`../src/${path}`)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'\\])\/\/[^\n]*/gm, "$1");
      return /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(code);
    });
    expect(withLiterals.sort()).toEqual(["draw/styles.ts", "theme/palette.ts"]);
  });
});
