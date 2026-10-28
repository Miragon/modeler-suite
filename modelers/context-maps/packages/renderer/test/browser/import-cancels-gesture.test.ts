import { afterEach, describe, expect, test } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement, Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  type CollaborativeContextMapsModeler,
} from "@miragon/context-maps-renderer";
import {
  emptyDocument,
  parseDocumentText,
  serializeDocumentText,
} from "@miragon/context-maps-schema-model";
import type { CmDocument } from "@miragon/context-maps-schema-model";

const CONTEXT_SIZE = { width: 200, height: 110 };

function contextMapWithA(position: { x: number; y: number }): string {
  const contextMap = emptyDocument("Gestures");
  contextMap.contexts = [
    { id: "a", label: "A", position, size: CONTEXT_SIZE },
    { id: "b", label: "B", position: { x: 450, y: 100 }, size: CONTEXT_SIZE },
    { id: "c", label: "C", position: { x: 450, y: 380 }, size: CONTEXT_SIZE },
  ];
  contextMap.relationships = [{ id: "r", from: "a", to: "b", pattern: "upstream-downstream" }];
  return serializeDocumentText(contextMap);
}

const BEFORE = contextMapWithA({ x: 100, y: 100 });
/** What a peer sent while the user's gesture runs: context A moved, the rest as before. */
const AFTER = contextMapWithA({ x: 100, y: 380 });

/** Free canvas between B and C, in diagram coordinates. */
const FREE_SPOT = { x: 550, y: 295 };

const GESTURE_PREVIEW = ".djs-drag-group, .djs-dragger, .djs-lasso-overlay";

interface ClientPoint {
  clientX: number;
  clientY: number;
}

interface Stage {
  modeler: CollaborativeContextMapsModeler;
  changes(): number;
  errors: unknown[];
}

const teardowns: Array<() => void> = [];

afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
});

async function stage(): Promise<Stage> {
  const host = attachedHost(900, 640);
  const modeler = createCollaborativeModeler();
  modeler.attachTo(host);
  await modeler.importText(BEFORE);
  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  const errors: unknown[] = [];
  const collectError = (event: ErrorEvent) => errors.push(event.error ?? event.message);
  window.addEventListener("error", collectError);
  teardowns.push(() => {
    window.removeEventListener("error", collectError);
    modeler.destroy();
    host.parentElement?.remove();
  });
  return { modeler, changes: () => changes, errors };
}

function service<T>(stage: Stage, name: string): T {
  return stage.modeler.diagram.get<T>(name);
}

function container(stage: Stage): HTMLElement {
  return service<Canvas>(stage, "canvas").getContainer();
}

function svg(stage: Stage): SVGSVGElement {
  return container(stage).querySelector("svg")!;
}

function shape(stage: Stage, id: string): Shape {
  return service<ElementRegistry>(stage, "elementRegistry").get(id) as Shape;
}

function clientPoint(stage: Stage, point: { x: number; y: number }): ClientPoint {
  const canvas = service<Canvas>(stage, "canvas");
  const viewbox = canvas.viewbox();
  const box = canvas.getContainer().getBoundingClientRect();
  return {
    clientX: box.left + (point.x - viewbox.x) * viewbox.scale,
    clientY: box.top + (point.y - viewbox.y) * viewbox.scale,
  };
}

function centreOfShape(stage: Stage, id: string): ClientPoint {
  const { x, y, width, height } = shape(stage, id);
  return clientPoint(stage, { x: x + width / 2, y: y + height / 2 });
}

function centreOfBox(element: Element): ClientPoint {
  const box = element.getBoundingClientRect();
  return { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
}

function shifted(point: ClientPoint, right: number, down: number): ClientPoint {
  return { clientX: point.clientX + right, clientY: point.clientY + down };
}

function pointer(
  target: EventTarget,
  type: string,
  at: ClientPoint,
  init: MouseEventInit = {},
): void {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...at, ...init }),
  );
}

function dragStart(target: Element, at: ClientPoint): void {
  target.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, ...at }));
}

function hitArea(stage: Stage, id: string): SVGElement {
  const graphics = service<ElementRegistry>(stage, "elementRegistry").getGraphics(id);
  return graphics.querySelector<SVGElement>(".djs-hit") ?? graphics;
}

