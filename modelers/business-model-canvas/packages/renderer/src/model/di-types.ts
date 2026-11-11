import type { Shape } from "diagram-js/lib/model/Types";
import type { BlockId, Sticky } from "@miragon/business-model-canvas-schema-model";

/**
 * A sticky on the canvas. The document on the root is the truth; `sticky` and `blockId` mirror
 * the sticky's entry there for drawing, and are written by every document update.
 */
export interface StickyShape extends Shape {
  elementKind: "sticky";
  sticky: Sticky;
  blockId?: BlockId | undefined;
}

export function isStickyShape(element: unknown): element is StickyShape {
  return (
    typeof element === "object" &&
    element !== null &&
    (element as Record<string, unknown>)["elementKind"] === "sticky"
  );
}
