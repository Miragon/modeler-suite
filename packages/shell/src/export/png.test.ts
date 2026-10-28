/// <reference types="vite/client" />
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import latinUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import latinExtUrl from "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?url";
import { afterEach, describe, expect, it, vi } from "vitest";
import tokens from "../../fixtures/tokens/cd-tokens.generated.json" with { type: "json" };
import {
  FALLBACK_FAMILY,
  LABEL,
  canvasInkWidth,
  fileAsDataUrl,
  inkWidth,
  labelSvg,
  pixelAt,
  pngPixels,
} from "../../test/support/png-pixels.js";
import { GEIST_UNICODE_RANGES, svgToPng } from "./index.js";
import { pngSize } from "./png.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const PLOT = tokens.hell["--cd-ui-plot"];
const GRUND = tokens.hell["--cd-ui-grund"];

function sized(attributes: string): string {
  return `<svg xmlns="${SVG_NAMESPACE}" ${attributes}><rect x="10" y="10" width="20" height="20"/></svg>`;
}

async function dimensions(png: Blob): Promise<[number, number]> {
  const bitmap = await createImageBitmap(png);
  const size: [number, number] = [bitmap.width, bitmap.height];
  bitmap.close();
  return size;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("svgToPng: size and background", () => {
  it("draws the SVG at twice its size, or at the scale it is given", async () => {
    const svg = sized('width="120" height="80"');
    const png = await svgToPng(svg, { background: GRUND });
    expect(png.type).toBe("image/png");
    expect(await dimensions(png)).toEqual([240, 160]);
    expect(await dimensions(await svgToPng(svg, { background: "transparent", scale: 4 }))).toEqual([
      480, 320,
    ]);
  });

  it("takes the size from the viewBox where the root has no width and height in pixels, else 1000 × 700", async () => {
    const options = { background: PLOT, fonts: [] };
    expect(await dimensions(await svgToPng(sized('viewBox="0 0 300 100"'), options))).toEqual([
      600, 200,
    ]);
    expect(
      await dimensions(
        await svgToPng(sized('width="100%" height="100%" viewBox="0 0 300 100"'), options),
      ),
    ).toEqual([600, 200]);
    expect(await dimensions(await svgToPng(sized(""), options))).toEqual([2000, 1400]);
  });

  it("takes the other side from the viewBox's ratio where the root has only one side in pixels", async () => {
    const options = { background: PLOT, fonts: [] };
    expect(
      await dimensions(await svgToPng(sized('width="150" viewBox="0 0 300 100"'), options)),
    ).toEqual([300, 100]);
    expect(
      await dimensions(
        await svgToPng(sized('width="100%" height="50" viewBox="0 0 300 100"'), options),
      ),
    ).toEqual([300, 100]);
  });

  it("fills the background it is given (guide §10.7), and none for the transparent variant", async () => {
    const svg = sized('width="40" height="40"');
    const corner = async (background: string): Promise<number[]> =>
      pixelAt(await pngPixels(await svgToPng(svg, { background })), 0, 0);
    expect(await corner(PLOT)).toEqual([255, 255, 255, 255]);
    expect(await corner(GRUND)).toEqual([249, 247, 247, 255]);
    expect((await corner("transparent"))[3]).toBe(0);
    expect(await corner("black")).toEqual([0, 0, 0, 255]);
    const drawing = pixelAt(await pngPixels(await svgToPng(svg, { background: GRUND })), 40, 40);
    expect(drawing).toEqual([0, 0, 0, 255]);
  });

  it("refuses a scale that is no positive number and an SVG that does not parse", async () => {
    const svg = sized('width="10" height="10"');
    for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(svgToPng(svg, { background: PLOT, scale })).rejects.toThrow(RangeError);
    }
    await expect(svgToPng("<svg", { background: PLOT })).rejects.toThrow(/does not parse/);
  });

  it("refuses a background a canvas cannot fill, which would leave it black, also what CSS.supports accepts", async () => {
    const svg = sized('width="10" height="10"');
    const refused = [
      "--cd-ui-plot",
      "var(--cd-ui-grund)",
      "inherit",
      "initial",
      "unset",
      "currentcolor",
      "light-dark(white, black)",
    ];
    for (const background of refused) {
      await expect(svgToPng(svg, { background, fonts: [] }), background).rejects.toThrow(
        /no colour a canvas fills/,
      );
    }
  });
});