function contextPadEntry(stage: Stage, contextId: string, action: string): HTMLElement {
  service<Selection>(stage, "selection").select(shape(stage, contextId) as DiagramElement);
  const entry = container(stage).querySelector<HTMLElement>(
    `.djs-context-pad.open [data-action="${action}"]`,
  );
  if (!entry) throw new Error(`the context pad of ${contextId} has no "${action}" entry`);
  return entry;
}

function paletteEntry(stage: Stage, action: string): HTMLElement {
  const entry = container(stage).querySelector<HTMLElement>(
    `.djs-palette [data-action="${action}"]`,
  );
  if (!entry) throw new Error(`the palette has no "${action}" entry`);
  return entry;
}

/** The pointer moves onto the canvas: diagram-js learns the drop target from the hover. */
function hoverCanvasAt(stage: Stage, at: ClientPoint): void {
  pointer(document, "mousemove", at);
  pointer(svg(stage), "mouseover", at);
  pointer(document, "mousemove", at);
}

function exported(stage: Stage): CmDocument {
  const parsed = parseDocumentText(stage.modeler.exportText());
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.document;
}

function selectedIds(stage: Stage): string[] {
  return (service<Selection>(stage, "selection").get() as DiagramElement[])
    .map((element) => element.id)
    .sort();
}

interface Gesture {
  name: string;
  previewOnCanvas: boolean;
  /** Starts the gesture on BEFORE and takes it past the drag threshold; returns the pointer. */
  begin(stage: Stage): ClientPoint;
  /** Moves the pointer on from where it is and releases it. */
  release(stage: Stage, pointerAt: ClientPoint): void;
  /** What the gesture does when no import comes in between. */
  expectApplied(stage: Stage): void;
}

const MOVE: Gesture = {
  name: "a move of context B",
  previewOnCanvas: true,
  begin(stage) {
    const start = centreOfShape(stage, "b");
    pointer(hitArea(stage, "b"), "mousedown", start);
    pointer(document, "mousemove", shifted(start, 20, 10));
    hoverCanvasAt(stage, shifted(start, 40, 20));
    return shifted(start, 40, 20);
  },
  release(_stage, pointerAt) {
    pointer(document, "mousemove", shifted(pointerAt, 20, 0));
    pointer(document, "mouseup", shifted(pointerAt, 20, 0));
  },
  expectApplied(stage) {
    expect(stage.changes()).toBe(1);
    const b = exported(stage).contexts.find((context) => context.id === "b");
    expect(b?.position.x).toBeGreaterThan(450);
  },
};

