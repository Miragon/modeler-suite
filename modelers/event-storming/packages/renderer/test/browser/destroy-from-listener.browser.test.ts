import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import {
  createCollaborativeModeler,
  type CollaborativeEventStormingModeler,
} from "../../src/index.js";
import {
  GESTURE_BOARD as BOARD,
  centre,
  offset,
  pointerOn,
  service,
  sticky,
  type Point,
} from "./support/gestures.js";

// #380, #373: a host may destroy the modeler from any listener (#170). A destroy from the change
// listener at a drop, a keyboard create or a paste placed with a click tore the board down while
// diagram-js and the palette still selected the new sticky on it, and a later change listener of
// the same delivery was still called. The teardown now waits until the handler of the input has
// returned, and no delivery reaches a listener after `destroy()` or after its unsubscribe. The end
// of every gesture of the board is in `interaction.browser.test.ts`.

const FREE: Point = { x: 640, y: 380 };

let modeler: CollaborativeEventStormingModeler;
let host: HTMLElement;
let errors: unknown[] = [];
const recordError = (event: ErrorEvent) => errors.push(event.error ?? event.message);
const recordRejection = (event: PromiseRejectionEvent) => errors.push(event.reason);

beforeEach(async () => {
  errors = [];
  window.addEventListener("error", recordError);
  window.addEventListener("unhandledrejection", recordRejection);
  host = attachedHost();
  modeler = createCollaborativeModeler();
  modeler.attachTo(host);
  await modeler.importText(BOARD);
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  window.removeEventListener("unhandledrejection", recordRejection);
  modeler.destroy();
  (host.parentElement ?? host).remove();
});

/** Every microtask and the steps an action defers by a task have run by then. */
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The handler of the input that started a drag has returned: the release or the key that ends it
 * comes in a handler of its own, as it does for a user.
 */
const handlerReturned = () => Promise.resolve();

/**
 * Read before the destroy, since reading a service afterwards would build a fresh diagram. Once
 * the input's handler has returned: no error reached the window, the drag and the canvas are gone,
 * a second destroy throws nothing, and the modeler keeps the text it had when it was destroyed.
 */
function destroyedCleanly(): (textAtDestroy: string | undefined) => Promise<void> {
  const dragging = service<Dragging>(modeler, "dragging");
  const { svg } = pointerOn(modeler);
  return async (textAtDestroy) => {
    await nextTask();
    expect(errors).toEqual([]);
    expect(textAtDestroy).toBeDefined();
    expect(dragging.context()).toBeFalsy();
    expect(svg.isConnected).toBe(false);
    expect(() => modeler.destroy()).not.toThrow();
    expect(modeler.interaction.active()).toBe(false);
    expect(modeler.exportText()).toBe(textAtDestroy);
  };
}

const paletteEntry = (action: string) =>
  modeler.diagram.container.querySelector<HTMLElement>(`.djs-palette [data-action="${action}"]`)!;

function stickyCount(text: string): number {
  return text.split("\n").filter((line) => /^(event|command|policy) /.test(line)).length;
}

function pressCanvasKey(key: string): void {
  const canvas = service<Canvas>(modeler, "canvas");
  canvas.focus();
  pointerOn(modeler).svg.dispatchEvent(
    new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }),
  );
}

/** Each makes one change; the change comes in the handler of the input's last step. */
const CHANGES: { what: string; stickies: number; make: () => Promise<void> }[] = [
  {
    what: "the drop of a move",
    stickies: 0,
    make: async () => {
      const pointer = pointerOn(modeler);
      const start = centre(sticky(modeler, "event_order_placed"));
      pointer.press(pointer.graphicsOf(sticky(modeler, "event_order_placed")), start);
      pointer.moveTo(offset(start, 60, 40));
      await handlerReturned();
      pointer.release(offset(start, 60, 40));
    },
  },
  {
    what: "a click on the palette's event, placed with a click on the canvas",
    stickies: 1,
    make: async () => {
      const pointer = pointerOn(modeler);
      pointer.click(paletteEntry("create.event"), FREE);
      await handlerReturned();
      pointer.moveTo(FREE);
      pointer.press(pointer.svg, FREE);
      pointer.release(FREE);
    },
  },
  {
    what: "Enter or Space on the palette's event (a click without a pointer)",
    stickies: 1,
    make: async () => {
      paletteEntry("create.event").dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
      );
    },
  },
  {
    what: "a paste that follows the pointer, placed with a click",
    stickies: 1,
    make: async () => {
      const pointer = pointerOn(modeler);
      service<Selection>(modeler, "selection").select(sticky(modeler, "event_order_placed"));
      pressCanvasKey("c");
      service<Selection>(modeler, "selection").select(null);
      pointer.moveTo(offset(FREE, -40, -20));
      pressCanvasKey("v");
      await handlerReturned();
      pointer.moveTo(FREE);
      pointer.press(pointer.svg, FREE);
      pointer.release(FREE);
    },
  },
];

