import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement } from "diagram-js/lib/model/Types";
import { createCollaborativeModeler, type CollaborativeWardleyModeler } from "../../src/index.js";
import {
  canvasSvgOf,
  centreOf,
  clientAt,
  diagramOf,
  enterCanvas,
  mouse,
  paletteEntry,
  shapeNamed,
  startGesture,
  type Point,
} from "./support/gesture-harness.js";
import teaShop from "./fixtures/tea-shop.wmap?raw";
import "../../src/assets/wardley.css";

// #380, #373: a host may destroy the modeler from any listener (#170). A destroy from the change
// listener at a drop, a create without a pointer or a paste placed with a click tore the map down
// while diagram-js and the palette still selected the new element on it, and a later change
// listener of the same delivery was still called. The teardown now waits until the handler of the
// input has returned, and no delivery reaches a listener after `destroy()` or after its
// unsubscribe. The release of every Wardley gesture is in `interaction.browser.test.ts`.

let modeler: CollaborativeWardleyModeler;
let host: HTMLElement;
const errors: unknown[] = [];
const collectError = (event: ErrorEvent) => errors.push(event.error ?? event.message);
const collectRejection = (event: PromiseRejectionEvent) => errors.push(event.reason);

beforeEach(async () => {
  errors.length = 0;
  window.addEventListener("error", collectError);
  window.addEventListener("unhandledrejection", collectRejection);
  host = attachedHost();
  modeler = createCollaborativeModeler();
  modeler.attachTo(host);
  await modeler.importText(teaShop);
});

afterEach(() => {
  window.removeEventListener("error", collectError);
  window.removeEventListener("unhandledrejection", collectRejection);
  modeler.destroy();
  (host.parentElement ?? host).remove();
});

/** The steps a create defers by a task (its name editor) have run by then. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

/**
 * The handler of the input that started a drag has returned: the release or the key that ends it
 * comes in a handler of its own, as it does for a user.
 */
const handlerReturned = () => Promise.resolve();

/**
 * Read before the destroy, since reading a service afterwards would build a fresh diagram. Once
 * the input's handler and the steps it deferred have run: no error reached the window, the drag
 * and the canvas are gone, a second destroy throws nothing, and the modeler keeps the text it had
 * when it was destroyed.
 */
function destroyedCleanly(): (textAtDestroy: string | undefined) => Promise<void> {
  const dragging = diagramOf(modeler).get<Dragging>("dragging");
  const svg = canvasSvgOf(modeler);
  return async (textAtDestroy) => {
    await settle();
    expect(errors).toEqual([]);
    expect(textAtDestroy).toBeDefined();
    expect(dragging.context()).toBeFalsy();
    expect(svg.isConnected).toBe(false);
    expect(() => modeler.destroy()).not.toThrow();
    expect(modeler.interaction.active()).toBe(false);
    expect(modeler.exportText()).toBe(textAtDestroy);
  };
}

function componentCount(text: string): number {
  return text.split("\n").filter((line) => line.startsWith("component ")).length;
}

function pressCanvasKey(key: string, init: KeyboardEventInit = {}): void {
  const svg = canvasSvgOf(modeler);
  svg.focus();
  svg.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
}

/** A spot of the plot right of the tea shop's components. */
function freeSpot(): Point {
  return clientAt(modeler, { x: 500, y: 330 });
}

describe("a destroy from the interaction listener when it hears the gesture end (#380)", () => {
  describe.each(["move", "create"] as const)("a %s", (kind) => {
    test.each([
      { ending: "drop", changes: 1 },
      { ending: "cancel", changes: 0 },
    ] as const)(
      "at its $ending: nothing throws and no later listener hears of it",
      async ({ ending, changes }) => {
        const expectDestroyedCleanly = destroyedCleanly();
        const before = modeler.exportText();
        let textAtDestroy: string | undefined;
        modeler.interaction.onChange((active) => {
          if (active) return;
          textAtDestroy = modeler.exportText();
          modeler.destroy();
        });
        const later: boolean[] = [];
        modeler.interaction.onChange((active) => later.push(active));
        let changed = 0;
        modeler.onContentChanged(() => (changed += 1));

        const gesture = await startGesture(modeler, kind);
        await handlerReturned();
        gesture[ending]();

        expect(later).toEqual([true]);
        await expectDestroyedCleanly(textAtDestroy);
        expect(later).toEqual([true]);
        expect(changed).toBe(changes);
        const created = kind === "create" ? changes : 0;
        expect(componentCount(textAtDestroy ?? "")).toBe(componentCount(before) + created);
      },
    );
  });
});

