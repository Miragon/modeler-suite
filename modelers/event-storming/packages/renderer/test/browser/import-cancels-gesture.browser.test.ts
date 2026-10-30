import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  Modeler,
  type CollaborativeEventStormingModeler,
} from "../../src/index.js";
import { isEventStormingShape, type EventStormingShape } from "../../src/model/di-types.js";
import type EventStormingLabelEditing from "../../src/label-editing/EventStormingLabelEditing.js";
import { noteMarkdownToDom } from "../../src/label-editing/note-editor-dom.js";
import {
  GESTURE_BOARD as BOARD,
  centre,
  offset,
  pointerOn,
  service,
  shapeOf,
  sticky,
  type Point,
} from "./support/gestures.js";

// A peer moved the policy: the import replaces every shape a running gesture holds.
const REMOTE = BOARD.replace("policy Reserve Stock [800, 200]", "policy Reserve Stock [840, 260]");

// The same peer edit with an arrow annotation, which an import waits for the annotation font for.
const REMOTE_ANNOTATED = REMOTE.replace(
  "Place Order -> Order Placed",
  "Place Order -> Order Placed; async",
);

const mounted: CollaborativeEventStormingModeler[] = [];
const plainModelers: Modeler[] = [];
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
  for (const modeler of plainModelers.splice(0)) modeler.destroy();
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

  it("ends the point drag when the import is called, though the import waits for its font", async () => {
    loadingAnnotationFont();
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    let stackChanges = 0;
    service<EventBus>(modeler, "eventBus").on("commandStack.changed", () => (stackChanges += 1));
    service<Selection>(modeler, "selection").select(
      shapeOf(modeler, (shape) => shape.eventStormingType === "drawing"),
    );
    const handle = modeler.diagram.container.querySelector(".event-storming-drawing-handle")!;
    const first = { x: 40, y: 480 };

    pointer.press(handle, first);
    pointer.moveTo(offset(first, 60, -80));
    const importing = modeler.importText(REMOTE_ANNOTATED);
    pointer.release(offset(first, 60, -80));
    expect(modeler.exportText()).toBe(BOARD);
    expect(stackChanges).toBe(0);
    await importing;

    expectNothingApplied(modeler, changes, REMOTE_ANNOTATED);
    expectEditsToCount(modeler, changes);
  });
});

/**
 * A host that echoes every change back through its store (a CRDT observer that does not filter its
 * own origin) imports inside `onContentChanged`, while the drop that made the change still runs.
 */
function reimportOnFirstChange(
  modeler: CollaborativeEventStormingModeler,
): () => Promise<unknown> | undefined {
  let reimport: Promise<unknown> | undefined;
  modeler.onContentChanged(() => {
    reimport ??= modeler.importText(modeler.exportText());
  });
  return () => reimport;
}

/**
 * A host that echoes every change back, each import started once the one before has settled (the
 * contract defines no overlapping imports): the first echo of a drop runs inside it.
 */
function echoEveryChange(modeler: CollaborativeEventStormingModeler) {
  const imports: Promise<unknown>[] = [];
  let pending: Promise<unknown> | undefined;
  modeler.onContentChanged(() => {
    const text = modeler.exportText();
    const run = () => modeler.importText(text);
    const next = pending ? pending.then(run, run) : run();
    pending = next;
    imports.push(next);
    void next.then(
      () => (pending = pending === next ? undefined : pending),
      () => (pending = pending === next ? undefined : pending),
    );
  });
  return {
    started: () => imports.length,
    settled: () => Promise.all(imports),
  };
}

const appendEntry = (modeler: CollaborativeEventStormingModeler) =>
  modeler.diagram.container.querySelector('.djs-context-pad [data-action="append"]')!;

/** An append from Order Placed, placed with a press at `free`; the trailing click is the caller's. */
function pressAppend(modeler: CollaborativeEventStormingModeler, free: Point) {
  const pointer = pointerOn(modeler);
  const source = sticky(modeler, "event_order_placed");
  service<Selection>(modeler, "selection").select(source);
  pointer.click(appendEntry(modeler), centre(source));
  pointer.moveTo(offset(free, -40, -20));
  pointer.moveTo(free);
  pointer.press(pointer.svg, free);
  return { pointer, placed: shapeOf(modeler, (shape) => shape.provisional === true) };
}

function dragEndingsOf(modeler: CollaborativeEventStormingModeler) {
  const endings = { ended: 0, canceled: 0 };
  const eventBus = service<EventBus>(modeler, "eventBus");
  eventBus.on("drag.ended", () => (endings.ended += 1));
  eventBus.on("drag.canceled", () => (endings.canceled += 1));
  return endings;
}

/** The drop applied once, ended as a drop, and the re-import inside it left the canvas usable. */
async function expectTheDropKept(
  modeler: CollaborativeEventStormingModeler,
  changes: () => number,
  endings: { ended: number; canceled: number },
  reimport: Promise<unknown> | undefined,
  before: string,
): Promise<void> {
  await expect(reimport).resolves.toBeDefined();
  expect(uncaught).toEqual([]);
  expect(changes()).toBe(1);
  expect(endings).toEqual({ ended: 1, canceled: 0 });
  const dropped = modeler.exportText();
  expect(dropped).not.toBe(before);
  expect(service<Dragging>(modeler, "dragging").context()).toBeFalsy();
  const container = service<Canvas>(modeler, "canvas").getContainer();
  expect(container.querySelector(".djs-drag-group, .djs-dragger")).toBe(null);
  const registry = service<ElementRegistry>(modeler, "elementRegistry");
  for (const selected of service<Selection>(modeler, "selection").get() as Element[]) {
    expect(registry.get(selected.id)).toBe(selected);
  }
  service<Modeling>(modeler, "modeling").moveElements(
    [sticky(modeler, "policy_reserve_stock") as Shape],
    { x: 20, y: 0 },
  );
  expect(changes()).toBe(2);
  expect(modeler.exportText()).not.toBe(dropped);
}

