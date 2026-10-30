import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeEventStormingModeler,
} from "../../src/index.js";
import orderCheckout from "./fixtures/order-checkout.storm?raw";
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
 * a second destroy throws nothing, and the modeler keeps the text of the board it tore down: the
 * one it had at the destroy, or the one drawn by the host's call that reached the listener.
 */
function destroyedCleanly(): (textKept: string | undefined) => Promise<void> {
  const dragging = service<Dragging>(modeler, "dragging");
  const { svg } = pointerOn(modeler);
  return async (textKept) => {
    await nextTask();
    expect(errors).toEqual([]);
    expect(textKept).toBeDefined();
    expect(dragging.context()).toBeFalsy();
    expect(svg.isConnected).toBe(false);
    expect(() => modeler.destroy()).not.toThrow();
    expect(modeler.interaction.active()).toBe(false);
    expect(modeler.exportText()).toBe(textKept);
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

// #415: a host's own call that reaches a listener goes on with the board once the listener has
// returned. `reveal` scrolls to the sticky after its selection listener, and an import draws the
// board after it ended a held gesture and after the clear that empties the selection, so a
// destroy() from those listeners tears the board down once the call has returned.
describe("a destroy from a listener that a host's call reaches (#415)", () => {
  it.each([
    { mount: "modeler", create: createCollaborativeModeler },
    { mount: "viewer", create: createCollaborativeViewer },
  ])(
    "reveal on the $mount: it scrolls to the sticky first, and nothing reaches the host afterwards",
    async ({ create }) => {
      const revealHost = attachedHost();
      const revealing = create();
      revealing.attachTo(revealHost);
      await revealing.importText(BOARD);
      const { x, y, width, height } = service<Canvas>(revealing, "canvas").viewbox();
      revealing.setViewState({ x: x + 5000, y: y + 5000, width, height });
      const steps: string[] = [];
      const eventBus = service<EventBus>(revealing, "eventBus");
      eventBus.on("canvas.viewbox.changing", () => steps.push("scroll"));
      eventBus.on("diagram.destroy", () => steps.push("teardown"));
      const { svg } = pointerOn(revealing);
      revealing.elements.onSelection(() => revealing.destroy());
      const later: unknown[] = [];
      revealing.elements.onSelection((ids) => later.push(ids));
      revealing.interaction.onChange((active) => later.push(active));
      revealing.onContentChanged(() => later.push("change"));

      try {
        expect(revealing.elements.reveal("event_order_placed")).toBe(true);
        expect(steps).toEqual(["scroll"]);
        await nextTask();
        expect(errors).toEqual([]);
        expect(steps).toEqual(["scroll", "teardown"]);
        expect(svg.isConnected).toBe(false);
        expect(later).toEqual([]);
        expect(() => revealing.destroy()).not.toThrow();
        expect(revealing.exportText()).toBe(BOARD);
      } finally {
        (revealHost.parentElement ?? revealHost).remove();
      }
    },
  );

  /** The text a fresh viewer exports once it has imported `text`. */
  async function exportedAfterImporting(text: string): Promise<string> {
    const referenceHost = attachedHost();
    const reference = createCollaborativeViewer();
    reference.attachTo(referenceHost);
    try {
      await reference.importText(text);
      return reference.exportText();
    } finally {
      reference.destroy();
      (referenceHost.parentElement ?? referenceHost).remove();
    }
  }

  /**
   * When the import has drawn and when the teardown runs, in order. The listeners return nothing:
   * diagram-js's event bus stops a delivery at a listener that returns a value.
   */
  function recordImportSteps(diagram: CollaborativeEventStormingModeler): string[] {
    const steps: string[] = [];
    const eventBus = service<EventBus>(diagram, "eventBus");
    eventBus.on("import.done", () => {
      steps.push("drawn");
    });
    eventBus.on("diagram.destroy", () => {
      steps.push("teardown");
    });
    return steps;
  }

  // Decision 3 of batch 12 on #170: the import draws on the live board, the teardown waits until
  // its call has returned, and its Promise rejects, as one that waits when the modeler is destroyed.
  it.each([
    { mount: "modeler", create: createCollaborativeModeler },
    { mount: "viewer", create: createCollaborativeViewer },
  ])(
    "an import on the $mount, whose clear empties the selection: it draws, then rejects as destroyed, and nothing reaches the host afterwards",
    async ({ create }) => {
      const imported = await exportedAfterImporting(orderCheckout);
      const importHost = attachedHost();
      const importing = create();
      importing.attachTo(importHost);
      try {
        await importing.importText(BOARD);
        importing.elements.reveal("event_order_placed");
        const steps = recordImportSteps(importing);
        const { svg } = pointerOn(importing);
        const heard: string[][] = [];
        importing.elements.onSelection((ids) => {
          heard.push(ids);
          importing.destroy();
        });
        const later: unknown[] = [];
        importing.elements.onSelection((ids) => later.push(ids));
        importing.interaction.onChange((active) => later.push(active));
        importing.onContentChanged(() => later.push("change"));

        const result = importing.importText(orderCheckout);

        expect(steps).toEqual(["drawn"]);
        await expect(result).rejects.toThrow("The modeler was destroyed.");
        expect(heard).toEqual([[]]);
        await nextTask();
        expect(errors).toEqual([]);
        expect(steps).toEqual(["drawn", "teardown"]);
        expect(svg.isConnected).toBe(false);
        expect(later).toEqual([]);
        expect(() => importing.destroy()).not.toThrow();
        expect(importing.exportText()).toBe(imported);
      } finally {
        (importHost.parentElement ?? importHost).remove();
      }
    },
  );

  /** A move of Order Placed past the drag threshold, or a create held over free board. */
  const HELD_GESTURES = {
    move: () => {
      const pointer = pointerOn(modeler);
      const moved = sticky(modeler, "event_order_placed");
      const start = centre(moved);
      pointer.press(pointer.graphicsOf(moved), start);
      pointer.moveTo(offset(start, 30, 20));
      pointer.moveTo(offset(start, 60, 40));
    },
    create: () => {
      const pointer = pointerOn(modeler);
      pointer.click(paletteEntry("create.event"), FREE);
      pointer.moveTo(offset(FREE, -40, -20));
      pointer.moveTo(FREE);
    },
  };

  it.each(["move", "create"] as const)(
    "an import that ends a held %s, heard by the interaction listener: it draws, then rejects as destroyed, and nothing reaches the host afterwards",
    async (kind) => {
      const imported = await exportedAfterImporting(orderCheckout);
      const expectDestroyedCleanly = destroyedCleanly();
      HELD_GESTURES[kind]();
      await handlerReturned();
      expect(modeler.interaction.active()).toBe(true);
      const steps = recordImportSteps(modeler);
      const heard: boolean[] = [];
      modeler.interaction.onChange((active) => {
        heard.push(active);
        modeler.destroy();
      });
      const later: unknown[] = [];
      modeler.interaction.onChange((active) => later.push(active));
      modeler.elements.onSelection((ids) => later.push(ids));
      modeler.onContentChanged(() => later.push("change"));

      const result = modeler.importText(orderCheckout);

      expect(steps).toEqual(["drawn"]);
      await expect(result).rejects.toThrow("The modeler was destroyed.");
      expect(heard).toEqual([false]);
      await expectDestroyedCleanly(imported);
      expect(steps).toEqual(["drawn", "teardown"]);
      expect(later).toEqual([]);
    },
  );
});
