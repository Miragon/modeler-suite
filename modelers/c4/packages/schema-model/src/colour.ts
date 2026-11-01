/*
 * WCAG 2.1 contrast and the mixes of SPEC 6.4 on `#rrggbb` colours. The light values of the
 * design system's roles the contrast rule measures against: the canvas ground
 * (`--cd-ui-grund`), the plot behind boxes and labels (`--cd-ui-plot`) and the ink (`--cd-ui-text`).
 */
// brand-lint-disable
export const CANVAS_GROUND = "#f9f7f7";
export const PLOT = "#ffffff";
export const INK = "#1d1d1d";
export const WHITE = "#ffffff";
// brand-lint-enable

export const TEXT_CONTRAST = 4.5;
export const LINE_CONTRAST = 3;

type Rgb = readonly [number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#rrggbb` in lower case, or undefined for anything else. */
export function normaliseColour(colour: string | undefined): string | undefined {
  if (colour === undefined) return undefined;
  const match = HEX.exec(colour.trim());
  if (!match?.[1]) return undefined;
  const digits =
    match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  return `#${digits.toLowerCase()}`;
}

export function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(rgb(first)), luminance(rgb(second))].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** `from` moved `share` (0..1) of the way to `to`, each channel rounded. */
export function mix(from: string, to: string, share: number): string {
  const start = rgb(from);
  const end = rgb(to);
  const channel = (index: 0 | 1 | 2) =>
    Math.round(start[index] + (end[index] - start[index]) * share);
  return hex([channel(0), channel(1), channel(2)]);
}

/** Structurizr's `shadeColor(colour, 100 - opacity)`: toward white, at most 90 %. */
export function withOpacity(colour: string, opacity: number | undefined): string {
  if (opacity === undefined || opacity >= 100) return colour;
  const share = Math.min(0.9, (100 - Math.max(0, opacity)) / 100);
  return mix(colour, WHITE, share);
}

/** The ink or white, whichever stands out more on `fill`. */
export function readableOn(fill: string): string {
  return contrast(INK, fill) >= contrast(WHITE, fill) ? INK : WHITE;
}

/** `preferred` when it reaches 4.5:1 on `fill`, else the ink or white (G §10.6). */
export function textOn(preferred: string | undefined, fill: string): string {
  if (preferred !== undefined && contrast(preferred, fill) >= TEXT_CONTRAST) return preferred;
  return readableOn(fill);
}

/**
 * The outline of a self-set fill without its own stroke: the fill mixed 20 % toward the ink, then
 * in 10 % steps until it reaches 3:1 on the canvas ground (SPEC 6.4).
 */
export function derivedStroke(fill: string): string {
  let tenths = 2;
  let stroke = mix(fill, INK, tenths / 10);
  while (contrast(stroke, CANVAS_GROUND) < LINE_CONTRAST && tenths < 10) {
    tenths += 1;
    stroke = mix(fill, INK, tenths / 10);
  }
  return stroke;
}

function rgb(colour: string): Rgb {
  const normalised = normaliseColour(colour);
  if (normalised === undefined) return [0, 0, 0];
  const value = Number.parseInt(normalised.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function hex(channels: Rgb): string {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function luminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}
