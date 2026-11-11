import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { CanvasDocument } from "@miragon/business-model-canvas-schema-model";
import { ROOT_ID, type RootBusinessObject } from "./types.js";

export const NO_DOCUMENT: CanvasDocument = Object.freeze({
  header: [],
  notes: [],
  blocks: [],
  extras: [],
}) as CanvasDocument;

/** Read without canvas.getRootElement(), which would create an implicit root before an import. */
export function documentOf(elementRegistry: ElementRegistry): CanvasDocument | undefined {
  const root = elementRegistry.get(ROOT_ID) as { businessObject?: RootBusinessObject } | undefined;
  return root?.businessObject?.document;
}
