import { afterEach, describe, expect, test } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement, Shape } from "diagram-js/lib/model/Types";
import type { ModuleDeclaration } from "didi";
import {
  cmConnectHandlesModule,
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

/** BEFORE without context B and its relationship: a peer deleted it. */
const BEFORE_WITHOUT_B = (() => {
  const parsed = parseDocumentText(BEFORE);
  if (!parsed.ok) throw new Error(parsed.error);
  return serializeDocumentText({
    ...parsed.document,
    contexts: parsed.document.contexts.filter((context) => context.id !== "b"),
    relationships: [],
  });
})();

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
  /** Every value `interaction.onChange` delivered, with what `active()` said inside the listener. */
  interactions: Array<{ delivered: boolean; activeInside: boolean }>;
}

const teardowns: Array<() => void> = [];

afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
});

async function stage(additionalModules: ModuleDeclaration[] = []): Promise<Stage> {
  const host = attachedHost(900, 640);
  const modeler = createCollaborativeModeler({ additionalModules });
  modeler.attachTo(host);
  await modeler.importText(BEFORE);
  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  const interactions: Stage["interactions"] = [];
  modeler.interaction.onChange((delivered) =>
    interactions.push({ delivered, activeInside: modeler.interaction.active() }),
  );
  const errors: unknown[] = [];
  const collectError = (event: ErrorEvent) => errors.push(event.error ?? event.message);
  window.addEventListener("error", collectError);
  teardowns.push(() => {
    window.removeEventListener("error", collectError);
    modeler.destroy();
    host.parentElement?.remove();
  });
  return { modeler, changes: () => changes, errors, interactions };
}

function delivered(stage: Stage): boolean[] {
  for (const { delivered, activeInside } of stage.interactions) {
    expect(activeInside).toBe(delivered);
  }
  return stage.interactions.map((interaction) => interaction.delivered);
}

