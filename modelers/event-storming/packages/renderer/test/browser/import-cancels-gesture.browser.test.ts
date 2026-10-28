import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  type CollaborativeEventStormingModeler,
} from "../../src/index.js";
import { isEventStormingShape, type EventStormingShape } from "../../src/model/di-types.js";

const BOARD = `title Gestures
level design
line [[40, 480], [360, 480], [360, 620]]
command Place Order [200, 200]
event Order Placed [500, 200]
policy Reserve Stock [800, 200]
note Agenda [560, 520] (size 200x120)
Place Order -> Order Placed
`;

// A peer moved the policy: the import replaces every shape a running gesture holds.
const REMOTE = BOARD.replace("policy Reserve Stock [800, 200]", "policy Reserve Stock [840, 260]");

// The same peer edit with an arrow annotation, which an import waits for the annotation font for.
const REMOTE_ANNOTATED = REMOTE.replace(
  "Place Order -> Order Placed",
  "Place Order -> Order Placed; async",
);

interface Point {
  x: number;
  y: number;
}

const mounted: CollaborativeEventStormingModeler[] = [];
const wrappers: HTMLElement[] = [];
const faces: FontFace[] = [];
let uncaught: unknown[] = [];

const recordUncaught = (event: ErrorEvent) => uncaught.push(event.error ?? event.message);

beforeEach(() => {
  uncaught = [];
  window.addEventListener("error", recordUncaught);
});

afterEach(() => {
  window.removeEventListener("error", recordUncaught);
  for (const modeler of mounted.splice(0)) modeler.destroy();
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
  for (const face of faces.splice(0)) document.fonts.delete(face);
});

async function editorWithBoard(): Promise<CollaborativeEventStormingModeler> {
  const host = attachedHost();
  if (host.parentElement) wrappers.push(host.parentElement);
  const modeler = createCollaborativeModeler();
  modeler.attachTo(host);
  mounted.push(modeler);
  await modeler.importText(BOARD);
  expect(modeler.exportText()).toBe(BOARD);
  return modeler;
}

/** Fails to load, as a blocked font file would, so an annotated board waits for it first. */
function loadingAnnotationFont(): void {
  const face = new FontFace("Geist Variable", "url(data:font/woff2;base64,AAAA)");
  document.fonts.add(face);
  faces.push(face);
}

function changesOf(modeler: CollaborativeEventStormingModeler): () => number {
  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  return () => changes;
}

function service<T>(modeler: CollaborativeEventStormingModeler, name: string): T {
  return modeler.diagram.get<T>(name);
}

function shapeOf(
  modeler: CollaborativeEventStormingModeler,
  matches: (shape: EventStormingShape) => boolean,
): EventStormingShape {
  const shape = service<ElementRegistry>(modeler, "elementRegistry").find(
    (element) => isEventStormingShape(element) && matches(element),
  );
  if (!shape) throw new Error("the board has no such shape");
  return shape as EventStormingShape;
}

const sticky = (modeler: CollaborativeEventStormingModeler, id: string) =>
  shapeOf(modeler, (shape) => shape.id === id);

const centre = (shape: Shape): Point => ({
  x: shape.x + shape.width / 2,
  y: shape.y + shape.height / 2,
});