describe("an import from inside the change listener of a drop", () => {
  it("keeps the move the drop applied", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const endings = dragEndingsOf(modeler);
    const reimport = reimportOnFirstChange(modeler);
    const event = sticky(modeler, "event_order_placed");
    const start = centre(event);

    pointer.press(pointer.graphicsOf(event), start);
    pointer.moveTo(offset(start, 20, 10));
    pointer.moveTo(offset(start, 60, 40));
    pointer.release(offset(start, 60, 40));

    await expectTheDropKept(modeler, changes, endings, reimport(), BOARD);
    expect(centre(sticky(modeler, "event_order_placed"))).toEqual(offset(start, 60, 40));
  });

  it("keeps the sticky a palette create dropped", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const endings = dragEndingsOf(modeler);
    const reimport = reimportOnFirstChange(modeler);
    const free = { x: 500, y: 360 };
    const entry = modeler.diagram.container.querySelector<HTMLElement>(
      '.djs-palette [data-action="create.event"]',
    )!;

    pointer.click(entry, free);
    pointer.moveTo(offset(free, -40, -20));
    pointer.moveTo(free);
    pointer.press(pointer.svg, free);
    pointer.release(free);

    await expectTheDropKept(modeler, changes, endings, reimport(), BOARD);
    expect(
      service<ElementRegistry>(modeler, "elementRegistry").filter(
        (element) => isEventStormingShape(element) && element.eventStormingType === "event",
      ),
    ).toHaveLength(2);
  });

  it("lets the drop end when the listener clears the board", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const endings = dragEndingsOf(modeler);
    modeler.onContentChanged(() => modeler.diagram.clear());
    const event = sticky(modeler, "event_order_placed");
    const start = centre(event);

    pointer.press(pointer.graphicsOf(event), start);
    pointer.moveTo(offset(start, 20, 10));
    pointer.moveTo(offset(start, 60, 40));
    pointer.release(offset(start, 60, 40));

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(1);
    expect(endings).toEqual({ ended: 1, canceled: 0 });
    expect(service<Dragging>(modeler, "dragging").context()).toBeFalsy();
    expect(modeler.exportText()).not.toContain("Order Placed");
  });
});

describe("an import from inside the change listener of the label commit a press makes", () => {
  it("refuses the resize the press on a note's handle starts, and keeps the commit", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const endings = dragEndingsOf(modeler);
    const reimport = reimportOnFirstChange(modeler);
    let resizeStarts = 0;
    service<EventBus>(modeler, "eventBus").on("resize.start", () => (resizeStarts += 1));
    const note = shapeOf(modeler, (shape) => shape.eventStormingType === "note");
    service<Selection>(modeler, "selection").select(note);
    service<EventStormingLabelEditing>(modeler, "eventStormingLabelEditing").activate(note);
    await userEvent.keyboard("XY");
    const handle = modeler.diagram.container.querySelector(".djs-resizer-se .djs-resizer-hit")!;
    const corner = { x: note.x + note.width, y: note.y + note.height };
    const committed = BOARD.replace("note Agenda [", "note XY [");

    pointer.press(handle, corner);
    await expect(reimport()).resolves.toBeDefined();
    pointer.moveTo(offset(corner, 80, 60));
    pointer.release(offset(corner, 80, 60));

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(1);
    expect(modeler.exportText()).toBe(committed);
    expect(resizeStarts).toBe(0);
    expect(endings).toEqual({ ended: 0, canceled: 0 });
    expect(service<Dragging>(modeler, "dragging").context()).toBeFalsy();
    expect(modeler.diagram.container.querySelector(".djs-resize-overlay")).toBe(null);

    const imported = shapeOf(modeler, (shape) => shape.eventStormingType === "note");
    service<Selection>(modeler, "selection").select(imported);
    pointer.press(
      modeler.diagram.container.querySelector(".djs-resizer-se .djs-resizer-hit")!,
      corner,
    );
    pointer.moveTo(offset(corner, 40, 20));
    pointer.release(offset(corner, 40, 20));

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(2);
    expect(resizeStarts).toBe(1);
    expect(modeler.exportText()).toContain("note XY [580, 530] (size 240x140)");
  });
});

