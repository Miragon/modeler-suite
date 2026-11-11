import { MAX_TEXT_LENGTH } from "@miragon/business-model-canvas-dsl";

/**
 * The share link: the canvas's canonical text, compressed (deflate-raw, browser-native, so no
 * CDN) as URL-safe Base64 in the hash, as the other Miragon web apps write it (`#mz=`). A link
 * shares an editable canvas, not a picture.
 */

const HASH_PREFIX = "#mz=";

/** The longest text the canvas reads; it stops a link that inflates to gigabytes early. */
const LONGEST_SHARED_TEXT = MAX_TEXT_LENGTH;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64: string): Uint8Array {
  let normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  if (padding) normalized += "=".repeat(4 - padding);
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function pipe(
  bytes: Uint8Array,
  stream: ReadableWritablePair,
  longest = Number.POSITIVE_INFINITY,
): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    length += read.value.length;
    if (length > longest) {
      await reader.cancel();
      throw new RangeError(`the shared canvas is longer than ${longest} bytes`);
    }
    chunks.push(read.value);
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

/** UTF-8 -> deflate-raw -> URL-safe Base64. */
export async function encodeDocument(text: string): Promise<string> {
  const deflated = await pipe(new TextEncoder().encode(text), new CompressionStream("deflate-raw"));
  return toBase64Url(deflated);
}

/** URL-safe Base64 -> inflate -> UTF-8. */
export async function decodeDocument(encoded: string): Promise<string> {
  const inflated = await pipe(
    fromBase64Url(encoded),
    new DecompressionStream("deflate-raw"),
    LONGEST_SHARED_TEXT,
  );
  return new TextDecoder().decode(inflated);
}

/** Whether the hash carries a canvas at all, readable or not (a link cut off when copied). */
export function hashHoldsDocument(): boolean {
  return location.hash.startsWith(HASH_PREFIX);
}

/** The document text in the hash, or null when there is none or it cannot be decoded. */
export async function readHashDocument(): Promise<string | null> {
  if (!hashHoldsDocument()) return null;
  try {
    return await decodeDocument(location.hash.slice(HASH_PREFIX.length));
  } catch {
    return null;
  }
}

/** The hash that carries `text`. */
export async function documentHash(text: string): Promise<string> {
  return HASH_PREFIX + (await encodeDocument(text));
}

/** The whole link to this page with `text` in its hash. */
export async function shareUrl(text: string): Promise<string> {
  return `${location.origin}${location.pathname}${await documentHash(text)}`;
}
