import type { Box } from "@miragon/c4-schema-model";
import { canvasFont } from "./textMetrics.js";

/** The text stack of an element box (SPEC 6.3). */
export const ELEMENT_FONTS = {
  name: canvasFont(15, 600, 1.25),
  type: canvasFont(12, 400, 1.3),
  description: canvasFont(13, 400, 1.35),
} as const;

/** The stack is centred as a block; these are the only gaps in it. */
export const ELEMENT_GAPS = { beforeType: 4, beforeDescription: 8 } as const;
export const NAME_MAX_LINES = 2;
/** `[Container: Java 21, Spring Boot 3, Hibernate]` wraps rather than end in an ellipsis. */
export const TYPE_LINE_MAX_LINES = 2;

/** A relationship's label (SPEC 6.3): two description lines and the technology fit 160 × 48. */
export const RELATIONSHIP_FONTS = {
  description: canvasFont(12, 400, 1.25),
  technology: canvasFont(11, 400, 1.3),
} as const;
export const RELATIONSHIP_LABEL = {
  descriptionLines: 3,
  technologyLines: 2,
  gap: 2,
  /** Between the text and the left and right edge of its ground. */
  padding: 4,
  /** Between the text and the top and bottom edge of its ground. */
  groundPadding: 2,
} as const;

/**
 * How far a relationship's drawn label may reach: its ground grows from the layout's 160 × 48
 * slot up to this, centred on the slot, before the text is cut short. The layout keeps the fixed
 * slot, so a longer description moves nothing (SPEC 4.3), and spaces the bends of a fan by this
 * same size (its own `LABEL_REACH`, `layout/src/relationships.ts`): change both together.
 */
export const LABEL_REACH = { width: 240, height: 72 } as const;

/** The most a label of `slot` may cover, in diagram coordinates. */
export function labelReach(slot: Box): Box {
  const width = Math.max(slot.width, LABEL_REACH.width);
  const height = Math.max(slot.height, LABEL_REACH.height);
  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height,
  };
}

/** The caption at a boundary's bottom left (SPEC 6.5). */
export const BOUNDARY_FONTS = {
  name: canvasFont(14, 600, 1.25),
  type: canvasFont(12, 400, 1.3),
} as const;
export const BOUNDARY_CAPTION = { inset: 12, gap: 2, band: 40 } as const;

export const GROUP_FONT = canvasFont(12, 600, 1.3);
export const GROUP_CAPTION = { inset: 12, top: 8 } as const;

/** The title block below the diagram (SPEC 6.5), 62 high whatever the font. */
export const TITLE_FONTS = {
  title: canvasFont(18, 600, 1.25),
  description: canvasFont(13, 400, 1.35),
} as const;
export const TITLE_BLOCK = { gap: 4, descriptionLines: 2, height: 62 } as const;

export const BADGE_FONT = canvasFont(11, 600, 1.2);
