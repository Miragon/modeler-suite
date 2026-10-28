import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import { parseDocumentJSON, serializeDocument } from "@miragon/value-chain-schema-model";
import {
  createCollaborativeModeler,
  type CollaborativeValueChainModeler,
  type VcLabelEditingProvider,
} from "../../src/index.js";
import "../../src/assets/value-chain.css";
import ORDER_TO_CASH from "./fixtures/order-to-cash.vc.json?raw";
import { CanvasPointer, FREE_SPOT } from "./support/pointer.js";

/**
 * #248: a host that imports (or clears) from its change listener does so while the drop that made
 * the change is still being applied. The import waits until the drop has ended (`drag.ended` or
 * `drag.canceled`) and then runs, its promise settling after it, so no listener of the drop meets
 * a replaced diagram: diagram-js's own selection on `shape.move.end` threw on a removed shape, and
 * the label editor an append opens would open on a shape the import had replaced.
 */

/** The document without one element and the connections that touch it. */
function withoutElement(text: string, id: string): string {
  const document = parseDocumentJSON(text);
  return serializeDocument({
    ...document,
    elements: document.elements.filter((element) => element.id !== id),
    connections: document.connections.filter(
      (connection) => connection.source !== id && connection.target !== id,
    ),
  });
}

/** The document with one element moved right, in canonical form. */
function withElementMoved(text: string, id: string, dx: number): string {
  const document = parseDocumentJSON(text);
  return serializeDocument({
    ...document,
    elements: document.elements.map((element) =>
      element.id === id
        ? { ...element, bounds: { ...element.bounds, x: element.bounds.x + dx } }
        : element,
    ),
  });
}

const WITHOUT_CREDIT = withoutElement(ORDER_TO_CASH, "step-credit");

let modeler: CollaborativeValueChainModeler | undefined;
let pointer: CanvasPointer;
let changes = 0;
let errors: unknown[] = [];
let dragEnds: string[] = [];

function recordError(event: ErrorEvent): void {
  errors.push(event.error);
}

function editor(): CollaborativeValueChainModeler {
  if (!modeler) throw new Error("no modeler mounted");
  return modeler;
}

function eventBus(): EventBus {
  return editor().diagram.get<EventBus>("eventBus");
}

/** Calls `react` in the change listener of the first change only, as an echoing host does. */
function onFirstChange(react: () => void): void {
  const unsubscribe = editor().onContentChanged(() => {
    unsubscribe();
    react();
  });
}

function moveCredit(dx = 60): void {
  const start = pointer.centreOf("step-credit");
  pointer.press(pointer.graphics("step-credit"), start);
  pointer.moveTo({ x: start.x + dx / 2, y: start.y });
  pointer.moveTo({ x: start.x + dx, y: start.y });
  pointer.release();
}

function expectDropEndedCleanly(): void {
  expect(errors).toEqual([]);
  expect(dragEnds).toEqual(["drag.ended"]);
}

beforeEach(async () => {
  modeler = createCollaborativeModeler({ fitOnImport: false });
  modeler.attachTo(attachedHost(1000, 700));
  await modeler.importText(ORDER_TO_CASH);
  pointer = new CanvasPointer(modeler);
  changes = 0;
  errors = [];
  dragEnds = [];
  modeler.onContentChanged(() => (changes += 1));
  eventBus().on(["drag.ended", "drag.canceled"], (event: { type: string }) => {
    dragEnds.push(event.type);
  });
  window.addEventListener("error", recordError);
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  modeler?.destroy();
  modeler = undefined;
});

