import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { parseDocumentJSON, serializeDocument } from "@miragon/value-chain-schema-model";
import {
  createCollaborativeModeler,
  isVcShape,
  type CollaborativeValueChainModeler,
  type VcModeling,
  type VcShape,
} from "../../src/index.js";
import "../../src/assets/value-chain.css";
import ORDER_TO_CASH from "./fixtures/order-to-cash.vc.json?raw";

interface Point {
  x: number;
  y: number;
}

/** A peer's edit of the document on the canvas: one element further right, in canonical form. */
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

const PEER_EDIT = withElementMoved(ORDER_TO_CASH, "step-invoice", 40);

let modeler: CollaborativeValueChainModeler | undefined;
let changes = 0;
let errors: unknown[] = [];

function recordError(event: ErrorEvent): void {
  errors.push(event.error);
}

beforeEach(async () => {
  modeler = createCollaborativeModeler({ fitOnImport: false });
  modeler.attachTo(attachedHost(1000, 700));
  await modeler.importText(ORDER_TO_CASH);
  changes = 0;
  errors = [];
  modeler.onContentChanged(() => (changes += 1));
  window.addEventListener("error", recordError);
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  modeler?.destroy();
  modeler = undefined;
});

function editor(): CollaborativeValueChainModeler {
  if (!modeler) throw new Error("no modeler mounted");
  return modeler;
}

function service<T>(name: string): T {
  return editor().diagram.get<T>(name);
}

function shape(id: string): VcShape {
  const found = service<ElementRegistry>("elementRegistry").get(id);
  if (!isVcShape(found)) throw new Error(`no shape ${id}`);
  return found;
}

function graphics(element: VcShape): SVGElement {
  return service<ElementRegistry>("elementRegistry").getGraphics(element);
}

function centreOf(id: string): Point {
  const { x, y, width, height } = shape(id);
  return { x: x + width / 2, y: y + height / 2 };
}

function client(point: Point): { clientX: number; clientY: number } {
  const canvas = service<Canvas>("canvas");
  const rect = canvas.getContainer().getBoundingClientRect();
  const viewbox = canvas.viewbox();
  return {
    clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
    clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
  };
}

function pointer(type: string, at: Point, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...client(at),
    ...init,
  });
}

function press(target: EventTarget, at: Point, init: MouseEventInit = {}): void {
  target.dispatchEvent(pointer("mousedown", at, init));
}

function moveTo(at: Point): void {
  document.dispatchEvent(pointer("mousemove", at));
}

/** What the browser fires when the pointer enters an element's graphics (diagram-js hover). */
function hover(target: EventTarget, at: Point): void {
  target.dispatchEvent(pointer("mouseover", at));
  moveTo(at);
}

function release(at: Point): void {
  document.dispatchEvent(pointer("mouseup", at));
}

function canvasSvg(): SVGSVGElement {
  const svg = editor().diagram.container.querySelector<SVGSVGElement>("svg");
  if (!svg) throw new Error("the canvas has no svg");
  return svg;
}

/** A palette entry and its centre in diagram coordinates, where a pointer clicks it. */
function paletteEntry(action: string): { entry: Element; at: Point } {
  const entry = editor().diagram.container.querySelector(`.djs-palette [data-action="${action}"]`);
  if (!entry) throw new Error(`no palette entry ${action}`);
  const box = entry.getBoundingClientRect();
  const canvas = service<Canvas>("canvas");
  const rect = canvas.getContainer().getBoundingClientRect();
  const viewbox = canvas.viewbox();
  const at = {
    x: viewbox.x + (box.left + box.width / 2 - rect.left) / viewbox.scale,
    y: viewbox.y + (box.top + box.height / 2 - rect.top) / viewbox.scale,
  };
  return { entry, at };
}

function gestureRuns(): boolean {
  return service<Dragging>("dragging").context() !== null;
}

/** The prefix of the running drag: an armed palette tool waits for its next press in one too. */
function dragPrefix(): string | undefined {
  const context = service<Dragging>("dragging").context() as { prefix: string } | null;
  return context?.prefix;
}

function connects(source: string, target: string): boolean {
  return parseDocumentJSON(editor().exportText()).connections.some(
    (connection) => connection.source === source && connection.target === target,
  );
}

/** The peer's text arrives while the gesture runs: the gesture ends there, as Escape ends it. */
async function importPeerEditMidGesture(): Promise<void> {
  expect(gestureRuns()).toBe(true);
  await editor().importText(PEER_EDIT);
  expect(gestureRuns()).toBe(false);
}

