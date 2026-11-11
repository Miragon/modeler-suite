import type { CanvasDocument } from "@miragon/business-model-canvas-schema-model";

/** The id of the canvas root. Sticky ids never take it (`isUsableStickyId` allows no `:`). */
export const ROOT_ID = "diagram:root";

/** The whole document lives on the root: blocks, notes and fields the canvas only keeps. */
export interface RootBusinessObject {
  document: CanvasDocument;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
