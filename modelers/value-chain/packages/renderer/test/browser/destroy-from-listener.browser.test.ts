import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { parseDocumentJSON } from "@miragon/value-chain-schema-model";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeValueChainModeler,
} from "../../src/index.js";
import "../../src/assets/value-chain.css";
import PORTER from "../../../../example/porter.vc.json?raw";
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
 * a second destroy throws nothing, and the modeler keeps the text of the diagram it tore down: the
 * one it had at the destroy, or the one drawn by the host's call that reached the listener.
 */
function destroyedCleanly(): (textKept: string | undefined) => Promise<void> {
  const dragging = editor().diagram.get<Dragging>("dragging");
  const svg = pointer.canvasSvg();
  return async (textKept) => {
    await nextTask();
    expect(errors).toEqual([]);
    expect(textKept).toBeDefined();
    expect(dragging.context()).toBeFalsy();
    expect(svg.isConnected).toBe(false);
    expect(() => editor().destroy()).not.toThrow();
    expect(editor().interaction.active()).toBe(false);
    expect(editor().exportText()).toBe(textKept);
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

// #415: a host's own call that reaches a listener goes on with the diagram once the listener has
// returned. `reveal` scrolls to the element after its selection listener, and an import draws the
// diagram after it ended a held gesture and after the clear that empties the selection, so a
// destroy() from those listeners tears the diagram down once the call has returned.
describe("a destroy from a listener that a host's call reaches (#415)", () => {
  it.each([
    { mount: "modeler", create: createCollaborativeModeler },
    { mount: "viewer", create: createCollaborativeViewer },
  ])(
    "reveal on the $mount: it scrolls to the element first, and nothing reaches the host afterwards",
    async ({ create }) => {
      const revealHost = attachedHost(1000, 700);
      const revealing = create();
      revealing.attachTo(revealHost);
      await revealing.importText(ORDER_TO_CASH);
      const { x, y, width, height } = revealing.diagram.get<Canvas>("canvas").viewbox();
      revealing.setViewState({ x: x + 5000, y: y + 5000, width, height });
      const steps: string[] = [];
      const eventBus = revealing.diagram.get<EventBus>("eventBus");
      eventBus.on("canvas.viewbox.changing", () => steps.push("scroll"));
      eventBus.on("diagram.destroy", () => steps.push("teardown"));
      const svg = new CanvasPointer(revealing).canvasSvg();
      const text = revealing.exportText();
      revealing.elements.onSelection(() => revealing.destroy());
      const later: unknown[] = [];
      revealing.elements.onSelection((ids) => later.push(ids));
      revealing.interaction.onChange((active) => later.push(active));
      revealing.onContentChanged(() => later.push("change"));

      try {
        expect(revealing.elements.reveal("step-credit")).toBe(true);
        expect(steps).toEqual(["scroll"]);
        await nextTask();
        expect(errors).toEqual([]);
        expect(steps).toEqual(["scroll", "teardown"]);
        expect(svg.isConnected).toBe(false);
        expect(later).toEqual([]);
        expect(() => revealing.destroy()).not.toThrow();
        expect(revealing.exportText()).toBe(text);
      } finally {
        revealHost.parentElement?.remove();
      }
    },
  );

  /** The text a fresh viewer exports once it has imported `text`. */
  async function exportedAfterImporting(text: string): Promise<string> {
    const referenceHost = attachedHost(1000, 700);
    const reference = createCollaborativeViewer();
    reference.attachTo(referenceHost);
    try {
      await reference.importText(text);
      return reference.exportText();
    } finally {
      reference.destroy();
      referenceHost.parentElement?.remove();
    }
  }

  /**
   * When the import has drawn and when the teardown runs, in order. The listeners return nothing:
   * diagram-js's event bus stops a delivery at a listener that returns a value.
   */
  function recordImportSteps(diagram: CollaborativeValueChainModeler): string[] {
    const steps: string[] = [];
    const eventBus = diagram.diagram.get<EventBus>("eventBus");
    eventBus.on("import.done", () => {
      steps.push("drawn");
    });
    eventBus.on("diagram.destroy", () => {
      steps.push("teardown");
    });
    return steps;
  }

  // Decision 3 of batch 12 on #170: the import draws on the live diagram, the teardown waits until
  // its call has returned, and its Promise rejects, as one that waits when the modeler is destroyed.
  it.each([
    { mount: "modeler", create: createCollaborativeModeler },
    { mount: "viewer", create: createCollaborativeViewer },
  ])(
    "an import on the $mount, whose clear empties the selection: it draws, then rejects as destroyed, and nothing reaches the host afterwards",
    async ({ create }) => {
      const imported = await exportedAfterImporting(PORTER);
      const importHost = attachedHost(1000, 700);
      const importing = create();
      importing.attachTo(importHost);
      try {
        await importing.importText(ORDER_TO_CASH);
        importing.elements.reveal("step-credit");
        const steps = recordImportSteps(importing);
        const svg = new CanvasPointer(importing).canvasSvg();
        const heard: string[][] = [];
        importing.elements.onSelection((ids) => {
          heard.push(ids);
          importing.destroy();
        });
        const later: unknown[] = [];
        importing.elements.onSelection((ids) => later.push(ids));
        importing.interaction.onChange((active) => later.push(active));
        importing.onContentChanged(() => later.push("change"));

        const result = importing.importText(PORTER);

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
        importHost.parentElement?.remove();
      }
    },
  );

  it.each(["move", "create"] as const)(
    "an import that ends a held %s, heard by the interaction listener: it draws, then rejects as destroyed, and nothing reaches the host afterwards",
    async (kind) => {
      const imported = await exportedAfterImporting(PORTER);
      const expectDestroyedCleanly = destroyedCleanly();
      startGesture(editor(), kind);
      await handlerReturned();
      expect(editor().interaction.active()).toBe(true);
      const steps = recordImportSteps(editor());
      const heard: boolean[] = [];
      editor().interaction.onChange((active) => {
        heard.push(active);
        editor().destroy();
      });
      const later: unknown[] = [];
      editor().interaction.onChange((active) => later.push(active));
      editor().elements.onSelection((ids) => later.push(ids));
      editor().onContentChanged(() => later.push("change"));

      const result = editor().importText(PORTER);

      expect(steps).toEqual(["drawn"]);
      await expect(result).rejects.toThrow("The modeler was destroyed.");
      expect(heard).toEqual([false]);
      await expectDestroyedCleanly(imported);
      expect(steps).toEqual(["drawn", "teardown"]);
      expect(later).toEqual([]);
    },
  );
});
