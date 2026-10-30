import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import { parseDSL } from "@miragon/event-storming-dsl";
import type { EventStormingBoard } from "@miragon/event-storming-schema-model";
import type { CollaborativeEventStormingModeler } from "../../../src/index.js";
import { isEventStormingShape, type EventStormingShape } from "../../../src/model/di-types.js";

/** One shape of every kind a gesture holds: stickies, an arrow, a resizable note, a drawing. */
export const GESTURE_BOARD = `title Gestures
level design
line [[40, 480], [360, 480], [360, 620]]
command Place Order [200, 200]
event Order Placed [500, 200]
policy Reserve Stock [800, 200]
note Agenda [560, 520] (size 200x120)
Place Order -> Order Placed
`;

/**
 * A board from JSON that the import rejects (L7): its sticky claims the id of the board itself.
 * The DSL reads every text, so only a board that bypasses it reaches a rejection.
 */
export function rejectedBoard(): EventStormingBoard {
  const board = parseDSL("title Broken\nevent Foo [0, 0]\n");
  return {
    ...board,
    elements: board.elements.map((element) => ({ ...element, id: "event-storming-root" })),
  };
}

export interface Point {
  x: number;
  y: number;
}

export function service<T>(modeler: CollaborativeEventStormingModeler, name: string): T {
  return modeler.diagram.get<T>(name);
}

export function shapeOf(
  modeler: CollaborativeEventStormingModeler,
  matches: (shape: EventStormingShape) => boolean,
): EventStormingShape {
  const shape = service<ElementRegistry>(modeler, "elementRegistry").find(
    (element) => isEventStormingShape(element) && matches(element),
  );
  if (!shape) throw new Error("the board has no such shape");
  return shape as EventStormingShape;
}

export const sticky = (modeler: CollaborativeEventStormingModeler, id: string) =>
  shapeOf(modeler, (shape) => shape.id === id);

export const centre = (shape: Shape): Point => ({
  x: shape.x + shape.width / 2,
  y: shape.y + shape.height / 2,
});

export const offset = (point: Point, dx: number, dy: number): Point => ({
  x: point.x + dx,
  y: point.y + dy,
});

/** Synthetic mouse events at board coordinates, as diagram-js receives them from a real pointer. */
export function pointerOn(modeler: CollaborativeEventStormingModeler) {
  const canvas = service<Canvas>(modeler, "canvas");
  const svg = canvas.getContainer().querySelector<SVGSVGElement>(":scope > svg")!;
  const client = (point: Point) => {
    const rect = canvas.getContainer().getBoundingClientRect();
    const viewbox = canvas.viewbox();
    return {
      clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
      clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
    };
  };
  const fire = (type: string, target: EventTarget, point: Point, init: MouseEventInit = {}) =>
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...client(point),
        ...init,
      }),
    );
  return {
    svg,
    graphicsOf: (element: Element) =>
      service<ElementRegistry>(modeler, "elementRegistry").getGraphics(element),
    press: (target: EventTarget, point: Point, init?: MouseEventInit) =>
      fire("mousedown", target, point, init),
    click: (target: EventTarget, point: Point) => fire("click", target, point, { detail: 1 }),
    /** Hover first: diagram-js takes a drag's drop target from the hover events. */
    moveTo(point: Point, over: EventTarget = svg) {
      fire("mouseover", over, point);
      fire("mousemove", over, point);
    },
    release: (point: Point, over: EventTarget = svg) => fire("mouseup", over, point),
  };
}

/** Escape as diagram-js's dragging listens for it: a keyup on the document. */
export function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
}

/**
 * Escape as the keyboard sends it, to the element with the focus: the press on a drawing's handle
 * focuses the canvas, and the point drag takes an Escape aimed at it.
 */
export function pressEscapeOnFocus(): void {
  const focused = document.activeElement ?? document.body;
  for (const type of ["keydown", "keyup"]) {
    focused.dispatchEvent(
      new KeyboardEvent(type, { key: "Escape", bubbles: true, cancelable: true }),
    );
  }
}
