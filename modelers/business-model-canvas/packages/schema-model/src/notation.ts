export interface TapeColor {
  name: string;
  /** The strip of tape across a sticky's top edge: 3:1 on the white paper and the canvas ground. */
  tape: string;
}

/*
 * The canvas has no official colours. A sticky carries one as tape on white paper, never as the
 * paper itself, and what a colour means is the team's to choose: a customer segment, a theme, an
 * owner. The tapes hold 3:1 on the paper and the canvas ground and stay apart under deuteranopia,
 * protanopia and tritanopia; light and dark tapes alternate, so neighbours differ in lightness
 * too. notation-contrast.test.ts checks all of it. Blue leads, as in the design system.
 */
// brand-lint-disable
export const TAPE_COLORS: readonly TapeColor[] = [
  { name: "Sky", tape: "#4090E9" },
  { name: "Peach", tape: "#B83C0A" },
  { name: "Lagoon", tape: "#2E9D93" },
  { name: "Lilac", tape: "#8855BE" },
  { name: "Sun", tape: "#AE8A0A" },
  { name: "Rose", tape: "#CE3B79" },
  { name: "Clay", tape: "#BC7A4E" },
  { name: "Mint", tape: "#4F7B24" },
];
// brand-lint-enable

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function isHexColor(value: string | undefined): value is string {
  return value !== undefined && HEX_COLOR.test(value);
}

/** What a file writes for a palette colour: its name in lower case, `sky`. */
export function colorName(color: TapeColor): string {
  return color.name.toLowerCase();
}

function paletteColor(value: string | undefined): TapeColor | undefined {
  return TAPE_COLORS.find((color) => colorName(color) === value?.toLowerCase());
}

/** A palette name or a `#RRGGBB` of the person's own: the colours a sticky can carry. */
export function isKnownColor(value: string | undefined): value is string {
  return paletteColor(value) !== undefined || isHexColor(value);
}

/** The tape a sticky's `color` shows: the palette's for a name, the person's own hex as it is. */
export function tapeColor(value: string | undefined): string | undefined {
  return paletteColor(value)?.tape ?? (isHexColor(value) ? value : undefined);
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  const [red, green, blue] = [0, 2, 4].map((offset) =>
    channel(parseInt(full.slice(offset, offset + 2), 16)),
  ) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Of two text colours, the one that reads better on `fill`. */
export function readableTextColor(fill: string, dark: string, light: string): string {
  return contrastRatio(fill, dark) >= contrastRatio(fill, light) ? dark : light;
}