/** Synthetic mouse events at board coordinates, as diagram-js receives them from a real pointer. */
function pointerOn(modeler: CollaborativeEventStormingModeler) {
  const canvas = service<Canvas>(modeler, "canvas");
  const svg = canvas.getContainer().querySelector("svg")!;
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

const offset = (point: Point, dx: number, dy: number): Point => ({
  x: point.x + dx,
  y: point.y + dy,
});

function expectNothingApplied(
  modeler: CollaborativeEventStormingModeler,
  changes: () => number,
  text: string,
): void {
  expect(uncaught).toEqual([]);
  expect(changes()).toBe(0);
  expect(modeler.exportText()).toBe(text);
  expect(service<CommandStack>(modeler, "commandStack").canUndo()).toBe(false);
  const container = service<Canvas>(modeler, "canvas").getContainer();
  expect(
    container.querySelector(
      ".djs-drag-group, .djs-dragger, .djs-resize-overlay, .djs-lasso-overlay",
    ),
  ).toBe(null);
  const registry = service<ElementRegistry>(modeler, "elementRegistry");
  for (const selected of service<Selection>(modeler, "selection").get() as Element[]) {
    expect(registry.get(selected.id)).toBe(selected);
  }
}

/** The command stack is not stuck: the next user edit is one change again. */
function expectEditsToCount(
  modeler: CollaborativeEventStormingModeler,
  changes: () => number,
): void {
  service<Modeling>(modeler, "modeling").moveElements(
    [sticky(modeler, "policy_reserve_stock") as Shape],
    { x: 20, y: 0 },
  );
  expect(changes()).toBe(1);
}

describe("an import while the user drags a sticky", () => {
  it("ends the drag past the threshold: the release applies nothing", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const event = sticky(modeler, "event_order_placed");
    const start = centre(event);

    pointer.press(pointer.graphicsOf(event), start);
    pointer.moveTo(offset(start, 20, 10));
    pointer.moveTo(offset(start, 60, 40));
    expect(modeler.diagram.container.querySelector(".djs-drag-group")).not.toBe(null);

    await modeler.importText(REMOTE);
    pointer.moveTo(offset(start, 90, 60));
    pointer.release(offset(start, 90, 60));

    expectNothingApplied(modeler, changes, REMOTE);
    expect(centre(sticky(modeler, "event_order_placed"))).toEqual(start);
    expectEditsToCount(modeler, changes);
  });

  it("ends a press still under the threshold, so the moves after the import start no drag", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const event = sticky(modeler, "event_order_placed");
    const start = centre(event);

    pointer.press(pointer.graphicsOf(event), start);
    await modeler.importText(REMOTE);
    pointer.moveTo(offset(start, 30, 20));
    pointer.moveTo(offset(start, 60, 40));
    pointer.release(offset(start, 60, 40));

    expectNothingApplied(modeler, changes, REMOTE);
    expectEditsToCount(modeler, changes);
  });

  it("ends the drag when the import is called, though the import waits for its font", async () => {
    loadingAnnotationFont();
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const start = centre(sticky(modeler, "event_order_placed"));

    pointer.press(pointer.graphicsOf(sticky(modeler, "event_order_placed")), start);
    pointer.moveTo(offset(start, 60, 40));
    const importing = modeler.importText(REMOTE_ANNOTATED);
    pointer.release(offset(start, 60, 40));
    expect(modeler.exportText()).toBe(BOARD);
    await importing;

    expectNothingApplied(modeler, changes, REMOTE_ANNOTATED);
  });

  it("ends a drag that starts while the import waits for its font", async () => {
    loadingAnnotationFont();
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const start = centre(sticky(modeler, "event_order_placed"));

    const importing = modeler.importText(REMOTE_ANNOTATED);
    pointer.press(pointer.graphicsOf(sticky(modeler, "event_order_placed")), start);
    pointer.moveTo(offset(start, 60, 40));
    await importing;
    pointer.release(offset(start, 60, 40));

    expectNothingApplied(modeler, changes, REMOTE_ANNOTATED);
    expectEditsToCount(modeler, changes);
  });
});

describe("an import while the user creates a sticky from the palette", () => {
  const paletteEntry = (modeler: CollaborativeEventStormingModeler) =>
    modeler.diagram.container.querySelector<HTMLElement>(
      '.djs-palette [data-action="create.event"]',
    )!;

  it("ends the create whose preview is on the canvas: the release adds nothing", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const free = { x: 500, y: 360 };

    pointer.click(paletteEntry(modeler), free);
    pointer.moveTo(offset(free, -40, -20));
    pointer.moveTo(free);
    expect(modeler.diagram.container.querySelector(".djs-drag-group")).not.toBe(null);

    await modeler.importText(REMOTE);
    pointer.moveTo(offset(free, 10, 10));
    pointer.press(pointer.svg, offset(free, 10, 10));
    pointer.release(offset(free, 10, 10));

    expectNothingApplied(modeler, changes, REMOTE);
    expectEditsToCount(modeler, changes);
  });

  it("ends the create whose preview is still off the canvas, over the palette", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const free = { x: 500, y: 360 };

    pointer.click(paletteEntry(modeler), free);
    expect(modeler.diagram.container.querySelector(".djs-drag-group")).toBe(null);

    await modeler.importText(REMOTE);
    pointer.moveTo(free);
    pointer.press(pointer.svg, free);
    pointer.release(free);

    expectNothingApplied(modeler, changes, REMOTE);
    expectEditsToCount(modeler, changes);
  });
});

