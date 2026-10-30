/**
 * #380, #373: a host may destroy the modeler from any listener (#170). `interaction.onChange(false)`
 * comes inside diagram-js's `drag.cleanup`, and a destroy there made diagram-js cancel the drag a
 * second time from inside its own cleanup (`Cannot read properties of null (reading 'trapClick')`).
 * A destroy from the change listener at a drop or a keyboard create tore the map down while
 * diagram-js and the palette still selected the new context on it (`reading 'length'` in
 * `Canvas.getRootElement`), and a later change listener of the same delivery was still called. The
 * teardown now waits until the handler of the input has returned, and no delivery reaches a
 * listener after `destroy()` or after its unsubscribe.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import {
  createCollaborativeModeler,
  type CollaborativeContextMapsModeler,
} from "@miragon/context-maps-renderer";
import { parseDocumentText } from "@miragon/context-maps-schema-model";
import conferencePlanner from "./fixtures/conference-planner.cm?raw";
import {
  canvasContainer,
  MOVED_CONTEXT,
  paletteEntry,
  service,
  startGesture,
  type GestureKind,
} from "./support/gestures.js";

let modeler: CollaborativeContextMapsModeler;
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
  await modeler.importText(conferencePlanner);
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  window.removeEventListener("unhandledrejection", recordRejection);
  modeler.destroy();
  host.parentElement?.remove();
});

/** Every microtask has run by then, the deferred teardown included. */
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The handler of the input that started a drag has returned: the release or the key that ends it
 * comes in a handler of its own, as it does for a user.
 */
const handlerReturned = () => Promise.resolve();

/**
 * Read before the destroy, since a service read afterwards would build a fresh diagram. Once the
 * input's handler has returned: no error reached the window, the drag and the canvas are gone, a
 * second destroy throws nothing, and the modeler keeps the text it had when it was destroyed.
 */
function destroyedCleanly(): (textAtDestroy: string | undefined) => Promise<void> {
  const dragging = service<Dragging>(modeler, "dragging");
  const container = canvasContainer(modeler);
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

function contextCount(text: string): number {
  const parsed = parseDocumentText(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.document.contexts.length;
}

/** The kit's kinds: a move, a palette entry dragged onto the canvas, one clicked onto it. */
const KINDS: { kind: GestureKind; what: string; creates: boolean }[] = [
  { kind: "move", what: "a move", creates: false },
  { kind: "create", what: "a palette create dragged onto the canvas", creates: true },
  { kind: "createOffCanvas", what: "a palette create clicked onto the canvas", creates: true },
];

describe("a destroy from the interaction listener when it hears the gesture end (#380)", () => {
  for (const { kind, what, creates } of KINDS) {
    for (const ending of ["drop", "cancel"] as const) {
      test(`${what}, at its ${ending}: nothing throws and no later listener hears of it`, async () => {
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

        const gesture = startGesture(modeler, kind);
        await handlerReturned();
        gesture[ending]();

        expect(later).toEqual([true]);
        await expectDestroyedCleanly(textAtDestroy);
        expect(later).toEqual([true]);
        expect(changed).toBe(ending === "drop" ? 1 : 0);
        const created = creates && ending === "drop" ? 1 : 0;
        expect(contextCount(modeler.exportText())).toBe(contextCount(before) + created);
      });
    }
  }
});

describe("a destroy from the change listener of a context the user made (#380, #373)", () => {
  const changes: { what: string; contexts: number; make: () => Promise<void> }[] = [
    ...KINDS.map(({ kind, what, creates }) => ({
      what: `the drop of ${what}`,
      contexts: creates ? 1 : 0,
      make: async () => {
        const gesture = startGesture(modeler, kind);
        await handlerReturned();
        gesture.drop();
      },
    })),
    {
      what: "Enter or Space on the palette's core context (a click without a pointer)",
      contexts: 1,
      make: async () => {
        paletteEntry(modeler, "context.core").dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
        );
      },
    },
  ];

  for (const { what, contexts, make } of changes) {
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
      expect(textAtDestroy).not.toBe(before);
      expect(contextCount(textAtDestroy ?? before)).toBe(contextCount(before) + contexts);
    });
  }
});

describe("no delivery reaches a listener that an earlier listener of it unsubscribed", () => {
  test("of a change", () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.onContentChanged(() => unsubscribeLater());
    let later = 0;
    unsubscribeLater = modeler.onContentChanged(() => (later += 1));

    startGesture(modeler, "move").drop();

    expect(later).toBe(0);
    expect(errors).toEqual([]);
  });

  test("of the interaction", () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.interaction.onChange(() => unsubscribeLater());
    const later: boolean[] = [];
    unsubscribeLater = modeler.interaction.onChange((active) => later.push(active));

    startGesture(modeler, "move").cancel();

    expect(later).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("of the selection", () => {
    let unsubscribeLater: () => void = () => undefined;
    modeler.elements.onSelection(() => unsubscribeLater());
    const later: string[][] = [];
    unsubscribeLater = modeler.elements.onSelection((ids) => later.push(ids));

    modeler.elements.reveal(MOVED_CONTEXT);

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

    modeler.elements.reveal(MOVED_CONTEXT);

    expect(later).toEqual([]);
  });
});

test("no later selection listener hears of a selection whose first listener destroyed the modeler", async () => {
  const [other] = modeler.elements.list().filter((element) => element.id !== MOVED_CONTEXT);
  modeler.elements.reveal(other?.id ?? "");
  const expectDestroyedCleanly = destroyedCleanly();
  const text = modeler.exportText();
  modeler.elements.onSelection(() => modeler.destroy());
  const later: string[][] = [];
  modeler.elements.onSelection((ids) => later.push(ids));

  // diagram-js clears the selection as it activates the move.
  startGesture(modeler, "move");

  await expectDestroyedCleanly(text);
  expect(later).toEqual([]);
});
