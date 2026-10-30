/// <reference types="vite/client" />
// The Wardley Maps apps load the italic faces too, for notes and axis captions. A file of its own,
// since svgToPng embeds the page's faces by default and png.test.ts keeps the upright-only page of
// the other modelers.
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist/wght-italic.css";
import "@fontsource-variable/geist-mono/wght.css";
import latinExtItalicUrl from "@fontsource-variable/geist/files/geist-latin-ext-wght-italic.woff2?url";
import latinExtUrl from "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?url";
import latinItalicUrl from "@fontsource-variable/geist/files/geist-latin-wght-italic.woff2?url";
import latinUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import { afterEach, describe, expect, it, vi } from "vitest";
import tokens from "../../fixtures/tokens/cd-tokens.generated.json" with { type: "json" };
import {
  FALLBACK_FAMILY,
  canvasInkWidth,
  expectNearer,
  fileAsDataUrl,
  labelSvg,
  type LabelStyle,
} from "../../test/support/png-pixels.js";
import { GEIST_UNICODE_RANGES, pageGeistFaces, svgToPng, type GeistFace } from "./index.js";

const PLOT = tokens.hell["--cd-ui-plot"];
const SCALE = 2;
const STYLES: readonly LabelStyle[] = ["italic", "normal"];

/**
 * Latin-ext after latin, as in png.test.ts, and enough of it that the latin-ext subset of either
 * style in the fallback moves the label: two such glyphs alone stay within expectNearer's margin.
 * Geist Italic draws z and ź, x and the digits 1, 3 and 7 narrower than the upright Geist does, so
 * the label tells the two styles apart, also the upright faces that the browser slants where no
 * italic face is embedded.
 */
const LABEL_TEXT = "Tax zone from Łódź 1737 źźźźźźźź";

type PageDrawings = Record<LabelStyle, { readonly geist: number; readonly fallback: number }>;

/** The label as the page itself draws it on a canvas, in each style: in Geist and in the fallback. */
async function pageDrawings(label: string): Promise<PageDrawings> {
  const drawing = async (style: LabelStyle) => ({
    geist: await canvasInkWidth(label, "'Geist Variable'", SCALE, style),
    fallback: await canvasInkWidth(label, FALLBACK_FAMILY, SCALE, style),
  });
  const drawings = { italic: await drawing("italic"), normal: await drawing("normal") };
  // a label whose drawings lie close together could not tell them apart
  expect(
    Math.abs(drawings.italic.geist - drawings.normal.geist),
    `Geist Italic ${drawings.italic.geist} px, upright ${drawings.normal.geist} px`,
  ).toBeGreaterThan(25);
  for (const style of STYLES) {
    const { geist, fallback } = drawings[style];
    expect(
      Math.abs(geist - fallback),
      `${style}: Geist ${geist} px, fallback ${fallback} px`,
    ).toBeGreaterThan(40);
  }
  return drawings;
}

/** The PNG's label is in Geist of its own style: far nearer it than the other style or the fallback. */
async function expectGeistIn(style: LabelStyle, png: Blob, drawings: PageDrawings): Promise<void> {
  const other = style === "italic" ? "normal" : "italic";
  await expectNearer(png, drawings[style].geist, drawings[other].geist);
  await expectNearer(png, drawings[style].geist, drawings[style].fallback);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("svgToPng: upright and italic Geist", () => {
  it("draws an italic label in Geist Italic and an upright one upright from the page's faces, where the upright faces alone slant the italic label", async () => {
    const drawings = await pageDrawings(LABEL_TEXT);
    const faces = pageGeistFaces();
    expect(faces.map((face) => face.style)).toEqual([
      ...Array<string>(5).fill("normal"),
      ...Array<string>(5).fill("italic"),
    ]);
    const onFontFallback = vi.fn();
    for (const style of STYLES) {
      const png = await svgToPng(await labelSvg(LABEL_TEXT, style), {
        background: PLOT,
        onFontFallback,
      });
      await expectGeistIn(style, png, drawings);
    }
    expect(onFontFallback).not.toHaveBeenCalled();

    const italicSvg = await labelSvg(LABEL_TEXT, "italic");
    const uprightFaces = faces.filter((face) => face.style === "normal");
    await expectNearer(
      await svgToPng(italicSvg, { background: PLOT, fonts: uprightFaces }),
      drawings.normal.geist,
      drawings.italic.geist,
    );
    await expectNearer(
      await svgToPng(italicSvg, { background: PLOT, fonts: [] }),
      drawings.italic.fallback,
      drawings.italic.geist,
    );
  });

  it("draws each label in its own style from faces given as data: URLs, upright first as the Wardley Maps webview passes them", async () => {
    const fonts: GeistFace[] = [
      { src: await fileAsDataUrl(latinExtUrl), unicodeRange: GEIST_UNICODE_RANGES.latinExt },
      { src: await fileAsDataUrl(latinUrl), unicodeRange: GEIST_UNICODE_RANGES.latin },
      {
        src: await fileAsDataUrl(latinExtItalicUrl),
        unicodeRange: GEIST_UNICODE_RANGES.latinExt,
        style: "italic",
      },
      {
        src: await fileAsDataUrl(latinItalicUrl),
        unicodeRange: GEIST_UNICODE_RANGES.latin,
        style: "italic",
      },
    ];
    const drawings = await pageDrawings(LABEL_TEXT);
    const svgs = {
      italic: await labelSvg(LABEL_TEXT, "italic"),
      normal: await labelSvg(LABEL_TEXT, "normal"),
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("refused by connect-src"));
    for (const style of STYLES) {
      await expectGeistIn(
        style,
        await svgToPng(svgs[style], { background: PLOT, fonts }),
        drawings,
      );
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