describe("svgToPng: loading", () => {
  it("loads the SVG as a data: URL, never as a blob: URL a widget's CSP would refuse", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const sources: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(function (
      this: HTMLImageElement,
      value: string,
    ) {
      sources.push(value);
      descriptor?.set?.call(this, value);
    });
    await svgToPng(await labelSvg("Tea"), { background: PLOT });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
  });

  it("awaits image.decode() after load and before drawing, since load can fire before a font is ready", async () => {
    const drawImage = vi.spyOn(CanvasRenderingContext2D.prototype, "drawImage");
    const decodeOriginal = HTMLImageElement.prototype.decode;
    const seenByDecode: { loaded: boolean; drawnBeforeDecoded: number }[] = [];
    const decode = vi
      .spyOn(HTMLImageElement.prototype, "decode")
      .mockImplementation(async function (this: HTMLImageElement) {
        const loaded = this.complete && this.naturalWidth > 0;
        await decodeOriginal.call(this);
        await new Promise((resolve) => setTimeout(resolve, 50));
        seenByDecode.push({ loaded, drawnBeforeDecoded: drawImage.mock.calls.length });
      });
    await svgToPng(await labelSvg("Tea"), { background: PLOT });
    expect(decode).toHaveBeenCalledOnce();
    expect(seenByDecode).toEqual([{ loaded: true, drawnBeforeDecoded: 0 }]);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(drawImage.mock.calls[0]?.[0]).toBe(decode.mock.contexts[0]);
  });

  it("draws text with a lone surrogate, as diagram-js leaves where it breaks a word inside an emoji", async () => {
    const svg = `<svg xmlns="${SVG_NAMESPACE}" width="60" height="20"><text y="15">Tea \uD83D</text></svg>`;
    expect(await dimensions(await svgToPng(svg, { background: GRUND, fonts: [] }))).toEqual([
      120, 40,
    ]);
  });

  it("draws a canvas the browser refuses again at iOS Safari's limit, and fails when that is refused too", async () => {
    const svg = sized('width="2100" height="2000"');
    const drawn: [number, number][] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      drawn.push([this.width, this.height]);
      callback(drawn.length === 1 ? null : new Blob(["png"], { type: "image/png" }));
    });
    expect(await (await svgToPng(svg, { background: GRUND, fonts: [] })).text()).toBe("png");
    const smaller = pngSize({ width: 2100, height: 2000 }, 2, 2 ** 24);
    expect(drawn).toEqual([
      [4200, 4000],
      [smaller.width, smaller.height],
    ]);
    expect(smaller.width * smaller.height).toBeLessThanOrEqual(2 ** 24);

    drawn.length = 0;
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      drawn.push([this.width, this.height]);
      callback(null);
    });
    await expect(
      svgToPng(sized('width="10" height="10"'), { background: GRUND, fonts: [] }),
    ).rejects.toThrow(/refused/);
    expect(drawn).toEqual([[20, 20]]);
  }, 30_000);
});

