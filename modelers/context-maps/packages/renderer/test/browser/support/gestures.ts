import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Shape } from "diagram-js/lib/model/Types";
import type { CollaborativeContextMapsModeler } from "@miragon/context-maps-renderer";

// The harness fields the contract kit's gesture cases read (`startGesture`, `armTool`,
// `exportImage`), driven on the conference planner the way a user's pointer does.

/** Free canvas of the conference planner, away from every context and relationship. */
export const FREE_SPOT = { x: 150, y: 600 };
export const MOVED_CONTEXT = "ctx_cfp";

export type GestureKind = "move" | "create" | "createOffCanvas";
export const GESTURE_KINDS: readonly GestureKind[] = ["move", "create", "createOffCanvas"];

export interface HeldGesture {
  /** Releases the pointer, or clicks where the preview is. */
  drop(): void;
  /** Escape. */
  cancel(): void;
}

export interface ClientPoint {
  clientX: number;
  clientY: number;
}

export function service<T>(modeler: CollaborativeContextMapsModeler, name: string): T {
  return modeler.diagram.get<T>(name);
}

export function canvasContainer(modeler: CollaborativeContextMapsModeler): HTMLElement {
  return service<Canvas>(modeler, "canvas").getContainer();
}

export function clientPoint(
  modeler: CollaborativeContextMapsModeler,
  point: { x: number; y: number },
): ClientPoint {
  const canvas = service<Canvas>(modeler, "canvas");
  const viewbox = canvas.viewbox();
  const box = canvas.getContainer().getBoundingClientRect();
  return {
    clientX: box.left + (point.x - viewbox.x) * viewbox.scale,
    clientY: box.top + (point.y - viewbox.y) * viewbox.scale,
  };
}

export function shifted(point: ClientPoint, right: number, down: number): ClientPoint {
  return { clientX: point.clientX + right, clientY: point.clientY + down };
}

export function centreOfBox(element: Element): ClientPoint {
  const box = element.getBoundingClientRect();
  return { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
}

export function pointer(
  target: EventTarget,
  type: string,
  at: ClientPoint,
  init: MouseEventInit = {},
): void {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...at, ...init }),
  );
}

export function canvasSvg(modeler: CollaborativeContextMapsModeler): SVGSVGElement {
  return canvasContainer(modeler).querySelector(":scope > svg")!;
}

export function hoverCanvasAt(modeler: CollaborativeContextMapsModeler, at: ClientPoint): void {
  pointer(document, "mousemove", at);
  pointer(canvasSvg(modeler), "mouseover", at);
  pointer(document, "mousemove", at);
}

export function paletteEntry(
  modeler: CollaborativeContextMapsModeler,
  action: string,
): HTMLElement {
  const entry = canvasContainer(modeler).querySelector<HTMLElement>(
    `.djs-palette [data-action="${action}"]`,
  );
  if (!entry) throw new Error(`the palette has no "${action}" entry`);
  return entry;
}

export function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
}

/** The harness field `startGesture`: a gesture held on `canonicalTexts[0]` the way a user holds it. */
export function startGesture(
  modeler: CollaborativeContextMapsModeler,
  kind: GestureKind,
): HeldGesture {
  if (kind === "move") {
    const element = service<ElementRegistry>(modeler, "elementRegistry").get(
      MOVED_CONTEXT,
    ) as Shape;
    const start = clientPoint(modeler, {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    });
    const hit = service<ElementRegistry>(modeler, "elementRegistry")
      .getGraphics(MOVED_CONTEXT)
      .querySelector(".djs-hit")!;
    pointer(hit, "mousedown", start);
    pointer(document, "mousemove", shifted(start, 20, 10));
    const held = shifted(start, 40, 20);
    hoverCanvasAt(modeler, held);
    return {
      drop: () => {
        pointer(document, "mousemove", shifted(held, 10, 0));
        pointer(document, "mouseup", shifted(held, 10, 0));
      },
      cancel: pressEscape,
    };
  }
  if (kind === "create") {
    const entry = paletteEntry(modeler, "context.core");
    entry.dispatchEvent(
      new DragEvent("dragstart", { bubbles: true, cancelable: true, ...centreOfBox(entry) }),
    );
    const held = clientPoint(modeler, FREE_SPOT);
    hoverCanvasAt(modeler, held);
    return {
      drop: () => {
        pointer(document, "mousemove", shifted(held, 5, 0));
        pointer(document, "mouseup", shifted(held, 5, 0));
      },
      cancel: pressEscape,
    };
  }
  const entry = paletteEntry(modeler, "context.supporting");
  const onPalette = centreOfBox(entry);
  pointer(entry, "click", onPalette, { detail: 1 });
  pointer(document, "mousemove", shifted(onPalette, 3, 2));
  return {
    drop: () => {
      const target = clientPoint(modeler, FREE_SPOT);
      hoverCanvasAt(modeler, target);
      pointer(canvasSvg(modeler), "mousedown", target);
      pointer(document, "mouseup", target);
    },
    cancel: pressEscape,
  };
}

/** The harness field `armTool`: the palette's lasso, armed and waiting for its next press. */
export function armTool(modeler: CollaborativeContextMapsModeler): void {
  const entry = paletteEntry(modeler, "lasso-tool");
  pointer(entry, "click", centreOfBox(entry), { detail: 1 });
  hoverCanvasAt(modeler, clientPoint(modeler, FREE_SPOT));
}

/** The harness field `exportImage`: the SVG export, as a host saves it. */
export function exportImage(modeler: CollaborativeContextMapsModeler): string {
  return modeler.diagram.saveSVG().svg;
}
