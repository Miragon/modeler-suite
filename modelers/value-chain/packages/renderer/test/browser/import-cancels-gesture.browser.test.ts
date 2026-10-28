import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
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

  it("a connect tool the palette armed, over a shape the import removes", async () => {
    const { entry, at } = paletteEntry("global-connect-tool");
    entry.dispatchEvent(pointer("click", at, { detail: 1 }));
    hover(graphics(shape("step-stock")), centreOf("step-stock"));
    expect(entry.classList.contains("highlighted-entry")).toBe(true);

    await importPeerEditMidGesture();

    expect(entry.classList.contains("highlighted-entry")).toBe(false);
    expectNothingApplied();
  });

  it("a text the import rejects leaves the gesture running, and its drop applies", async () => {
    const start = centreOf("step-credit");
    press(graphics(shape("step-credit")), start);
    moveTo({ x: start.x + 40, y: start.y });

    await expect(editor().importText('{ "schemaVersion": 99 }')).rejects.toThrow();
    expect(gestureRuns()).toBe(true);
    moveTo({ x: start.x + 60, y: start.y });
    release({ x: start.x + 60, y: start.y });

    expect(errors).toEqual([]);
    expect(changes).toBe(1);
    expect(shape("step-credit").x).toBe(300);
  });
});
