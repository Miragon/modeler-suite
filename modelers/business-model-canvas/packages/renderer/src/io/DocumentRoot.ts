import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementFactory from "diagram-js/lib/core/ElementFactory";
import type EventBus from "diagram-js/lib/core/EventBus";
import { NO_DOCUMENT } from "./documentOf.js";
import { ROOT_ID } from "./types.js";

/**
 * The root and its empty document exist from the start, so an edit made before the first import
 * lands in a document too, as it would after one.
 */
export default class DocumentRoot {
  static $inject = ["eventBus", "canvas", "elementFactory"];

  constructor(eventBus: EventBus, canvas: Canvas, elementFactory: ElementFactory) {
    eventBus.on("diagram.init", () => {
      canvas.setRootElement(
        elementFactory.createRoot({ id: ROOT_ID, businessObject: { document: NO_DOCUMENT } }),
      );
    });
  }
}