// A peer deleted the event the user moves: the import removes the moved sticky.
const WITHOUT_ORDER_PLACED = BOARD.replace("event Order Placed [500, 200]\n", "").replace(
  "Place Order -> Order Placed\n",
  "",
);

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("an import from inside the change listener of a drop waits for the drop (#248)", () => {
  it.each([
    ["the moved sticky", "event_order_placed"],
    ["another sticky", "policy_reserve_stock"],
  ])(
    "ends a move as a drop when %s was selected before the drag",
    async (_, selectedBeforeDrag) => {
      const modeler = await editorWithBoard();
      const pointer = pointerOn(modeler);
      const changes = changesOf(modeler);
      const endings = dragEndingsOf(modeler);
      let reimport: Promise<unknown> | undefined;
      modeler.onContentChanged(() => {
        reimport ??= modeler.importText(WITHOUT_ORDER_PLACED);
      });
      service<Selection>(modeler, "selection").select(sticky(modeler, selectedBeforeDrag));
      const event = sticky(modeler, "event_order_placed");
      const start = centre(event);

      pointer.press(pointer.graphicsOf(event), start);
      pointer.moveTo(offset(start, 20, 10));
      pointer.moveTo(offset(start, 60, 40));
      pointer.release(offset(start, 60, 40));

      // Every listener of the drop ran on the board it changed; the import comes after it.
      expect(uncaught).toEqual([]);
      expect(endings).toEqual({ ended: 1, canceled: 0 });
      expect(reimport).toBeDefined();
      expect(centre(sticky(modeler, "event_order_placed"))).toEqual(offset(start, 60, 40));

      await expect(reimport).resolves.toBeDefined();
      expect(uncaught).toEqual([]);
      expect(changes()).toBe(1);
      expect(modeler.exportText()).toBe(WITHOUT_ORDER_PLACED);
      const registry = service<ElementRegistry>(modeler, "elementRegistry");
      for (const selected of service<Selection>(modeler, "selection").get() as Element[]) {
        expect(registry.get(selected.id)).toBe(selected);
      }
      service<Modeling>(modeler, "modeling").moveElements(
        [sticky(modeler, "policy_reserve_stock") as Shape],
        { x: 20, y: 0 },
      );
      expect(changes()).toBe(2);
    },
  );

  it("opens the kind chooser of an append on the placed sticky, and again on the echoed one", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const reimport = reimportOnFirstChange(modeler);
    const registry = service<ElementRegistry>(modeler, "elementRegistry");
    const choosers: { target: unknown; onTheBoard: boolean; imported: boolean }[] = [];
    let imported = false;
    service<EventBus>(modeler, "eventBus").on(
      "popupMenu.open.allowed",
      (event: { target: { id: string } }) => {
        choosers.push({
          target: event.target,
          onTheBoard: registry.get(event.target.id) === event.target,
          imported,
        });
      },
    );
    const source = sticky(modeler, "event_order_placed");
    service<Selection>(modeler, "selection").select(source);
    const entry = modeler.diagram.container.querySelector(
      '.djs-context-pad [data-action="append"]',
    )!;
    const free = { x: 700, y: 400 };

    pointer.click(entry, centre(source));
    pointer.moveTo(offset(free, -40, -20));
    pointer.moveTo(free);
    pointer.press(pointer.svg, free);
    const placed = shapeOf(modeler, (shape) => shape.provisional === true);
    void reimport()?.then(() => (imported = true));
    pointer.release(free);
    pointer.click(pointer.svg, free);

    await expect(reimport()).resolves.toBeDefined();
    await nextTask();

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(1);
    const echoed = sticky(modeler, placed.id);
    expect(echoed).not.toBe(placed);
    expect(echoed.provisional).toBe(true);
    // First on the sticky the user placed, before the import; then on its echo.
    expect(
      choosers.map(({ target, onTheBoard, imported: afterImport }) => ({
        placed: target === placed,
        echoed: target === echoed,
        onTheBoard,
        afterImport,
      })),
    ).toEqual([
      { placed: true, echoed: false, onTheBoard: true, afterImport: false },
      { placed: false, echoed: true, onTheBoard: true, afterImport: true },
    ]);
    const popup = modeler.diagram.container.querySelector(".djs-popup");
    expect(popup).not.toBe(null);

    popup!
      .querySelector('[data-id="kind-policy"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTask();
    expect(changes()).toBe(2);
    expect(echoed.eventStormingType).toBe("policy");
    expect(echoed.provisional).toBeUndefined();
    expect(modeler.diagram.container.querySelector(".event-storming-label-input")).not.toBe(null);
  });

  it("keeps the name typed after the kind of an append is picked, with a host that echoes every change", async () => {
    const modeler = await editorWithBoard();
    const changes = changesOf(modeler);
    const echo = echoEveryChange(modeler);
    const free = { x: 700, y: 400 };

    const { pointer, placed } = pressAppend(modeler, free);
    pointer.release(free);
    pointer.click(pointer.svg, free);
    await echo.settled();
    await nextTask();
    modeler.diagram.container
      .querySelector('.djs-popup [data-id="kind-policy"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await echo.settled();
    await nextTask();

    const field = modeler.diagram.container.querySelector<HTMLTextAreaElement>(
      ".event-storming-label-input",
    );
    expect(field).not.toBe(null);
    field!.value = "Reserve More Stock";
    field!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
    );
    await echo.settled();

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(3);
    expect(echo.started()).toBe(3);
    const named = sticky(modeler, placed.id);
    expect(named.eventStormingType).toBe("policy");
    expect(named.eventStormingLabel).toBe("Reserve More Stock");
    expect(modeler.exportText()).toContain("policy Reserve More Stock [");
  });

  it("reports an undo while the step of an append holds the drop, and the waiting import keeps it", async () => {
    const modeler = await editorWithBoard();
    const changes = changesOf(modeler);
    const echo = echoEveryChange(modeler);
    const free = { x: 700, y: 400 };

    const { pointer } = pressAppend(modeler, free);
    pointer.release(free);
    expect(echo.started()).toBe(1);
    expect(modeler.exportText()).not.toBe(BOARD);

    service<CommandStack>(modeler, "commandStack").undo();
    expect(changes()).toBe(2);
    expect(modeler.exportText()).toBe(BOARD);
    pointer.click(pointer.svg, free);
    await echo.settled();
    await nextTask();

    expect(uncaught).toEqual([]);
    expect(echo.started()).toBe(2);
    expect(modeler.exportText()).toBe(BOARD);
  });

  it("applies a drawing's point drop before the import, which waits for the drop's listeners", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const reimport = reimportOnFirstChange(modeler);
    const drawing = shapeOf(modeler, (shape) => shape.eventStormingType === "drawing");
    const registry = service<ElementRegistry>(modeler, "elementRegistry");
    const boardInTheDrop: boolean[] = [];
    service<EventBus>(modeler, "eventBus").on("commandStack.changed", () =>
      boardInTheDrop.push(registry.get(drawing.id) === drawing),
    );
    service<Selection>(modeler, "selection").select(drawing);
    const handle = modeler.diagram.container.querySelector(".event-storming-drawing-handle")!;
    const first = { x: 40, y: 480 };

    pointer.press(handle, first);
    pointer.moveTo(offset(first, 30, -40));
    pointer.release(offset(first, 30, -40));
    const dropped = modeler.exportText();
    expect(dropped).not.toBe(BOARD);
    expect(boardInTheDrop).toEqual([true]);

    await expect(reimport()).resolves.toBeDefined();
    expect(uncaught).toEqual([]);
    expect(changes()).toBe(1);
    expect(modeler.exportText()).toBe(dropped);
  });

  it("rejects an import waiting for the step of an append when the modeler is destroyed", async () => {
    const modeler = await editorWithBoard();
    const reimport = reimportOnFirstChange(modeler);
    const free = { x: 700, y: 400 };

    const { pointer } = pressAppend(modeler, free);
    pointer.release(free);
    expect(reimport()).toBeDefined();
    modeler.destroy();

    await expect(reimport()).rejects.toThrow(/destroyed/);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(uncaught).toEqual([]);
  });

  it("lets an import run after a drop whose cleanup throws, with the gesture ended", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const endings = dragEndingsOf(modeler);
    const failure = new Error("a cleanup listener failed");
    service<EventBus>(modeler, "eventBus").on("drag.cleanup", () => {
      throw failure;
    });
    let reimport: Promise<unknown> | undefined;
    modeler.onContentChanged(() => {
      reimport ??= modeler.importText(WITHOUT_ORDER_PLACED);
    });
    const event = sticky(modeler, "event_order_placed");
    const start = centre(event);

    pointer.press(pointer.graphicsOf(event), start);
    pointer.moveTo(offset(start, 20, 10));
    pointer.moveTo(offset(start, 60, 40));
    pointer.release(offset(start, 60, 40));
    expect(endings).toEqual({ ended: 0, canceled: 0 });
    expect(reimport).toBeDefined();
    expect(modeler.exportText()).not.toBe(WITHOUT_ORDER_PLACED);

    await expect(reimport).resolves.toBeDefined();
    await nextTask();
    expect(uncaught).toEqual([failure]);
    expect(modeler.interaction.active()).toBe(false);
    expect(modeler.exportText()).toBe(WITHOUT_ORDER_PLACED);
  });
});

