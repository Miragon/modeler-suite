import { SELF_SET_TEXT } from "./styles.js";

function channels(colour: string): [number, number, number] | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
  if (!hex?.[1]) return undefined;
  const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join("") : hex[1];
  return [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** WCAG 2.1 relative luminance; undefined for a value that is no hex colour. */
export function relativeLuminance(colour: string): number | undefined {
  const rgb = channels(colour);
  if (!rgb) return undefined;
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

export function contrastRatio(first: string, second: string): number | undefined {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  if (a === undefined || b === undefined) return undefined;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Black or white, whichever has more contrast on `fill` (guide §10.6). */
export function readableTextOn(fill: string): string {
  const onDark = contrastRatio(SELF_SET_TEXT.light, fill) ?? 0;
  const onLight = contrastRatio(SELF_SET_TEXT.dark, fill) ?? Number.POSITIVE_INFINITY;
  return onDark > onLight ? SELF_SET_TEXT.light : SELF_SET_TEXT.dark;
}
