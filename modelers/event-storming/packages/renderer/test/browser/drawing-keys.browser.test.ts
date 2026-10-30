import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  type CollaborativeEventStormingModeler,
  type CollaborativeEventStormingOptions,
} from "../../src/index.js";
import type EventStormingDrawTool from "../../src/draw-tool/EventStormingDrawTool.js";
import type EventStormingCopyPaste from "../../src/modeling/EventStormingCopyPaste.js";
import {
  GESTURE_BOARD as BOARD,
  offset,
  pointerOn,
  service,
  shapeOf,
  sticky,
  type Point,
} from "./support/gestures.js";

const mounted: CollaborativeEventStormingModeler[] = [];
const wrappers: HTMLElement[] = [];
const cleanups: (() => void)[] = [];
let hostField: HTMLInputElement;
let uncaught: unknown[] = [];

const recordUncaught = (event: ErrorEvent) => uncaught.push(event.error ?? event.message);

beforeEach(() => {
  uncaught = [];
  window.addEventListener("error", recordUncaught);
  hostField = document.createElement("input");
  hostField.setAttribute("aria-label", "Host field");
  document.body.append(hostField);
});

afterEach(() => {
  window.removeEventListener("error", recordUncaught);
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const modeler of mounted.splice(0)) modeler.destroy();
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
  hostField.remove();
});

async function editorWithBoard(
  options?: CollaborativeEventStormingOptions,
): Promise<CollaborativeEventStormingModeler> {
  const host = attachedHost();
  if (host.parentElement) wrappers.push(host.parentElement);
  const modeler = createCollaborativeModeler(options);
  modeler.attachTo(host);
  mounted.push(modeler);
  await modeler.importText(BOARD);
  return modeler;
}

function changesOf(modeler: CollaborativeEventStormingModeler): () => number {
  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  return () => changes;
}

const drawingOf = (modeler: CollaborativeEventStormingModeler) =>
  shapeOf(modeler, (shape) => shape.eventStormingType === "drawing");

const handlesOf = (modeler: CollaborativeEventStormingModeler) => [
  ...modeler.diagram.container.querySelectorAll<SVGCircleElement>(".event-storming-drawing-handle"),
];

const handlePositions = (modeler: CollaborativeEventStormingModeler) =>
  handlesOf(modeler).map((handle) => [
    Number(handle.getAttribute("cx")),
    Number(handle.getAttribute("cy")),
  ]);

const pointDragPreview = (modeler: CollaborativeEventStormingModeler) =>
  modeler.diagram.container.querySelector(".layer-event-storming-drawing-handles polyline");

const HANDLES_OF_THE_BOARD = [
  [40, 480],
  [360, 480],
  [360, 620],
];

const FIRST_POINT: Point = { x: 40, y: 480 };

/** Within the pixel the synthetic pointer rounds its position to, at the board's zoom. */
function expectTheFirstPointMovedTo(modeler: CollaborativeEventStormingModeler, point: Point) {
  const [x, y] = handlePositions(modeler)[0]!;
  expect(Math.abs(x! - point.x)).toBeLessThan(2);
  expect(Math.abs(y! - point.y)).toBeLessThan(2);
}

/** The drawing selected and its first point held past where it was, as a user drags it. */
function holdFirstPoint(modeler: CollaborativeEventStormingModeler) {
  const pointer = pointerOn(modeler);
  const drawing = drawingOf(modeler);
  service<Selection>(modeler, "selection").select(drawing);
  pointer.press(handlesOf(modeler)[0]!, FIRST_POINT);
  pointer.moveTo(offset(FIRST_POINT, 60, -80));
  expect(modeler.interaction.active()).toBe(true);
  expect(pointDragPreview(modeler)).not.toBe(null);
  return { pointer, drawing };
}