const paletteEntryOf = (modeler: CollaborativeEventStormingModeler, action: string) =>
  modeler.diagram.container.querySelector<HTMLElement>(`.djs-palette [data-action="${action}"]`)!;

/**
 * Enter or Space on a creating palette entry, as the shell synthesises it (a click with no
 * pointer); returns the sticky it created, the one whose id the board did not have.
 */
function createWithEnter(
  modeler: CollaborativeEventStormingModeler,
  action: string,
): EventStormingShape {
  const registry = service<ElementRegistry>(modeler, "elementRegistry");
  const before = new Set(registry.getAll().map((element) => element.id));
  paletteEntryOf(modeler, action).dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
  );
  return shapeOf(modeler, (shape) => !before.has(shape.id));
}

// The commit renames the policy, whose id then no longer follows from its name and is written.
const RENAMED_POLICY = BOARD.replace(
  "policy Reserve Stock [800, 200]",
  "policy Reserve More Stock [800, 200] (id policy_reserve_stock)",
);

const labelField = (modeler: CollaborativeEventStormingModeler) =>
  modeler.diagram.container.querySelector<HTMLTextAreaElement>(".event-storming-label-input");

function commitWithCtrlEnter(field: HTMLElement): void {
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
}

/** The label editor open on `shape` with `text` typed into it. */
function typingInto(
  modeler: CollaborativeEventStormingModeler,
  shape: EventStormingShape,
  text: string,
): HTMLTextAreaElement {
  service<EventStormingLabelEditing>(modeler, "eventStormingLabelEditing").activate(shape);
  const field = labelField(modeler)!;
  field.value = text;
  return field;
}

/** Whether each shape is still the one the board holds under its id: no import replaced it. */
function stickiesOnTheBoard(modeler: CollaborativeEventStormingModeler) {
  const registry = service<ElementRegistry>(modeler, "elementRegistry");
  return (...shapes: EventStormingShape[]) =>
    shapes.every((shape) => registry.get(shape.id) === shape);
}

