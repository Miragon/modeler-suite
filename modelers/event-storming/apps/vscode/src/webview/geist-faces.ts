import { GEIST_UNICODE_RANGES, type GeistFace } from "@miragon/modeler-shell/export";
import cyrillicExt from "@fontsource-variable/geist/files/geist-cyrillic-ext-wght-normal.woff2?dataurl";
import cyrillic from "@fontsource-variable/geist/files/geist-cyrillic-wght-normal.woff2?dataurl";
import vietnamese from "@fontsource-variable/geist/files/geist-vietnamese-wght-normal.woff2?dataurl";
import latinExt from "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?dataurl";
import latin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?dataurl";

/**
 * Geist for the PNG export, as data: URLs: the webview's CSP has no `connect-src`, so the export
 * cannot fetch the font files its stylesheet points at. Every subset the page loads is here, in
 * fontsource's order with latin last, so a label in any of them is drawn in Geist.
 */
export const GEIST_FACES: readonly GeistFace[] = [
  { src: cyrillicExt, unicodeRange: GEIST_UNICODE_RANGES.cyrillicExt },
  { src: cyrillic, unicodeRange: GEIST_UNICODE_RANGES.cyrillic },
  { src: vietnamese, unicodeRange: GEIST_UNICODE_RANGES.vietnamese },
  { src: latinExt, unicodeRange: GEIST_UNICODE_RANGES.latinExt },
  { src: latin, unicodeRange: GEIST_UNICODE_RANGES.latin },
];
