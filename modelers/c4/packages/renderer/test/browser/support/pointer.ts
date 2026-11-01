/*
 * Real pointer and key events on a mounted diagram, at points in diagram coordinates, for the
 * renderer's own browser tests (the template gestures test's helpers).
 */
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type { BaseViewer } from "../../../src/BaseViewer.js";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Pointer {
  readonly svg: SVGSVGElement;
  client(point: Point): { clientX: number; clientY: number };
  /** A mouse event of the primary button at a point in diagram coordinates, not yet fired. */
  event(type: string, at: Point, init?: MouseEventInit): MouseEvent;
  press(target: EventTarget, at: Point, init?: MouseEventInit): void;
  moveTo(at: Point): void;
  hover(at: Point, target?: EventTarget): void;
  release(at: Point): void;
  /** Presses on the element's centre and drags it past the threshold, holding it there. */
  grab(canvasId: string, by: Point): { drop(): void; cancel(): void };
  /** The centre of a palette entry, in diagram coordinates, and the entry. */
  paletteEntry(action: string): { entry: Element; at: Point };
  /** A pointer click on a palette entry; returns its centre in diagram coordinates. */
  clickPalette(action: string): Point;
  /** The shell's synthesised click for Enter on an entry: no pointer, detail 0. */
  pressPalette(action: string): void;
  dragPrefix(): string | undefined;
}

export function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
}

export function pointerOn(diagram: BaseViewer): Pointer {
  const canvas = diagram.get<Canvas>("canvas");
  const registry = diagram.get<ElementRegistry>("elementRegistry");
  const svg = canvas.getContainer().querySelector<SVGSVGElement>(":scope > svg");
  if (!svg) throw new Error("the canvas has no svg");
  const client = (point: Point) => {
    const rect = canvas.getContainer().getBoundingClientRect();
    const viewbox = canvas.viewbox();
    return {
      clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
      clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
    };
  };
  const event = (type: string, at: Point, init: MouseEventInit = {}) =>
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...client(at), ...init });
  const fire = (type: string, target: EventTarget, at: Point, init: MouseEventInit = {}) => {
    target.dispatchEvent(event(type, at, init));
  };
  const paletteEntry = (action: string) => {
    const entry = diagram.container.querySelector(`.djs-palette [data-action="${action}"]`);
    if (!entry) throw new Error(`no palette entry ${action}`);
    const box = entry.getBoundingClientRect();
    const rect = canvas.getContainer().getBoundingClientRect();
    const viewbox = canvas.viewbox();
    return {
      entry,
      at: {
        x: viewbox.x + (box.left + box.width / 2 - rect.left) / viewbox.scale,
        y: viewbox.y + (box.top + box.height / 2 - rect.top) / viewbox.scale,
      },
    };
  };
  const pointer: Pointer = {
    svg,
    client,
    event,
    press: (target, at, init = {}) => fire("mousedown", target, at, init),
    moveTo: (at) => fire("mousemove", document, at),
    hover(at, target = svg) {
      fire("mouseover", target, at);
      fire("mousemove", document, at);
    },
    release: (at) => fire("mouseup", document, at),
    grab(canvasId, by) {
      const element = registry.get(canvasId) as
        { x: number; y: number; width: number; height: number } | undefined;
      if (!element) throw new Error(`no element ${canvasId} on the canvas`);
      const start = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
      const end = { x: start.x + by.x, y: start.y + by.y };
      pointer.press(registry.getGraphics(canvasId), start);
      pointer.moveTo({ x: start.x + by.x / 3, y: start.y + by.y / 3 });
      pointer.moveTo({ x: start.x + (2 * by.x) / 3, y: start.y + (2 * by.y) / 3 });
      return {
        drop() {
          pointer.hover(end);
          pointer.release(end);
        },
        cancel: pressEscape,
      };
    },
    paletteEntry,
    clickPalette(action) {
      const { entry, at } = paletteEntry(action);
      fire("click", entry, at, { detail: 1 });
      return at;
    },
    pressPalette(action) {
      paletteEntry(action).entry.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
      );
    },
    dragPrefix: () =>
      (diagram.get<Dragging>("dragging").context() as { prefix: string } | null)?.prefix,
  };
  return pointer;
}
