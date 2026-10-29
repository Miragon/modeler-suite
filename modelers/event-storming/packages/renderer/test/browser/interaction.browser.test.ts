import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Shape } from "diagram-js/lib/model/Types";
import { parseDSL } from "@miragon/event-storming-dsl";
import type { EventStormingBoard } from "@miragon/event-storming-schema-model";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeEventStormingModeler,
} from "../../src/index.js";
import {
  GESTURE_BOARD as BOARD,
  centre,
  offset,
  pointerOn,
  pressEscape,
  service,
  shapeOf,
  sticky,
} from "./support/gestures.js";

// A peer moved the policy: the import replaces every shape a running gesture holds.
const REMOTE = BOARD.replace("policy Reserve Stock [800, 200]", "policy Reserve Stock [840, 260]");

/**
 * A board from JSON that the import rejects (L7): its sticky claims the id of the board itself.
 * The DSL reads every text, so only a board that bypasses it reaches a rejection.
 */
function rejectedBoard(): EventStormingBoard {
  const board = parseDSL("title Broken\nevent Foo [0, 0]\n");
  return {
    ...board,
    elements: board.elements.map((element) => ({ ...element, id: "event-storming-root" })),
  };
}

const FREE = { x: 640, y: 380 };

const mounted: CollaborativeEventStormingModeler[] = [];
const wrappers: HTMLElement[] = [];
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
});

function mount(modeler: CollaborativeEventStormingModeler): CollaborativeEventStormingModeler {
  const host = attachedHost();
  if (host.parentElement) wrappers.push(host.parentElement);
  modeler.attachTo(host);
  mounted.push(modeler);
  return modeler;
}

async function editorWithBoard(): Promise<CollaborativeEventStormingModeler> {
  const modeler = mount(createCollaborativeModeler());
  await modeler.importText(BOARD);
  return modeler;
}

/** Every value `onChange` delivered, each with what `active()` read inside the listener. */
function reportsOf(modeler: CollaborativeEventStormingModeler) {
  const reports: { value: boolean; activeInside: boolean }[] = [];
  const unsubscribe = modeler.interaction.onChange((value) =>
    reports.push({ value, activeInside: modeler.interaction.active() }),
  );
  return {
    values: () => reports.map(({ value }) => value),
    consistent: () => reports.every(({ value, activeInside }) => value === activeInside),
    unsubscribe,
  };
}

/**
 * A pan of the empty canvas above the board (diagram-js's `MoveCanvas`, which takes the press
 * while the canvas has the focus), moved in screen pixels from where it started.
 */
function panOn(modeler: CollaborativeEventStormingModeler) {
  const canvas = service<Canvas>(modeler, "canvas");
  canvas.focus();
  const startViewbox = canvas.viewbox();
  const rect = canvas.getContainer().getBoundingClientRect();
  const empty = { x: 640, y: 80 };
  const start = {
    x: rect.left + (empty.x - startViewbox.x) * startViewbox.scale,
    y: rect.top + (empty.y - startViewbox.y) * startViewbox.scale,
  };
  const at = (dx: number): MouseEventInit => ({
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: start.x + dx,
    clientY: start.y,
  });
  const svg = canvas.getContainer().querySelector("svg")!;
  return {
    startViewbox,
    press: () => svg.dispatchEvent(new MouseEvent("mousedown", at(0))),
    moveBy: (dx: number) => document.dispatchEvent(new MouseEvent("mousemove", at(dx))),
    release: (dx: number) => document.dispatchEvent(new MouseEvent("mouseup", at(dx))),
  };
}

const paletteEntry = (modeler: CollaborativeEventStormingModeler, action: string) =>
  modeler.diagram.container.querySelector<HTMLElement>(`.djs-palette [data-action="${action}"]`)!;

const contextPadEntry = (modeler: CollaborativeEventStormingModeler, action: string) =>
  modeler.diagram.container.querySelector<HTMLElement>(
    `.djs-context-pad [data-action="${action}"]`,
  )!;

interface HeldGesture {
  drop(): void;
  cancel?(): void;
}

type GestureKind = [
  name: string,
  hold: (modeler: CollaborativeEventStormingModeler) => HeldGesture,
];

const POINT_DRAG = "a point drag of a drawing";

