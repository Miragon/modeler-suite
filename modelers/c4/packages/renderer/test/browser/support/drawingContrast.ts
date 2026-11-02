/**
 * WCAG 2.1 contrast for the drawing's tests, written out here instead of taken from the renderer so
 * the tests do not measure the renderer with its own ruler (Context Maps' `test/support/contrast.ts`).
 * Reads `#RRGGBB`, `#RGB` and the `rgb(r, g, b)` values `getComputedStyle` returns.
 */

export type Rgb = readonly [number, number, number];

export const TEXT_CONTRAST = 4.5;
export const NON_TEXT_CONTRAST = 3;

export function rgbOf(colour: string): Rgb {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
  if (hex?.[1]) {
    const digits =
      hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join("") : hex[1];
    const channel = (offset: number) => parseInt(digits.slice(offset, offset + 2), 16);
    return [channel(0), channel(2), channel(4)];
  }
  const functional = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(colour.trim());
  if (functional) return [Number(functional[1]), Number(functional[2]), Number(functional[3])];
  throw new Error(`expected a hex or rgb() colour, got "${colour}"`);
}

function relativeLuminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

export function contrast(first: string, second: string): number {
  const [lighter, darker] = [
    relativeLuminance(rgbOf(first)),
    relativeLuminance(rgbOf(second)),
  ].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** A pair below `minimum`, worded for the failure message, or `undefined` when it holds. */
export function pairBelow(
  name: string,
  foreground: string,
  background: string,
  minimum: number,
): string | undefined {
  const ratio = contrast(foreground, background);
  if (ratio >= minimum) return undefined;
  return `${name}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`;
}
