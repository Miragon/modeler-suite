/**
 * Image export for the webview: SVG/PNG with the scene (native JSON document) EMBEDDED in the file,
 * so exported images can later be reopened as a Context Maps diagram (idea from Excalidraw).
 *
 * The pure byte/encoding helpers live DOM-free in ../png.ts (also used by the extension host).
 * Only what the browser needs remains here: the shell's rasteriser and Blob/FileReader.
 */

import { MIRAGON } from "@miragon/context-maps-renderer";
import { GEIST_UNICODE_RANGES, svgToPng, type GeistFace } from "@miragon/modeler-shell/export";
import cyrillicExt from "@fontsource-variable/geist/files/geist-cyrillic-ext-wght-normal.woff2?dataurl";
import cyrillic from "@fontsource-variable/geist/files/geist-cyrillic-wght-normal.woff2?dataurl";
import vietnamese from "@fontsource-variable/geist/files/geist-vietnamese-wght-normal.woff2?dataurl";
import latinExt from "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?dataurl";
import latin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?dataurl";
import { EMBED_KEYWORD, encodeDoc, pngInsertText } from "../png.js";

const SVG_ATTR = "data-tt-document";

/** `hell['--cd-ui-grund']`: a picture is light in every mode (guide §10.7); `theme.sync` pins it. */
const PNG_BACKGROUND = MIRAGON.grau;

/**
 * The webview can't fetch its own font files (the CSP has no connect-src), so the faces travel as
 * data: URLs, in fontsource's order with latin last: of overlapping ranges the last one draws.
 */
const GEIST_FACES: readonly GeistFace[] = [
  { src: cyrillicExt, unicodeRange: GEIST_UNICODE_RANGES.cyrillicExt },
  { src: cyrillic, unicodeRange: GEIST_UNICODE_RANGES.cyrillic },
  { src: vietnamese, unicodeRange: GEIST_UNICODE_RANGES.vietnamese },
  { src: latinExt, unicodeRange: GEIST_UNICODE_RANGES.latinExt },
  { src: latin, unicodeRange: GEIST_UNICODE_RANGES.latin },
];

export interface EmbeddedPng {
  readonly blob: Blob;
  readonly fontFallback: boolean;
}

export function embedSvg(svg: string, doc: string): string {
  return svg.replace(/<svg\b/, `<svg ${SVG_ATTR}="${encodeDoc(doc)}"`);
}

export async function svgToEmbeddedPng(svg: string, doc: string): Promise<EmbeddedPng> {
  let fontFallback = false;
  const png = await svgToPng(svg, {
    background: PNG_BACKGROUND,
    fonts: GEIST_FACES,
    onFontFallback: () => {
      fontFallback = true;
    },
  });
  const withScene = pngInsertText(
    new Uint8Array(await png.arrayBuffer()),
    EMBED_KEYWORD,
    encodeDoc(doc),
  );
  return { blob: new Blob([withScene as BlobPart], { type: "image/png" }), fontFallback };
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