describe("Escape during the point drag of a drawing (#243)", () => {
  it("ends the drag without a commit, and the drawing stays selected with its handles in place", async () => {
    const modeler = await editorWithBoard();
    const changes = changesOf(modeler);
    hostField.focus();
    const { pointer, drawing } = holdFirstPoint(modeler);

    await userEvent.keyboard("{Escape}");
    expect(modeler.interaction.active()).toBe(false);
    expect(pointDragPreview(modeler)).toBe(null);

    const releasedAt = offset(FIRST_POINT, 90, -100);
    pointer.moveTo(releasedAt);
    pointer.release(releasedAt);
    // The browser clicks where the press and the release meet: the canvas <svg>.
    pointer.click(pointer.svg, releasedAt);

    expect(uncaught).toEqual([]);
    expect(changes()).toBe(0);
    expect(modeler.exportText()).toBe(BOARD);
    expect(service<CommandStack>(modeler, "commandStack").canUndo()).toBe(false);
    expect(service<Selection>(modeler, "selection").get()).toEqual([drawing]);
    expect(handlePositions(modeler)).toEqual(HANDLES_OF_THE_BOARD);
  });

  it("leaves the clicks and drags after it as they were", async () => {
    const modeler = await editorWithBoard();
    const changes = changesOf(modeler);
    const { pointer, drawing } = holdFirstPoint(modeler);
    await userEvent.keyboard("{Escape}");
    pointer.release(FIRST_POINT);
    pointer.click(pointer.svg, FIRST_POINT);
    expect(service<Selection>(modeler, "selection").get()).toEqual([drawing]);

    pointer.click(pointer.svg, { x: 640, y: 380 });
    expect(service<Selection>(modeler, "selection").get()).toEqual([]);

    holdFirstPoint(modeler);
    pointer.release(offset(FIRST_POINT, 60, -80));
    expect(uncaught).toEqual([]);
    expect(changes()).toBe(1);
    expectTheFirstPointMovedTo(modeler, offset(FIRST_POINT, 60, -80));
  });

  it("leaves an Escape aimed at a host's field to the field: the drag goes on", async () => {
    const modeler = await editorWithBoard();
    const changes = changesOf(modeler);
    const escapesInTheField: boolean[] = [];
    hostField.addEventListener("keydown", (event) => {
      if (event.key === "Escape") escapesInTheField.push(event.defaultPrevented);
    });
    const { pointer } = holdFirstPoint(modeler);

    hostField.focus();
    await userEvent.keyboard("{Escape}");
    expect(escapesInTheField).toEqual([false]);
    expect(modeler.interaction.active()).toBe(true);

    pointer.release(offset(FIRST_POINT, 60, -80));
    expect(uncaught).toEqual([]);
    expect(changes()).toBe(1);
    expectTheFirstPointMovedTo(modeler, offset(FIRST_POINT, 60, -80));
  });
});

/**
 * The keys that start a gesture at the pointer, which would take the press meant for the next point
 * of the line the draw tool holds.
 */
const GESTURE_KEYS = [
  ["L, the lasso", "l"],
  ["E, a domain event at the pointer", "e"],
  ["C, a command at the pointer", "c"],
  ["paste, which attaches to the pointer", "{Control>}v{/Control}"],
] as const;

/** Each key as the page sees it after the modeler: whether a listener took it. */
function keysReachingThePage(): () => { key: string; taken: boolean }[] {
  const seen: { key: string; taken: boolean }[] = [];
  const record = (event: KeyboardEvent) => {
    if (!["Control", "Shift"].includes(event.key)) {
      seen.push({ key: event.key, taken: event.defaultPrevented });
    }
  };
  window.addEventListener("keydown", record);
  cleanups.push(() => window.removeEventListener("keydown", record));
  return () => seen;
}

