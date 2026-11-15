import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Drift guard of the board's two sheets, `assets/board.css` and `assets/board-base.css`. They
 * read the design-system roles only, through one alias block on `.board-root`, and each alias
 * keeps the light value the sheet was measured with. The files in `theme/` are unchanged copies
 * of the design system's assets. A hand edit, a colour of the sheet's own or an alias moved to a
 * role with another light value fails here instead of in review.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const boardCss = readSource("../src/assets/board.css");
const baseCss = readSource("../src/assets/board-base.css");
const vendoredTokensCss = readSource("../src/theme/cd-tokens.generated.css");
const vendoredTokensJson = readSource("../src/theme/cd-tokens.generated.json");

const SHEETS = { "board.css": boardCss, "board-base.css": baseCss };

interface VendoredTokens {
  $description: string;
  hell: Record<string, string>;
  dunkel: Record<string, string>;
  hochkontrast: { hell: Record<string, string>; dunkel: Record<string, string> };
  fest: Record<string, string>;
  shell: Record<string, string>;
}
const tokens = JSON.parse(vendoredTokensJson) as VendoredTokens;

/**
 * sha256 of every copy of a design-system file, as `.miragon/brand-assets.sha256` records it:
 * `brand-assets.mjs` of the `miragon-brand` plugin writes it whenever it re-copies the files.
 */
const BRAND_ASSET_CHECKSUMS = new Map(
  readSource("../../../../../.miragon/brand-assets.sha256")
    .trim()
    .split("\n")
    .map((line) => line.split(/\s+/).reverse() as [string, string]),
);
const THEME_DIRECTORY = "modelers/board/packages/renderer/src/theme";

const VENDORED_FILES = {
  "cd-tokens.generated.css": vendoredTokensCss,
  "cd-tokens.generated.json": vendoredTokensJson,
};

/**
 * The names the sheet read on the page it was measured on: 22 colour aliases and 2 font names of
 * that page's ui-kit, which nothing in the suite defines.
 */
const NAMES_OF_THE_MEASURED_PAGE = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--canvas-background",
  "--secondary",
  "--muted-foreground",
  "--border",
  "--input",
  "--ring",
  "--link",
  "--primary",
  "--primary-hover",
  "--primary-foreground",
  "--accent",
  "--destructive",
  "--destructive-soft",
  "--success",
  "--success-soft",
  "--warning",
  "--warning-soft",
  "--info",
  "--designiq-font-sans",
  "--designiq-font-mono",
];

/** The light value each colour alias had on the measured page, which its role must still give. */
const LIGHT_VALUE_OF_ALIAS: Record<string, string> = {
  "--board-background": "#FFFFFF",
  "--board-foreground": "#1D1D1D",
  "--board-card": "#FFFFFF",
  "--board-card-foreground": "#1D1D1D",
  "--board-canvas-background": "#FFFFFF",
  "--board-secondary": "#F9F7F7",
  "--board-muted-foreground": "#6B6666",
  "--board-border": "#E6E2E2",
  "--board-input": "#8F8A8A",
  "--board-ring": "#2B50D4",
  "--board-link": "#2B50D4",
  "--board-primary": "#335DE5",
  "--board-primary-hover": "#2B50D4",
  "--board-primary-foreground": "#FFFFFF",
  "--board-destructive": "#CD1839",
  "--board-destructive-soft": "#FBEEF0",
  "--board-success": "#00E676",
  "--board-success-soft": "#DAFBEB",
  "--board-warning": "#FFB000",
  "--board-warning-soft": "#FFF1D2",
  "--board-info": "#335DE5",
};

/** Guide §8: the hover and the text of a primary button are the same in both modes. */
const FIXED_ALIASES = ["--board-primary-hover", "--board-primary-foreground"];

const FONT_STACKS: Record<string, string> = {
  "--board-font-sans":
    '"Geist Variable", Geist, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  "--board-font-mono":
    '"Geist Mono Variable", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** Set by the canvas on the two edge layers, never declared in a sheet. */
const SET_BY_THE_CANVAS = ["--board-zoom"];

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function variablesRead(source: string): string[] {
  return [...withoutComments(source).matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]!);
}

/** The `--name: value` declarations of the first `.board-root` rule: the alias block. */
function readAliases(): Record<string, string> {
  const block = /\.board-root\s*\{([^}]*)\}/.exec(withoutComments(boardCss));
  if (!block) throw new Error("board.css has no rule on .board-root");
  const aliases: Record<string, string> = {};
  for (const match of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    aliases[match[1]!] = match[2]!.trim().replace(/\s+/g, " ");
  }
  return aliases;
}

/** The light value of `var(--cd-…)`: a role through `hell`, a fixed token through `fest`. */
function lightValueOf(expression: string): string {
  const token = /^var\((--cd-[\w-]+)\)$/.exec(expression)?.[1];
  if (token === undefined) throw new Error(`not one token: ${expression}`);
  const value = token.startsWith("--cd-ui-") ? tokens.hell[token] : tokens.fest[token];
  if (value === undefined) throw new Error(`${token} is not in cd-tokens.generated.json`);
  return value.toUpperCase();
}

