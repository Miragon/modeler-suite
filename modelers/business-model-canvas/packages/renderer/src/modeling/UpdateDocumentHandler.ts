import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Element } from "diagram-js/lib/model/Types";
import {
  findSticky,
  type BlockId,
  type CanvasDocument,
  type Sticky,
} from "@miragon/business-model-canvas-schema-model";
import { layoutOf } from "../io/layoutOf.js";
import { ROOT_ID, type RootBusinessObject } from "../io/types.js";
import { isStickyShape, type StickyShape } from "../model/di-types.js";

interface ShapeState {
  shape: StickyShape;
  x: number;
  y: number;
  sticky: Sticky;
  blockId: BlockId | undefined;
}

export interface UpdateDocumentContext {
  document: CanvasDocument;
  previous?: { document: CanvasDocument; shapes: ShapeState[] };
}

type DiagramRoot = Element & { businessObject: RootBusinessObject };

/**
 * Replaces the document on the root and lays every sticky out again from it. One command, so a
 * drop and its reflow are one undo step; the elements it returns are drawn again, and the frame
 * with them.
 */
export default class UpdateDocumentHandler {
  static $inject = ["elementRegistry"];

  constructor(private readonly elementRegistry: ElementRegistry) {}

  execute(context: UpdateDocumentContext): Element[] {
    const root = this.root();
    const shapes = this.stickyShapes();
    context.previous = {
      document: root.businessObject.document,
      shapes: shapes.map((shape) => ({
        shape,
        x: shape.x,
        y: shape.y,
        sticky: shape.sticky,
        blockId: shape.blockId,
      })),
    };
    root.businessObject = { document: context.document };
    const layout = layoutOf(context.document);
    for (const shape of shapes) {
      const placed = findSticky(context.document, shape.id);
      const rect = layout.stickies.get(shape.id);
      if (!placed || !rect) continue;
      shape.sticky = placed.sticky;
      shape.blockId = placed.blockId;
      shape.x = rect.x;
      shape.y = rect.y;
    }
    return [root, ...shapes];
  }

  revert(context: UpdateDocumentContext): Element[] {
    const root = this.root();
    const previous = context.previous!;
    root.businessObject = { document: previous.document };
    for (const state of previous.shapes) {
      Object.assign(state.shape, {
        x: state.x,
        y: state.y,
        sticky: state.sticky,
        blockId: state.blockId,
      });
    }
    return [root, ...previous.shapes.map((state) => state.shape)];
  }

  private root(): DiagramRoot {
    return this.elementRegistry.get(ROOT_ID) as DiagramRoot;
  }

  private stickyShapes(): StickyShape[] {
    return this.elementRegistry.filter(isStickyShape) as StickyShape[];
  }
}
