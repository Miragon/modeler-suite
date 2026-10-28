import { beforeEach, describe, expect, it, vi } from "vitest";
import { MIRAGON } from "@miragon/context-maps-renderer";
import { svgToPng } from "@miragon/modeler-shell/export";
import type * as ShellExport from "@miragon/modeler-shell/export";
import { EMBED_KEYWORD, decodeDoc, pngExtractText } from "../src/png.js";
import { blobToBase64, svgToEmbeddedPng } from "../src/webview/io.js";
import { PNG_SIGNATURE, pngChunk } from "./pngChunks.js";

vi.mock("@miragon/modeler-shell/export", async (importOriginal) => ({
  ...(await importOriginal<typeof ShellExport>()),
  svgToPng: vi.fn(),
}));

const MAP = '{"title":"Shop"}';

function rasterisedPng(): Blob {
  const bytes = new Uint8Array([...PNG_SIGNATURE, ...pngChunk("IEND", new Uint8Array())]);
  return new Blob([bytes], { type: "image/png" });
}

async function embeddedMap(blob: Blob): Promise<string | undefined> {
  const bytes = new Uint8Array(Buffer.from(await blobToBase64(blob), "base64"));
  const embedded = pngExtractText(bytes, EMBED_KEYWORD);
  return embedded === null ? undefined : decodeDoc(embedded);
}

beforeEach(() => vi.mocked(svgToPng).mockReset());

describe("svgToEmbeddedPng", () => {
  it("draws on the light ground with the five Geist subsets and keeps the map in the file", async () => {
    vi.mocked(svgToPng).mockResolvedValue(rasterisedPng());

    const { blob, fontFallback } = await svgToEmbeddedPng("<svg/>", MAP);

    expect(fontFallback).toBe(false);
    expect(await embeddedMap(blob)).toBe(MAP);
    const [svg, options] = vi.mocked(svgToPng).mock.calls[0]!;
    expect(svg).toBe("<svg/>");
    expect(options?.background).toBe(MIRAGON.grau);
    expect(options?.fonts).toHaveLength(5);
  });

  it("reports that Geist could not be embedded and still returns the picture with the map", async () => {
    vi.mocked(svgToPng).mockImplementation((_svg, options) => {
      options?.onFontFallback?.(new Error("the font file answered 404"));
      return Promise.resolve(rasterisedPng());
    });

    const { blob, fontFallback } = await svgToEmbeddedPng("<svg/>", MAP);

    expect(fontFallback).toBe(true);
    expect(await embeddedMap(blob)).toBe(MAP);
  });
});
