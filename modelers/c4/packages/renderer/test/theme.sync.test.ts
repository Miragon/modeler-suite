import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLORS, FONT, ROLE_LIGHT, SELF_SET_TEXT } from "../src/draw/styles.js";

/**
 * Drift guard: `assets/c4.css` reads the design-system roles only, and the files in `theme/` are
 * complete, unchanged copies of the design system's assets. A partial re-copy, a hand edit or a
 * colour of the stylesheet's own fails here instead of in review.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const css = readSource("../src/assets/c4.css");
const vendoredTokensCss = readSource("../src/theme/cd-tokens.generated.css");
const vendoredCanvasCss = readSource("../src/theme/cd-canvas.css");
const vendoredTokensJson = readSource("../src/theme/cd-tokens.generated.json");

interface VendoredTokens {
  hell: Record<string, string>;
  dunkel: Record<string, string>;
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

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("theme.sync: c4.css takes every colour from the roles", () => {
  it("declares no colour literal: no hex, rgb() or hsl() value", () => {
    expect(withoutComments(css)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it("reads only roles and mode-independent tokens, never a fixed palette colour", () => {
    const used = [...withoutComments(css).matchAll(/var\((--cd-[\w-]+)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(0);
    for (const token of used) {
      expect(token).toMatch(
        /^--cd-(ui-[\w-]+|radius-\w+|shadow-\d|ease(-out)?|motion-\w+|shell-(rand|zeile|ziel|frei))$/,
      );
    }
  });

  it("starts with the tokens (layered), diagram-js and cd-canvas (unlayered), in this order", () => {
    const imports = [...withoutComments(css).matchAll(/@import\s+([^;]+);/g)].map((match) =>
      match[1]!.trim().replace(/\s+/g, " "),
    );
    expect(imports).toEqual([
      '"../theme/cd-tokens.generated.css" layer(c4-tokens)',
      '"diagram-js/assets/diagram-js.css"',
      '"../theme/cd-canvas.css"',
    ]);
  });

  it("paints the surround in --cd-ui-grund with the dot grid in --cd-ui-linie (guide §10.1)", () => {
    const container = /\.c4-container\s*\{([^}]*)\}/.exec(withoutComments(css));
    expect(container?.[1]).toMatch(/background-color:\s*var\(--cd-ui-grund\);/);
    expect(container?.[1]).toMatch(
      /background-image:\s*radial-gradient\(var\(--cd-ui-linie\) 1px, transparent 1px\);/,
    );
  });
});

describe("theme.sync: the vendored files are complete, unchanged copies (design system 1.27.0)", () => {
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

  it("cd-canvas.css maps diagram-js onto roles the tokens define", () => {
    const roles = [...withoutComments(vendoredCanvasCss).matchAll(/var\((--cd-ui-[\w-]+)/g)].map(
      (match) => match[1]!,
    );
    expect(roles.length).toBeGreaterThan(10);
    for (const role of new Set(roles)) {
      expect(Object.keys(tokens.hell), role).toContain(role);
      expect(Object.keys(tokens.dunkel), role).toContain(role);
    }
  });

  it("the renderer's stylesheet reads only roles the tokens define", () => {
    const defined = new Set([
      ...Object.keys(tokens.hell),
      ...Object.keys(tokens.fest),
      ...Object.keys(tokens.shell),
    ]);
    const used = [...withoutComments(css).matchAll(/var\((--cd-ui-[\w-]+)/g)].map((m) => m[1]!);
    for (const role of new Set(used)) expect(defined, role).toContain(role);
  });
});

/** The drawing's own sources: every role class it writes and every colour it could hard-code. */
const DRAWING_FOLDERS = ["draw", "text", "legend"] as const;
const drawingSources = DRAWING_FOLDERS.flatMap((folder) => {
  const directory = new URL(`../src/${folder}/`, import.meta.url);
  return readdirSync(directory)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({
      file: `${folder}/${file}`,
      source: readFileSync(new URL(file, directory), "utf8"),
    }));
});

/** Which property each role class of cd-canvas.css sets. */
const canvasClassProperties = new Map(
  [...withoutComments(vendoredCanvasCss).matchAll(/\.(cd-c-[\w-]+)\s*\{\s*(fill|stroke):/g)].map(
    (match) => [match[1]!, match[2]!],
  ),
);

describe("theme.sync: the drawing paints with roles and their light values (SPEC 6.4)", () => {
  it("ROLE_LIGHT names classes of cd-canvas.css, each with the property the class sets", () => {
    for (const [role, { attribute }] of Object.entries(ROLE_LIGHT)) {
      expect(canvasClassProperties.get(role), role).toBe(attribute);
    }
  });

  it("every ROLE_LIGHT value is the light value of the class's role (hell)", () => {
    for (const [role, { value }] of Object.entries(ROLE_LIGHT)) {
      const variable = new RegExp(`\\.${role}\\s*\\{[^}]*var\\((--cd-ui-[\\w-]+)\\)`).exec(
        withoutComments(vendoredCanvasCss),
      )?.[1];
      expect(variable, role).toBeDefined();
      expect(value, role).toBe(tokens.hell[variable!]);
    }
  });

  it("every role class the drawing, the previews and drawSignature use has a ROLE_LIGHT entry", () => {
    const used = new Set(
      drawingSources.flatMap(({ source }) =>
        [...withoutComments(source).matchAll(/["'](cd-c-[\w-]+)["']/g)].map((match) => match[1]!),
      ),
    );
    expect(used.size).toBeGreaterThan(4);
    for (const role of used) expect(Object.keys(ROLE_LIGHT), role).toContain(role);
  });

  it("writes no colour literal: every colour comes from the vendored tokens or the document", () => {
    for (const { file, source } of drawingSources) {
      expect(withoutComments(source), file).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|var\(/i);
    }
  });

  it("takes the self-set text colours and the hosts' canvas colours from the tokens", () => {
    expect(SELF_SET_TEXT).toEqual({
      dark: tokens.fest["--cd-schwarz"],
      light: tokens.fest["--cd-weiss"],
    });
    expect(COLORS).toEqual({
      ink: tokens.hell["--cd-ui-text"],
      fill: tokens.hell["--cd-ui-plot"],
      paper: tokens.hell["--cd-ui-grund"],
    });
  });

  // @fontsource-variable/geist registers the face as 'Geist Variable'; a bare 'Geist' never matches.
  it("names the fontsource family first on the canvas, as the container's stack does", () => {
    expect(FONT.family.startsWith("'Geist Variable', 'Geist',")).toBe(true);
    expect(withoutComments(css)).toMatch(/font-family:\s*"Geist Variable",\s*"Geist",/);
  });
});