describe("an import from the change listener of a drop waits until the drop has ended", () => {
  it.each([
    ["another shape", "step-order"],
    ["the moved shape", "step-credit"],
  ])(
    "a move, with %s selected before the drag, whose import removes the moved shape",
    async (_, selected) => {
      editor().elements.reveal(selected);
      let reimport: Promise<unknown> | undefined;
      onFirstChange(() => {
        reimport = editor().importText(WITHOUT_CREDIT);
      });

      moveCredit();
      expectDropEndedCleanly();
      expect(pointer.shape("step-credit").x).toBe(300);

      await reimport;
      expect(editor().exportText()).toBe(WITHOUT_CREDIT);
      expect(changes).toBe(1);
      expect(errors).toEqual([]);
    },
  );

  it("a create from the palette, with a shape selected before", async () => {
    editor().elements.reveal("step-order");
    let reimport: Promise<unknown> | undefined;
    onFirstChange(() => {
      reimport = editor().importText(ORDER_TO_CASH);
    });

    pointer.pickFromPalette("create.step");
    pointer.hover(pointer.canvasSvg(), FREE_SPOT);
    pointer.release(FREE_SPOT);
    expectDropEndedCleanly();
    expect(editor().elements.list()).toHaveLength(
      parseDocumentJSON(ORDER_TO_CASH).elements.length + 1,
    );

    await reimport;
    expect(editor().exportText()).toBe(ORDER_TO_CASH);
    expect(changes).toBe(1);
  });

  it("an append from the context pad opens its label editor on the live step, open again after an echo import", async () => {
    const registry = editor().diagram.get<ElementRegistry>("elementRegistry");
    const labelEditing = editor().diagram.get<VcLabelEditingProvider>("vcLabelEditingProvider");
    let reimport: Promise<unknown> | undefined;
    onFirstChange(() => {
      reimport = editor().importText(editor().exportText());
    });

    const entry = pointer.contextPadEntry("step-delivery", "append.step");
    entry.dispatchEvent(pointer.event("dragstart", pointer.centreOf("step-delivery")));
    pointer.hover(pointer.canvasSvg(), FREE_SPOT);
    pointer.release(FREE_SPOT);
    expectDropEndedCleanly();
    const appended = labelEditing.openEdit()?.element;
    expect(appended).toBeDefined();
    expect(registry.get(appended!.id)).toBe(appended);

    await reimport;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const reopened = labelEditing.openEdit()?.element;
    expect(reopened?.id).toBe(appended!.id);
    expect(registry.get(reopened!.id)).toBe(reopened);
    expect(errors).toEqual([]);
  });

  it("settles after the drop has ended and the import has run", async () => {
    const order: string[] = [];
    eventBus().on("drag.ended", () => order.push("drop ended"));
    eventBus().on("import.done", () => order.push("imported"));
    let reimport: Promise<unknown> | undefined;
    onFirstChange(() => {
      order.push("import called");
      reimport = editor()
        .importText(WITHOUT_CREDIT)
        .then(() => order.push("settled"));
    });

    moveCredit();
    expect(order).toEqual(["import called", "drop ended"]);

    await reimport;
    expect(order).toEqual(["import called", "drop ended", "imported", "settled"]);
  });

  it("runs the imports that wait in the order they came, and one called once the drop ended waits behind them", async () => {
    const first = withElementMoved(ORDER_TO_CASH, "step-order", 10);
    const second = withElementMoved(ORDER_TO_CASH, "step-order", 20);
    const third = withElementMoved(ORDER_TO_CASH, "step-order", 30);
    const settled: string[] = [];
    const imports: Promise<unknown>[] = [];
    onFirstChange(() => {
      imports.push(
        editor()
          .importText(first)
          .then(() => settled.push("first")),
      );
      imports.push(
        editor()
          .importText(second)
          .then(() => settled.push("second")),
      );
    });
    eventBus().once("drag.ended", () => {
      imports.push(
        editor()
          .importText(third)
          .then(() => settled.push("third")),
      );
    });

    moveCredit();
    await Promise.all(imports);

    expect(settled).toEqual(["first", "second", "third"]);
    expect(editor().exportText()).toBe(third);
    expect(errors).toEqual([]);
  });

  it("a text the import rejects rejects at once, and the drop applies", async () => {
    let rejected: Promise<unknown> | undefined;
    onFirstChange(() => {
      rejected = editor().importText('{ "schemaVersion": 99 }');
    });

    moveCredit();
    expectDropEndedCleanly();

    await expect(rejected).rejects.toThrow();
    expect(pointer.shape("step-credit").x).toBe(300);
    expect(changes).toBe(1);
  });

  it("runs also when a listener threw in the drop's cleanup, which keeps diagram-js from announcing the end", async () => {
    const failingCleanup = (): never => {
      throw new Error("cleanup failed");
    };
    eventBus().on("shape.move.cleanup", failingCleanup);
    let reimport: Promise<unknown> | undefined;
    onFirstChange(() => {
      reimport = editor().importText(WITHOUT_CREDIT);
    });
    const start = pointer.centreOf("step-credit");
    pointer.press(pointer.graphics("step-credit"), start);
    pointer.moveTo({ x: start.x + 60, y: start.y });
    expect(() =>
      editor()
        .diagram.get<Dragging>("dragging")
        .end(pointer.event("mouseup", { x: start.x + 60, y: start.y })),
    ).toThrow("cleanup failed");
    eventBus().off("shape.move.cleanup", failingCleanup);
    expect(dragEnds).toEqual([]);

    await reimport;
    expect(editor().exportText()).toBe(WITHOUT_CREDIT);
  });

  it("rejects when the modeler is destroyed before the drop's import ran", async () => {
    let reimport: Promise<unknown> | undefined;
    onFirstChange(() => {
      reimport = editor().importText(WITHOUT_CREDIT);
    });

    moveCredit();
    editor().destroy();

    await expect(reimport).rejects.toThrow("The modeler was destroyed.");
  });

  it("leaves the interaction surface reporting the drop once each way", async () => {
    const seen: boolean[] = [];
    editor().interaction.onChange((active) => seen.push(active));
    let reimport: Promise<unknown> | undefined;
    onFirstChange(() => {
      expect(editor().interaction.active()).toBe(true);
      reimport = editor().importText(WITHOUT_CREDIT);
    });

    moveCredit();
    await reimport;

    expect(seen).toEqual([true, false]);
    expect(editor().interaction.active()).toBe(false);
  });
});

describe("clear() from the change listener of a drop", () => {
  it("empties the diagram once the drop has ended, with a shape selected before the drag", async () => {
    editor().elements.reveal("step-order");
    onFirstChange(() => editor().diagram.clear());

    moveCredit();
    expectDropEndedCleanly();
    expect(pointer.shape("step-credit").x).toBe(300);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editor().diagram.exportDocument().elements).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("outside a drop empties the diagram at once", () => {
    editor().diagram.clear();
    expect(editor().diagram.exportDocument().elements).toEqual([]);
  });
});