describe("an import from inside the change listener of a user action waits for the action (#305)", () => {
  it("opens the label editor of a keyboard create on the created sticky, then on the echoed one, and keeps the name", async () => {
    const modeler = await editorWithBoard();
    const changes = changesOf(modeler);
    const reimport = reimportOnFirstChange(modeler);
    const labelEditing = service<EventStormingLabelEditing>(modeler, "eventStormingLabelEditing");
    const onTheBoard = stickiesOnTheBoard(modeler);

    const created = createWithEnter(modeler, "create.event");

    // The create selected its sticky and opened its editor on the board it changed.
    expect(reimport()).toBeDefined();
    expect(onTheBoard(created)).toBe(true);
    expect(service<Selection>(modeler, "selection").get()).toEqual([created]);
    expect(labelEditing.openEdit()?.elementId).toBe(created.id);

    await expect(reimport()).resolves.toBeDefined();
    await nextTask();
    const echoed = sticky(modeler, created.id);
    expect(echoed).not.toBe(created);
    expect(labelEditing.openEdit()?.elementId).toBe(created.id);

    const field = labelField(modeler)!;
    field.value = "Typed Name";
    commitWithCtrlEnter(field);

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(2);
    expect(echoed.eventStormingLabel).toBe("Typed Name");
    expect(modeler.exportText()).toContain("event Typed Name [");
  });

  it("keeps the name typed after a keyboard create, with a host that echoes every change", async () => {
    const modeler = await editorWithBoard();
    const changes = changesOf(modeler);
    const echo = echoEveryChange(modeler);

    const created = createWithEnter(modeler, "create.command");
    await echo.settled();
    await nextTask();
    const field = labelField(modeler)!;
    field.value = "Cancel Order";
    commitWithCtrlEnter(field);
    await echo.settled();

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(2);
    expect(echo.started()).toBe(2);
    expect(sticky(modeler, created.id).eventStormingLabel).toBe("Cancel Order");
    expect(modeler.exportText()).toContain("command Cancel Order [");
  });

  it("imports a label commit once the key that committed it has been handled", async () => {
    const modeler = await editorWithBoard();
    const changes = changesOf(modeler);
    const reimport = reimportOnFirstChange(modeler);
    const onTheBoard = stickiesOnTheBoard(modeler);
    const policy = sticky(modeler, "policy_reserve_stock");

    commitWithCtrlEnter(typingInto(modeler, policy, "Reserve More Stock"));

    expect(reimport()).toBeDefined();
    expect(onTheBoard(policy)).toBe(true);
    await expect(reimport()).resolves.toBeDefined();
    await nextTask();

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(1);
    expect(sticky(modeler, policy.id)).not.toBe(policy);
    expect(modeler.exportText()).toBe(RENAMED_POLICY);
    expect(labelField(modeler)).toBe(null);
    service<Modeling>(modeler, "modeling").moveElements(
      [sticky(modeler, "policy_reserve_stock") as Shape],
      { x: 20, y: 0 },
    );
    expect(changes()).toBe(2);
  });

  it("imports once a press on another sticky has committed the label, refusing the move it starts", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const endings = dragEndingsOf(modeler);
    const reimport = reimportOnFirstChange(modeler);
    const onTheBoard = stickiesOnTheBoard(modeler);
    const policy = sticky(modeler, "policy_reserve_stock");
    const event = sticky(modeler, "event_order_placed");
    const start = centre(event);
    typingInto(modeler, policy, "Reserve More Stock");

    pointer.press(pointer.graphicsOf(event), start);
    expect(reimport()).toBeDefined();
    expect(onTheBoard(policy, event)).toBe(true);
    await expect(reimport()).resolves.toBeDefined();
    pointer.moveTo(offset(start, 30, 20));
    pointer.moveTo(offset(start, 60, 40));
    pointer.release(offset(start, 60, 40));

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(1);
    expect(endings).toEqual({ ended: 0, canceled: 0 });
    expect(modeler.exportText()).toBe(RENAMED_POLICY);
    expect(service<Dragging>(modeler, "dragging").context()).toBeFalsy();
    expect(modeler.diagram.container.querySelector(".djs-drag-group")).toBe(null);

    const echoed = sticky(modeler, "event_order_placed");
    pointer.press(pointer.graphicsOf(echoed), start);
    pointer.moveTo(offset(start, 30, 20));
    pointer.moveTo(offset(start, 60, 40));
    pointer.release(offset(start, 60, 40));
    expect(uncaught).toEqual([]);
    expect(changes()).toBe(2);
    expect(centre(sticky(modeler, "event_order_placed"))).toEqual(offset(start, 60, 40));
  });

  it("imports once a click on a palette entry has committed the label, refusing the create it starts", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const changes = changesOf(modeler);
    const reimport = reimportOnFirstChange(modeler);
    const onTheBoard = stickiesOnTheBoard(modeler);
    const policy = sticky(modeler, "policy_reserve_stock");
    const free = { x: 500, y: 360 };
    typingInto(modeler, policy, "Reserve More Stock");

    pointer.click(paletteEntryOf(modeler, "create.event"), free);
    expect(reimport()).toBeDefined();
    expect(onTheBoard(policy)).toBe(true);
    await expect(reimport()).resolves.toBeDefined();
    pointer.moveTo(offset(free, -40, -20));
    pointer.moveTo(free);
    pointer.press(pointer.svg, free);
    pointer.release(free);

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(1);
    expect(modeler.exportText()).toBe(RENAMED_POLICY);
    expect(service<Dragging>(modeler, "dragging").context()).toBeFalsy();
    expect(modeler.interaction.active()).toBe(false);

    pointer.click(paletteEntryOf(modeler, "create.event"), free);
    pointer.moveTo(offset(free, -40, -20));
    pointer.moveTo(free);
    pointer.press(pointer.svg, free);
    pointer.release(free);
    expect(uncaught).toEqual([]);
    expect(changes()).toBe(2);
    expect(modeler.exportText()).not.toBe(RENAMED_POLICY);
  });

  it("keeps the text typed after a keyboard create of a note, whose id the echo changes", async () => {
    const modeler = await editorWithBoard();
    const changes = changesOf(modeler);
    const echo = echoEveryChange(modeler);
    const labelEditing = service<EventStormingLabelEditing>(modeler, "eventStormingLabelEditing");

    const created = createWithEnter(modeler, "create.note");
    expect(labelEditing.openEdit()?.elementId).toBe(created.id);
    await echo.settled();
    await nextTask();
    // A note has no id grammar: the import derives its id from its text.
    expect(service<ElementRegistry>(modeler, "elementRegistry").get(created.id)).toBeUndefined();
    const echoed = shapeOf(
      modeler,
      (shape) => shape.eventStormingType === "note" && shape.id !== "note_agenda",
    );
    expect(centre(echoed).x).toBeCloseTo(centre(created).x, 2);
    expect(centre(echoed).y).toBeCloseTo(centre(created).y, 2);
    expect(labelEditing.openEdit()?.elementId).toBe(echoed.id);

    const editor = labelField(modeler)!;
    noteMarkdownToDom(editor, "Remember the milk");
    commitWithCtrlEnter(editor);
    await echo.settled();

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(2);
    expect(echo.started()).toBe(2);
    expect(labelField(modeler)).toBe(null);
    expect(modeler.exportText()).toContain("note Remember the milk [");
  });
});

/** A host that imports a peer's board as soon as the selection changes, once. */
function importOnSelection(
  modeler: CollaborativeEventStormingModeler,
  text: string,
): () => Promise<unknown> | undefined {
  let reimport: Promise<unknown> | undefined;
  modeler.elements.onSelection(() => {
    reimport ??= modeler.importText(text);
  });
  return () => reimport;
}

