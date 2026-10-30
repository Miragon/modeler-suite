import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeWardleyModeler,
} from "../../src/index.js";
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
import platformStrategy from "./fixtures/platform-strategy.wmap?raw";
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
 * and the canvas are gone, a second destroy throws nothing, and the modeler keeps the text of the
 * map it tore down: the one it had at the destroy, or the one drawn by the host's call that
 * reached the listener.
 */
function destroyedCleanly(): (textKept: string | undefined) => Promise<void> {
  const dragging = diagramOf(modeler).get<Dragging>("dragging");
  const svg = canvasSvgOf(modeler);
  return async (textKept) => {
    await settle();
    expect(errors).toEqual([]);
    expect(textKept).toBeDefined();
    expect(dragging.context()).toBeFalsy();
    expect(svg.isConnected).toBe(false);
    expect(() => modeler.destroy()).not.toThrow();
    expect(modeler.interaction.active()).toBe(false);
    expect(modeler.exportText()).toBe(textKept);
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

// #415: a host's own call that reaches a listener goes on with the map once the listener has
// returned. `reveal` scrolls to the element after its selection listener, and an import draws the
// map after it ended a held gesture and after the clear that empties the selection, so a destroy()
// from those listeners tears the map down once the call has returned.
describe("a destroy from a listener that a host's call reaches (#415)", () => {
  test.each([
    { mount: "modeler", create: createCollaborativeModeler },
    { mount: "viewer", create: createCollaborativeViewer },
  ])(
    "reveal on the $mount: it scrolls to the element first, and nothing reaches the host afterwards",
    async ({ create }) => {
      const revealHost = attachedHost();
      const revealing = create();
      revealing.attachTo(revealHost);
      await revealing.importText(teaShop);
      const { x, y, width, height } = diagramOf(revealing).get<Canvas>("canvas").viewbox();
      revealing.setViewState({ x: x + 5000, y: y + 5000, width, height });
      const steps: string[] = [];
      const eventBus = diagramOf(revealing).get<EventBus>("eventBus");
      eventBus.on("canvas.viewbox.changing", () => steps.push("scroll"));
      eventBus.on("diagram.destroy", () => steps.push("teardown"));
      const svg = canvasSvgOf(revealing);
      const text = revealing.exportText();
      revealing.elements.onSelection(() => revealing.destroy());
      const later: unknown[] = [];
      revealing.elements.onSelection((ids) => later.push(ids));
      revealing.interaction.onChange((active) => later.push(active));
      revealing.onContentChanged(() => later.push("change"));

      try {
        expect(revealing.elements.reveal(shapeNamed(revealing, "Cup").id)).toBe(true);
        expect(steps).toEqual(["scroll"]);
        await settle();
        expect(errors).toEqual([]);
        expect(steps).toEqual(["scroll", "teardown"]);
        expect(svg.isConnected).toBe(false);
        expect(later).toEqual([]);
        expect(() => revealing.destroy()).not.toThrow();
        expect(revealing.exportText()).toBe(text);
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
  function recordImportSteps(diagram: CollaborativeWardleyModeler): string[] {
    const steps: string[] = [];
    const eventBus = diagramOf(diagram).get<EventBus>("eventBus");
    eventBus.on("import.done", () => {
      steps.push("drawn");
    });
    eventBus.on("diagram.destroy", () => {
      steps.push("teardown");
    });
    return steps;
  }

  // Decision 3 of batch 12 on #170: the import draws on the live map, the teardown waits until its
  // call has returned, and its Promise rejects, as one that waits when the modeler is destroyed.
  test.each([
    { mount: "modeler", create: createCollaborativeModeler },
    { mount: "viewer", create: createCollaborativeViewer },
  ])(
    "an import on the $mount, whose clear empties the selection: it draws, then rejects as destroyed, and nothing reaches the host afterwards",
    async ({ create }) => {
      const imported = await exportedAfterImporting(platformStrategy);
      const importHost = attachedHost();
      const importing = create();
      importing.attachTo(importHost);
      try {
        await importing.importText(teaShop);
        importing.elements.reveal(shapeNamed(importing, "Cup").id);
        const steps = recordImportSteps(importing);
        const svg = canvasSvgOf(importing);
        const heard: string[][] = [];
        importing.elements.onSelection((ids) => {
          heard.push(ids);
          importing.destroy();
        });
        const later: unknown[] = [];
        importing.elements.onSelection((ids) => later.push(ids));
        importing.interaction.onChange((active) => later.push(active));
        importing.onContentChanged(() => later.push("change"));

        const result = importing.importText(platformStrategy);

        expect(steps).toEqual(["drawn"]);
        await expect(result).rejects.toThrow("The modeler was destroyed.");
        expect(heard).toEqual([[]]);
        await settle();
        expect(errors).toEqual([]);
        expect(steps).toEqual(["drawn", "teardown"]);
        expect(svg.isConnected).toBe(false);
        expect(later).toEqual([]);
        expect(() => importing.destroy()).not.toThrow();
        expect(importing.exportText()).toBe(imported);
        // The selection the import brings back after it has drawn the map built no new one.
        expect(importing.diagram.container.querySelector(".djs-container")).toBeNull();
      } finally {
        (importHost.parentElement ?? importHost).remove();
      }
    },
  );

  test.each(["move", "create"] as const)(
    "an import that ends a held %s, heard by the interaction listener: it draws, then rejects as destroyed, and nothing reaches the host afterwards",
    async (kind) => {
      const imported = await exportedAfterImporting(platformStrategy);
      const expectDestroyedCleanly = destroyedCleanly();
      await startGesture(modeler, kind);
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

      const result = modeler.importText(platformStrategy);

      expect(steps).toEqual(["drawn"]);
      await expect(result).rejects.toThrow("The modeler was destroyed.");
      expect(heard).toEqual([false]);
      await expectDestroyedCleanly(imported);
      expect(steps).toEqual(["drawn", "teardown"]);
      expect(later).toEqual([]);
    },
  );

  // The modeler's import selects again what was selected before it, once it has drawn the map.
  test("an import that brings the selection back, heard by the selection listener: it rejects as destroyed, and nothing reaches the host afterwards", async () => {
    const imported = await exportedAfterImporting(teaShop);
    const expectDestroyedCleanly = destroyedCleanly();
    modeler.elements.reveal(shapeNamed(modeler, "Cup").id);
    const selected = modeler.elements.selection();
    expect(selected).toHaveLength(1);
    const heard: string[][] = [];
    modeler.elements.onSelection((ids) => {
      heard.push(ids);
      if (ids.length > 0) modeler.destroy();
    });
    const later: unknown[] = [];
    modeler.elements.onSelection((ids) => later.push(ids));
    modeler.interaction.onChange((active) => later.push(active));
    modeler.onContentChanged(() => later.push("change"));

    await expect(modeler.importText(teaShop)).rejects.toThrow("The modeler was destroyed.");

    expect(heard).toEqual([[], selected]);
    await expectDestroyedCleanly(imported);
    expect(later).toEqual([[]]);
  });

  // A destroy that comes after the import's call has returned, from no listener of the import,
  // leaves an import that has drawn by then to resolve, as in every other renderer.
  test("an import that has drawn when its call returns resolves, though the host destroys the modeler right after that call", async () => {
    modeler.elements.reveal(shapeNamed(modeler, "Cup").id);
    const steps = recordImportSteps(modeler);
    const heard: string[][] = [];
    modeler.elements.onSelection((ids) => heard.push(ids));

    const result = modeler.importText(platformStrategy);
    expect(steps).toEqual(["drawn"]);
    modeler.destroy();

    await expect(result).resolves.toEqual({ warnings: [] });
    await settle();
    expect(errors).toEqual([]);
    expect(steps).toEqual(["drawn", "teardown"]);
    // The selection from before the import is not brought back on the destroyed modeler.
    expect(heard).toEqual([[]]);
  });
});
