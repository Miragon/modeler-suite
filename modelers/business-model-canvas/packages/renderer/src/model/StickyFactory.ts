import type ElementFactory from "diagram-js/lib/core/ElementFactory";
import {
  STICKY_SIZE,
  type BlockId,
  type Rect,
  type Sticky,
} from "@miragon/business-model-canvas-schema-model";
import type { StickyShape } from "./di-types.js";

/** Builds diagram-js shapes from the document (import) and blank ones for the palette. */
export default class StickyFactory {
  static $inject = ["elementFactory"];

  constructor(private readonly elementFactory: ElementFactory) {}

  fromDocument(sticky: Sticky, blockId: BlockId, rect: Rect): StickyShape {
    return this.elementFactory.createShape({
      id: sticky.id,
      ...rect,
      elementKind: "sticky",
      sticky,
      blockId,
    }) as StickyShape;
  }

  /** No id and no place: the element factory allocates the id, the drop decides the block. */
  createNew(text = ""): StickyShape {
    const shape = this.elementFactory.createShape({
      ...STICKY_SIZE,
      elementKind: "sticky",
      sticky: { id: "", text, attributes: [], notes: [] },
    }) as StickyShape;
    shape.sticky = { ...shape.sticky, id: shape.id };
    return shape;
  }
}