function expectNothingApplied(): void {
  expect(errors).toEqual([]);
  expect(changes).toBe(0);
  expect(editor().exportText()).toBe(PEER_EDIT);
}

/** The history is not stuck half-way through a failed command: the next edit is one change. */
function expectNextEditSaves(): void {
  service<VcModeling>("vcModeling").updateLabel(shape("step-credit"), "Credit limit");
  expect(changes).toBe(1);
}

describe("an import while a gesture runs cancels the gesture first", () => {
  it("moving a shape past the drag threshold", async () => {
    const start = centreOf("step-credit");
    press(graphics(shape("step-credit")), start);
    moveTo({ x: start.x + 20, y: start.y });
    moveTo({ x: start.x + 40, y: start.y });

    await importPeerEditMidGesture();
    moveTo({ x: start.x + 60, y: start.y });
    release({ x: start.x + 60, y: start.y });

    expectNothingApplied();
    expect(shape("step-credit").x).toBe(240);
    expectNextEditSaves();
  });

  it("moving a shape still inside the drag threshold", async () => {
    const start = centreOf("step-credit");
    press(graphics(shape("step-credit")), start);

    await importPeerEditMidGesture();
    moveTo({ x: start.x + 60, y: start.y });
    release({ x: start.x + 60, y: start.y });

    expectNothingApplied();
    expectNextEditSaves();
  });

  it("resizing a shape by its handle", async () => {
    service<Selection>("selection").select(shape("step-credit"));
    const handle = editor().diagram.container.querySelector(
      ".djs-resizer-step-credit.djs-resizer-se",
    );
    if (!handle) throw new Error("no resize handle");
    const corner = { x: 400, y: 140 };
    press(handle, corner);
    moveTo({ x: corner.x + 30, y: corner.y + 30 });

    await importPeerEditMidGesture();
    moveTo({ x: corner.x + 60, y: corner.y + 60 });
    release({ x: corner.x + 60, y: corner.y + 60 });

    expectNothingApplied();
    expect(shape("step-credit").width).toBe(160);
    expectNextEditSaves();
  });

  it("connecting from the context pad onto another shape", async () => {
    service<Selection>("selection").select(shape("step-stock"));
    const entry = editor().diagram.container.querySelector(
      '.djs-context-pad [data-action="connect.sequence"]',
    );
    if (!entry) throw new Error("no connect entry in the context pad");
    const start = centreOf("step-stock");
    entry.dispatchEvent(pointer("click", start, { detail: 1 }));
    const target = centreOf("step-delivery");
    moveTo({ x: start.x + 20, y: start.y });
    hover(graphics(shape("step-delivery")), target);

    await importPeerEditMidGesture();
    hover(graphics(shape("step-delivery")), target);
    release(target);

    expectNothingApplied();
    expectNextEditSaves();
  });

  it("dragging a lasso over shapes", async () => {
    const start = { x: 20, y: 60 };
    press(canvasSvg(), start, { shiftKey: true });
    moveTo({ x: 300, y: 160 });

    await importPeerEditMidGesture();
    moveTo({ x: 640, y: 160 });
    release({ x: 640, y: 160 });

    expectNothingApplied();
    expect(service<Selection>("selection").get()).toEqual([]);
  });

  describe("creating a shape", () => {
    const freeSpot = { x: 500, y: 450 };

    function dragPreview(): Element | null {
      return editor().diagram.container.querySelector(".djs-drag-group");
    }

    it("from the palette, with its preview on the canvas", async () => {
      const { entry, at } = paletteEntry("create.step");
      entry.dispatchEvent(pointer("click", at, { detail: 1 }));
      hover(canvasSvg(), freeSpot);
      expect(dragPreview()).not.toBeNull();

      await importPeerEditMidGesture();
      expect(dragPreview()).toBeNull();
      hover(canvasSvg(), freeSpot);
      release(freeSpot);

      expectNothingApplied();
      expectNextEditSaves();
    });

    it("from the palette, with its pointer still on the palette and the preview off the canvas", async () => {
      const { entry, at } = paletteEntry("create.step");
      entry.dispatchEvent(pointer("click", at, { detail: 1 }));
      moveTo({ x: at.x, y: at.y + 8 });
      expect(dragPreview()).toBeNull();

      await importPeerEditMidGesture();
      hover(canvasSvg(), freeSpot);
      release(freeSpot);

      expectNothingApplied();
      expectNextEditSaves();
    });

    it("dragged out of the context pad as an appended step", async () => {
      service<Selection>("selection").select(shape("step-delivery"));
      const entry = editor().diagram.container.querySelector(
        '.djs-context-pad [data-action="append.step"]',
      );
      if (!entry) throw new Error("no append entry in the context pad");
      entry.dispatchEvent(pointer("dragstart", centreOf("step-delivery")));
      hover(canvasSvg(), freeSpot);

      await importPeerEditMidGesture();
      hover(canvasSvg(), freeSpot);
      release(freeSpot);

      expectNothingApplied();
      expectNextEditSaves();
    });
  });

  it("making space with the palette's space tool", async () => {
    const { entry, at } = paletteEntry("space-tool");
    entry.dispatchEvent(pointer("click", at, { detail: 1 }));
    const start = { x: 410, y: 40 };
    hover(canvasSvg(), start);
    press(canvasSvg(), start);
    moveTo({ x: start.x + 30, y: start.y });
    moveTo({ x: start.x + 60, y: start.y });

    await importPeerEditMidGesture();
    moveTo({ x: start.x + 90, y: start.y });
    release({ x: start.x + 90, y: start.y });

    expectNothingApplied();
    expectNextEditSaves();
  });

  it("a press of the armed connect tool on a shape, before the pointer leaves that shape", async () => {
    const { entry, at } = paletteEntry("global-connect-tool");
    entry.dispatchEvent(pointer("click", at, { detail: 1 }));
    const start = centreOf("step-stock");
    hover(graphics(shape("step-stock")), start);
    press(graphics(shape("step-stock")), start);
    // The tool's own drag ended on the press; its connect starts once the pointer leaves the shape.
    expect(gestureRuns()).toBe(false);

    await editor().importText(PEER_EDIT);
    graphics(shape("step-stock")).dispatchEvent(pointer("mouseout", start));
    const target = centreOf("step-delivery");
    hover(graphics(shape("step-delivery")), target);
    release(target);

    expect(gestureRuns()).toBe(false);
    expect(entry.classList.contains("highlighted-entry")).toBe(false);
    expectNothingApplied();
    expectNextEditSaves();
    entry.dispatchEvent(pointer("click", at, { detail: 1 }));
    expect(dragPrefix()).toBe("global-connect");
    expect(entry.classList.contains("highlighted-entry")).toBe(true);
  });

  it("a lasso that the armed lasso tool started", async () => {
    const { entry, at } = paletteEntry("lasso-tool");
    entry.dispatchEvent(pointer("click", at, { detail: 1 }));
    const start = { x: 20, y: 60 };
    hover(canvasSvg(), start);
    press(canvasSvg(), start);
    moveTo({ x: 300, y: 160 });
    expect(dragPrefix()).toBe("lasso");

    await importPeerEditMidGesture();
    moveTo({ x: 640, y: 160 });
    release({ x: 640, y: 160 });

    expectNothingApplied();
    expect(entry.classList.contains("highlighted-entry")).toBe(false);
    expect(service<Selection>("selection").get()).toEqual([]);
  });

  it("a connect that the armed connect tool started, once the pointer left its shape", async () => {
    const { entry, at } = paletteEntry("global-connect-tool");
    entry.dispatchEvent(pointer("click", at, { detail: 1 }));
    const start = centreOf("step-stock");
    hover(graphics(shape("step-stock")), start);
    press(graphics(shape("step-stock")), start);
    graphics(shape("step-stock")).dispatchEvent(pointer("mouseout", start));
    const target = centreOf("step-delivery");
    hover(graphics(shape("step-delivery")), target);
    expect(dragPrefix()).toBe("connect");

    await importPeerEditMidGesture();
    hover(graphics(shape("step-delivery")), target);
    release(target);

    expectNothingApplied();
    expect(entry.classList.contains("highlighted-entry")).toBe(false);
    expectNextEditSaves();
  });

  describe("a palette tool that only waits for its next press stays armed", () => {
    const freeSpot = { x: 500, y: 450 };

    function arm(action: string): Element {
      const { entry, at } = paletteEntry(action);
      entry.dispatchEvent(pointer("click", at, { detail: 1 }));
      return entry;
    }

    async function importWhileArmed(entry: Element, prefix: string): Promise<void> {
      expect(dragPrefix()).toBe(prefix);
      await editor().importText(PEER_EDIT);
      expect(dragPrefix()).toBe(prefix);
      expect(entry.classList.contains("highlighted-entry")).toBe(true);
      expectNothingApplied();
    }

    it.each([
      ["lasso-tool", "lasso.selection"],
      ["hand-tool", "hand"],
      ["space-tool", "spaceTool.selection"],
      ["global-connect-tool", "global-connect"],
    ])("the %s, also before the pointer moved", async (action, prefix) => {
      await importWhileArmed(arm(action), prefix);
    });

    it("the lasso tool, which then selects the shapes the import drew", async () => {
      const entry = arm("lasso-tool");
      hover(canvasSvg(), freeSpot);
      await importWhileArmed(entry, "lasso.selection");

      press(canvasSvg(), { x: 20, y: 60 });
      moveTo({ x: 300, y: 160 });
      moveTo({ x: 410, y: 160 });
      release({ x: 410, y: 160 });

      const selected = service<Selection>("selection").get();
      expect(selected).toContain(shape("step-order"));
      expect(selected).toContain(shape("step-credit"));
      expect(selected).not.toContain(shape("step-delivery"));
      expect(errors).toEqual([]);
      expect(changes).toBe(0);
    });

    it("the hand tool, which then pans the view", async () => {
      const entry = arm("hand-tool");
      hover(canvasSvg(), freeSpot);
      await importWhileArmed(entry, "hand");
      const before = service<Canvas>("canvas").viewbox().x;

      press(canvasSvg(), freeSpot);
      moveTo({ x: freeSpot.x + 50, y: freeSpot.y });
      moveTo({ x: freeSpot.x + 100, y: freeSpot.y });
      release({ x: freeSpot.x + 100, y: freeSpot.y });

      expect(service<Canvas>("canvas").viewbox().x).toBeLessThan(before);
      expect(errors).toEqual([]);
      expect(changes).toBe(0);
    });

    it("the space tool, which then makes space among the shapes the import drew", async () => {
      const entry = arm("space-tool");
      hover(canvasSvg(), freeSpot);
      await importWhileArmed(entry, "spaceTool.selection");

      const start = { x: 410, y: 40 };
      press(canvasSvg(), start);
      moveTo({ x: start.x + 30, y: start.y });
      moveTo({ x: start.x + 60, y: start.y });
      release({ x: start.x + 60, y: start.y });

      const moved = shape("step-delivery").x - 420;
      expect(moved).toBeGreaterThan(0);
      expect(shape("step-invoice").x).toBe(640 + moved);
      expect(shape("step-credit").x).toBe(240);
      expect(errors).toEqual([]);
      expect(changes).toBe(1);
    });

    it("the connect tool, resting on a shape the import replaces, which then connects the shapes the import drew", async () => {
      const entry = arm("global-connect-tool");
      const start = centreOf("step-stock");
      hover(graphics(shape("step-stock")), start);
      await importWhileArmed(entry, "global-connect");

      hover(graphics(shape("step-stock")), start);
      press(graphics(shape("step-stock")), start);
      graphics(shape("step-stock")).dispatchEvent(pointer("mouseout", start));
      const target = centreOf("step-delivery");
      hover(graphics(shape("step-delivery")), target);
      release(target);

      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(connects("step-stock", "step-delivery")).toBe(true);
      expect(entry.classList.contains("highlighted-entry")).toBe(false);
    });

    it("the connect tool, pressed before the pointer entered the shape the import drew under it, connects nothing", async () => {
      const entry = arm("global-connect-tool");
      const start = centreOf("step-stock");
      hover(graphics(shape("step-stock")), start);
      await importWhileArmed(entry, "global-connect");

      press(graphics(shape("step-stock")), start);
      graphics(shape("step-stock")).dispatchEvent(pointer("mouseout", start));
      const target = centreOf("step-delivery");
      hover(graphics(shape("step-delivery")), target);
      release(target);

      expect(gestureRuns()).toBe(false);
      expect(entry.classList.contains("highlighted-entry")).toBe(false);
      expectNothingApplied();
      expectNextEditSaves();
    });
  });

  describe("a host that imports from its change listener, while the drop applies", () => {
    function importOnFirstChange(): void {
      const unsubscribe = editor().onContentChanged(() => {
        unsubscribe();
        void editor().importText(PEER_EDIT);
      });
    }

    function expectImportReplacedTheDrop(): void {
      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(gestureRuns()).toBe(false);
      expect(editor().exportText()).toBe(PEER_EDIT);
      service<VcModeling>("vcModeling").updateLabel(shape("step-credit"), "Credit limit");
      expect(changes).toBe(2);
    }

    it("of a move", async () => {
      importOnFirstChange();
      const start = centreOf("step-credit");
      press(graphics(shape("step-credit")), start);
      moveTo({ x: start.x + 40, y: start.y });
      release({ x: start.x + 40, y: start.y });

      expectImportReplacedTheDrop();
    });

    it("of a create from the palette", async () => {
      importOnFirstChange();
      const { entry, at } = paletteEntry("create.step");
      entry.dispatchEvent(pointer("click", at, { detail: 1 }));
      const freeSpot = { x: 500, y: 450 };
      hover(canvasSvg(), freeSpot);
      release(freeSpot);

      expectImportReplacedTheDrop();
    });

    it("of a connect from the context pad", async () => {
      importOnFirstChange();
      service<Selection>("selection").select(shape("step-stock"));
      const entry = editor().diagram.container.querySelector(
        '.djs-context-pad [data-action="connect.sequence"]',
      );
      if (!entry) throw new Error("no connect entry in the context pad");
      const start = centreOf("step-stock");
      entry.dispatchEvent(pointer("click", start, { detail: 1 }));
      const target = centreOf("step-delivery");
      moveTo({ x: start.x + 20, y: start.y });
      hover(graphics(shape("step-delivery")), target);
      release(target);

      expectImportReplacedTheDrop();
    });
  });

  it("a text or a document the import rejects leaves the gesture running, and its drop applies", async () => {
    const start = centreOf("step-credit");
    press(graphics(shape("step-credit")), start);
    moveTo({ x: start.x + 40, y: start.y });

    await expect(editor().importText('{ "schemaVersion": 99 }')).rejects.toThrow();
    const current = parseDocumentJSON(ORDER_TO_CASH);
    const duplicateIds = { ...current, elements: [...current.elements, ...current.elements] };
    expect(() => editor().diagram.importDocument(duplicateIds)).toThrow();
    expect(gestureRuns()).toBe(true);
    moveTo({ x: start.x + 60, y: start.y });
    release({ x: start.x + 60, y: start.y });

    expect(errors).toEqual([]);
    expect(changes).toBe(1);
    expect(shape("step-credit").x).toBe(300);
  });

  it("a drop that ended in a failing cleanup listener does not keep a later import from ending a gesture", async () => {
    const eventBus = service<EventBus>("eventBus");
    const failingCleanup = (): never => {
      throw new Error("cleanup failed");
    };
    eventBus.on("shape.move.cleanup", failingCleanup);
    const start = centreOf("step-credit");
    press(graphics(shape("step-credit")), start);
    moveTo({ x: start.x + 40, y: start.y });
    expect(() =>
      service<Dragging>("dragging").end(pointer("mouseup", { x: start.x + 40, y: start.y })),
    ).toThrow("cleanup failed");
    eventBus.off("shape.move.cleanup", failingCleanup);
    errors = [];
    changes = 0;

    press(graphics(shape("step-credit")), start);
    moveTo({ x: start.x + 40, y: start.y });
    await importPeerEditMidGesture();
    release({ x: start.x + 40, y: start.y });

    expectNothingApplied();
    expectNextEditSaves();
  });

  it("clearing the diagram ends the gesture as well, and the release changes nothing", () => {
    const start = centreOf("step-credit");
    press(graphics(shape("step-credit")), start);
    moveTo({ x: start.x + 20, y: start.y });
    moveTo({ x: start.x + 40, y: start.y });
    expect(gestureRuns()).toBe(true);

    editor().diagram.clear();
    changes = 0;
    expect(gestureRuns()).toBe(false);
    moveTo({ x: start.x + 60, y: start.y });
    release({ x: start.x + 60, y: start.y });

    expect(errors).toEqual([]);
    expect(changes).toBe(0);
    expect(editor().diagram.exportDocument().elements).toEqual([]);
  });

  it("clearing the diagram leaves an armed palette tool armed", () => {
    const { entry, at } = paletteEntry("lasso-tool");
    entry.dispatchEvent(pointer("click", at, { detail: 1 }));

    editor().diagram.clear();

    expect(dragPrefix()).toBe("lasso.selection");
    expect(entry.classList.contains("highlighted-entry")).toBe(true);
  });
});

