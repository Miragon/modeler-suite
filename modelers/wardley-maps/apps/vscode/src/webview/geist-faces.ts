import cyrillicExt from "@fontsource-variable/geist/files/geist-cyrillic-ext-wght-normal.woff2?dataurl";
import cyrillic from "@fontsource-variable/geist/files/geist-cyrillic-wght-normal.woff2?dataurl";
import vietnamese from "@fontsource-variable/geist/files/geist-vietnamese-wght-normal.woff2?dataurl";
import latinExt from "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?dataurl";
import latin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?dataurl";
import italicCyrillicExt from "@fontsource-variable/geist/files/geist-cyrillic-ext-wght-italic.woff2?dataurl";
import italicCyrillic from "@fontsource-variable/geist/files/geist-cyrillic-wght-italic.woff2?dataurl";
import italicVietnamese from "@fontsource-variable/geist/files/geist-vietnamese-wght-italic.woff2?dataurl";
import italicLatinExt from "@fontsource-variable/geist/files/geist-latin-ext-wght-italic.woff2?dataurl";
import italicLatin from "@fontsource-variable/geist/files/geist-latin-wght-italic.woff2?dataurl";
import { GEIST_UNICODE_RANGES, type GeistFace } from "@miragon/modeler-shell/export";

/**
 * The faces the webview's stylesheet loads (`wght.css`, then `wght-italic.css`, in their order with
 * latin last), as data: URLs. An SVG drawn as an image can't fetch the webview's font files, and
 * the webview's CSP has no `connect-src` for the shell to read them with. Notes and axis captions
 * are italic, so a PNG needs the italic subsets as well. The export embeds only the subsets whose
 * range holds a character of the map's text.
 */
export const GEIST_FACES: readonly GeistFace[] = [
  { src: cyrillicExt, unicodeRange: GEIST_UNICODE_RANGES.cyrillicExt },
  { src: cyrillic, unicodeRange: GEIST_UNICODE_RANGES.cyrillic },
  { src: vietnamese, unicodeRange: GEIST_UNICODE_RANGES.vietnamese },
  { src: latinExt, unicodeRange: GEIST_UNICODE_RANGES.latinExt },
  { src: latin, unicodeRange: GEIST_UNICODE_RANGES.latin },
  { src: italicCyrillicExt, unicodeRange: GEIST_UNICODE_RANGES.cyrillicExt, style: "italic" },
  { src: italicCyrillic, unicodeRange: GEIST_UNICODE_RANGES.cyrillic, style: "italic" },
  { src: italicVietnamese, unicodeRange: GEIST_UNICODE_RANGES.vietnamese, style: "italic" },
  { src: italicLatinExt, unicodeRange: GEIST_UNICODE_RANGES.latinExt, style: "italic" },
  { src: italicLatin, unicodeRange: GEIST_UNICODE_RANGES.latin, style: "italic" },
];
