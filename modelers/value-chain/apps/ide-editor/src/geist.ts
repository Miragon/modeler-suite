import cyrillicExt from "@fontsource-variable/geist/files/geist-cyrillic-ext-wght-normal.woff2?dataurl";
import cyrillic from "@fontsource-variable/geist/files/geist-cyrillic-wght-normal.woff2?dataurl";
import latin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?dataurl";
import latinExt from "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?dataurl";
import vietnamese from "@fontsource-variable/geist/files/geist-vietnamese-wght-normal.woff2?dataurl";
import { GEIST_UNICODE_RANGES, type GeistFace } from "@miragon/modeler-shell/export";

// The webview's CSP has no connect-src, so the shell cannot fetch the font files the stylesheet
// names; the PNG export gets the faces inline instead, every subset the stylesheet ships, so a
// label draws in Geist in the PNG wherever it does on the canvas. In fontsource's order, latin
// last: of overlapping faces the last one declared draws a character.
export const GEIST_FACES: readonly GeistFace[] = [
  { src: cyrillicExt, unicodeRange: GEIST_UNICODE_RANGES.cyrillicExt },
  { src: cyrillic, unicodeRange: GEIST_UNICODE_RANGES.cyrillic },
  { src: vietnamese, unicodeRange: GEIST_UNICODE_RANGES.vietnamese },
  { src: latinExt, unicodeRange: GEIST_UNICODE_RANGES.latinExt },
  { src: latin, unicodeRange: GEIST_UNICODE_RANGES.latin },
];
