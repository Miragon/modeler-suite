import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Element } from "diagram-js/lib/model/Types";
import { getBBox } from "diagram-js/lib/util/Elements";
import { isStickyShape } from "../model/di-types.js";
import { documentOf } from "./documentOf.js";
import { layoutOf } from "./layoutOf.js";
import type { Bounds } from "./types.js";

/**
 * The extent of the content: the canvas frame with its header and footer and every sticky, also on
 * an empty canvas, which starts at its full size. The SVG export frames the same.
 */
export default class ContentBounds {
  static $inject = ["elementRegistry"];

  constructor(private readonly elementRegistry: ElementRegistry) {}

  isEmpty(): boolean {
    return !this.elementRegistry.getAll().some(isStickyShape);
  }

  /** The whole canvas and every sticky, grown by `padding`: what a fit and an export frame. */
  contentBounds(padding = 0): Bounds | undefined {
    const document = documentOf(this.elementRegistry);
    if (!document) return undefined;
    const frame = layoutOf(document).bounds;
    const stickies = this.elementRegistry.filter(isStickyShape) as Element[];
    return padded(stickies.length === 0 ? frame : union(frame, getBBox(stickies)), padding);
  }
}

function union(first: Bounds, second: Bounds): Bounds {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  return {
    x,
    y,
    width: Math.max(first.x + first.width, second.x + second.width) - x,
    height: Math.max(first.y + first.height, second.y + second.height) - y,
  };
}

function padded(box: Bounds, padding: number): Bounds {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + 2 * padding,
    height: box.height + 2 * padding,
  };
}