/** The import replaced the board after the command, which left a usable history behind. */
async function expectTheImportAfterTheCommand(
  modeler: CollaborativeEventStormingModeler,
  changes: () => number,
  reimport: () => Promise<unknown> | undefined,
): Promise<void> {
  expect(reimport()).toBeDefined();
  expect(modeler.exportText()).not.toBe(REMOTE);
  await expect(reimport()).resolves.toBeDefined();
  expect(uncaught).toEqual([]);
  expect(changes()).toBe(1);
  expect(modeler.exportText()).toBe(REMOTE);
  const commandStack = service<CommandStack>(modeler, "commandStack");
  expect(commandStack.canUndo()).toBe(false);
  expect(commandStack.canRedo()).toBe(false);
  const policy = sticky(modeler, "policy_reserve_stock");
  expect(policy.parent).toBeTruthy();
  service<Modeling>(modeler, "modeling").moveElements([policy as Shape], { x: 20, y: 0 });
  expect(changes()).toBe(2);
  commandStack.undo();
  expect(uncaught).toEqual([]);
  expect(modeler.exportText()).toBe(REMOTE);
}

describe("an import from a selection listener inside a command waits for the command", () => {
  it("imports after a delete of the selected sticky", async () => {
    const modeler = await editorWithBoard();
    const event = sticky(modeler, "event_order_placed");
    service<Selection>(modeler, "selection").select(event);
    const changes = changesOf(modeler);
    const reimport = importOnSelection(modeler, REMOTE);

    service<Modeling>(modeler, "modeling").removeElements([event as Shape]);

    await expectTheImportAfterTheCommand(modeler, changes, reimport);
  });

  it("imports after an undo that removes the selected sticky", async () => {
    const modeler = await editorWithBoard();
    createWithEnter(modeler, "create.event");
    service<EventStormingLabelEditing>(modeler, "eventStormingLabelEditing").cancel();
    expect(service<Selection>(modeler, "selection").get()).toHaveLength(1);
    await nextTask();
    const changes = changesOf(modeler);
    const reimport = importOnSelection(modeler, REMOTE);

    service<CommandStack>(modeler, "commandStack").undo();

    await expectTheImportAfterTheCommand(modeler, changes, reimport);
  });

  it("imports after a redo that deletes the selected sticky again", async () => {
    const modeler = await editorWithBoard();
    const commandStack = service<CommandStack>(modeler, "commandStack");
    const event = sticky(modeler, "event_order_placed");
    service<Modeling>(modeler, "modeling").removeElements([event as Shape]);
    commandStack.undo();
    service<Selection>(modeler, "selection").select(sticky(modeler, "event_order_placed"));
    await nextTask();
    const changes = changesOf(modeler);
    const reimport = importOnSelection(modeler, REMOTE);

    commandStack.redo();

    await expectTheImportAfterTheCommand(modeler, changes, reimport);
  });
});

/** What the user saw of the drag whose start the selection listener's import ended. */
function startWatch(modeler: CollaborativeEventStormingModeler) {
  const reported: boolean[] = [];
  modeler.interaction.onChange((active) => reported.push(active));
  return { endings: dragEndingsOf(modeler), reported, onTheBoard: stickiesOnTheBoard(modeler) };
}

/**
 * The drag that cleared the selection activated on the board it holds and ended there as
 * cancelled; the import waits until diagram-js's activation has returned.
 */
function expectTheStartEnded(
  modeler: CollaborativeEventStormingModeler,
  reimport: () => Promise<unknown> | undefined,
  watch: ReturnType<typeof startWatch>,
  ...held: EventStormingShape[]
): void {
  expect(uncaught).toEqual([]);
  expect(reimport()).toBeDefined();
  expect(modeler.exportText()).toBe(BOARD);
  expect(watch.onTheBoard(...held)).toBe(true);
  expect(service<Dragging>(modeler, "dragging").context()).toBeFalsy();
  expect(watch.endings).toEqual({ ended: 0, canceled: 1 });
  const container = service<Canvas>(modeler, "canvas").getContainer();
  expect(container.querySelector(".djs-drag-active")).toBe(null);
}

async function expectTheImportAfterTheStart(
  modeler: CollaborativeEventStormingModeler,
  changes: () => number,
  reimport: () => Promise<unknown> | undefined,
  watch: ReturnType<typeof startWatch>,
  text = REMOTE,
): Promise<void> {
  await expect(reimport()).resolves.toBeDefined();
  expectNothingApplied(modeler, changes, text);
  expect(watch.endings).toEqual({ ended: 0, canceled: 1 });
  expect(watch.reported).toEqual([]);
  expect(modeler.interaction.active()).toBe(false);
  expectEditsToCount(modeler, changes);
}

