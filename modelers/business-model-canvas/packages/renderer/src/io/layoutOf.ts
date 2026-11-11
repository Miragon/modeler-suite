import {
  layoutCanvas,
  type CanvasDocument,
  type CanvasLayout,
} from "@miragon/business-model-canvas-schema-model";

const layouts = new WeakMap<CanvasDocument, CanvasLayout>();

/** Documents are never changed in place, so one layout per document object holds. */
export function layoutOf(document: CanvasDocument): CanvasLayout {
  let layout = layouts.get(document);
  if (!layout) {
    layout = layoutCanvas(document);
    layouts.set(document, layout);
  }
  return layout;
}
