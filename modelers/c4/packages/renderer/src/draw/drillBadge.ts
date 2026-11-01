import type { Box } from "@miragon/c4-schema-model";
import type { SceneElement } from "../scene/types.js";
import { textWidth } from "../text/textMetrics.js";
import { BADGE_FONT } from "../text/typography.js";
import { BADGE_SIZE, badgeSlotOf, drawnShape } from "./shapes.js";

/** The class of the badge and its hit: a click inside opens the child view (SPEC 6.5). */
export const DRILL_CLASS = "c4-drill";

const ICON_SIZE = 14;
const PADDING = (BADGE_SIZE - ICON_SIZE) / 2;
const COUNT_GAP = 2;
const COUNT_END = 4;

export interface DrillBadgeLayout {
  /** Diagram coordinates. */
  readonly box: Box;
  readonly icon: Box;
  /** The child count, drawn after the icon when there is at least one child. */
  readonly count: { readonly text: string; readonly x: number; readonly y: number } | undefined;
  /** "Open Bookshop containers (Enter)": the view it opens, as the breadcrumb names it. */
  readonly title: string;
}

function titleOf(element: SceneElement): string {
  const level =
    element.kind === "softwareSystem"
      ? "containers"
      : element.kind === "container"
        ? "components"
        : undefined;
  const name = element.name.trim() || element.id;
  return level === undefined ? "Open view (Enter)" : `Open ${name} ${level} (Enter)`;
}

/** The badge inside the element's outline (SPEC 6.5), or undefined without a child view. */
export function drillBadgeLayout(element: SceneElement): DrillBadgeLayout | undefined {
  if (!element.drill) return undefined;
  const { childCount } = element.drill;
  const countText = childCount > 0 ? String(childCount) : undefined;
  const width =
    countText === undefined
      ? BADGE_SIZE
      : Math.ceil(PADDING + ICON_SIZE + COUNT_GAP + textWidth(countText, BADGE_FONT) + COUNT_END);
  const slot = badgeSlotOf(drawnShape(element.shape), element.box.width, element.box.height, width);
  const left = slot.align === "right" ? slot.x - width : slot.x - width / 2;
  const box = {
    x: element.box.x + left,
    y: element.box.y + slot.bottom - BADGE_SIZE,
    width,
    height: BADGE_SIZE,
  };
  const icon = { x: box.x + PADDING, y: box.y + PADDING, width: ICON_SIZE, height: ICON_SIZE };
  return {
    box,
    icon,
    count:
      countText === undefined
        ? undefined
        : { text: countText, x: icon.x + ICON_SIZE + COUNT_GAP, y: box.y + BADGE_SIZE / 2 },
    title: titleOf(element),
  };
}