describe("an import while the user resizes a note", () => {
  it("ends the resize: the release changes no box", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const note = shapeOf(modeler, (shape) => shape.eventStormingType === "note");
    service<Selection>(modeler, "selection").select(note);
    const handle = modeler.diagram.container.querySelector(".djs-resizer-se")!;
    const corner = { x: note.x + note.width, y: note.y + note.height };

    pointer.press(handle, corner);
    pointer.moveTo(offset(corner, 30, 20));
    pointer.moveTo(offset(corner, 80, 60));
    expect(modeler.diagram.container.querySelector(".djs-resize-overlay")).not.toBe(null);

    await modeler.importText(REMOTE);
    pointer.release(offset(corner, 80, 60));

    expectNothingApplied(modeler, changes, REMOTE);
    expectEditsToCount(modeler, changes);
  });
});

describe("an import while the user connects two stickies", () => {
  it("ends the connect: the release draws no arrow", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const source = sticky(modeler, "event_order_placed");
    const target = sticky(modeler, "policy_reserve_stock");
    service<Selection>(modeler, "selection").select(source);
    const entry = modeler.diagram.container.querySelector(
      '.djs-context-pad [data-action="connect"]',
    )!;

    pointer.click(entry, centre(source));
    pointer.moveTo(offset(centre(source), 60, 0));
    pointer.moveTo(centre(target), pointer.graphicsOf(target));
    expect(modeler.diagram.container.querySelector(".djs-dragger")).not.toBe(null);

    await modeler.importText(REMOTE);
    pointer.release(centre(target), pointer.svg);

    expectNothingApplied(modeler, changes, REMOTE);
    expectEditsToCount(modeler, changes);
  });
});

describe("an import while the user draws a lasso", () => {
  it("ends the lasso: the release selects nothing the import removed", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const event = sticky(modeler, "event_order_placed");
    const corner = { x: event.x - 40, y: event.y - 40 };
    const across = { x: event.x + event.width + 40, y: event.y + event.height + 40 };

    pointer.press(pointer.svg, corner, { shiftKey: true });
    pointer.moveTo(offset(corner, 20, 20));
    pointer.moveTo(across);
    expect(modeler.diagram.container.querySelector(".djs-lasso-overlay")).not.toBe(null);

    await modeler.importText(REMOTE);
    pointer.moveTo(offset(across, 10, 10));
    pointer.release(offset(across, 10, 10));

    expectNothingApplied(modeler, changes, REMOTE);
    expect(service<Selection>(modeler, "selection").get()).toEqual([]);
    expectEditsToCount(modeler, changes);
  });

  it("keeps the palette's lasso tool armed, which then selects on the imported board", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const entry = modeler.diagram.container.querySelector(
      '.djs-palette [data-action="lasso-tool"]',
    )!;
    const before = sticky(modeler, "policy_reserve_stock");

    pointer.click(entry, centre(before));
    pointer.moveTo(offset(centre(before), -300, 100));

    await modeler.importText(REMOTE);
    const moved = sticky(modeler, "policy_reserve_stock");
    const corner = { x: moved.x - 20, y: moved.y - 20 };
    pointer.press(pointer.svg, corner);
    pointer.moveTo(offset(corner, 20, 20));
    pointer.moveTo({ x: moved.x + moved.width + 20, y: moved.y + moved.height + 20 });
    pointer.release({ x: moved.x + moved.width + 20, y: moved.y + moved.height + 20 });

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(0);
    expect(service<Selection>(modeler, "selection").get()).toEqual([moved]);
  });
});

describe("an import while the user drags a point of a drawing", () => {
  it("ends the point drag: the release changes no drawing", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const drawing = shapeOf(modeler, (shape) => shape.eventStormingType === "drawing");
    service<Selection>(modeler, "selection").select(drawing);
    const handle = modeler.diagram.container.querySelector(".event-storming-drawing-handle")!;
    const preview = ".layer-event-storming-drawing-handles polyline";
    const first = { x: 40, y: 480 };

    pointer.press(handle, first);
    pointer.moveTo(offset(first, 30, -40));
    expect(modeler.diagram.container.querySelector(preview)).not.toBe(null);

    await modeler.importText(REMOTE);
    pointer.moveTo(offset(first, 60, -80));
    pointer.release(offset(first, 60, -80));

    expectNothingApplied(modeler, changes, REMOTE);
    expect(
      modeler.diagram.container.querySelector(`.event-storming-drawing-handle, ${preview}`),
    ).toBe(null);
    expectEditsToCount(modeler, changes);
  });
});