describe("theme.sync: the board's sheets take every colour from the roles", () => {
  it.each(Object.entries(SHEETS))(
    "%s declares no colour literal: no hex, rgb() or hsl() value",
    (_name, css) => {
      expect(withoutComments(css)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    },
  );

  it("reads only roles, mode-independent tokens and the fixed values of guide §8's buttons", () => {
    const used = Object.values(SHEETS)
      .flatMap(variablesRead)
      .filter((name) => name.startsWith("--cd-"));
    expect(used.length).toBeGreaterThan(40);
    for (const token of used) {
      expect(token).toMatch(
        /^--cd-(ui-[\w-]+|radius-\w+|shadow-\d|ease(-out)?|motion-\w+|blau|blau-link|weiss|danger)$/,
      );
    }
  });

  it("reads every role and token by a name the vendored tokens define", () => {
    const defined = new Set(
      [...vendoredTokensCss.matchAll(/(--cd-[\w-]+)\s*:/g)].map((match) => match[1]!),
    );
    const used = Object.values(SHEETS)
      .flatMap(variablesRead)
      .filter((name) => name.startsWith("--cd-"));
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });

  it("reads no name of the page it was measured on", () => {
    const used = new Set(Object.values(SHEETS).flatMap(variablesRead));
    expect(NAMES_OF_THE_MEASURED_PAGE).toHaveLength(24);
    expect(NAMES_OF_THE_MEASURED_PAGE.filter((name) => used.has(name))).toEqual([]);
  });

  it("reads no --board-* name that the alias block does not declare", () => {
    const declared = new Set([...Object.keys(readAliases()), ...SET_BY_THE_CANVAS]);
    const used = Object.values(SHEETS)
      .flatMap(variablesRead)
      .filter((name) => name.startsWith("--board-"));
    expect(used.length).toBeGreaterThan(100);
    expect([...new Set(used)].filter((name) => !declared.has(name))).toEqual([]);
  });
});

describe("theme.sync: the alias block keeps the light picture the sheet was measured with", () => {
  const aliases = readAliases();

  it("declares the 22 colour aliases and the 2 font aliases, and nothing else", () => {
    expect(Object.keys(aliases).sort()).toEqual(
      [...Object.keys(LIGHT_VALUE_OF_ALIAS), "--board-accent", ...Object.keys(FONT_STACKS)].sort(),
    );
    expect(Object.keys(aliases)).toHaveLength(NAMES_OF_THE_MEASURED_PAGE.length);
  });

  it.each(Object.entries(LIGHT_VALUE_OF_ALIAS))("%s resolves to %s in light", (alias, value) => {
    expect(lightValueOf(aliases[alias]!)).toBe(value);
  });

  it("reads a role wherever the design system has one", () => {
    for (const alias of Object.keys(LIGHT_VALUE_OF_ALIAS)) {
      const fixed = FIXED_ALIASES.includes(alias);
      expect(aliases[alias], alias).toMatch(fixed ? /^var\(--cd-(?!ui-)/ : /^var\(--cd-ui-/);
    }
  });

  it("mixes the hover ground from the role of the primary colour, as the measured page did", () => {
    const mixed = /^color-mix\(in srgb, (var\(--cd-ui-[\w-]+\)) 10%, transparent\)$/.exec(
      aliases["--board-accent"]!,
    );
    expect(mixed, aliases["--board-accent"]).not.toBeNull();
    expect(lightValueOf(mixed![1]!)).toBe(LIGHT_VALUE_OF_ALIAS["--board-primary"]);
  });

  it.each(Object.entries(FONT_STACKS))("%s is the measured page's stack", (alias, stack) => {
    expect(aliases[alias]).toBe(stack);
  });
});

describe("theme.sync: board.css wires the tokens, React Flow's sheet and its base", () => {
  it("starts with the tokens (layered), React Flow (unlayered) and the base (layered)", () => {
    const statements = withoutComments(boardCss)
      .split(/;|\{/)
      .map((statement) => statement.trim().replace(/\s+/g, " "));
    expect(statements.slice(0, 4)).toEqual([
      '@import "../theme/cd-tokens.generated.css" layer(board-tokens)',
      '@import "@xyflow/react/dist/style.css"',
      '@import "./board-base.css" layer(board-base)',
      ".board-root",
    ]);
    expect(boardCss.match(/@import/g)).toHaveLength(3);
    expect(baseCss).not.toMatch(/@import/);
  });
});

describe("theme.sync: the vendored files are unchanged copies (.miragon/brand-assets.yaml)", () => {
  for (const [file, source] of Object.entries(VENDORED_FILES)) {
    it(`${file} is byte-identical to the copy brand-assets.mjs recorded`, () => {
      const recorded = BRAND_ASSET_CHECKSUMS.get(`${THEME_DIRECTORY}/${file}`);
      expect(recorded).toMatch(/^[0-9a-f]{64}$/);
      expect(createHash("sha256").update(source, "utf8").digest("hex")).toBe(recorded);
    });
  }

  it("the theme folder holds the two token files and no cd-canvas.css", () => {
    const folder = fileURLToPath(new URL("../src/theme/", import.meta.url));
    expect(readdirSync(folder).sort()).toEqual(Object.keys(VENDORED_FILES).sort());
  });

  it("the JSON is the generated file, with the light roles the aliases resolve through", () => {
    expect(vendoredTokensJson.startsWith('{\n  "$description": "AUTOMATISCH GENERIERT')).toBe(true);
    expect(Object.keys(tokens)).toEqual([
      "$description",
      "hell",
      "dunkel",
      "hochkontrast",
      "fest",
      "shell",
    ]);
    expect(Object.keys(tokens.hell).length).toBeGreaterThan(20);
  });
});
