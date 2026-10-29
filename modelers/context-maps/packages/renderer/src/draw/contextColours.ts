import { SUBDOMAIN_TYPE_SPECS } from "@miragon/context-maps-schema-model";
import type { CmContext } from "../model/di-types.js";
import { MIRAGON } from "../theme/index.js";
import { INK, INK_SOFT, NEUTRAL_FILL, NEUTRAL_STROKE } from "./styles.js";

type Rgb = readonly [number, number, number];
type ContextColouring = Pick<CmContext, "subdomainType" | "fill" | "stroke">;

function parseHexColour(colour: string): Rgb | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
  if (!match) return undefined;
  const hex =
    match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return [channel(0), channel(2), channel(4)];
}

function relativeLuminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** The WCAG contrast ratio of two hex colours, or `undefined` when one is no hex colour. */
export function contrastRatio(first: string, second: string): number | undefined {
  const firstRgb = parseHexColour(first);
  const secondRgb = parseHexColour(second);
  if (!firstRgb || !secondRgb) return undefined;
  const [lighter, darker] = [relativeLuminance(firstRgb), relativeLuminance(secondRgb)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/** Text on `fill` is schwarz or weiss, whichever has more contrast (guide §10.6). */
export function readableTextColour(fill: string): string {
  const onInk = contrastRatio(INK, fill);
  const onPaper = contrastRatio(MIRAGON.weiss, fill);
  if (onInk === undefined || onPaper === undefined) return INK;
  return onPaper > onInk ? MIRAGON.weiss : INK;
}

function subdomainSpecOf(context: ContextColouring) {
  return context.subdomainType ? SUBDOMAIN_TYPE_SPECS[context.subdomainType] : undefined;
}

export function contextFill(context: ContextColouring): string {
  return context.fill ?? subdomainSpecOf(context)?.fill ?? NEUTRAL_FILL;
}

export function contextStroke(context: ContextColouring): string {
  return context.stroke ?? subdomainSpecOf(context)?.stroke ?? NEUTRAL_STROKE;
}

/**
 * Whether the box takes the renderer's own fill, the element fill of guide §10.1, which follows the
 * mode: neither the subdomain type nor the author colours it. Its name and team follow with it.
 */
export function contextFillIsNeutral(context: ContextColouring): boolean {
  return (context.fill ?? subdomainSpecOf(context)?.fill) === undefined;
}

/** Whether the box takes the renderer's own outline, which follows the mode. */
export function contextStrokeIsNeutral(context: ContextColouring): boolean {
  return (context.stroke ?? subdomainSpecOf(context)?.stroke) === undefined;
}

/** The context's name, on whatever fill it has. */
export function contextNameColour(context: ContextColouring): string {
  return readableTextColour(contextFill(context));
}

/**
 * The team caption and its glyph: quiet text on the notation's own fills, where it keeps 4.5:1,
 * and the name's black or white on a fill the author set, which may be any colour.
 */
export function contextTeamColour(context: ContextColouring): string {
  return context.fill ? readableTextColour(context.fill) : INK_SOFT;
}

/**
 * What an editor over the box writes a context's name or team in: the colour the canvas draws it in,
 * as the role where that follows the mode (on the renderer's own fill), else the fixed value.
 */
export function contextEditorColour(context: ContextColouring, part: "name" | "team"): string {
  if (contextFillIsNeutral(context)) {
    return part === "team" ? "var(--cd-ui-text-leise)" : "var(--cd-ui-text)";
  }
  return part === "team" ? contextTeamColour(context) : contextNameColour(context);
}

/**
 * The subdomain badge, its type name and glyph, reads like the team caption: the type's own stroke
 * colour stays below 3:1 on its fill. The box keeps the type's fill and stroke as the colour cue.
 */
export function contextBadgeColour(context: ContextColouring): string {
  return contextTeamColour(context);
}
