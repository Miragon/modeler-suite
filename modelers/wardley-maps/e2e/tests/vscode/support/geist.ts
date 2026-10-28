import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { EMBEDDED_GEIST } from "../../support/svg-images.js";

// Resolved from the extension, so these are the files its geist-faces.ts bundles.
const fontsource = dirname(
  createRequire(new URL("../../../../apps/vscode/package.json", import.meta.url)).resolve(
    "@fontsource-variable/geist/package.json",
  ),
);

/** Each subset's `unicode-range` as fontsource itself declares it, by subset name. */
const SUBSET_RANGES = JSON.parse(readFileSync(join(fontsource, "unicode.json"), "utf8")) as Record<
  string,
  string
>;

/** Each Geist font file's name, by its content in Base64. */
const FILES_BY_CONTENT = new Map(
  readdirSync(join(fontsource, "files"))
    .filter((name) => name.endsWith(".woff2"))
    .map((name) => [readFileSync(join(fontsource, "files", name)).toString("base64"), name]),
);

export type GeistStyle = "normal" | "italic";

export interface EmbeddedGeistFace {
  /** The fontsource subset whose `unicode-range` the face declares. */
  readonly subset: string | undefined;
  readonly style: string | undefined;
  /** The fontsource file whose bytes the face's data: URL holds. */
  readonly file: string | undefined;
}

/**
 * The Geist faces an exported SVG carries inline, in its order, each told apart by fontsource's
 * own subset ranges and files rather than by the extension's: a face with no range of a subset, a
 * file that is not a Geist file, or the file of another subset or style differs from
 * {@link geistFace}.
 */
export function embeddedGeistFaces(svg: string): EmbeddedGeistFace[] {
  return Array.from(svg.matchAll(/@font-face\{([^}]*)\}/g), ([, rule = ""]) => rule)
    .filter((rule) => rule.includes(EMBEDDED_GEIST.family))
    .map((rule) => {
      const range = /unicode-range:([^;]+)/.exec(rule)?.[1];
      const content = /src:url\("data:font\/woff2;base64,([A-Za-z0-9+/]+=*)"\)/.exec(rule)?.[1];
      return {
        subset: Object.keys(SUBSET_RANGES).find((subset) => SUBSET_RANGES[subset] === range),
        style: /font-style:([a-z]+)/.exec(rule)?.[1],
        file: content === undefined ? undefined : FILES_BY_CONTENT.get(content),
      };
    });
}

/** A face of `subset` in `style` that carries that subset's own file. */
export function geistFace(subset: string, style: GeistStyle): EmbeddedGeistFace {
  return { subset, style, file: `geist-${subset}-wght-${style}.woff2` };
}