/** The gestures of the board, each held the way a user holds it, with its drop and its cancel. */
const GESTURES: GestureKind[] = [
  [
    "a move past the threshold",
    (modeler) => {
      const pointer = pointerOn(modeler);
      const start = centre(sticky(modeler, "event_order_placed"));
      pointer.press(pointer.graphicsOf(sticky(modeler, "event_order_placed")), start);
      pointer.moveTo(offset(start, 2, 1));
      expect(modeler.interaction.active()).toBe(false);
      pointer.moveTo(offset(start, 60, 40));
      return { drop: () => pointer.release(offset(start, 60, 40)), cancel: pressEscape };
    },
  ],
  [
    "a resize of a note",
    (modeler) => {
      const pointer = pointerOn(modeler);
      const note = shapeOf(modeler, (shape) => shape.eventStormingType === "note");
      service<Selection>(modeler, "selection").select(note);
      const corner = { x: note.x + note.width, y: note.y + note.height };
      pointer.press(modeler.diagram.container.querySelector(".djs-resizer-se")!, corner);
      pointer.moveTo(offset(corner, 40, 30));
      return { drop: () => pointer.release(offset(corner, 40, 30)), cancel: pressEscape };
    },
  ],
  [
    "a connect from the context pad",
    (modeler) => {
      const pointer = pointerOn(modeler);
      const source = sticky(modeler, "event_order_placed");
      const target = sticky(modeler, "policy_reserve_stock");
      service<Selection>(modeler, "selection").select(source);
      pointer.click(contextPadEntry(modeler, "connect"), centre(source));
      pointer.moveTo(centre(target), pointer.graphicsOf(target));
      return {
        drop: () => pointer.release(centre(target), pointer.graphicsOf(target)),
        cancel: pressEscape,
      };
    },
  ],
  [
    "a lasso drag",
    (modeler) => {
      const pointer = pointerOn(modeler);
      const corner = { x: 420, y: 140 };
      pointer.press(pointer.svg, corner, { shiftKey: true });
      pointer.moveTo(offset(corner, 300, 160));
      return { drop: () => pointer.release(offset(corner, 300, 160)), cancel: pressEscape };
    },
  ],
  [
    "a palette create held over the canvas",
    (modeler) => {
      const pointer = pointerOn(modeler);
      pointer.click(paletteEntry(modeler, "create.event"), FREE);
      pointer.moveTo(offset(FREE, -40, -20));
      pointer.moveTo(FREE);
      return {
        drop: () => {
          pointer.press(pointer.svg, FREE);
          pointer.release(FREE);
        },
        cancel: pressEscape,
      };
    },
  ],
  [
    "a palette create held over the palette",
    (modeler) => {
      const pointer = pointerOn(modeler);
      const entry = paletteEntry(modeler, "create.event");
      pointer.click(entry, FREE);
      expect(modeler.diagram.container.querySelector(".djs-drag-group")).toBe(null);
      return {
        drop: () => {
          pointer.press(entry, FREE);
          pointer.release(FREE, entry);
        },
        cancel: pressEscape,
      };
    },
  ],
  [
    "an append from the context pad",
    (modeler) => {
      const pointer = pointerOn(modeler);
      const source = sticky(modeler, "event_order_placed");
      service<Selection>(modeler, "selection").select(source);
      pointer.click(contextPadEntry(modeler, "append"), centre(source));
      pointer.moveTo(offset(FREE, -40, -20));
      pointer.moveTo(FREE);
      return {
        drop: () => {
          pointer.press(pointer.svg, FREE);
          pointer.release(FREE);
        },
        cancel: pressEscape,
      };
    },
  ],
  [
    POINT_DRAG,
    (modeler) => {
      const pointer = pointerOn(modeler);
      service<Selection>(modeler, "selection").select(
        shapeOf(modeler, (shape) => shape.eventStormingType === "drawing"),
      );
      const first = { x: 40, y: 480 };
      pointer.press(
        modeler.diagram.container.querySelector(".event-storming-drawing-handle")!,
        first,
      );
      expect(modeler.interaction.active()).toBe(false);
      pointer.moveTo(offset(first, 30, -40));
      return { drop: () => pointer.release(offset(first, 30, -40)) };
    },
  ],
];

