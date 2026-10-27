import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_DOCUMENT,
  parseDocumentText,
  serializeDocumentText,
} from "@miragon/context-maps-schema-model";
import { EXAMPLE_MAP } from "../src/examples.js";
import { EMBED_KEYWORD, decodeDoc, encodeDoc, pngExtractText, pngInsertText } from "../src/png.js";
import { PNG_SIGNATURE, pngChunk, pngChunks, textChunkData, textChunksWith } from "./pngChunks.js";

const RGBA_8_BIT = Uint8Array.of(8, 6, 0, 0, 0);

/** A 1×1 PNG as an image encoder writes it, with `ancillary` chunks between IDAT and IEND. */
function onePixelPng(...ancillary: Uint8Array[]): Uint8Array {
  const header = new Uint8Array(13);
  const size = new DataView(header.buffer);
  size.setUint32(0, 1);
  size.setUint32(4, 1);
  header.set(RGBA_8_BIT, 8);
  const unfilteredRow = Uint8Array.of(0, 0x24, 0x4b, 0x7a, 0xff);
  const parts = [
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(unfilteredRow)),
    ...ancillary,
    pngChunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

function foreignTextChunk(): Uint8Array {
  return pngChunk("tEXt", textChunkData("Software", "an image editor"));
}

function mapTitled(title: string): string {
  return serializeDocumentText({ ...SAMPLE_DOCUMENT, title });
}

describe("pngInsertText and pngExtractText", () => {
  it("give back the map they embedded", () => {
    const embedded = encodeDoc(EXAMPLE_MAP);
    const png = pngInsertText(onePixelPng(), EMBED_KEYWORD, embedded);
    expect(pngExtractText(png, EMBED_KEYWORD)).toBe(embedded);
    expect(decodeDoc(pngExtractText(png, EMBED_KEYWORD)!)).toBe(EXAMPLE_MAP);
  });

  it("write one tEXt chunk with a valid CRC right before IEND and keep the image's chunks", () => {
    const image = onePixelPng();
    const embedded = encodeDoc(EXAMPLE_MAP);
    const png = pngInsertText(image, EMBED_KEYWORD, embedded);

    expect([...png.subarray(0, PNG_SIGNATURE.length)]).toEqual([...PNG_SIGNATURE]);
    const chunks = pngChunks(png);
    expect(chunks.map((chunk) => chunk.type)).toEqual(["IHDR", "IDAT", "tEXt", "IEND"]);
    expect(chunks.every((chunk) => chunk.crcValid)).toBe(true);
    expect(chunks[2]!.data).toEqual(textChunkData(EMBED_KEYWORD, embedded));
    const imageChunks = pngChunks(image);
    expect(chunks.filter((chunk) => chunk.type !== "tEXt")).toEqual(imageChunks);
    expect(png.length).toBe(image.length + 12 + textChunkData(EMBED_KEYWORD, embedded).length);
  });

  it("replace the map a PNG already carries and keep the text chunks of other tools", () => {
    const first = pngInsertText(
      onePixelPng(foreignTextChunk()),
      EMBED_KEYWORD,
      encodeDoc(mapTitled("First")),
    );
    const second = pngInsertText(first, EMBED_KEYWORD, encodeDoc(mapTitled("Second")));

    expect(decodeDoc(pngExtractText(second, EMBED_KEYWORD)!)).toBe(mapTitled("Second"));
    expect(textChunksWith(second, EMBED_KEYWORD)).toEqual([encodeDoc(mapTitled("Second"))]);
    expect(textChunksWith(second, "Software")).toEqual(["an image editor"]);
    const chunks = pngChunks(second);
    expect(chunks.map((chunk) => chunk.type)).toEqual(["IHDR", "IDAT", "tEXt", "tEXt", "IEND"]);
    expect(chunks.every((chunk) => chunk.crcValid)).toBe(true);
  });

  it("find no map in a PNG without the chunk, even when other tools wrote text chunks", () => {
    expect(pngExtractText(onePixelPng(), EMBED_KEYWORD)).toBeNull();
    expect(pngExtractText(onePixelPng(foreignTextChunk()), EMBED_KEYWORD)).toBeNull();
  });

  it("read back a map longer than one decoding slice of 32 KiB", () => {
    const longMap = mapTitled("x".repeat(100_000));
    const png = pngInsertText(onePixelPng(), EMBED_KEYWORD, encodeDoc(longMap));
    expect(decodeDoc(pngExtractText(png, EMBED_KEYWORD)!)).toBe(longMap);
  });
});

describe("encodeDoc and decodeDoc", () => {
  const title = "Lieferkette über Grenzen: Zürich, Kraków, 東京 🚚";

  it("encode to URL-safe Base64, which a Latin-1 tEXt chunk holds unchanged", () => {
    expect(encodeDoc(mapTitled(title))).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("keep a map title outside ASCII through the PNG", () => {
    const png = pngInsertText(onePixelPng(), EMBED_KEYWORD, encodeDoc(mapTitled(title)));
    const parsed = parseDocumentText(decodeDoc(pngExtractText(png, EMBED_KEYWORD)!));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.document.title).toBe(title);
    expect(decodeDoc(encodeDoc(mapTitled(title)))).toBe(mapTitled(title));
  });
});
