import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { parseDocumentJSON } from "@miragon/value-chain-schema-model";
import {
  createCollaborativeModeler,
  type CollaborativeValueChainModeler,
} from "../../src/index.js";
import "../../src/assets/value-chain.css";
import ORDER_TO_CASH from "./fixtures/order-to-cash.vc.json?raw";
import { CanvasPointer, FREE_SPOT, startGesture, type Point } from "./support/pointer.js";

/**
 * #380, #373: a host may destroy the modeler from any listener (#170). A destroy from the change
 * listener at a drop, a keyboard create or a paste placed with a click tore the canvas down while
 * diagram-js and the palette still selected the new step on it (`Cannot read properties of
 * undefined (reading 'length')` in `Canvas.getRootElement`), and a later change listener of the
 * same delivery was still called. The teardown now waits until the handler of the input has
 * returned, and no delivery reaches a listener after `destroy()` or after its unsubscribe.
 */

/** An empty spot right of the fixture's steps, where a paste follows the pointer from. */
const EMPTY_STRETCH: Point = { x: 820, y: 560 };

let modeler: CollaborativeValueChainModeler | undefined;
let pointer: CanvasPointer;
let errors: unknown[] = [];

function recordError(event: ErrorEvent): void {
  errors.push(event.error);
}

function recordRejection(event: PromiseRejectionEvent): void {
  errors.push(event.reason);
}

function editor(): CollaborativeValueChainModeler {
  if (!modeler) throw new Error("no modeler mounted");
  return modeler;
}

/** Every microtask has run by then, the deferred teardown included. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The handler of the input that started a drag has returned: the release or the key that ends it
 * comes in a handler of its own, as it does for a user.
 */
function handlerReturned(): Promise<void> {
  return Promise.resolve();
}

beforeEach(async () => {
  modeler = createCollaborativeModeler({ fitOnImport: false });
  modeler.attachTo(attachedHost(1000, 700));
  await modeler.importText(ORDER_TO_CASH);
  pointer = new CanvasPointer(modeler);
  errors = [];
  window.addEventListener("error", recordError);
  window.addEventListener("unhandledrejection", recordRejection);
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  window.removeEventListener("unhandledrejection", recordRejection);
  modeler?.destroy();
  modeler = undefined;
});

/**
 * Read before the destroy, since reading a service afterwards would build a fresh diagram. Once
 * the input's handler has returned: no error reached the window, the drag and the canvas are gone,
 * a second destroy throws nothing, and the modeler keeps the text it had when it was destroyed.
 */
function destroyedCleanly(): (textAtDestroy: string | undefined) => Promise<void> {
  const dragging = editor().diagram.get<Dragging>("dragging");
  const svg = pointer.canvasSvg();
  return async (textAtDestroy) => {
    await nextTask();
    expect(errors).toEqual([]);
    expect(textAtDestroy).toBeDefined();
    expect(dragging.context()).toBeFalsy();
    expect(svg.isConnected).toBe(false);
    expect(() => editor().destroy()).not.toThrow();
    expect(editor().interaction.active()).toBe(false);
    expect(editor().exportText()).toBe(textAtDestroy);
  };
}

function stepCount(text: string): number {
  return parseDocumentJSON(text).elements.filter((element) => element.elementType === "step")
    .length;
}

function keydownWithCmd(key: string): void {
  pointer
    .canvasSvg()
    .dispatchEvent(
      new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }),
    );
}

describe("a destroy from the interaction listener when it hears the gesture end (#380)", () => {
  describe.each(["move", "create"] as const)("a %s", (kind) => {
    it.each([
      { ending: "drop", changes: 1 },
      { ending: "cancel", changes: 0 },
    ] as const)(
      "at its $ending: nothing throws and no later listener hears of it",
      async ({ ending, changes }) => {
        const expectDestroyedCleanly = destroyedCleanly();
        const before = editor().exportText();
        let textAtDestroy: string | undefined;
        editor().interaction.onChange((active) => {
          if (active) return;
          textAtDestroy = editor().exportText();
          editor().destroy();
        });
        const later: boolean[] = [];
        editor().interaction.onChange((active) => later.push(active));
        let changed = 0;
        editor().onContentChanged(() => (changed += 1));

        const gesture = startGesture(editor(), kind);
        await handlerReturned();
        gesture[ending]();

        expect(later).toEqual([true]);
        await expectDestroyedCleanly(textAtDestroy);
        expect(later).toEqual([true]);
        expect(changed).toBe(changes);
        const created = kind === "create" ? changes : 0;
        expect(stepCount(textAtDestroy ?? "")).toBe(stepCount(before) + created);
      },
    );
  });
});