/** Lets the tasks run that the canvas deferred (the pad's position, the type menu). */
async function nextTasks(count = 3): Promise<void> {
  for (let task = 0; task < count; task += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
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
  /** Opt-in modules the gesture needs besides the default modeler's. */
  modules?: ModuleDeclaration[];
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

/** The box of the lasso: around B and C, before and after the import, never around A. */
const LASSO_FROM = { x: 420, y: 70 };
const LASSO_TO = { x: 690, y: 520 };

const LASSO: Gesture = {
  name: "a lasso drag around B and C",
  previewOnCanvas: true,
  begin(stage) {
    const start = clientPoint(stage, LASSO_FROM);
    pointer(svg(stage), "mousedown", start, { shiftKey: true });
    pointer(document, "mousemove", shifted(start, 20, 20));
    const end = clientPoint(stage, LASSO_TO);
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
    name: "a connect dragged from the bottom connect handle of B to C",
    previewOnCanvas: true,
    modules: [cmConnectHandlesModule],
    begin(stage) {
      service<Selection>(stage, "selection").select(shape(stage, "b") as DiagramElement);
      const handle = container(stage).querySelector<HTMLElement>(
        '.cm-connect-handle[data-side="bottom"]',
      );
      if (!handle) throw new Error("B shows no bottom connect handle");
      const start = centreOfBox(handle);
      pointer(handle, "mousedown", start);
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
  LASSO,
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
    const running = await stage(gesture.modules);
    gesture.release(running, gesture.begin(running));
    expect(running.errors).toEqual([]);
    gesture.expectApplied(running);
  });

  test("is an interaction from its start until its drop", async () => {
    const running = await stage(gesture.modules);
    expect(running.modeler.interaction.active()).toBe(false);

    const pointerAt = gesture.begin(running);
    expect(running.modeler.interaction.active()).toBe(true);
    expect(delivered(running)).toEqual([true]);

    gesture.release(running, pointerAt);
    expect(running.modeler.interaction.active()).toBe(false);
    expect(delivered(running)).toEqual([true, false]);
    expect(running.errors).toEqual([]);
  });

  test("is an interaction until Escape cancels it", async () => {
    const running = await stage(gesture.modules);
    gesture.begin(running);
    expect(running.modeler.interaction.active()).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
    expect(running.modeler.interaction.active()).toBe(false);
    expect(delivered(running)).toEqual([true, false]);
    expect(running.changes()).toBe(0);
  });

  test("is cancelled by an import that arrives while it runs, as Escape cancels it", async () => {
    const running = await stage(gesture.modules);
    const pointerAt = gesture.begin(running);
    expect(dragging(running).context()?.active).toBe(true);
    expect(container(running).querySelector(GESTURE_PREVIEW) !== null).toBe(
      gesture.previewOnCanvas,
    );

    const selections: string[][] = [];
    const stopRecording = running.modeler.elements.onSelection((ids) => selections.push(ids));
    const imported = running.modeler.importText(AFTER);
    expect(running.modeler.interaction.active()).toBe(false);
    expect(delivered(running)).toEqual([true, false]);
    await imported;
    stopRecording();
    expect(selections.flat()).toEqual([]);
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

  // The lasso changes no content, so no host imports from its drop.
  if (gesture === LASSO) return;

  test("applies its drop, then the import the host makes from its change listener", async () => {
    const running = await stage(gesture.modules);
    const imports: Array<Promise<unknown>> = [];
    running.modeler.onContentChanged(() => {
      if (imports.length === 0) imports.push(running.modeler.importText(AFTER));
    });

    gesture.release(running, gesture.begin(running));
    expect(imports).toHaveLength(1);
    // The drop's own listeners finish on the map the drop changed; the import waits for them.
    gesture.expectApplied(running);
    await imports[0];

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expect(running.modeler.exportText()).toBe(AFTER);
    expect(dragging(running).context()).toBeFalsy();
    expect(delivered(running)).toEqual([true, false]);
    await nextTasks();
    expect(document.querySelector(".djs-popup")).toBeNull();
    expect(running.errors).toEqual([]);
    service<Modeling>(running, "modeling").moveElements([shape(running, "c")], { x: 30, y: 0 });
    expect(running.changes()).toBe(2);
  });
});

describe("a press on context B that has not reached the drag threshold", () => {
  test("is ended by an import, so the moves after it start no drag", async () => {
    const running = await stage();
    const start = centreOfShape(running, "b");
    pointer(hitArea(running, "b"), "mousedown", start);
    pointer(document, "mousemove", shifted(start, 2, 1));
    expect(dragging(running).context()?.prefix).toBe("shape.move");
    expect(dragging(running).context()?.active).toBeFalsy();

    expect(running.modeler.interaction.active()).toBe(false);

    await running.modeler.importText(AFTER);
    expect(dragging(running).context()).toBeFalsy();
    hoverCanvasAt(running, shifted(start, 40, 20));
    pointer(document, "mouseup", shifted(start, 40, 20));

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(0);
    expect(running.modeler.exportText()).toBe(AFTER);
    expect(dragging(running).context()).toBeFalsy();
    expect(container(running).querySelector(GESTURE_PREVIEW)).toBeNull();
    expect(delivered(running)).toEqual([]);
    service<Modeling>(running, "modeling").moveElements([shape(running, "c")], { x: 30, y: 0 });
    expect(running.changes()).toBe(1);
  });
});

describe("an import the renderer rejects leaves the running gesture alone", () => {
  test("a text that does not parse", async () => {
    const running = await stage();
    const pointerAt = MOVE.begin(running);

    await expect(running.modeler.importText("{ no context map")).rejects.toThrow();
    expect(running.modeler.interaction.active()).toBe(true);
    expect(delivered(running)).toEqual([true]);
    MOVE.release(running, pointerAt);

    expect(running.errors).toEqual([]);
    MOVE.expectApplied(running);
    expect(delivered(running)).toEqual([true, false]);
  });

  test("a document the canvas cannot draw: two contexts share an id", async () => {
    const running = await stage();
    const pointerAt = MOVE.begin(running);
    const parsed = parseDocumentText(AFTER);
    if (!parsed.ok) throw new Error(parsed.error);
    const sharedId: CmDocument = {
      ...parsed.document,
      contexts: parsed.document.contexts.map((context) =>
        context.id === "c" ? { ...context, id: "b" } : context,
      ),
    };

    expect(() => running.modeler.diagram.importDocument(sharedId)).toThrow(/more than once/);
    MOVE.release(running, pointerAt);

    expect(running.errors).toEqual([]);
    MOVE.expectApplied(running);
  });
});

describe("the lasso tool armed in the palette", () => {
  function lassoEntry(stage: Stage): HTMLElement {
    return paletteEntry(stage, "lasso-tool");
  }

  function arm(stage: Stage): void {
    pointer(lassoEntry(stage), "click", centreOfBox(lassoEntry(stage)), { detail: 1 });
  }

  test.each([
    { pointer: "still on the palette", onCanvasFirst: false },
    { pointer: "already on the canvas", onCanvasFirst: true },
  ])("stays armed across an import, the pointer $pointer", async ({ onCanvasFirst }) => {
    const running = await stage();
    arm(running);
    if (onCanvasFirst) hoverCanvasAt(running, clientPoint(running, FREE_SPOT));
    expect(dragging(running).context()?.prefix).toBe("lasso.selection");

    expect(running.modeler.interaction.active()).toBe(false);

    await running.modeler.importText(AFTER);

    expect(dragging(running).context()?.prefix).toBe("lasso.selection");
    expect(lassoEntry(running).classList.contains("highlighted-entry")).toBe(true);
    expect(running.modeler.interaction.active()).toBe(false);
    expect(delivered(running)).toEqual([]);

    const start = clientPoint(running, LASSO_FROM);
    hoverCanvasAt(running, start);
    pointer(svg(running), "mousedown", start);
    expect(running.modeler.interaction.active()).toBe(true);
    const end = clientPoint(running, LASSO_TO);
    pointer(document, "mousemove", end);
    pointer(document, "mouseup", end);

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(0);
    expect(selectedIds(running)).toEqual(["b", "c"]);
    expect(running.modeler.exportText()).toBe(AFTER);
    expect(delivered(running)).toEqual([true, false]);
  });

  test("its press starts a lasso drag, which an import cancels", async () => {
    const running = await stage();
    arm(running);
    const start = clientPoint(running, LASSO_FROM);
    hoverCanvasAt(running, start);
    pointer(svg(running), "mousedown", start);
    const end = clientPoint(running, LASSO_TO);
    pointer(document, "mousemove", end);
    expect(dragging(running).context()?.prefix).toBe("lasso");
    expect(container(running).querySelector(GESTURE_PREVIEW)).not.toBeNull();

    await running.modeler.importText(AFTER);
    expect(dragging(running).context()).toBeFalsy();
    expect(container(running).querySelector(GESTURE_PREVIEW)).toBeNull();
    pointer(document, "mousemove", shifted(end, 5, 5));
    pointer(document, "mouseup", shifted(end, 5, 5));

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(0);
    expect(selectedIds(running)).toEqual([]);
    expect(lassoEntry(running).classList.contains("highlighted-entry")).toBe(false);
    expect(running.modeler.exportText()).toBe(AFTER);
  });
});

describe("a pan of the canvas, dragged on its empty ground", () => {
  test("is no interaction, and an import leaves it running", async () => {
    const running = await stage();
    const canvas = service<Canvas>(running, "canvas");
    canvas.focus();
    const start = clientPoint(running, FREE_SPOT);
    pointer(svg(running), "mousedown", start);
    pointer(document, "mousemove", shifted(start, 40, 0));
    const panned = canvas.viewbox();
    expect(running.modeler.interaction.active()).toBe(false);

    await running.modeler.importText(AFTER);
    const fitted = canvas.viewbox();
    expect(fitted.x).not.toBe(panned.x);
    pointer(document, "mousemove", shifted(start, 70, 0));
    expect(canvas.viewbox().x).toBeCloseTo(fitted.x - 30 / fitted.scale, 3);
    pointer(document, "mouseup", shifted(start, 70, 0));

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(0);
    expect(running.modeler.exportText()).toBe(AFTER);
    expect(delivered(running)).toEqual([]);
  });
});

describe("an import from the change listener of a drop waits until the drop has ended", () => {
  function dragEndings(stage: Stage): string[] {
    const endings: string[] = [];
    const eventBus = service<EventBus>(stage, "eventBus");
    eventBus.on("drag.ended", () => endings.push("ended"));
    eventBus.on("drag.canceled", () => endings.push("canceled"));
    return endings;
  }

  test("a map without the context the drop moved, with another one selected before the drag", async () => {
    const running = await stage();
    const endings = dragEndings(running);
    let reimport: Promise<unknown> | undefined;
    running.modeler.onContentChanged(() => {
      reimport ??= running.modeler.importText(BEFORE_WITHOUT_B);
    });
    running.modeler.elements.reveal("a");

    MOVE.release(running, MOVE.begin(running));
    expect(reimport).toBeDefined();
    await reimport;

    expect(running.errors).toEqual([]);
    expect(endings).toEqual(["ended"]);
    expect(running.changes()).toBe(1);
    expect(running.modeler.exportText()).toBe(BEFORE_WITHOUT_B);
    expect(selectedIds(running)).toEqual([]);
    service<Modeling>(running, "modeling").moveElements([shape(running, "c")], { x: 30, y: 0 });
    expect(running.changes()).toBe(2);
  });

  test("its promise settles after the import, in the order the host called it", async () => {
    const running = await stage();
    const settled: string[] = [];
    running.modeler.onContentChanged(() => {
      if (settled.length > 0) return;
      void running.modeler.importText(BEFORE_WITHOUT_B).then(() => settled.push("first"));
      void running.modeler.importText(AFTER).then(() => settled.push("second"));
      settled.push("called");
    });

    MOVE.release(running, MOVE.begin(running));
    expect(settled).toEqual(["called"]);
    MOVE.expectApplied(running);
    await nextTasks(1);

    expect(settled).toEqual(["called", "first", "second"]);
    expect(running.modeler.exportText()).toBe(AFTER);
    expect(running.errors).toEqual([]);
  });

  test("an echo of an append dropped from the context pad keeps its subdomain-type menu", async () => {
    const running = await stage();
    let echo: Promise<unknown> | undefined;
    running.modeler.onContentChanged(() => {
      echo ??= running.modeler.importText(running.modeler.exportText());
    });
    const entry = contextPadEntry(running, "b", "append-context");
    const start = centreOfBox(entry);
    dragStart(entry, start);
    const onCanvas = clientPoint(running, FREE_SPOT);
    hoverCanvasAt(running, onCanvas);
    pointer(document, "mousemove", shifted(onCanvas, 10, 0));
    pointer(document, "mouseup", shifted(onCanvas, 10, 0));
    const appendedText = running.modeler.exportText();
    await echo;
    await nextTasks();

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expect(running.modeler.exportText()).toBe(appendedText);
    const appended = exported(running).contexts.find(
      (context) => !["a", "b", "c"].includes(context.id),
    );
    if (!appended) throw new Error("the append added no context");
    expect(selectedIds(running)).toEqual([appended.id]);
    expect(service<ContextPad>(running, "contextPad").isOpen(shape(running, appended.id))).toBe(
      true,
    );
    const menu = document.querySelector(".djs-popup");
    expect(menu?.querySelector(".djs-popup-title")?.textContent).toBe("Subdomain type");

    menu!
      .querySelector('[data-id="type-core"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(running.changes()).toBe(2);
    expect(exported(running).contexts.find((context) => context.id === appended.id)).toMatchObject({
      subdomainType: "core",
    });
  });
});

describe("an import from the interaction listener when Escape ends a gesture", () => {
  test("waits until the cancel has ended", async () => {
    const running = await stage();
    let reimport: Promise<unknown> | undefined;
    running.modeler.interaction.onChange((active) => {
      if (!active) reimport ??= running.modeler.importText(AFTER);
    });
    MOVE.begin(running);

    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
    expect(reimport).toBeDefined();
    await reimport;

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(0);
    expect(running.modeler.exportText()).toBe(AFTER);
    expect(dragging(running).context()).toBeFalsy();
  });
});

describe("clear() during a running drag", () => {
  test("cancels the drag first, so its release applies nothing", async () => {
    const running = await stage();
    const pointerAt = MOVE.begin(running);

    running.modeler.diagram.clear();
    expect(dragging(running).context()).toBeFalsy();
    expect(delivered(running)).toEqual([true, false]);
    MOVE.release(running, pointerAt);

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(0);
    await running.modeler.importText(AFTER);
    service<Modeling>(running, "modeling").moveElements([shape(running, "c")], { x: 30, y: 0 });
    expect(running.changes()).toBe(1);
  });

  test("leaves the lasso tool armed in the palette", async () => {
    const running = await stage();
    const entry = paletteEntry(running, "lasso-tool");
    pointer(entry, "click", centreOfBox(entry), { detail: 1 });

    running.modeler.diagram.clear();

    expect(dragging(running).context()?.prefix).toBe("lasso.selection");
    expect(running.errors).toEqual([]);
  });
});