describe("the board's keys while the draw tool holds a line (#243)", () => {
  /**
   * A board with an edit to undo and one to redo and a sticky selected and copied, then the draw
   * tool with two points placed and the pointer on the canvas, where a create or a paste would
   * start.
   */
  async function drawingALine(options?: CollaborativeEventStormingOptions) {
    const modeler = await editorWithBoard(options);
    const pointer = pointerOn(modeler);
    const policy = sticky(modeler, "policy_reserve_stock");
    const modeling = service<Modeling>(modeler, "modeling");
    modeling.moveElements([policy as Shape], { x: 20, y: 0 });
    modeling.moveElements([policy as Shape], { x: 20, y: 0 });
    service<CommandStack>(modeler, "commandStack").undo();
    service<Selection>(modeler, "selection").select(policy);
    service<EventStormingCopyPaste>(modeler, "eventStormingCopyPaste").copy();
    const edited = modeler.exportText();
    const changes = changesOf(modeler);
    const drawTool = service<EventStormingDrawTool>(modeler, "eventStormingDrawTool");
    const entry = modeler.diagram.container.querySelector(
      '.djs-palette [data-action="draw-tool"]',
    )!;

    pointer.click(entry, { x: 300, y: 380 });
    for (const point of [
      { x: 300, y: 380 },
      { x: 460, y: 420 },
    ]) {
      pointer.press(pointer.svg, point);
      pointer.release(point);
    }
    pointer.moveTo({ x: 520, y: 400 });
    expect(drawTool.holdsLine()).toBe(true);
    return { modeler, pointer, policy, edited, changes, drawTool };
  }

  it.each(GESTURE_KEYS)("does nothing with %s, and keeps it from the page", async (_, key) => {
    const { modeler, policy, edited, changes, drawTool } = await drawingALine();
    const commandStack = service<CommandStack>(modeler, "commandStack");
    const keys = keysReachingThePage();

    await userEvent.keyboard(key);

    expect(keys().map(({ taken }) => taken)).toEqual([true]);
    expect(uncaught).toEqual([]);
    expect(service<Dragging>(modeler, "dragging").context()).toBeFalsy();
    expect(changes()).toBe(0);
    expect(modeler.exportText()).toBe(edited);
    expect(commandStack.canUndo()).toBe(true);
    expect(commandStack.canRedo()).toBe(true);
    expect(service<Selection>(modeler, "selection").get()).toEqual([policy]);
    expect(drawTool.holdsLine()).toBe(true);
  });

  it("acts on the keys that start no gesture as without a line, and the line goes on", async () => {
    const { modeler, policy, changes, drawTool } = await drawingALine();
    const commandStack = service<CommandStack>(modeler, "commandStack");

    await userEvent.keyboard("{Delete}");
    expect(changes()).toBe(1);
    expect(modeler.exportText()).not.toContain("Reserve Stock");
    expect(drawTool.holdsLine()).toBe(true);

    await userEvent.keyboard("{Control>}z{/Control}");
    expect(changes()).toBe(2);
    expect(modeler.exportText()).toContain("policy Reserve Stock [820, 200]");
    expect(commandStack.canRedo()).toBe(true);
    expect(drawTool.holdsLine()).toBe(true);

    await userEvent.keyboard("{Enter}");
    expect(uncaught).toEqual([]);
    expect(changes()).toBe(3);
    expect(modeler.exportText().match(/^line /gm)).toHaveLength(2);
    expect(sticky(modeler, policy.id)).toBeDefined();
  });

  it("leaves undo and redo to a host that owns the history, and the keys the board has none for", async () => {
    const { modeler, edited, changes, drawTool } = await drawingALine({ undoRedoKeys: false });
    const keys = keysReachingThePage();

    await userEvent.keyboard("{Control>}z{/Control}{Control>}{Shift>}z{/Shift}{/Control}x");

    expect(keys()).toEqual([
      { key: "z", taken: false },
      { key: "z", taken: false },
      { key: "x", taken: false },
    ]);
    expect(changes()).toBe(0);
    expect(modeler.exportText()).toBe(edited);
    expect(drawTool.holdsLine()).toBe(true);
  });

  it("acts on them again once Enter has finished the line", async () => {
    const { modeler, changes, drawTool } = await drawingALine();

    await userEvent.keyboard("lec");
    await userEvent.keyboard("{Enter}");
    expect(drawTool.isActive()).toBe(false);
    expect(changes()).toBe(1);
    expect(modeler.exportText().match(/^line /gm)).toHaveLength(2);

    await userEvent.keyboard("l");
    expect(service<Dragging>(modeler, "dragging").context()?.prefix).toBe("lasso.selection");
  });

  it("acts on them again once Escape has cancelled a line of one point", async () => {
    const modeler = await editorWithBoard();
    const pointer = pointerOn(modeler);
    const drawTool = service<EventStormingDrawTool>(modeler, "eventStormingDrawTool");
    pointer.click(
      modeler.diagram.container.querySelector('.djs-palette [data-action="draw-tool"]')!,
      { x: 300, y: 380 },
    );
    pointer.press(pointer.svg, { x: 300, y: 380 });
    pointer.moveTo({ x: 520, y: 400 });

    await userEvent.keyboard("l");
    expect(service<Dragging>(modeler, "dragging").context()).toBeFalsy();
    await userEvent.keyboard("{Escape}");
    expect(drawTool.isActive()).toBe(false);

    await userEvent.keyboard("e");
    expect(service<Dragging>(modeler, "dragging").context()?.prefix).toBe("create");
  });
});

/**
 * The keys that would change the drawing under a point drag or start a second gesture next to it.
 * The release writes back every point as the press found it, over a nudge, a duplicate selects
 * the copy, and a lasso, a create or a paste would end with the same release.
 */