describe("an import from a selection listener at a drag's start waits for the start (#336)", () => {
  it("ends the move of another sticky than the selected one", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const policy = sticky(modeler, "policy_reserve_stock");
    service<Selection>(modeler, "selection").select(policy);
    const changes = changesOf(modeler);
    const watch = startWatch(modeler);
    const reimport = importOnSelection(modeler, REMOTE);
    const event = sticky(modeler, "event_order_placed");
    const start = centre(event);

    pointer.press(pointer.graphicsOf(event), start);
    pointer.moveTo(offset(start, 60, 40));

    expectTheStartEnded(modeler, reimport, watch, event, policy);
    await expect(reimport()).resolves.toBeDefined();
    pointer.moveTo(offset(start, 90, 60));
    pointer.release(offset(start, 90, 60));
    await expectTheImportAfterTheStart(modeler, changes, reimport, watch);
  });

  it("ends the move when the moves and the release come before the import could run", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    service<Selection>(modeler, "selection").select(sticky(modeler, "policy_reserve_stock"));
    const changes = changesOf(modeler);
    const watch = startWatch(modeler);
    const reimport = importOnSelection(modeler, REMOTE);
    const event = sticky(modeler, "event_order_placed");
    const start = centre(event);

    pointer.press(pointer.graphicsOf(event), start);
    pointer.moveTo(offset(start, 30, 20));
    pointer.moveTo(offset(start, 60, 40));
    pointer.release(offset(start, 60, 40));

    expectTheStartEnded(modeler, reimport, watch, event);
    expect(changes()).toBe(0);
    await expectTheImportAfterTheStart(modeler, changes, reimport, watch);
  });

  it("ends a create from the palette, which diagram-js activates at the click", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const policy = sticky(modeler, "policy_reserve_stock");
    service<Selection>(modeler, "selection").select(policy);
    const changes = changesOf(modeler);
    const watch = startWatch(modeler);
    const reimport = importOnSelection(modeler, REMOTE);
    const free = { x: 500, y: 360 };

    pointer.click(paletteEntryOf(modeler, "create.event"), free);

    expectTheStartEnded(modeler, reimport, watch, policy);
    await expect(reimport()).resolves.toBeDefined();
    pointer.moveTo(offset(free, -40, -20));
    pointer.moveTo(free);
    pointer.press(pointer.svg, free);
    pointer.release(free);
    await expectTheImportAfterTheStart(modeler, changes, reimport, watch);
  });

  it("ends the resize of the selected note, which diagram-js activates at the press", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const note = shapeOf(modeler, (shape) => shape.eventStormingType === "note");
    service<Selection>(modeler, "selection").select(note);
    const changes = changesOf(modeler);
    const watch = startWatch(modeler);
    const reimport = importOnSelection(modeler, REMOTE);
    const corner = { x: note.x + note.width, y: note.y + note.height };

    pointer.press(modeler.diagram.container.querySelector(".djs-resizer-se")!, corner);

    expectTheStartEnded(modeler, reimport, watch, note);
    await expect(reimport()).resolves.toBeDefined();
    pointer.moveTo(offset(corner, 80, 60));
    pointer.release(offset(corner, 80, 60));
    await expectTheImportAfterTheStart(modeler, changes, reimport, watch);
  });

  it("ends an append from the selected sticky's context pad", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const source = sticky(modeler, "event_order_placed");
    service<Selection>(modeler, "selection").select(source);
    const changes = changesOf(modeler);
    const watch = startWatch(modeler);
    const reimport = importOnSelection(modeler, REMOTE);
    const free = { x: 500, y: 360 };

    pointer.click(appendEntry(modeler), centre(source));

    expectTheStartEnded(modeler, reimport, watch, source);
    await expect(reimport()).resolves.toBeDefined();
    pointer.moveTo(free);
    pointer.press(pointer.svg, free);
    pointer.release(free);
    await expectTheImportAfterTheStart(modeler, changes, reimport, watch);
  });

  it("ends a connect from the selected sticky's context pad once it passes the threshold", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const source = sticky(modeler, "event_order_placed");
    const target = sticky(modeler, "policy_reserve_stock");
    service<Selection>(modeler, "selection").select(source);
    const changes = changesOf(modeler);
    const watch = startWatch(modeler);
    const reimport = importOnSelection(modeler, REMOTE);
    const entry = modeler.diagram.container.querySelector(
      '.djs-context-pad [data-action="connect"]',
    )!;

    pointer.click(entry, centre(source));
    expect(reimport()).toBeUndefined();
    pointer.moveTo(offset(centre(source), 60, 0));

    expectTheStartEnded(modeler, reimport, watch, source, target);
    await expect(reimport()).resolves.toBeDefined();
    pointer.moveTo(centre(sticky(modeler, "policy_reserve_stock")));
    pointer.release(centre(sticky(modeler, "policy_reserve_stock")));
    await expectTheImportAfterTheStart(modeler, changes, reimport, watch);
  });

  it("ends the drag at its start, though the import then waits for its font", async () => {
    loadingAnnotationFont();
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    service<Selection>(modeler, "selection").select(sticky(modeler, "policy_reserve_stock"));
    const changes = changesOf(modeler);
    const watch = startWatch(modeler);
    const reimport = importOnSelection(modeler, REMOTE_ANNOTATED);
    const event = sticky(modeler, "event_order_placed");
    const start = centre(event);

    pointer.press(pointer.graphicsOf(event), start);
    pointer.moveTo(offset(start, 60, 40));

    expectTheStartEnded(modeler, reimport, watch, event);
    await nextTask();
    pointer.moveTo(offset(start, 90, 60));
    pointer.release(offset(start, 90, 60));
    expect(changes()).toBe(0);
    await expectTheImportAfterTheStart(modeler, changes, reimport, watch, REMOTE_ANNOTATED);
  });

  it("leaves a drawing's point drag alone, which keeps the selection", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    service<Selection>(modeler, "selection").select(
      shapeOf(modeler, (shape) => shape.eventStormingType === "drawing"),
    );
    const changes = changesOf(modeler);
    const reimport = importOnSelection(modeler, REMOTE);
    const handle = modeler.diagram.container.querySelector(".event-storming-drawing-handle")!;
    const first = { x: 40, y: 480 };

    pointer.press(handle, first);
    pointer.moveTo(offset(first, 60, -80));
    pointer.release(offset(first, 60, -80));

    expect(uncaught).toEqual([]);
    expect(reimport()).toBeUndefined();
    expect(changes()).toBe(1);
    expect(modeler.exportText()).not.toContain("line [[40, 480], [360, 480], [360, 620]]");
    expect(modeler.exportText()).toContain("[360, 480], [360, 620]]");
  });
});