describe("a destroy from the change listener of a step the user made (#380, #373)", () => {
  /** Each makes one change; the change comes in the handler of the input's last step. */
  const changes = [
    {
      what: "the drop of a move",
      steps: 0,
      make: async () => {
        const gesture = startGesture(editor(), "move");
        await handlerReturned();
        gesture.drop();
      },
    },
    {
      what: "the drop of a step dragged from the palette",
      steps: 1,
      make: async () => {
        const gesture = startGesture(editor(), "create");
        await handlerReturned();
        gesture.drop();
      },
    },
    {
      what: "a click on the palette's Step, placed with a click on the canvas",
      steps: 1,
      make: async () => {
        pointer.pickFromPalette("create.step");
        await handlerReturned();
        pointer.hover(pointer.canvasSvg(), FREE_SPOT);
        pointer.release();
      },
    },
    {
      what: "the drop of a step dragged from the context pad's append",
      steps: 1,
      make: async () => {
        const entry = pointer.contextPadEntry("step-delivery", "append.step");
        entry.dispatchEvent(pointer.event("dragstart", pointer.centreOf("step-delivery")));
        await handlerReturned();
        pointer.hover(pointer.canvasSvg(), FREE_SPOT);
        pointer.release(FREE_SPOT);
      },
    },
    {
      what: "Enter or Space on the palette's Step (a click without a pointer)",
      steps: 1,
      make: () => {
        const { entry } = pointer.paletteEntry("create.step");
        entry.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
        );
        return Promise.resolve();
      },
    },
    {
      what: "a paste that follows the pointer, placed with a click",
      steps: 1,
      make: async () => {
        pointer.canvasSvg().dispatchEvent(pointer.event("mousemove", EMPTY_STRETCH));
        keydownWithCmd("v");
        await handlerReturned();
        pointer.hover(pointer.canvasSvg(), FREE_SPOT);
        pointer.release();
      },
    },
  ];

  it.each(changes)(
    "$what: nothing throws, and neither a later change listener nor the selection listener hears more",
    async ({ steps, make }) => {
      const selection = editor().diagram.get<Selection>("selection");
      selection.select(pointer.shape("step-credit"));
      pointer.canvasSvg().focus();
      keydownWithCmd("c");
      selection.select(null);
      const expectDestroyedCleanly = destroyedCleanly();
      const before = editor().exportText();
      const selections: string[][] = [];
      editor().elements.onSelection((ids) => selections.push(ids));
      let textAtDestroy: string | undefined;
      let selectionsAtDestroy = -1;
      editor().onContentChanged(() => {
        textAtDestroy = editor().exportText();
        selectionsAtDestroy = selections.length;
        editor().destroy();
      });
      let later = 0;
      editor().onContentChanged(() => (later += 1));

      const making = make();
      expect(later).toBe(0);
      await making;

      await expectDestroyedCleanly(textAtDestroy);
      expect(later).toBe(0);
      expect(selections).toHaveLength(selectionsAtDestroy);
      expect(stepCount(textAtDestroy ?? "")).toBe(stepCount(before) + steps);
      expect(textAtDestroy).not.toBe(before);
    },
  );
});

describe("no delivery reaches a listener that an earlier listener of it unsubscribed", () => {
  it("of a change", () => {
    let unsubscribeLater: () => void = () => undefined;
    editor().onContentChanged(() => unsubscribeLater());
    let later = 0;
    unsubscribeLater = editor().onContentChanged(() => (later += 1));

    startGesture(editor(), "move").drop();

    expect(later).toBe(0);
    expect(errors).toEqual([]);
  });

  it("of the interaction", () => {
    let unsubscribeLater: () => void = () => undefined;
    editor().interaction.onChange(() => unsubscribeLater());
    const later: boolean[] = [];
    unsubscribeLater = editor().interaction.onChange((active) => later.push(active));

    startGesture(editor(), "move").cancel();

    expect(later).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("of the selection", () => {
    let unsubscribeLater: () => void = () => undefined;
    editor().elements.onSelection(() => unsubscribeLater());
    const later: string[][] = [];
    unsubscribeLater = editor().elements.onSelection((ids) => later.push(ids));

    editor().elements.reveal("step-credit");

    expect(later).toEqual([]);
  });

  it("of the selection, also when the earlier listener unsubscribed itself first", () => {
    const unsubscribes: (() => void)[] = [];
    unsubscribes.push(
      editor().elements.onSelection(() => {
        for (const unsubscribe of unsubscribes) unsubscribe();
      }),
    );
    const later: string[][] = [];
    unsubscribes.push(editor().elements.onSelection((ids) => later.push(ids)));

    editor().elements.reveal("step-credit");

    expect(later).toEqual([]);
  });
});

it("no later selection listener hears of a selection whose first listener destroyed the modeler", async () => {
  editor().elements.reveal("step-credit");
  const expectDestroyedCleanly = destroyedCleanly();
  const text = editor().exportText();
  editor().elements.onSelection(() => editor().destroy());
  const later: string[][] = [];
  editor().elements.onSelection((ids) => later.push(ids));

  // diagram-js empties the selection as it activates the move.
  startGesture(editor(), "move");

  await expectDestroyedCleanly(text);
  expect(later).toEqual([]);
});
