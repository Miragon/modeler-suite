import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import {
  isVcShape,
  type CollaborativeValueChainModeler,
  type VcShape,
} from "../../../src/index.js";

export interface Point {
  x: number;
  y: number;
}

/** The kit's gesture kinds (`packages/api/README.md`, "Cases for the 1.5 surfaces and the gesture rules of 1.6"). */
export type GestureKind = "move" | "create" | "createOffCanvas";

/** A gesture the pointer holds, released or cancelled with Escape. */
export interface HeldGesture {
  drop(): void;
  cancel(): void;
}

/** An empty spot of the Order to Cash fixture, inside the 1000 × 700 host the tests mount. */
export const FREE_SPOT: Point = { x: 500, y: 450 };

/** Real DOM pointer and key events on a mounted collaborative modeler, in diagram coordinates. */
export class CanvasPointer {
  private last: Point = { x: 0, y: 0 };

  constructor(private readonly modeler: CollaborativeValueChainModeler) {}

  shape(id: string): VcShape {
    const found = this.modeler.diagram.get<ElementRegistry>("elementRegistry").get(id);
    if (!isVcShape(found)) throw new Error(`no shape ${id}`);
    return found;
  }

  graphics(id: string): SVGElement {
    return this.modeler.diagram.get<ElementRegistry>("elementRegistry").getGraphics(this.shape(id));
  }

  centreOf(id: string): Point {
    const { x, y, width, height } = this.shape(id);
    return { x: x + width / 2, y: y + height / 2 };
  }

  canvasSvg(): SVGSVGElement {
    const svg = this.modeler.diagram.container.querySelector<SVGSVGElement>("svg");
    if (!svg) throw new Error("the canvas has no svg");
    return svg;
  }

  client(point: Point): { clientX: number; clientY: number } {
    const canvas = this.modeler.diagram.get<Canvas>("canvas");
    const rect = canvas.getContainer().getBoundingClientRect();
    const viewbox = canvas.viewbox();
    return {
      clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
      clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
    };
  }

  event(type: string, at: Point, init: MouseEventInit = {}): MouseEvent {
    this.last = at;
    return new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...this.client(at),
      ...init,
    });
  }

  press(target: EventTarget, at: Point, init: MouseEventInit = {}): void {
    target.dispatchEvent(this.event("mousedown", at, init));
  }

  click(target: EventTarget, at: Point): void {
    target.dispatchEvent(this.event("click", at, { detail: 1 }));
  }

  moveTo(at: Point): void {
    document.dispatchEvent(this.event("mousemove", at));
  }

  /** What the browser fires when the pointer enters an element's graphics (diagram-js hover). */
  hover(target: EventTarget, at: Point): void {
    target.dispatchEvent(this.event("mouseover", at));
    this.moveTo(at);
  }

  release(at: Point = this.last): void {
    document.dispatchEvent(this.event("mouseup", at));
  }

  escape(): void {
    document.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Escape", bubbles: true, cancelable: true }),
    );
  }

  /** A palette entry and its centre in diagram coordinates, where a pointer clicks it. */
  paletteEntry(action: string): { entry: Element; at: Point } {
    const entry = this.modeler.diagram.container.querySelector(
      `.djs-palette [data-action="${action}"]`,
    );
    if (!entry) throw new Error(`no palette entry ${action}`);
    const box = entry.getBoundingClientRect();
    const canvas = this.modeler.diagram.get<Canvas>("canvas");
    const rect = canvas.getContainer().getBoundingClientRect();
    const viewbox = canvas.viewbox();
    const at = {
      x: viewbox.x + (box.left + box.width / 2 - rect.left) / viewbox.scale,
      y: viewbox.y + (box.top + box.height / 2 - rect.top) / viewbox.scale,
    };
    return { entry, at };
  }

  /** Clicks a palette entry: a create follows the pointer from there, a tool is armed. */
  pickFromPalette(action: string): { entry: Element; at: Point } {
    const picked = this.paletteEntry(action);
    this.click(picked.entry, picked.at);
    return picked;
  }

  /** A context pad entry of `id`'s shape, selected first so that its pad is open. */
  contextPadEntry(id: string, action: string): Element {
    this.modeler.elements.reveal(id);
    const entry = this.modeler.diagram.container.querySelector(
      `.djs-context-pad [data-action="${action}"]`,
    );
    if (!entry) throw new Error(`no context pad entry ${action}`);
    return entry;
  }
}

/**
 * The kit's harness field `startGesture(modeler, kind)`, for this file's fixture: holds a gesture the way a user does and
 * returns while it runs. A move presses the first listed element and moves past the drag
 * threshold; a create picks the palette's step and holds its preview over the canvas, or over the
 * palette (`createOffCanvas`).
 */
export function startGesture(
  modeler: CollaborativeValueChainModeler,
  kind: GestureKind,
): HeldGesture {
  const pointer = new CanvasPointer(modeler);
  if (kind === "move") {
    const [first] = modeler.elements.list();
    if (!first) throw new Error("the diagram has no element to move");
    const start = pointer.centreOf(first.id);
    pointer.press(pointer.graphics(first.id), start);
    pointer.moveTo({ x: start.x + 20, y: start.y });
    pointer.moveTo({ x: start.x + 40, y: start.y });
  } else {
    const { at } = pointer.pickFromPalette("create.step");
    if (kind === "create") pointer.hover(pointer.canvasSvg(), FREE_SPOT);
    else pointer.moveTo({ x: at.x, y: at.y + 8 });
  }
  return { drop: () => pointer.release(), cancel: () => pointer.escape() };
}

/** The kit's harness field `armTool(modeler)`: arms the palette's lasso without a press. */
export function armTool(modeler: CollaborativeValueChainModeler): void {
  new CanvasPointer(modeler).pickFromPalette("lasso-tool");
}

/** The kit's harness field `exportImage(modeler)`: the SVG export a host saves. */
export function exportImage(modeler: CollaborativeValueChainModeler): string {
  return modeler.diagram.saveSVG().svg;
}
