/**
 * Presence payload sanitizers: awareness states arrive from REMOTE peers and
 * are UNTRUSTED input (any authenticated client can put arbitrary strings into
 * its awareness fields). Everything presence-rendered goes through here:
 * colours land in generated CSS text (injection surface), names in CSS
 * `content` strings and SVG labels, avatar urls in an <img src>.
 */

import { fest } from "../theme/cd-tokens.generated.json";

/** hex colours only: anything else could smuggle CSS past a generated rule */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
/**
 * a peer whose colour is missing or malformed: the CI's neutral, so they read
 * as "someone" rather than as a person's identity hue (presenceColor never
 * hands out a grey). text-leise, not kontur: names sit on it in white, and
 * kontur carries white text at only 3.4:1, text-leise at 5.6:1.
 */
export const FALLBACK_PRESENCE_COLOR = fest["--cd-text-leise"];

export function safePresenceColor(color: unknown): string {
  return typeof color === "string" && HEX_COLOR.test(color) ? color : FALLBACK_PRESENCE_COLOR;
}

/** display label: control chars and CSS-string breakers stripped, length capped */
export function safePresenceLabel(name: unknown): string {
  if (typeof name !== "string") return "?";
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\u0000-\u001f\u007f\\"]/g, "").trim();
  return clean === "" ? "?" : clean.slice(0, 24);
}
