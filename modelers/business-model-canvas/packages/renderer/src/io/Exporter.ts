import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { validateDocument, type CanvasDocument } from "@miragon/business-model-canvas-schema-model";
import { NO_DOCUMENT, documentOf } from "./documentOf.js";

/** Every canvas edit is a document update on the root, so the root's document is the export. */
export default class Exporter {
  static $inject = ["elementRegistry"];

  constructor(private readonly elementRegistry: ElementRegistry) {}

  export(): CanvasDocument {
    return validateDocument(documentOf(this.elementRegistry) ?? NO_DOCUMENT);
  }
}
