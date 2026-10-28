/**
 * Image export for the webview: SVG/PNG with the scene (native JSON document) EMBEDDED in the file,
 * so exported images can later be reopened as a Team Topologies diagram (idea from Excalidraw).
 *
 * The pure byte/encoding helpers live DOM-free in ../png.ts (also used by the extension host).
 * The rasterization is the shell's `svgToPng`; only the Blob/FileReader plumbing remains here.
 */

import { GEIST_UNICODE_RANGES, svgToPng, type GeistFace } from "@miragon/modeler-shell/export";
import cyrillicExt from "@fontsource-variable/geist/files/geist-cyrillic-ext-wght-normal.woff2?dataurl";
import cyrillic from "@fontsource-variable/geist/files/geist-cyrillic-wght-normal.woff2?dataurl";
import vietnamese from "@fontsource-variable/geist/files/geist-vietnamese-wght-normal.woff2?dataurl";
import latinExt from "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?dataurl";
import latin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?dataurl";
import tokens from "../../../../packages/renderer/src/theme/cd-tokens.generated.json";
import { EMBED_KEYWORD, encodeDoc, pngInsertText } from "../png.js";

/** The webview's CSP has no `connect-src`, so the faces travel inline instead of being fetched. */
const GEIST_FACES: readonly GeistFace[] = [
  { src: cyrillicExt, unicodeRange: GEIST_UNICODE_RANGES.cyrillicExt },
  { src: cyrillic, unicodeRange: GEIST_UNICODE_RANGES.cyrillic },
  { src: vietnamese, unicodeRange: GEIST_UNICODE_RANGES.vietnamese },
  { src: latinExt, unicodeRange: GEIST_UNICODE_RANGES.latinExt },
  { src: latin, unicodeRange: GEIST_UNICODE_RANGES.latin },
];

const PNG_BACKGROUND = tokens.hell["--cd-ui-grund"];

const SVG_ATTR = "data-tt-document";

export function embedSvg(svg: string, doc: string): string {
  return svg.replace(/<svg\b/, `<svg ${SVG_ATTR}="${encodeDoc(doc)}"`);
}

export interface EmbeddedPngOptions {
  /** Called when Geist could not be embedded and the labels came out in the system sans. */
  onFontFallback(reason: unknown): void;
}

export async function svgToEmbeddedPng(
  svg: string,
  doc: string,
  options: EmbeddedPngOptions,
): Promise<Blob> {
  const png = await svgToPng(svg, {
    background: PNG_BACKGROUND,
    fonts: GEIST_FACES,
    onFontFallback: options.onFontFallback,
  });
  const withScene = pngInsertText(
    new Uint8Array(await png.arrayBuffer()),
    EMBED_KEYWORD,
    encodeDoc(doc),
  );
  return new Blob([withScene as BlobPart], { type: "image/png" });
}

/** Blob -> Base64 (without the data-URL prefix) for transport to the host. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the export blob."));
    reader.readAsDataURL(blob);
  });
}