describe("svgToPng: Geist", () => {
  const SCALE = 2;

  /** The label as the page itself draws it on a canvas, in Geist and in the fallback. */
  async function pageDrawings(label: string): Promise<{ geist: number; fallback: number }> {
    const geist = await canvasInkWidth(label, "'Geist Variable'", SCALE);
    const fallback = await canvasInkWidth(label, FALLBACK_FAMILY, SCALE);
    // a label whose fonts lie close together could not tell them apart
    expect(
      Math.abs(geist - fallback),
      `Geist ${geist} px, fallback ${fallback} px`,
    ).toBeGreaterThan(40);
    return { geist, fallback };
  }

  /**
   * The PNG's label is far nearer one drawing than the other. The canvas and an SVG image round
   * glyph positions differently (WebKit on Linux: 3 px over 25 glyphs), so an exact width would be
   * flaky; one subset in the fallback moves the label by a third of the gap or more.
   */
  async function expectNearer(png: Blob, near: number, far: number): Promise<void> {
    const width = inkWidth(await pngPixels(png));
    expect(
      4 * Math.abs(width - near),
      `PNG ${width} px, expected near ${near} px, far from ${far} px`,
    ).toBeLessThan(Math.abs(width - far));
  }

  it("draws the labels in Geist from the page's own faces, where without them they fall back", async () => {
    const label = "Tier 1 Support 1111";
    const { geist, fallback } = await pageDrawings(label);
    const svg = await labelSvg(label);
    const onFontFallback = vi.fn();
    await expectNearer(await svgToPng(svg, { background: PLOT, onFontFallback }), geist, fallback);
    await expectNearer(await svgToPng(svg, { background: PLOT, fonts: [] }), fallback, geist);
    expect(onFontFallback).not.toHaveBeenCalled();
  });

  it("loads every subset a label needs, also one only a later character asks for", async () => {
    // latin-ext after latin
    const label = "Kettle from Łódź łłłłłłłł";
    const { geist, fallback } = await pageDrawings(label);
    const svg = await labelSvg(label);
    await expectNearer(await svgToPng(svg, { background: GRUND }), geist, fallback);
  });

  it("embeds faces given as data: URLs without a fetch, as a VS Code webview without connect-src needs", async () => {
    const fonts = [
      { src: await fileAsDataUrl(latinExtUrl), unicodeRange: GEIST_UNICODE_RANGES.latinExt },
      { src: await fileAsDataUrl(latinUrl), unicodeRange: GEIST_UNICODE_RANGES.latin },
    ];
    const label = "Sold in Łódź łłłłłłłł 11";
    const { geist, fallback } = await pageDrawings(label);
    const svg = await labelSvg(label);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("refused by connect-src"));
    const png = await svgToPng(svg, { background: GRUND, fonts });
    expect(fetchSpy).not.toHaveBeenCalled();
    await expectNearer(png, geist, fallback);
  });

  it("draws in the fallback, and tells the caller, when a font file cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const label = "Tier 1 Support 1111";
    const { geist, fallback } = await pageDrawings(label);
    const svg = await labelSvg(label);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    const onFontFallback = vi.fn();
    const png = await svgToPng(svg, {
      background: PLOT,
      fonts: [
        { src: "/fonts/missing/geist-latin.woff2", unicodeRange: GEIST_UNICODE_RANGES.latin },
      ],
      onFontFallback,
    });
    expect(onFontFallback).toHaveBeenCalledOnce();
    expect(String(onFontFallback.mock.calls[0]?.[0])).toMatch(/answered 404/);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/falls back to the system sans/);
    expect((await pngPixels(png)).width).toBe(LABEL.width * SCALE);
    await expectNearer(png, fallback, geist);
  });
});

describe("pngSize", () => {
  it("is the size times the scale while the canvas stays within the limit", () => {
    expect(pngSize({ width: 1190, height: 776 }, 2, 2 ** 27)).toEqual({
      width: 2380,
      height: 1552,
    });
    expect(pngSize({ width: 100.25, height: 50.5 }, 2, 2 ** 27)).toEqual({
      width: 201,
      height: 101,
    });
  });

  it("lowers the scale in proportion to stay within the pixels in all and per side", () => {
    const large = pngSize({ width: 5110, height: 5096 }, 4, 2 ** 27);
    expect(large.width * large.height).toBeLessThanOrEqual(2 ** 27);
    expect(large.width / large.height).toBeCloseTo(5110 / 5096, 2);
    const ios = pngSize({ width: 5110, height: 5096 }, 2, 2 ** 24);
    expect(ios.width * ios.height).toBeLessThanOrEqual(2 ** 24);
    expect(pngSize({ width: 20_000, height: 300 }, 4, 2 ** 27)).toEqual({
      width: 32_767,
      height: 491,
    });
    expect(pngSize({ width: 0.1, height: 0.1 }, 2, 2 ** 27)).toEqual({ width: 1, height: 1 });
  });
});
