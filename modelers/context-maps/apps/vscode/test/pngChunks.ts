import { crc32 } from "node:zlib";

/*
 * A PNG reader and chunk writer of the tests' own, on Node's CRC-32, so the checks of png.ts do
 * not trust the CRC table they check.
 */

export const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export interface PngChunk {
  type: string;
  data: Uint8Array;
  /** The CRC the file stores equals the CRC-32 of the chunk's type and data. */
  crcValid: boolean;
}

/** One chunk as an encoder writes it: length, type, data, CRC. */
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(latin1Bytes(type), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

/** A tEXt chunk's data: the keyword, a zero byte, the text. */
export function textChunkData(keyword: string, text: string): Uint8Array {
  return Uint8Array.from([...latin1Bytes(keyword), 0, ...latin1Bytes(text)]);
}

/** The chunks of `png` in file order. Throws without the signature or on a chunk cut short. */
export function pngChunks(png: Uint8Array): PngChunk[] {
  if (!PNG_SIGNATURE.every((byte, index) => png[index] === byte)) {
    throw new Error("The bytes do not start with the PNG signature.");
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < png.length) {
    if (offset + 12 > png.length) throw new Error(`The chunk at byte ${offset} is cut short.`);
    const length = view.getUint32(offset);
    const crcOffset = offset + 8 + length;
    if (crcOffset + 4 > png.length) {
      throw new Error(`The chunk at byte ${offset} runs past the end of the file.`);
    }
    const typeAndData = png.subarray(offset + 4, crcOffset);
    chunks.push({
      type: latin1Text(typeAndData.subarray(0, 4)),
      data: typeAndData.subarray(4),
      crcValid: view.getUint32(crcOffset) === crc32(typeAndData),
    });
    offset = crcOffset + 4;
  }
  return chunks;
}

/** The text of every tEXt chunk with `keyword`, in file order. */
export function textChunksWith(png: Uint8Array, keyword: string): string[] {
  const prefix = [...latin1Bytes(keyword), 0];
  return pngChunks(png)
    .filter(
      (chunk) => chunk.type === "tEXt" && prefix.every((byte, index) => chunk.data[index] === byte),
    )
    .map((chunk) => latin1Text(chunk.data.subarray(prefix.length)));
}

function latin1Bytes(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(text, "latin1"));
}

function latin1Text(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
}
