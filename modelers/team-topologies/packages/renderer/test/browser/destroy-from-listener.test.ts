import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import {
  createCollaborativeModeler,
  parseDocumentText,
  type CollaborativeTeamTopologiesModeler,
  type Modeler,
} from "@miragon/team-topologies-renderer";
import onlineShop from "../../../../example/sample.tt?raw";
import { Pointer, middle, paletteEntry, shape } from "./support/pointer.js";

// #380, #373: a host may destroy the modeler from any listener (#170). A destroy from the change
// listener at a keyboard create or at a paste placed with a click tore the diagram down while the
// palette and diagram-js still selected the new team on it, and a later change listener of the
// same delivery was still called. The teardown now waits until the handler of the input has
// returned, and no delivery reaches a listener after `destroy()` or after its unsubscribe. The end
// of every drag is in `import-during-gesture.test.ts`.

let modeler: CollaborativeTeamTopologiesModeler;
let diagram: Modeler;
let host: HTMLElement;
let pointer: Pointer;
let errors: unknown[] = [];
const recordError = (event: ErrorEvent) => errors.push(event.error ?? event.message);
const recordRejection = (event: PromiseRejectionEvent) => errors.push(event.reason);

beforeEach(async () => {
  errors = [];
  window.addEventListener("error", recordError);
  window.addEventListener("unhandledrejection", recordRejection);
  host = document.createElement("div");
  host.style.cssText = "position: fixed; left: 0; top: 0; width: 1280px; height: 800px;";
  document.body.append(host);
  modeler = createCollaborativeModeler();
  modeler.attachTo(host);
  await modeler.importText(onlineShop);
  diagram = modeler.diagram as Modeler;
  pointer = new Pointer(diagram);
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  window.removeEventListener("unhandledrejection", recordRejection);
  modeler.destroy();
  host.remove();
});

/** Every microtask has run by then, the deferred teardown included. */
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A spot right of the sample's teams. */
const FREE_SPOT = { x: 1120, y: 120 };

/**
 * Read before the destroy, since a service read afterwards would build a fresh diagram. Once the
 * input's handler has returned: no error reached the window, the drag and the canvas are gone, a
 * second destroy throws nothing, and the modeler keeps the text it had when it was destroyed.
 */
function destroyedCleanly(): (textAtDestroy: string | undefined) => Promise<void> {
  const dragging = diagram.get<Dragging>("dragging");
  const container = diagram.get<Canvas>("canvas").getContainer();
  return async (textAtDestroy) => {
    await nextTask();
    expect(errors).toEqual([]);
    expect(textAtDestroy).toBeDefined();
    expect(dragging.context()).toBeFalsy();
    expect(container.isConnected).toBe(false);
    expect(() => modeler.destroy()).not.toThrow();
    expect(modeler.interaction.active()).toBe(false);
    expect(modeler.exportText()).toBe(textAtDestroy);
  };
}

function teamCount(text: string): number {
  return parseDocumentText(text).nodes.length;
}

function keyboardClick(entry: HTMLElement): void {
  entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
}

function pressCanvasKey(key: string): void {
  const svg = diagram.get<Canvas>("canvas").getContainer().querySelector("svg")!;
  svg.focus();
  svg.dispatchEvent(
    new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }),
  );
}

const container = () => diagram.get<Canvas>("canvas").getContainer();

/** The pointer moves over the canvas, where diagram-js's `Mouse` takes a paste's start from. */
function moveOverCanvas(at: { x: number; y: number }): void {
  const canvas = diagram.get<Canvas>("canvas");
  const rect = container().getBoundingClientRect();
  const viewbox = canvas.viewbox();
  container()
    .querySelector("svg")!
    .dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: rect.left + (at.x - viewbox.x) * viewbox.scale,
        clientY: rect.top + (at.y - viewbox.y) * viewbox.scale,
      }),
    );
}

describe("a destroy from the change listener of a team the user made (#380, #373)", () => {
  const changes: { what: string; make: () => Promise<void> }[] = [
    {
      what: "Enter or Space on the palette's platform team (a click without a pointer)",
      make: async () => keyboardClick(paletteEntry(container(), "team.platform")),
    },
    {
      what: "a paste that follows the pointer, placed with a click",
      make: async () => {
        diagram.get<Selection>("selection").select(shape(diagram, "team_checkout"));
        pressCanvasKey("c");
        diagram.get<Selection>("selection").select(null);
        moveOverCanvas({ x: FREE_SPOT.x - 40, y: FREE_SPOT.y });
        pressCanvasKey("v");
        await Promise.resolve();
        pointer.enter();
        pointer.moveTo(FREE_SPOT);
        pointer.releaseAt(FREE_SPOT);
      },
    },
  ];

  for (const { what, make } of changes) {
    test(`${what}: nothing throws, and neither a later change listener nor the selection listener hears more`, async () => {
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
      expect(teamCount(textAtDestroy ?? before)).toBe(teamCount(before) + 1);
    });
  }
});

describe("no delivery reaches a listener that an earlier listener of it unsubscribed", () => {
  test("of a change", () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.onContentChanged(() => unsubscribeLater());
    let later = 0;
    unsubscribeLater = modeler.onContentChanged(() => (later += 1));

    keyboardClick(paletteEntry(container(), "team.platform"));

    expect(later).toBe(0);
    expect(errors).toEqual([]);
  });

  test("of the interaction", () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.interaction.onChange(() => unsubscribeLater());
    const later: boolean[] = [];
    unsubscribeLater = modeler.interaction.onChange((active) => later.push(active));
    const start = middle(shape(diagram, "team_checkout"));

    pointer.press(pointer.graphics("team_checkout"), start);
    pointer.enter();
    pointer.moveTo({ x: start.x + 60, y: start.y });
    pointer.escape();

    expect(later).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("of the selection", () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.elements.onSelection(() => unsubscribeLater());
    const later: string[][] = [];
    unsubscribeLater = modeler.elements.onSelection((ids) => later.push(ids));

    modeler.elements.reveal("team_checkout");

    expect(later).toEqual([]);
  });
});

test("no later selection listener hears of a selection whose first listener destroyed the modeler", async () => {
  modeler.elements.reveal("team_discovery");
  const expectDestroyedCleanly = destroyedCleanly();
  const text = modeler.exportText();
  modeler.elements.onSelection(() => modeler.destroy());
  const later: string[][] = [];
  modeler.elements.onSelection((ids) => later.push(ids));
  const start = middle(shape(diagram, "team_checkout"));

  // diagram-js clears the selection as it activates the move.
  pointer.press(pointer.graphics("team_checkout"), start);
  pointer.enter();
  pointer.moveTo({ x: start.x + 60, y: start.y });

  await expectDestroyedCleanly(text);
  expect(later).toEqual([]);
});