describe("a pan is no gesture: an import leaves it running", () => {
  interface ClientPoint {
    clientX: number;
    clientY: number;
  }

  const START = { x: 500, y: 450 };

  function panTo(point: ClientPoint): void {
    document.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, cancelable: true, ...point }),
    );
  }

  function viewboxX(): number {
    return service<Canvas>("canvas").viewbox().x;
  }

  function offset(point: ClientPoint, dx: number): ClientPoint {
    return { clientX: point.clientX + dx, clientY: point.clientY };
  }

  function armHandTool(): Element {
    const { entry, at } = paletteEntry("hand-tool");
    entry.dispatchEvent(pointer("click", at, { detail: 1 }));
    return entry;
  }

  function pressForPan(start: ClientPoint, init: MouseEventInit = {}): void {
    canvasSvg().dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...start,
        ...init,
      }),
    );
  }

  function pressWithPrimaryModifier(start: ClientPoint): void {
    pressForPan(start, { ctrlKey: true, metaKey: true });
  }

  function pointerOnCanvas(start: ClientPoint): void {
    canvasSvg().dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, cancelable: true, ...start }),
    );
    canvasSvg().dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, cancelable: true, ...start }),
    );
  }

  function releaseAt(point: ClientPoint): void {
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, ...point }),
    );
  }

  function spaceKey(type: "keydown" | "keyup"): void {
    canvasSvg().dispatchEvent(
      new KeyboardEvent(type, { key: " ", code: "Space", bubbles: true, cancelable: true }),
    );
  }

  /** What the running pan brings back to the selection when it ends. */
  function selectionTheRunningPanHolds(): string[] {
    const pan = service<Dragging>("dragging").context() as {
      payload: { previousSelection?: Array<{ id: string }> };
    } | null;
    return pan?.payload.previousSelection?.map((element) => element.id) ?? [];
  }

  function selectedIds(): string[] {
    return service<Selection>("selection")
      .get()
      .map((element) => element.id);
  }

  it("a pan with the palette's hand tool continues, and the tool pans again after it", async () => {
    armHandTool();
    const start = client(START);
    pointerOnCanvas(start);
    pressForPan(start);
    panTo(offset(start, 30));
    panTo(offset(start, 60));
    expect(dragPrefix()).toBe("hand.move");

    await editor().importText(PEER_EDIT);
    expect(dragPrefix()).toBe("hand.move");
    const beforeFirstPan = viewboxX();
    panTo(offset(start, 90));
    expect(viewboxX()).toBeLessThan(beforeFirstPan);
    releaseAt(offset(start, 90));
    expect(dragPrefix()).toBe("hand");

    const beforeSecondPan = viewboxX();
    pressForPan(start);
    panTo(offset(start, 30));
    panTo(offset(start, 60));
    expect(dragPrefix()).toBe("hand.move");
    expect(viewboxX()).toBeLessThan(beforeSecondPan);
    releaseAt(offset(start, 60));
    expectNothingApplied();
  });

  it("a pan with Space held continues, and ends with the key", async () => {
    canvasSvg().focus();
    const start = client(START);
    pointerOnCanvas(start);
    spaceKey("keydown");
    panTo(offset(start, 30));
    panTo(offset(start, 60));
    expect(dragPrefix()).toBe("hand.move");

    await editor().importText(PEER_EDIT);
    expect(dragPrefix()).toBe("hand.move");
    const before = viewboxX();
    panTo(offset(start, 90));
    expect(viewboxX()).toBeLessThan(before);
    spaceKey("keyup");

    expect(gestureRuns()).toBe(false);
    expectNothingApplied();
  });

  it("a pan with Ctrl or Cmd and a press continues, and ends with the release", async () => {
    const start = client(START);
    pointerOnCanvas(start);
    pressWithPrimaryModifier(start);
    panTo(offset(start, 30));
    panTo(offset(start, 60));
    expect(dragPrefix()).toBe("hand.move");

    await editor().importText(PEER_EDIT);
    expect(dragPrefix()).toBe("hand.move");
    const before = viewboxX();
    panTo(offset(start, 90));
    expect(viewboxX()).toBeLessThan(before);
    releaseAt(offset(start, 90));

    expect(gestureRuns()).toBe(false);
    expectNothingApplied();
  });

  describe("a pan that holds the selection from before it started", () => {
    beforeEach(() => {
      service<Selection>("selection").select(shape("step-credit"));
    });

    it("with Space held brings back no selection of the shapes the import replaced", async () => {
      canvasSvg().focus();
      const start = client(START);
      pointerOnCanvas(start);
      spaceKey("keydown");
      panTo(offset(start, 30));
      panTo(offset(start, 60));
      expect(selectionTheRunningPanHolds()).toEqual(["step-credit"]);
      expect(selectedIds()).toEqual([]);

      await editor().importText(PEER_EDIT);
      spaceKey("keyup");

      expect(gestureRuns()).toBe(false);
      expect(selectedIds()).toEqual([]);
      expectNothingApplied();
    });

    it("with Ctrl or Cmd and a press brings back no selection of the shapes the import replaced", async () => {
      const start = client(START);
      pointerOnCanvas(start);
      pressWithPrimaryModifier(start);
      panTo(offset(start, 30));
      panTo(offset(start, 60));
      expect(selectionTheRunningPanHolds()).toEqual(["step-credit"]);
      expect(selectedIds()).toEqual([]);

      await editor().importText(PEER_EDIT);
      releaseAt(offset(start, 60));

      expect(gestureRuns()).toBe(false);
      expect(selectedIds()).toEqual([]);
      expectNothingApplied();
    });
  });

  it("clearing the diagram leaves it running as well", () => {
    armHandTool();
    const start = client(START);
    pointerOnCanvas(start);
    pressForPan(start);
    panTo(offset(start, 30));
    panTo(offset(start, 60));

    editor().diagram.clear();
    expect(dragPrefix()).toBe("hand.move");
    const before = viewboxX();
    panTo(offset(start, 90));
    expect(viewboxX()).toBeLessThan(before);
    releaseAt(offset(start, 90));

    expect(dragPrefix()).toBe("hand");
  });

  it("a move drag next to a pan is still cancelled", async () => {
    const start = centreOf("step-credit");
    press(graphics(shape("step-credit")), start);
    moveTo({ x: start.x + 20, y: start.y });
    moveTo({ x: start.x + 40, y: start.y });
    expect(dragPrefix()).toBe("shape.move");

    await importPeerEditMidGesture();
    release({ x: start.x + 60, y: start.y });

    expectNothingApplied();
    expect(shape("step-credit").x).toBe(240);
  });

  describe("an import that fits the view", () => {
    beforeEach(async () => {
      modeler?.destroy();
      modeler = createCollaborativeModeler();
      modeler.attachTo(attachedHost(1000, 700));
      await modeler.importText(ORDER_TO_CASH);
      modeler.onContentChanged(() => (changes += 1));
      service<Canvas>("canvas").scroll({ dx: -200, dy: 0 });
    });

    it("moves a running pan on from the fitted view, not back to the view before the import", async () => {
      armHandTool();
      const start = client(START);
      pointerOnCanvas(start);
      pressForPan(start);
      panTo(offset(start, 30));
      panTo(offset(start, 60));
      expect(dragPrefix()).toBe("hand.move");
      const viewBeforeImport = viewboxX();

      await editor().importText(PEER_EDIT);
      const fittedView = viewboxX();
      expect(Math.abs(fittedView - viewBeforeImport)).toBeGreaterThan(50);
      expect(dragPrefix()).toBe("hand.move");

      panTo(offset(start, 61));
      expect(viewboxX()).toBeCloseTo(fittedView - 1, 0);
      panTo(offset(start, 91));
      expect(viewboxX()).toBeCloseTo(fittedView - 31, 0);
      releaseAt(offset(start, 91));
      expect(dragPrefix()).toBe("hand");
    });

    it("moves a pan that has not left its press yet on from the fitted view", async () => {
      armHandTool();
      const start = client(START);
      pointerOnCanvas(start);
      pressForPan(start);
      expect(dragPrefix()).toBe("hand.move");
      const viewBeforeImport = viewboxX();

      await editor().importText(PEER_EDIT);
      const fittedView = viewboxX();
      expect(Math.abs(fittedView - viewBeforeImport)).toBeGreaterThan(50);
      expect(dragPrefix()).toBe("hand.move");

      panTo(offset(start, 60));
      expect(viewboxX()).toBeCloseTo(fittedView - 60, 0);
      releaseAt(offset(start, 60));
      expect(dragPrefix()).toBe("hand");
    });
  });
});