describe("a destroy from the change listener of an element the user made (#380, #373)", () => {
  /** Each makes one change; the change comes in the handler of the input's last step. */
  const changes = [
    {
      what: "the drop of a move",
      components: 0,
      make: async () => {
        const gesture = await startGesture(modeler, "move");
        await handlerReturned();
        gesture.drop();
      },
    },
    {
      what: "a click on the palette's Component, placed with a click on the canvas",
      components: 1,
      make: async () => {
        const gesture = await startGesture(modeler, "create");
        await handlerReturned();
        gesture.drop();
      },
    },
    {
      what: "Enter or Space on the palette's Component (a click without a pointer)",
      components: 1,
      make: async () => {
        const entry = paletteEntry(modeler, "create.component");
        mouse(entry, "click", centreOf(entry), { detail: 0 });
      },
    },
    {
      what: "a paste that follows the pointer, placed with a click",
      components: 1,
      make: async () => {
        diagramOf(modeler)
          .get<Selection>("selection")
          .select(shapeNamed(modeler, "Cup") as unknown as DiagramElement);
        pressCanvasKey("c", { ctrlKey: true });
        diagramOf(modeler).get<Selection>("selection").select(null);
        mouse(canvasSvgOf(modeler), "mousemove", freeSpot());
        pressCanvasKey("v", { ctrlKey: true });
        await handlerReturned();
        enterCanvas(modeler);
        mouse(document, "mousemove", freeSpot());
        mouse(canvasSvgOf(modeler), "mouseup", freeSpot());
      },
    },
  ];

  test.each(changes)(
    "$what: nothing throws, and neither a later change listener nor the selection listener hears more",
    async ({ components, make }) => {
      const expectDestroyedCleanly = destroyedCleanly();
      const before = modeler.exportText();
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
      expect(textAtDestroy).not.toBe(before);
      expect(componentCount(textAtDestroy ?? "")).toBe(componentCount(before) + components);
    },
  );
});

describe("no delivery reaches a listener that an earlier listener of it unsubscribed", () => {
  test("of a change", async () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.onContentChanged(() => unsubscribeLater());
    let later = 0;
    unsubscribeLater = modeler.onContentChanged(() => (later += 1));

    (await startGesture(modeler, "move")).drop();

    expect(later).toBe(0);
    expect(errors).toEqual([]);
  });

  test("of the interaction", async () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.interaction.onChange(() => unsubscribeLater());
    const later: boolean[] = [];
    unsubscribeLater = modeler.interaction.onChange((active) => later.push(active));

    (await startGesture(modeler, "move")).cancel();

    expect(later).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("of the selection", () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.elements.onSelection(() => unsubscribeLater());
    const later: string[][] = [];
    unsubscribeLater = modeler.elements.onSelection((ids) => later.push(ids));

    modeler.elements.reveal(modeler.elements.list()[0]?.id ?? "");

    expect(later).toEqual([]);
  });

  test("of the selection, also when the earlier listener unsubscribed itself first", () => {
    const unsubscribes: (() => void)[] = [];
    unsubscribes.push(
      modeler.elements.onSelection(() => {
        for (const unsubscribe of unsubscribes) unsubscribe();
      }),
    );
    const later: string[][] = [];
    unsubscribes.push(modeler.elements.onSelection((ids) => later.push(ids)));

    modeler.elements.reveal(modeler.elements.list()[0]?.id ?? "");

    expect(later).toEqual([]);
  });
});

test("no later selection listener hears of a selection whose first listener destroyed the modeler", async () => {
  modeler.elements.reveal(modeler.elements.list()[0]?.id ?? "");
  const expectDestroyedCleanly = destroyedCleanly();
  const text = modeler.exportText();
  modeler.elements.onSelection(() => modeler.destroy());
  const later: string[][] = [];
  modeler.elements.onSelection((ids) => later.push(ids));

  // diagram-js clears the selection as it activates the move.
  await startGesture(modeler, "move");

  await expectDestroyedCleanly(text);
  expect(later).toEqual([]);
});
