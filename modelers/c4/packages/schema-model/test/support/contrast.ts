/**
 * WCAG 2.1 contrast for the notation tests, written out here instead of taken from the package so
 * the tests do not measure the style cascade with its own ruler (Context Maps' pattern).
 */

export const TEXT_CONTRAST = 4.5;
export const NON_TEXT_CONTRAST = 3;

type Rgb = readonly [number, number, number];

function rgbOf(colour: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  if (!hex?.[1]) throw new Error(`expected #rrggbb, got "${colour}"`);
  const channel = (offset: number) => parseInt(hex[1]!.slice(offset, offset + 2), 16);
  return [channel(0), channel(2), channel(4)];
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