describe("a destroy from a listener at a drag's start throws nothing, and nothing reaches the host afterwards (#346)", () => {
  /** The input that makes diagram-js activate the drag, and with it clear the selection. */
  const activations = [
    {
      what: "a press on a sticky, moved past the drag threshold",
      activate: (modeler: CollaborativeEventStormingModeler) => {
        const pointer = pointerOn(modeler);
        const event = sticky(modeler, "event_order_placed");
        const start = centre(event);
        pointer.press(pointer.graphicsOf(event), start);
        pointer.moveTo(offset(start, 60, 40));
      },
    },
    {
      what: "a click on the palette's event",
      activate: (modeler: CollaborativeEventStormingModeler) =>
        pointerOn(modeler).click(paletteEntryOf(modeler, "create.event"), { x: 500, y: 360 }),
    },
  ];

  /**
   * Read before the destroy, which takes the canvas the pointer reads: once the input's handler
   * has returned, the modeler is destroyed, no error reached the window, the drag and the canvas
   * are gone, the release changes nothing, and the modeler keeps its text.
   */
  function destroyedCleanly(modeler: CollaborativeEventStormingModeler): () => Promise<void> {
    const dragging = service<Dragging>(modeler, "dragging");
    const { svg } = pointerOn(modeler);
    const box = svg.getBoundingClientRect();
    const release = new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    });
    const changes = changesOf(modeler);
    return async () => {
      await nextTask();
      expect(uncaught).toEqual([]);
      expect(dragging.context()).toBeFalsy();
      expect(svg.isConnected).toBe(false);
      document.dispatchEvent(release);
      await nextTask();
      expect(uncaught).toEqual([]);
      expect(changes()).toBe(0);
      expect(modeler.interaction.active()).toBe(false);
      expect(modeler.exportText()).toBe(BOARD);
    };
  }

  for (const { what, activate } of activations) {
    it(`${what}, from the selection listener: the listener hears nothing more`, async () => {
      const modeler = await editorWithBoard();
      service<Selection>(modeler, "selection").select(sticky(modeler, "policy_reserve_stock"));
      const expectDestroyedCleanly = destroyedCleanly(modeler);
      const reported: boolean[] = [];
      modeler.interaction.onChange((active) => reported.push(active));
      const heard: string[][] = [];
      modeler.elements.onSelection((ids) => {
        heard.push(ids);
        modeler.destroy();
      });

      activate(modeler);
      expect(heard).toEqual([[]]);
      await expectDestroyedCleanly();
      expect(heard).toEqual([[]]);
      expect(reported).toEqual([]);
    });

    it(`${what}, from the interaction listener: no later listener hears of it`, async () => {
      const modeler = await editorWithBoard();
      const expectDestroyedCleanly = destroyedCleanly(modeler);
      const later: boolean[] = [];
      modeler.interaction.onChange(() => modeler.destroy());
      modeler.interaction.onChange((active) => later.push(active));

      activate(modeler);
      await expectDestroyedCleanly();
      expect(later).toEqual([]);
    });
  }
});

describe("clearing the board while the user drags a sticky", () => {
  it("ends the drag: the release throws nothing and changes nothing", async () => {
    const host = attachedHost();
    if (host.parentElement) wrappers.push(host.parentElement);
    const modeler = new Modeler({ container: host });
    plainModelers.push(modeler);
    await modeler.importDSL(BOARD);
    let stackChanges = 0;
    modeler.on("commandStack.changed", () => (stackChanges += 1));
    const canvas = modeler.get<Canvas>("canvas");
    const event = modeler.get<ElementRegistry>("elementRegistry").get("event_order_placed")!;
    const start = centre(event as Shape);
    const at = (point: Point): MouseEventInit => {
      const rect = canvas.getContainer().getBoundingClientRect();
      const viewbox = canvas.viewbox();
      return {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
        clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
      };
    };
    const svg = canvas.getContainer().querySelector("svg")!;
    const graphics = modeler.get<ElementRegistry>("elementRegistry").getGraphics(event);

    graphics.dispatchEvent(new MouseEvent("mousedown", at(start)));
    svg.dispatchEvent(new MouseEvent("mousemove", at(offset(start, 20, 10))));
    svg.dispatchEvent(new MouseEvent("mousemove", at(offset(start, 60, 40))));
    expect(modeler.container.querySelector(".djs-drag-group")).not.toBe(null);

    modeler.clear();
    svg.dispatchEvent(new MouseEvent("mouseup", at(offset(start, 60, 40))));

    expect(uncaught).toEqual([]);
    expect(stackChanges).toBe(0);
    expect(modeler.exportDSL()).not.toContain("Order Placed");
  });

  it("ends the drag at its start when a selection listener clears the board there", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    service<Selection>(modeler, "selection").select(sticky(modeler, "policy_reserve_stock"));
    const changes = changesOf(modeler);
    const endings = dragEndingsOf(modeler);
    let cleared = false;
    modeler.elements.onSelection(() => {
      if (cleared) return;
      cleared = true;
      modeler.diagram.clear();
    });
    const event = sticky(modeler, "event_order_placed");
    const start = centre(event);

    pointer.press(pointer.graphicsOf(event), start);
    pointer.moveTo(offset(start, 60, 40));
    pointer.moveTo(offset(start, 90, 60));
    pointer.release(offset(start, 90, 60));

    expect(uncaught).toEqual([]);
    expect(cleared).toBe(true);
    expect(changes()).toBe(0);
    expect(endings).toEqual({ ended: 0, canceled: 1 });
    expect(service<Dragging>(modeler, "dragging").context()).toBeFalsy();
    expect(modeler.diagram.container.querySelector(".djs-drag-group")).toBe(null);
    expect(modeler.exportText()).not.toContain("Order Placed");
    await modeler.importText(BOARD);
    expect(modeler.exportText()).toBe(BOARD);
  });
});