describe("a destroy from the change listener of a sticky the user made (#380, #373)", () => {
  it.each(CHANGES)(
    "$what: nothing throws, and neither a later change listener nor the selection listener hears more",
    async ({ stickies, make }) => {
      const expectDestroyedCleanly = destroyedCleanly();
      const selections: string[][] = [];
      modeler.elements.onSelection((ids) => selections.push(ids));
      let textAtDestroy: string | undefined;
      let selectionsAtDestroy = -1;
      modeler.onContentChanged(() => {
        textAtDestroy = modeler.exportText();
        selectionsAtDestroy = selections.length;
        modeler.destroy();
      });
      let later = 0;
      modeler.onContentChanged(() => (later += 1));

      await make();

      await expectDestroyedCleanly(textAtDestroy);
      expect(later).toBe(0);
      expect(selections).toHaveLength(selectionsAtDestroy);
      expect(textAtDestroy).not.toBe(BOARD);
      expect(stickyCount(textAtDestroy ?? "")).toBe(stickyCount(BOARD) + stickies);
    },
  );
});

describe("no delivery reaches a listener that an earlier listener of it unsubscribed", () => {
  it("of a change", () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.onContentChanged(() => unsubscribeLater());
    let later = 0;
    unsubscribeLater = modeler.onContentChanged(() => (later += 1));

    paletteEntry("create.event").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );

    expect(later).toBe(0);
    expect(errors).toEqual([]);
  });

  it("of the interaction", () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.interaction.onChange(() => unsubscribeLater());
    const later: boolean[] = [];
    unsubscribeLater = modeler.interaction.onChange((active) => later.push(active));
    const pointer = pointerOn(modeler);
    const start = centre(sticky(modeler, "event_order_placed"));

    pointer.press(pointer.graphicsOf(sticky(modeler, "event_order_placed")), start);
    pointer.moveTo(offset(start, 60, 40));
    pointer.release(offset(start, 60, 40));

    expect(later).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("of the selection", () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.elements.onSelection(() => unsubscribeLater());
    const later: string[][] = [];
    unsubscribeLater = modeler.elements.onSelection((ids) => later.push(ids));

    modeler.elements.reveal("event_order_placed");

    expect(later).toEqual([]);
  });

  it("of the selection, also when the earlier listener unsubscribed itself first", () => {
    const unsubscribes: (() => void)[] = [];
    unsubscribes.push(
      modeler.elements.onSelection(() => {
        for (const unsubscribe of unsubscribes) unsubscribe();
      }),
    );
    const later: string[][] = [];
    unsubscribes.push(modeler.elements.onSelection((ids) => later.push(ids)));

    modeler.elements.reveal("event_order_placed");

    expect(later).toEqual([]);
  });
});

it("no later selection listener hears of a selection whose first listener destroyed the modeler", async () => {
  modeler.elements.reveal("policy_reserve_stock");
  const expectDestroyedCleanly = destroyedCleanly();
  modeler.elements.onSelection(() => modeler.destroy());
  const later: string[][] = [];
  modeler.elements.onSelection((ids) => later.push(ids));
  const pointer = pointerOn(modeler);
  const start = centre(sticky(modeler, "event_order_placed"));

  // diagram-js clears the selection as it activates the move.
  pointer.press(pointer.graphicsOf(sticky(modeler, "event_order_placed")), start);
  pointer.moveTo(offset(start, 60, 40));

  await expectDestroyedCleanly(BOARD);
  expect(later).toEqual([]);
});
