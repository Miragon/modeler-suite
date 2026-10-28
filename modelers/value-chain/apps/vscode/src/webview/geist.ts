import latin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?dataurl";
import latinExt from "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?dataurl";
import { GEIST_UNICODE_RANGES, type GeistFace } from "@miragon/modeler-shell/export";

// The webview's CSP has no connect-src, so the shell cannot fetch the font files the stylesheet
// names; the PNG export gets the faces inline instead. Latin last: of overlapping faces the last
// one declared draws a character.
export const GEIST_FACES: readonly GeistFace[] = [
  { src: latinExt, unicodeRange: GEIST_UNICODE_RANGES.latinExt },
  { src: latin, unicodeRange: GEIST_UNICODE_RANGES.latin },
];
