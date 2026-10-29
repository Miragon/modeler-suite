import { DARK_PLOT, MIRAGON } from "../theme/palette.js";

type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SERIALIZED_RGBA = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/;

function parseHex(color: string): Rgba | undefined {
  if (!HEX_COLOR.test(color)) return undefined;
  const short = color.length <= 5;
  const digits = short
    ? [...color.slice(1)].map((digit) => digit + digit).join("")
    : color.slice(1);
  const channel = (index: number) => parseInt(digits.slice(index * 2, index * 2 + 2), 16);
  return [channel(0), channel(1), channel(2), digits.length === 8 ? channel(3) / 255 : 1];
}

let colorCanvas: CanvasRenderingContext2D | null | undefined;

function colorContext(): CanvasRenderingContext2D | null {
  // jsdom has no canvas and logs an error for every getContext call: ask only a real browser.
  colorCanvas ??=
    typeof document !== "undefined" && typeof CanvasRenderingContext2D !== "undefined"
      ? Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", {
          willReadFrequently: true,
        })
      : null;
  return colorCanvas;
}

function paintedOverGround(context: CanvasRenderingContext2D, color: string): Rgba {
  context.fillStyle = MIRAGON.grau;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const { data } = context.getImageData(0, 0, 1, 1);
  return [data[0]!, data[1]!, data[2]!, 1];
}

/**
 * The DSL also takes CSS colour names (`(color green)`) and a stored board any CSS colour, which
 * only the browser can resolve. Without a canvas (jsdom) the colour stays unread.
 */
function parseWithCanvas(color: string): Rgba | undefined {
  const context = colorContext();
  if (!context) return undefined;
  // A value that is no colour leaves `fillStyle` as it was, so two start values tell it apart.
  context.fillStyle = MIRAGON.schwarz;
  context.fillStyle = color;
  const fromDark = String(context.fillStyle);
  context.fillStyle = MIRAGON.weiss;
  context.fillStyle = color;
  if (String(context.fillStyle) !== fromDark) return undefined;
  // Names, rgb() and hsl() read back exactly as hex or rgba(), without the pixel readback that
  // privacy modes add noise to. Newer syntaxes (oklch(), lab(), color-mix()) read back in their
  // own form, so only those are painted.
  const serialized = SERIALIZED_RGBA.exec(fromDark);
  if (serialized) {
    const [, red, green, blue, alpha] = serialized;
    return [Number(red), Number(green), Number(blue), alpha === undefined ? 1 : Number(alpha)];
  }
  return parseHex(fromDark) ?? paintedOverGround(context, color);
}

function parseColor(color: string): Rgba | undefined {
  const trimmed = color.trim();
  return parseHex(trimmed) ?? parseWithCanvas(trimmed);
}

function over([red, green, blue, alpha]: Rgba, ground: Rgba): Rgba {
  const mix = (top: number, bottom: number) => top * alpha + bottom * (1 - alpha);
  return [mix(red, ground[0]), mix(green, ground[1]), mix(blue, ground[2]), 1];
}

function relativeLuminance([red, green, blue]: Rgba): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function ratio(first: Rgba, second: Rgba): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter! + 0.05) / (darker! + 0.05);
}

const CANVAS_GROUND = parseHex(MIRAGON.grau)!;
const DARK_GROUND = parseHex(DARK_PLOT)!;
const BLACK_TEXT = parseHex(MIRAGON.schwarz)!;
const WHITE_TEXT = parseHex(MIRAGON.weiss)!;

/** Guide §3.6: a stroke needs 3:1 against what it lies on. */
const NON_TEXT_CONTRAST = 3;

/**
 * Whether a stroke the user coloured falls below 3:1 on the dark plot and so lies on an underlay
 * there (guide §10.6). A translucent stroke counts as it shows over that plot; a colour the
 * renderer cannot read gets none, since nothing says it is weak.
 */
export function strokeNeedsUnderlayOnDark(color: string): boolean {
  const parsed = parseColor(color);
  if (!parsed) return false;
  return ratio(over(parsed, DARK_GROUND), DARK_GROUND) < NON_TEXT_CONTRAST;
}

/**
 * Text colour on a sticky's fill (guide §10.6): `schwarz` or `weiss`, whichever contrasts more
 * with the fill, so a fill the user picks keeps its text readable. A translucent fill counts as
 * it shows over the canvas ground; a fill the renderer cannot read keeps `schwarz`.
 */
export function textColorOn(fill: string): typeof MIRAGON.schwarz | typeof MIRAGON.weiss {
  const parsed = parseColor(fill);
  if (!parsed) return MIRAGON.schwarz;
  const shown = over(parsed, CANVAS_GROUND);
  return ratio(shown, WHITE_TEXT) > ratio(shown, BLACK_TEXT) ? MIRAGON.weiss : MIRAGON.schwarz;
}