const GESTURES: Gesture[] = [
  MOVE,
  {
    name: "a connect dragged from the context pad of B to C",
    previewOnCanvas: true,
    begin(stage) {
      const entry = contextPadEntry(stage, "b", "connect");
      const start = centreOfBox(entry);
      dragStart(entry, start);
      const target = centreOfShape(stage, "c");
      pointer(document, "mousemove", shifted(start, 0, 20));
      pointer(hitArea(stage, "c"), "mouseover", target);
      pointer(document, "mousemove", target);
      return target;
    },
    release(_stage, pointerAt) {
      pointer(document, "mouseup", pointerAt);
    },
    expectApplied(stage) {
      expect(stage.changes()).toBe(1);
      const added = exported(stage).relationships.filter((relationship) => relationship.id !== "r");
      expect(added).toMatchObject([{ from: "b", to: "c" }]);
    },
  },
  {
    name: "a lasso drag around B and C",
    previewOnCanvas: true,
    begin(stage) {
      const start = clientPoint(stage, { x: 420, y: 70 });
      pointer(svg(stage), "mousedown", start, { shiftKey: true });
      pointer(document, "mousemove", shifted(start, 20, 20));
      const end = clientPoint(stage, { x: 690, y: 520 });
      pointer(document, "mousemove", end);
      return end;
    },
    release(_stage, pointerAt) {
      pointer(document, "mousemove", shifted(pointerAt, 5, 5));
      pointer(document, "mouseup", shifted(pointerAt, 5, 5));
    },
    expectApplied(stage) {
      expect(stage.changes()).toBe(0);
      expect(selectedIds(stage)).toEqual(["b", "c"]);
    },
  },
  {
    name: "a create dragged from the palette onto the canvas",
    previewOnCanvas: true,
    begin(stage) {
      const entry = paletteEntry(stage, "context.core");
      const start = centreOfBox(entry);
      dragStart(entry, start);
      const onCanvas = clientPoint(stage, FREE_SPOT);
      hoverCanvasAt(stage, onCanvas);
      return onCanvas;
    },
    release(_stage, pointerAt) {
      pointer(document, "mousemove", shifted(pointerAt, 10, 0));
      pointer(document, "mouseup", shifted(pointerAt, 10, 0));
    },
    expectApplied(stage) {
      expect(stage.changes()).toBe(1);
      expect(exported(stage).contexts).toHaveLength(4);
    },
  },
  {
    name: "a create clicked in the palette, its preview still off the canvas",
    previewOnCanvas: false,
    begin(stage) {
      const entry = paletteEntry(stage, "context.supporting");
      const start = centreOfBox(entry);
      pointer(entry, "click", start, { detail: 1 });
      pointer(document, "mousemove", shifted(start, 3, 2));
      return shifted(start, 3, 2);
    },
    release(stage) {
      const drop = clientPoint(stage, FREE_SPOT);
      hoverCanvasAt(stage, drop);
      pointer(svg(stage), "mousedown", drop);
      pointer(document, "mouseup", drop);
    },
    expectApplied(stage) {
      expect(stage.changes()).toBe(1);
      expect(exported(stage).contexts).toHaveLength(4);
    },
  },
  {
    name: "an append dragged from the context pad of B",
    previewOnCanvas: true,
    begin(stage) {
      const entry = contextPadEntry(stage, "b", "append-context");
      const start = centreOfBox(entry);
      dragStart(entry, start);
      const onCanvas = clientPoint(stage, FREE_SPOT);
      hoverCanvasAt(stage, onCanvas);
      return onCanvas;
    },
    release(_stage, pointerAt) {
      pointer(document, "mousemove", shifted(pointerAt, 10, 0));
      pointer(document, "mouseup", shifted(pointerAt, 10, 0));
    },
    expectApplied(stage) {
      expect(stage.changes()).toBe(1);
      expect(exported(stage).contexts).toHaveLength(4);
      expect(exported(stage).relationships).toHaveLength(2);
    },
  },
];

function dragging(stage: Stage): Dragging {
  return service<Dragging>(stage, "dragging");
}

describe.each(GESTURES)("$name", (gesture) => {
  test("applies when no import comes in between", async () => {
    const running = await stage();
    gesture.release(running, gesture.begin(running));
    expect(running.errors).toEqual([]);
    gesture.expectApplied(running);
  });

  test("is cancelled by an import that arrives while it runs, as Escape cancels it", async () => {
    const running = await stage();
    const pointerAt = gesture.begin(running);
    expect(dragging(running).context()?.active).toBe(true);
    expect(container(running).querySelector(GESTURE_PREVIEW) !== null).toBe(
      gesture.previewOnCanvas,
    );

    await running.modeler.importText(AFTER);
    expect(dragging(running).context()).toBeFalsy();
    expect(container(running).querySelector(GESTURE_PREVIEW)).toBeNull();
    gesture.release(running, pointerAt);

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(0);
    expect(running.modeler.exportText()).toBe(AFTER);
    expect(selectedIds(running)).toEqual([]);
    expect(container(running).classList.contains("cm-dragging")).toBe(false);

    service<Modeling>(running, "modeling").moveElements([shape(running, "c")], { x: 30, y: 0 });
    expect(running.changes()).toBe(1);
  });
});

test("an import the renderer rejects leaves the running gesture alone", async () => {
  const running = await stage();
  const pointerAt = MOVE.begin(running);

  await expect(running.modeler.importText("{ no context map")).rejects.toThrow();
  MOVE.release(running, pointerAt);

  expect(running.errors).toEqual([]);
  MOVE.expectApplied(running);
});
