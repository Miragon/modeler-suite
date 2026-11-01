import type { LineStyle, Point } from "@miragon/c4-schema-model";
import { formatNumber } from "./svg.js";

/**
 * Dash patterns that grow with the stroke: an element's or boundary's dashed outline is `8 6` at 2
 * units, a relationship's `6 4` at 1.5 (Structurizr's dashed default, SPEC 6.5), dotted `2 4`.
 */
export function dashArray(
  line: LineStyle,
  width: number,
  kind: "outline" | "relationship",
): string | undefined {
  if (line === "solid") return undefined;
  const [dash, gap] =
    line === "dotted"
      ? [width, 2 * width]
      : kind === "relationship"
        ? [4 * width, (8 * width) / 3]
        : [4 * width, 3 * width];
  return `${formatNumber(dash)} ${formatNumber(gap)}`;
}

export function polylinePath(points: readonly Point[]): string {
  return points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${formatNumber(x)},${formatNumber(y)}`)
    .join("");
}

const CHEVRON_LEG = 10;
const CHEVRON_ANGLE = Math.PI / 6;

/**
 * The open chevron at the destination (SPEC 6.5): two 10-unit legs back along the last segment.
 * Undefined when the line has no length to point along.
 */
export function chevronPath(points: readonly Point[]): string | undefined {
  const tip = points.at(-1);
  if (!tip) return undefined;
  const from = [...points]
    .reverse()
    .find((point) => Math.hypot(point.x - tip.x, point.y - tip.y) > 0.5);
  if (!from) return undefined;
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const leg = (offset: number) => ({
    x: tip.x - CHEVRON_LEG * Math.cos(angle + offset),
    y: tip.y - CHEVRON_LEG * Math.sin(angle + offset),
  });
  return polylinePath([leg(CHEVRON_ANGLE), tip, leg(-CHEVRON_ANGLE)]);
}