const KEYS_A_POINT_DRAG_TAKES = [
  ["ArrowRight, a nudge of the drawing", "{ArrowRight}"],
  ["Shift+ArrowRight, a coarse nudge", "{Shift>}{ArrowRight}{/Shift}"],
  ["ArrowLeft", "{ArrowLeft}"],
  ["ArrowUp", "{ArrowUp}"],
  ["Shift+ArrowDown", "{Shift>}{ArrowDown}{/Shift}"],
  ...GESTURE_KEYS,
  ["duplicate", "{Control>}d{/Control}"],
] as const;

describe("the board's keys during the point drag of a drawing (#375)", () => {
  /** A sticky copied, so that a paste has something to attach to the pointer, then the drag. */
  async function draggingAPoint() {
    const modeler = await editorWithBoard();
    service<Selection>(modeler, "selection").select(sticky(modeler, "policy_reserve_stock"));
    service<EventStormingCopyPaste>(modeler, "eventStormingCopyPaste").copy();
    const changes = changesOf(modeler);
    const { pointer, drawing } = holdFirstPoint(modeler);
    return { modeler, pointer, drawing, changes };
  }

  const RELEASED_AT = offset(FIRST_POINT, 60, -80);

  it.each(KEYS_A_POINT_DRAG_TAKES)(
    "does nothing with %s, and the release moves the dragged point alone",
    async (_, key) => {
      const { modeler, pointer, drawing, changes } = await draggingAPoint();
      const keys = keysReachingThePage();

      await userEvent.keyboard(key);

      expect(keys().map(({ taken }) => taken)).toEqual([true]);
      expect(uncaught).toEqual([]);
      expect(service<Dragging>(modeler, "dragging").context()).toBeFalsy();
      expect(changes()).toBe(0);
      expect(modeler.exportText()).toBe(BOARD);
      expect(service<Selection>(modeler, "selection").get()).toEqual([drawing]);
      expect(modeler.interaction.active()).toBe(true);
      expect(pointDragPreview(modeler)).not.toBe(null);

      pointer.release(RELEASED_AT);
      expect(uncaught).toEqual([]);
      expect(changes()).toBe(1);
      expectTheFirstPointMovedTo(modeler, RELEASED_AT);
      expect(handlePositions(modeler).slice(1)).toEqual(HANDLES_OF_THE_BOARD.slice(1));
      service<CommandStack>(modeler, "commandStack").undo();
      expect(modeler.exportText()).toBe(BOARD);
    },
  );

  it("keeps Escape, which ends the drag without a commit after the keys it took", async () => {
    const { modeler, pointer, drawing, changes } = await draggingAPoint();

    await userEvent.keyboard("{ArrowRight}e");
    await userEvent.keyboard("{Escape}");
    expect(modeler.interaction.active()).toBe(false);
    expect(pointDragPreview(modeler)).toBe(null);

    pointer.release(RELEASED_AT);
    pointer.click(pointer.svg, RELEASED_AT);
    expect(uncaught).toEqual([]);
    expect(changes()).toBe(0);
    expect(modeler.exportText()).toBe(BOARD);
    expect(service<Selection>(modeler, "selection").get()).toEqual([drawing]);
    expect(handlePositions(modeler)).toEqual(HANDLES_OF_THE_BOARD);
  });

  it("keeps Delete, which removes the drawing and ends the drag without a commit", async () => {
    const { modeler, pointer, changes } = await draggingAPoint();

    await userEvent.keyboard("{Delete}");
    expect(changes()).toBe(1);
    expect(modeler.exportText()).not.toMatch(/^line /m);
    expect(modeler.interaction.active()).toBe(false);
    expect(pointDragPreview(modeler)).toBe(null);

    pointer.release(RELEASED_AT);
    expect(uncaught).toEqual([]);
    expect(changes()).toBe(1);
    expect(modeler.exportText()).not.toMatch(/^line /m);
  });

  it("acts on the keys again once the release has ended the drag", async () => {
    const { modeler, pointer, changes } = await draggingAPoint();
    await userEvent.keyboard("{ArrowRight}");
    pointer.release(RELEASED_AT);
    expect(changes()).toBe(1);

    await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(changes()).toBe(2);
    expectTheFirstPointMovedTo(modeler, offset(RELEASED_AT, 10, 0));

    await userEvent.keyboard("l");
    expect(service<Dragging>(modeler, "dragging").context()?.prefix).toBe("lasso.selection");
  });
});