describe("the interaction surface (modeler-api 1.5)", () => {
  it("is false before the first import and at rest", async () => {
    const modeler = mount(createCollaborativeModeler());
    const reports = reportsOf(modeler);
    expect(modeler.interaction.active()).toBe(false);
    await modeler.importText(BOARD);
    expect(modeler.interaction.active()).toBe(false);
    expect(reports.values()).toEqual([]);
  });

  it.each(GESTURES)("is true while %s is held and false after its drop", async (_, hold) => {
    const modeler = await editorWithBoard();
    const reports = reportsOf(modeler);

    const gesture = hold(modeler);
    expect(modeler.interaction.active()).toBe(true);
    expect(reports.values()).toEqual([true]);

    gesture.drop();
    expect(modeler.interaction.active()).toBe(false);
    expect(reports.values()).toEqual([true, false]);
    expect(reports.consistent()).toBe(true);
    expect(uncaught).toEqual([]);
  });

  // A drawing's point drag has no Escape yet (#243).
  it.each(GESTURES.filter(([name]) => name !== POINT_DRAG))(
    "is false after %s is cancelled with Escape",
    async (_, hold) => {
      const modeler = await editorWithBoard();
      const reports = reportsOf(modeler);

      const gesture = hold(modeler);
      gesture.cancel?.();
      expect(modeler.interaction.active()).toBe(false);
      expect(reports.values()).toEqual([true, false]);
      expect(reports.consistent()).toBe(true);
      expect(modeler.exportText()).toBe(BOARD);
    },
  );

  it.each(GESTURES)(
    "is false once an import ended %s, before the import resolves",
    async (_, hold) => {
      const modeler = await editorWithBoard();
      const reports = reportsOf(modeler);
      let changes = 0;
      modeler.onContentChanged(() => (changes += 1));

      const gesture = hold(modeler);
      const importing = modeler.importText(REMOTE);
      expect(modeler.interaction.active()).toBe(false);
      expect(reports.values()).toEqual([true, false]);
      await importing;
      gesture.drop();

      expect(reports.values()).toEqual([true, false]);
      expect(changes).toBe(0);
      expect(modeler.exportText()).toBe(REMOTE);
      expect(uncaught).toEqual([]);
    },
  );

  it("stays true through a rejected import, until the drop", async () => {
    const modeler = await editorWithBoard();
    const reports = reportsOf(modeler);
    const [, holdMove] = GESTURES[0]!;

    const gesture = holdMove(modeler);
    await expect(modeler.diagram.importMap(rejectedBoard())).rejects.toThrow(/reserved/);
    expect(modeler.interaction.active()).toBe(true);
    expect(reports.values()).toEqual([true]);

    gesture.drop();
    expect(reports.values()).toEqual([true, false]);
    expect(modeler.exportText()).not.toBe(BOARD);
  });

  it("stays false while a palette tool is only armed, and turns true with the drag it starts", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const reports = reportsOf(modeler);

    pointer.click(paletteEntry(modeler, "lasso-tool"), FREE);
    pointer.moveTo(offset(FREE, 40, 40));
    pointer.moveTo(offset(FREE, -80, 20));
    expect(modeler.interaction.active()).toBe(false);
    pointer.click(paletteEntry(modeler, "draw-tool"), FREE);
    pointer.moveTo(offset(FREE, 30, 30));
    expect(modeler.interaction.active()).toBe(false);
    pointer.click(paletteEntry(modeler, "draw-tool"), FREE);
    expect(reports.values()).toEqual([]);

    pointer.click(paletteEntry(modeler, "lasso-tool"), offset(FREE, -60, -60));
    pointer.moveTo(FREE);
    expect(modeler.interaction.active()).toBe(false);
    pointer.press(pointer.svg, FREE);
    pointer.moveTo(offset(FREE, 120, 80));
    expect(modeler.interaction.active()).toBe(true);
    pointer.release(offset(FREE, 120, 80));
    expect(modeler.interaction.active()).toBe(false);
    expect(reports.values()).toEqual([true, false]);
  });

  it("stays false during a pan, which an import leaves running", async () => {
    const modeler = await editorWithBoard();
    const reports = reportsOf(modeler);
    const canvas = service<Canvas>(modeler, "canvas");
    const pan = panOn(modeler);

    pan.press();
    pan.moveBy(40);
    pan.moveBy(80);
    expect(canvas.viewbox().x).not.toBe(pan.startViewbox.x);
    expect(modeler.interaction.active()).toBe(false);

    await modeler.importText(REMOTE);
    const fitted = canvas.viewbox();
    pan.moveBy(120);
    expect(canvas.viewbox().x).toBeCloseTo(fitted.x - 40 / fitted.scale, 5);
    pan.release(120);

    expect(reports.values()).toEqual([]);
    expect(uncaught).toEqual([]);
  });

  it("delivers nothing after the unsubscribe", async () => {
    const modeler = await editorWithBoard();
    const reports = reportsOf(modeler);
    const [, holdMove] = GESTURES[0]!;

    const gesture = holdMove(modeler);
    reports.unsubscribe();
    gesture.drop();

    expect(reports.values()).toEqual([true]);
  });

  it("calls nothing after destroy, also for a gesture the destroy ends", async () => {
    const modeler = await editorWithBoard();
    const reports = reportsOf(modeler);
    const [, holdMove] = GESTURES[0]!;

    holdMove(modeler);
    modeler.destroy();

    expect(reports.values()).toEqual([true]);
    expect(modeler.interaction.active()).toBe(false);
  });

  it("is false on the viewer, through a pan", async () => {
    const viewer = mount(createCollaborativeViewer());
    const reports = reportsOf(viewer);
    await viewer.importText(BOARD);
    const pan = panOn(viewer);

    pan.press();
    pan.moveBy(60);
    expect(service<Canvas>(viewer, "canvas").viewbox().x).not.toBe(pan.startViewbox.x);
    expect(viewer.interaction.active()).toBe(false);
    pan.release(60);

    expect(reports.values()).toEqual([]);
  });

  it("leaves the history and the next edit alone", async () => {
    const modeler = await editorWithBoard();
    const [, holdMove] = GESTURES[0]!;
    let changes = 0;
    modeler.onContentChanged(() => (changes += 1));

    holdMove(modeler).drop();
    expect(changes).toBe(1);
    service<Modeling>(modeler, "modeling").moveElements(
      [sticky(modeler, "policy_reserve_stock") as Shape],
      { x: 20, y: 0 },
    );
    expect(changes).toBe(2);
    service<CommandStack>(modeler, "commandStack").undo();
    service<CommandStack>(modeler, "commandStack").undo();
    expect(modeler.exportText()).toBe(BOARD);
  });
});
