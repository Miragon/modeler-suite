import type { CollaborativeModeler } from "@miragon/modeler-api";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { CollaborativeWardleyModeler, Modeler } from "../../../src/index.js";
import { isWardleyShape, type WardleyShape } from "../../../src/model/di-types.js";

// The harness fields the contract's 1.5 kit cases read (`startGesture`, `armTool`, `exportImage`,
// packages/api/README.md, "Cases for the 1.5 surfaces"), driven the way a user's pointer does.

export type GestureKind = "move" | "create" | "createOffCanvas";

export const GESTURE_KINDS: readonly GestureKind[] = ["move", "create", "createOffCanvas"];

export interface HeldGesture {
  /** Releases the pointer where the gesture holds it. */
  drop(): void;
  /** Presses Escape. */
  cancel(): void;
}

export interface Point {
  x: number;
  y: number;
}

export function diagramOf(modeler: CollaborativeModeler): Modeler {
  return (modeler as CollaborativeWardleyModeler).diagram as Modeler;
}

export function canvasSvgOf(modeler: CollaborativeModeler): SVGSVGElement {
  const svg = diagramOf(modeler)
    .get<Canvas>("canvas")
    .getContainer()
    .querySelector<SVGSVGElement>(":scope > svg");
  if (!svg) throw new Error("the canvas has no <svg>");
  return svg;
}

/** The client coordinates of a point in diagram coordinates. */
export function clientAt(modeler: CollaborativeModeler, point: Point): Point {
  const canvas = diagramOf(modeler).get<Canvas>("canvas");
  const rect = canvas.getContainer().getBoundingClientRect();
  const viewbox = canvas.viewbox();
  return {
    x: rect.left + (point.x - viewbox.x) * viewbox.scale,
    y: rect.top + (point.y - viewbox.y) * viewbox.scale,
  };
}

export function centreOf(target: Element): Point {
  const rect = target.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function mouse(target: EventTarget, type: string, at: Point, init: MouseEventInit = {}) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: at.x,
      clientY: at.y,
      ...init,
    }),
  );
}

/** Escape as a keyboard sends it to the focused canvas: diagram-js cancels a drag on its keyup. */
export function pressEscape(modeler: CollaborativeModeler): void {
  const svg = canvasSvgOf(modeler);
  for (const type of ["keydown", "keyup"]) {
    svg.dispatchEvent(new KeyboardEvent(type, { key: "Escape", bubbles: true, cancelable: true }));
  }
}

export function shapeNamed(modeler: CollaborativeModeler, name: string): WardleyShape {
  const shape = diagramOf(modeler)
    .get<ElementRegistry>("elementRegistry")
    .find((element) => isWardleyShape(element) && element.wardleyLabel === name);
  if (!shape) throw new Error(`the map has no ${name}`);
  return shape as WardleyShape;
}

export function graphicsOf(modeler: CollaborativeModeler, id: string): SVGElement {
  const graphics = diagramOf(modeler).get<ElementRegistry>("elementRegistry").getGraphics(id);
  if (!graphics) throw new Error(`no graphics for ${id}`);
  return graphics;
}

export function paletteEntry(modeler: CollaborativeModeler, action: string): HTMLElement {
  const entry = diagramOf(modeler)
    .get<Canvas>("canvas")
    .getContainer()
    .querySelector<HTMLElement>(`.djs-palette .entry[data-action="${action}"]`);
  if (!entry) throw new Error(`the palette has no ${action} entry`);
  return entry;
}

/** A pointer click on a palette entry (`detail: 1`, unlike Enter or Space on it). */
export function clickEntry(entry: HTMLElement): Point {
  const at = centreOf(entry);
  mouse(entry, "click", at, { detail: 1 });
  return at;
}

/** The pointer enters the canvas: diagram-js takes the drop target from the hover events. */
export function enterCanvas(modeler: CollaborativeModeler): void {
  canvasSvgOf(modeler).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
}

function moveTo(at: Point): void {
  mouse(document, "mousemove", at);
}

/**
 * Holds a gesture on the imported `tea-shop.wmap` and returns while it runs: `move` presses Cup and
 * moves it past the drag threshold, `create` holds the preview of a new component over the canvas,
 * `createOffCanvas` over the palette.
 */
export async function startGesture(
  modeler: CollaborativeModeler,
  kind: GestureKind,
): Promise<HeldGesture> {
  const svg = canvasSvgOf(modeler);
  let at: Point;
  if (kind === "move") {
    const cup = shapeNamed(modeler, "Cup");
    at = clientAt(modeler, { x: cup.x + cup.width / 2, y: cup.y + cup.height / 2 });
    mouse(graphicsOf(modeler, cup.id), "mousedown", at);
    enterCanvas(modeler);
    at = { x: at.x + 30, y: at.y + 10 };
    moveTo({ x: at.x - 15, y: at.y });
    moveTo(at);
  } else {
    const entry = paletteEntry(modeler, "create.component");
    at = clickEntry(entry);
    if (kind === "create") {
      enterCanvas(modeler);
      at = clientAt(modeler, { x: 500, y: 330 });
    } else {
      at = { x: at.x + 4, y: at.y + 2 };
    }
    moveTo(at);
  }
  return {
    drop: () => mouse(kind === "createOffCanvas" ? document : svg, "mouseup", at),
    cancel: () => pressEscape(modeler),
  };
}

/** Arms the lasso from the palette and moves the pointer onto the canvas, without a press. */
export function armTool(modeler: CollaborativeModeler): void {
  const entry = paletteEntry(modeler, "lasso-tool");
  const at = clickEntry(entry);
  enterCanvas(modeler);
  moveTo({ x: at.x + 40, y: at.y + 120 });
  moveTo({ x: at.x + 60, y: at.y + 160 });
}

/** The SVG export, as a host saves it. */
export async function exportImage(modeler: CollaborativeModeler): Promise<string> {
  return (await diagramOf(modeler).saveSVG()).svg;
}
