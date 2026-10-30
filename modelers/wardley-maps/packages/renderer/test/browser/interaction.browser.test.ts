import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type { ImportResult } from "@miragon/modeler-api";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement, Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  INTERACTION_CHANGED,
  ROOT_ID,
  type CollaborativeWardleyModeler,
  type InteractionChangedEvent,
} from "../../src/index.js";
import type WardleyElementFactory from "../../src/model/WardleyElementFactory.js";
import type WardleyModeling from "../../src/modeling/WardleyModeling.js";
import type WardleyLabelEditing from "../../src/label-editing/WardleyLabelEditing.js";
import type EvolutionGrid from "../../src/evolution-grid/EvolutionGrid.js";
import { isWardleyShape, type WardleyShape } from "../../src/model/di-types.js";
import {
  GESTURE_KINDS,
  armTool,
  canvasSvgOf,
  centreOf,
  clickEntry,
  clientAt,
  diagramOf,
  enterCanvas,
  graphicsOf,
  mouse,
  paletteEntry,
  pressEscape,
  shapeNamed,
  startGesture,
  type GestureKind,
  type Point,
} from "./support/gesture-harness.js";
import teaShop from "./fixtures/tea-shop.wmap?raw";
import platformStrategy from "./fixtures/platform-strategy.wmap?raw";
import "../../src/assets/wardley.css";

// The `interaction` surface of contract 1.5, the RECOMMENDED gesture cancel of L1, the export while
// a gesture runs, which stays the committed document (#347), and an import from the change listener
// of a drop, which waits until the drop has ended (#248). The first two describe blocks follow the
// kit's cases (packages/api/README.md, "Cases for the 1.5 surfaces"), with the harness fields of
// ./support/gesture-harness.ts.

const mountedModelers: CollaborativeWardleyModeler[] = [];
const hostWrappers: HTMLElement[] = [];
const errors: unknown[] = [];
const collectError = (event: ErrorEvent) => errors.push(event.error ?? event.message);

beforeEach(() => {
  errors.length = 0;
  window.addEventListener("error", collectError);
});

afterEach(() => {
  window.removeEventListener("error", collectError);
  for (const modeler of mountedModelers.splice(0)) modeler.destroy();
  for (const wrapper of hostWrappers.splice(0)) wrapper.remove();
});

function mount(modeler: CollaborativeWardleyModeler): CollaborativeWardleyModeler {
  const host = attachedHost();
  hostWrappers.push(host.parentElement ?? host);
  modeler.attachTo(host);
  mountedModelers.push(modeler);
  return modeler;
}

interface Session {
  modeler: CollaborativeWardleyModeler;
  changes: () => number;
  /** Every value `interaction.onChange` delivered. */
  delivered: boolean[];
  /** Deliveries during which `interaction.active()` returned another value than the listener got. */
  mismatches: () => number;
}

async function session(text: string = teaShop): Promise<Session> {
  const modeler = mount(createCollaborativeModeler());
  await modeler.importText(text);
  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  const delivered: boolean[] = [];
  let mismatches = 0;
  modeler.interaction.onChange((active) => {
    delivered.push(active);
    if (modeler.interaction.active() !== active) mismatches += 1;
  });
  return { modeler, changes: () => changes, delivered, mismatches: () => mismatches };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

let createdComponents = 0;

/** The harness's `mutate`: adds a component of its own name by its command. */
function addComponent(modeler: CollaborativeWardleyModeler): void {
  const diagram = diagramOf(modeler);
  createdComponents += 1;
  const component = diagram
    .get<WardleyElementFactory>("wardleyElementFactory")
    .createNew("component", `Added Component ${createdComponents}`);
  diagram
    .get<Modeling>("modeling")
    .createShape(
      component as unknown as Shape,
      { x: 400, y: 300 },
      diagram.get<Canvas>("canvas").getRootElement() as Shape,
    );
}

function undo(modeler: CollaborativeWardleyModeler): void {
  diagramOf(modeler).get<CommandStack>("commandStack").undo();
}

function expectNoRemovedElementSelected(modeler: CollaborativeWardleyModeler): void {
  const diagram = diagramOf(modeler);
  const registry = diagram.get<ElementRegistry>("elementRegistry");
  for (const selected of diagram.get<Selection>("selection").get() as DiagramElement[]) {
    expect(registry.get(selected.id)).toBe(selected);
  }
}

describe("an import during a gesture cancels it (L1, the kit's gesture case)", () => {
  const imports: ReadonlyArray<readonly [string, string]> = [
    ["another document", platformStrategy],
    ["the same document again", teaShop],
  ];
  for (const kind of GESTURE_KINDS) {
    test.each(imports)(`${kind}: importing %s`, async (_, imported) => {
      const current = await session();
      const { modeler } = current;
      const held = await startGesture(modeler, kind);
      expect(modeler.interaction.active()).toBe(true);
      expect(current.delivered).toEqual([true]);

      let deliveredBeforeResolve: boolean[] = [];
      await modeler.importText(imported).then((result) => {
        deliveredBeforeResolve = [...current.delivered];
        return result;
      });
      expect(deliveredBeforeResolve).toEqual([true, false]);
      expect(modeler.interaction.active()).toBe(false);

      held.drop();
      await settle();
      expect(errors).toEqual([]);
      expect(current.changes()).toBe(0);
      expect(modeler.exportText()).toBe(imported);
      undo(modeler);
      expect(modeler.exportText()).toBe(imported);
      expect(current.changes()).toBe(0);
      addComponent(modeler);
      expect(current.changes()).toBe(1);
      expect(modeler.exportText()).not.toBe(imported);
      expect(current.delivered).toEqual([true, false]);
      expect(current.mismatches()).toBe(0);
    });
  }

  test("a map the canvas cannot hold leaves a running gesture running, and its drop applies", async () => {
    const current = await session();
    const { modeler } = current;
    const diagram = diagramOf(modeler);
    const held = await startGesture(modeler, "move");
    const invalid = {
      ...diagram.exportMap(),
      edges: [{ id: "e", edgeType: "dependency", from: "x", to: "y" }],
    };
    await expect(diagram.importMap(invalid as never)).rejects.toThrow();
    expect(modeler.interaction.active()).toBe(true);
    expect(current.delivered).toEqual([true]);

    held.drop();
    expect(errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(modeler.exportText()).not.toContain("component Cup [0.73, 0.78]");
    expect(current.delivered).toEqual([true, false]);
  });
});

describe("interaction (the kit's interaction case)", () => {
  test("is false before the first import and at rest", async () => {
    const modeler = mount(createCollaborativeModeler());
    expect(modeler.interaction.active()).toBe(false);
    await modeler.importText(teaShop);
    expect(modeler.interaction.active()).toBe(false);
  });

  const ends: ReadonlyArray<readonly [GestureKind, "drop" | "cancel"]> = GESTURE_KINDS.flatMap(
    (kind) => [[kind, "drop"] as const, [kind, "cancel"] as const],
  );
  test.each(ends)("follows a %s gesture to its %s", async (kind, end) => {
    const current = await session();
    const { modeler } = current;
    const held = await startGesture(modeler, kind);
    expect(modeler.interaction.active()).toBe(true);
    expect(current.delivered).toEqual([true]);

    held[end]();
    expect(modeler.interaction.active()).toBe(false);
    expect(current.delivered).toEqual([true, false]);
    await settle();
    expect(errors).toEqual([]);
    expect(current.delivered).toEqual([true, false]);
    expect(current.mismatches()).toBe(0);
    expect(current.changes()).toBe(end === "drop" && kind !== "createOffCanvas" ? 1 : 0);
  });

  test("stays false while a tool is only armed, and calls no listener", async () => {
    const current = await session();
    const { modeler } = current;
    armTool(modeler);
    expect(draggingPrefix(modeler)).toBe("lasso.selection");
    expect(modeler.interaction.active()).toBe(false);
    expect(current.delivered).toEqual([]);
  });

  test("delivers nothing after the unsubscribe", async () => {
    const current = await session();
    const { modeler } = current;
    const delivered: boolean[] = [];
    const unsubscribe = modeler.interaction.onChange((active) => delivered.push(active));
    unsubscribe();
    const held = await startGesture(modeler, "move");
    held.drop();
    expect(delivered).toEqual([]);
    expect(current.delivered).toEqual([true, false]);
  });

  test("calls no listener after destroy()", async () => {
    const current = await session();
    const { modeler } = current;
    await startGesture(modeler, "move");
    modeler.destroy();
    expect(current.delivered).toEqual([true]);
    expect(modeler.interaction.active()).toBe(false);
    expect(() => modeler.interaction.onChange(() => undefined)()).not.toThrow();
  });

  test("is false on the viewer, also while the view is panned", async () => {
    const viewer = mount(createCollaborativeViewer());
    const delivered: boolean[] = [];
    viewer.interaction.onChange((active) => delivered.push(active));
    await viewer.importText(teaShop);
    const from = clientAt(viewer, { x: 300, y: 200 });
    mouse(graphicsOf(viewer, ROOT_ID), "mousedown", from);
    mouse(document, "mousemove", { x: from.x + 40, y: from.y + 30 });
    expect(viewer.interaction.active()).toBe(false);
    mouse(document, "mouseup", { x: from.x + 40, y: from.y + 30 });
    expect(delivered).toEqual([]);
    expect(viewer.interaction.active()).toBe(false);
  });
});

function draggingPrefix(modeler: CollaborativeWardleyModeler): string | undefined {
  const context = diagramOf(modeler).get<Dragging>("dragging").context() as {
    prefix?: string;
  } | null;
  return context?.prefix;
}

// A map with every element a Wardley gesture holds: components, an evolve target, a region and a
// drawing.
const GESTURE_MAP = `title Gestures
component Kettle [0.5, 0.5]
component Water [0.3, 0.3]
component Cup [0.7, 0.2]
evolve Kettle 0.7
pioneers [0.98, 0.05, 0.75, 0.3]
line [[0.85, 0.15], [0.9, 0.3], [0.8, 0.4]]
Kettle -> Water
`;

function diagramPoint(modeler: CollaborativeWardleyModeler, visibility: number, evolution: number) {
  return clientAt(
    modeler,
    diagramOf(modeler).get<EvolutionGrid>("evolutionGrid").toCanvas({ evolution, visibility }),
  );
}

function middleOf(modeler: CollaborativeWardleyModeler, shape: WardleyShape): Point {
  return clientAt(modeler, { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 });
}

function select(modeler: CollaborativeWardleyModeler, element: unknown): void {
  diagramOf(modeler)
    .get<Selection>("selection")
    .select(element as DiagramElement);
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function inCanvas(modeler: CollaborativeWardleyModeler, selector: string): Element {
  const found = diagramOf(modeler).get<Canvas>("canvas").getContainer().querySelector(selector);
  if (!found) throw new Error(`the canvas has no ${selector}`);
  return found;
}

/** Presses `target` at `from`, then moves the pointer 40 px right and 20 px down in two steps. */
function pressAndDrag(target: EventTarget, from: Point, init: MouseEventInit = {}): Point {
  mouse(target, "mousedown", from, init);
  mouse(document, "mousemove", { x: from.x + 20, y: from.y + 10 }, init);
  const to = { x: from.x + 40, y: from.y + 20 };
  mouse(document, "mousemove", to, init);
  return to;
}

/** A Wardley gesture beyond the kit's kinds: starts it and returns its release. */
type WardleyGesture = (modeler: CollaborativeWardleyModeler) => Promise<() => void>;

const releaseAt = (modeler: CollaborativeWardleyModeler, at: Point) => () =>
  mouse(canvasSvgOf(modeler), "mouseup", at);

const WARDLEY_GESTURES: ReadonlyArray<readonly [string, WardleyGesture]> = [
  [
    "a resize of a region",
    async (modeler) => {
      const region = diagramOf(modeler)
        .get<ElementRegistry>("elementRegistry")
        .find((element) => isWardleyShape(element) && element.wardleyType === "attitude");
      select(modeler, region);
      const handle = inCanvas(modeler, ".djs-resizer-se .djs-resizer-hit");
      return releaseAt(modeler, pressAndDrag(handle, centreOf(handle)));
    },
  ],
  [
    "a connect from the context pad",
    async (modeler) => {
      select(modeler, shapeNamed(modeler, "Cup"));
      await nextFrame();
      const entry = inCanvas(modeler, '.djs-context-pad.open .entry[data-action="connect"]');
      const from = centreOf(entry);
      mouse(entry, "click", from, { detail: 1 });
      enterCanvas(modeler);
      mouse(document, "mousemove", { x: from.x + 30, y: from.y + 30 });
      return releaseAt(modeler, { x: from.x + 30, y: from.y + 30 });
    },
  ],
  [
    "a lasso drag with Shift",
    async (modeler) => {
      const from = diagramPoint(modeler, 0.95, 0.4);
      return releaseAt(
        modeler,
        pressAndDrag(graphicsOf(modeler, ROOT_ID), from, { shiftKey: true }),
      );
    },
  ],
  [
    "the drag of an armed lasso",
    async (modeler) => {
      armTool(modeler);
      const from = diagramPoint(modeler, 0.95, 0.4);
      return releaseAt(modeler, pressAndDrag(graphicsOf(modeler, ROOT_ID), from));
    },
  ],
  [
    "a label drag",
    async (modeler) => {
      const label = graphicsOf(modeler, shapeNamed(modeler, "Water").id).querySelector(
        ".wardley-label-handle",
      );
      if (!label) throw new Error("Water has no label handle");
      const rect = label.getBoundingClientRect();
      const to = pressAndDrag(label, { x: rect.left + 4, y: rect.top + rect.height / 2 });
      return () => mouse(document, "mouseup", to);
    },
  ],
  [
    "a point drag of a drawing",
    async (modeler) => {
      const drawing = diagramOf(modeler)
        .get<ElementRegistry>("elementRegistry")
        .find((element) => isWardleyShape(element) && element.wardleyType === "drawing");
      select(modeler, drawing);
      const handle = inCanvas(modeler, ".wardley-drawing-handle");
      const to = pressAndDrag(handle, diagramPoint(modeler, 0.85, 0.15));
      return () => mouse(document, "mouseup", to);
    },
  ],
  [
    "a drag of the evolve target",
    async (modeler) => {
      const handle = graphicsOf(modeler, shapeNamed(modeler, "Kettle").id).querySelector(
        ".wardley-evolve-handle",
      );
      if (!handle) throw new Error("Kettle has no evolve handle");
      const to = pressAndDrag(handle, diagramPoint(modeler, 0.5, 0.7));
      return () => mouse(document, "mouseup", to);
    },
  ],
  [
    "an evolve placement from the context pad",
    async (modeler) => {
      select(modeler, shapeNamed(modeler, "Water"));
      await nextFrame();
      const entry = inCanvas(modeler, '.djs-context-pad.open .entry[data-action="evolve"]');
      const from = centreOf(entry);
      mouse(entry, "click", from, { detail: 1 });
      enterCanvas(modeler);
      const to = diagramPoint(modeler, 0.3, 0.6);
      mouse(document, "mousemove", { x: to.x - 20, y: to.y });
      mouse(document, "mousemove", to);
      return releaseAt(modeler, to);
    },
  ],
  [
    "a drag of the plot corner",
    async (modeler) => {
      const handle = inCanvas(modeler, ".wardley-map-resize-xy");
      return releaseAt(modeler, pressAndDrag(handle, centreOf(handle)));
    },
  ],
  [
    "a create the quick-create key C starts with the pointer over the canvas",
    async (modeler) => {
      const to = diagramPoint(modeler, 0.6, 0.85);
      mouse(canvasSvgOf(modeler), "mousemove", to);
      pressCanvasKey(modeler, "c");
      return releaseAt(modeler, to);
    },
  ],
  [
    "a connect the key A starts from the selected component",
    async (modeler) => {
      select(modeler, shapeNamed(modeler, "Cup"));
      const to = diagramPoint(modeler, 0.6, 0.85);
      mouse(canvasSvgOf(modeler), "mousemove", to);
      pressCanvasKey(modeler, "a");
      return releaseAt(modeler, to);
    },
  ],
];

function pressCanvasKey(modeler: CollaborativeWardleyModeler, key: string): void {
  const svg = canvasSvgOf(modeler);
  svg.focus();
  svg.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("interaction follows every Wardley gesture", () => {
  test.each(WARDLEY_GESTURES)("%s, from its start to its release", async (_, start) => {
    const current = await session(GESTURE_MAP);
    const { modeler } = current;
    const release = await start(modeler);
    expect(modeler.interaction.active()).toBe(true);
    expect(current.delivered).toEqual([true]);

    release();
    expect(modeler.interaction.active()).toBe(false);
    expect(current.delivered).toEqual([true, false]);
    await settle();
    expect(errors).toEqual([]);
    expect(current.delivered).toEqual([true, false]);
    expect(current.mismatches()).toBe(0);
  });

  test.each(WARDLEY_GESTURES)("%s, ended by an import before it resolves", async (_, start) => {
    const current = await session(GESTURE_MAP);
    const { modeler } = current;
    const release = await start(modeler);
    expect(current.delivered).toEqual([true]);

    const imported = GESTURE_MAP.replace("component Cup [0.7, 0.2]", "component Cup [0.65, 0.25]");
    let deliveredBeforeResolve: boolean[] = [];
    await modeler.importText(imported).then(() => {
      deliveredBeforeResolve = [...current.delivered];
    });
    expect(deliveredBeforeResolve).toEqual([true, false]);
    expect(modeler.interaction.active()).toBe(false);
    const afterImport = modeler.exportText();
    expect(afterImport).toContain("component Cup [0.65, 0.25]");

    release();
    await settle();
    expect(errors).toEqual([]);
    expect(current.changes()).toBe(0);
    expect(modeler.exportText()).toBe(afterImport);
    expect(current.delivered).toEqual([true, false]);
  });

  test.each(WARDLEY_GESTURES)("%s, ended by Escape on the canvas", async (_, start) => {
    const current = await session(GESTURE_MAP);
    const { modeler } = current;
    const before = modeler.exportText();
    const release = await start(modeler);
    expect(current.delivered).toEqual([true]);

    pressEscape(modeler);
    expect(modeler.interaction.active()).toBe(false);
    expect(current.delivered).toEqual([true, false]);
    expect(modeler.exportText()).toBe(before);

    release();
    await settle();
    expect(errors).toEqual([]);
    expect(current.changes()).toBe(0);
    expect(modeler.exportText()).toBe(before);
    expect(diagramOf(modeler).get<CommandStack>("commandStack").canUndo()).toBe(false);
    expect(current.delivered).toEqual([true, false]);
  });
});

function theDrawing(modeler: CollaborativeWardleyModeler): WardleyShape {
  const drawing = diagramOf(modeler)
    .get<ElementRegistry>("elementRegistry")
    .find((element) => isWardleyShape(element) && element.wardleyType === "drawing");
  if (!drawing) throw new Error("the map has no drawing");
  return drawing as WardleyShape;
}

/**
 * A release as the browser sends it: the mouseup on the element under the pointer, then the click
 * on the innermost element that holds both that one and the pressed one.
 */
function releaseWithClick(pressed: Element, at: Point): void {
  const released = document.elementFromPoint(at.x, at.y) ?? document.body;
  mouse(released, "mouseup", at);
  let clicked: Element | null = pressed;
  while (clicked && !clicked.contains(released)) clicked = clicked.parentElement;
  mouse(clicked ?? document.documentElement, "click", at);
}

/** The renderer's own drags, outside diagram-js dragging: each binds its own Escape. */
const OWN_DRAGS = WARDLEY_GESTURES.filter(([name]) =>
  ["a label drag", "a point drag of a drawing", "a drag of the evolve target"].includes(name),
);

describe("Escape during the renderer's own drags", () => {
  test("ends a drawing's point drag without a commit, and the drawing stays selected", async () => {
    const current = await session(GESTURE_MAP);
    const { modeler } = current;
    const drawing = theDrawing(modeler);
    select(modeler, drawing);
    const container = diagramOf(modeler).get<Canvas>("canvas").getContainer();
    const handleCount = container.querySelectorAll(".wardley-drawing-handle").length;
    expect(handleCount).toBeGreaterThan(0);
    const handle = inCanvas(modeler, ".wardley-drawing-handle");
    const to = pressAndDrag(handle, diagramPoint(modeler, 0.85, 0.15));
    const preview = ".layer-wardley-drawing-handles :is(polyline, polygon)";
    expect(container.querySelector(preview)).not.toBeNull();

    pressEscape(modeler);
    expect(container.querySelector(preview)).toBeNull();
    expect(diagramOf(modeler).get<Selection>("selection").get()).toEqual([drawing]);
    expect(container.querySelectorAll(".wardley-drawing-handle")).toHaveLength(handleCount);

    releaseWithClick(handle, to);
    expect(errors).toEqual([]);
    expect(current.changes()).toBe(0);
    expect(diagramOf(modeler).get<Selection>("selection").get()).toEqual([drawing]);
    expect(container.querySelectorAll(".wardley-drawing-handle")).toHaveLength(handleCount);

    await settle();
    mouse(canvasSvgOf(modeler), "click", to);
    expect(diagramOf(modeler).get<Selection>("selection").get()).toEqual([]);
  });

  test.each(OWN_DRAGS)(
    "%s runs on through an Escape in a host field, which reaches the host",
    async (_, start) => {
      const current = await session(GESTURE_MAP);
      const { modeler } = current;
      const release = await start(modeler);
      const field = document.createElement("input");
      document.body.append(field);
      hostWrappers.push(field);
      const seenByHost: string[] = [];
      field.addEventListener("keydown", (event) => seenByHost.push(event.key));
      field.focus();

      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(escape);
      expect(escape.defaultPrevented).toBe(false);
      expect(seenByHost).toEqual(["Escape"]);
      expect(modeler.interaction.active()).toBe(true);

      release();
      await settle();
      expect(errors).toEqual([]);
      expect(current.changes()).toBe(1);
      expect(current.delivered).toEqual([true, false]);
    },
  );
});

function gestureNamed(name: string): WardleyGesture {
  const gesture = WARDLEY_GESTURES.find(([listed]) => listed === name);
  if (!gesture) throw new Error(`no Wardley gesture "${name}"`);
  return gesture[1];
}

/** An import whose render throws half-way, after the canvas has been cleared. */
async function importFailingHalfWay(modeler: CollaborativeWardleyModeler): Promise<void> {
  const factory = diagramOf(modeler).get<WardleyElementFactory>("wardleyElementFactory");
  const createFromModel = factory.createFromModel.bind(factory);
  factory.createFromModel = (element) => {
    if (element.label === "Broken") throw new Error("render failed");
    return createFromModel(element);
  };
  try {
    await expect(modeler.importText("title Next\ncomponent Broken [0.5, 0.5]")).rejects.toThrow(
      "render failed",
    );
  } finally {
    factory.createFromModel = createFromModel;
  }
}

/** Presses the name label of the component `name` and drags it, without a release. */
function dragNameOf(modeler: CollaborativeWardleyModeler, name: string): Point {
  const label = graphicsOf(modeler, shapeNamed(modeler, name).id).querySelector(
    '.wardley-label-handle[data-label-role="name"]',
  );
  if (!label) throw new Error(`${name} has no name label handle`);
  const rect = label.getBoundingClientRect();
  return pressAndDrag(label, { x: rect.left + 4, y: rect.top + rect.height / 2 });
}

/** The lines of `text` that `committed` does not have. */
function linesAdded(committed: string, text: string): string[] {
  const before = new Set(committed.split("\n"));
  return text.split("\n").filter((line) => !before.has(line));
}

// The drags that preview on the shapes themselves, and the line their release commits.
const SHAPE_PREVIEWS: ReadonlyArray<readonly [string, WardleyGesture, RegExp]> = [
  [
    "a drag of the evolve target",
    gestureNamed("a drag of the evolve target"),
    /^evolve Kettle 0\.\d+$/,
  ],
  [
    "an evolve placement from the context pad",
    gestureNamed("an evolve placement from the context pad"),
    /^evolve Water 0\.\d+$/,
  ],
  [
    "a drag of a component's name",
    gestureNamed("a label drag"),
    /^component Water \[0\.3, 0\.3\] label \[-?\d+, -?\d+\]$/,
  ],
  [
    "a drag of an evolve target's name",
    async (modeler) => {
      const label = graphicsOf(modeler, shapeNamed(modeler, "Kettle").id).querySelector(
        '.wardley-label-handle[data-label-role="movement"]',
      );
      if (!label) throw new Error("Kettle's evolve target has no label handle");
      const rect = label.getBoundingClientRect();
      const to = pressAndDrag(label, { x: rect.left + 4, y: rect.top + rect.height / 2 });
      return () => mouse(document, "mouseup", to);
    },
    /^evolve Kettle 0\.7 label \[-?\d+, -?\d+\]$/,
  ],
];

// A host saves the export at any moment, also while the user drags (#347).
describe("the export is the committed document while a gesture runs", () => {
  test.each(WARDLEY_GESTURES)("%s, until its release", async (_, start) => {
    const current = await session(GESTURE_MAP);
    const { modeler } = current;
    const committed = modeler.exportText();
    const release = await start(modeler);
    expect(modeler.exportText()).toBe(committed);

    release();
    await settle();
    expect(errors).toEqual([]);
    expect(modeler.exportText()).toBe(diagramOf(modeler).exportDSL());
    expect(current.changes()).toBe(modeler.exportText() === committed ? 0 : 1);
  });

  test.each(SHAPE_PREVIEWS)(
    "%s: without the preview the canvas shows, then with the commit of the release",
    async (_, start, committedLine) => {
      const current = await session(GESTURE_MAP);
      const { modeler } = current;
      const committed = modeler.exportText();
      const release = await start(modeler);
      expect(diagramOf(modeler).exportDSL()).not.toBe(committed);
      expect(modeler.exportText()).toBe(committed);
      expect(current.changes()).toBe(0);

      let exportedOnChange: string | undefined;
      modeler.onContentChanged(() => (exportedOnChange ??= modeler.exportText()));
      release();
      expect(current.changes()).toBe(1);
      const dropped = modeler.exportText();
      expect(exportedOnChange).toBe(dropped);
      expect(dropped).toBe(diagramOf(modeler).exportDSL());
      const added = linesAdded(committed, dropped);
      expect(added).toHaveLength(1);
      expect(added[0]).toMatch(committedLine);
    },
  );

  test.each(SHAPE_PREVIEWS)(
    "%s: a command before the release ends it without a commit and keeps the command",
    async (_, start) => {
      const current = await session(GESTURE_MAP);
      const { modeler } = current;
      const committed = modeler.exportText();
      const release = await start(modeler);
      diagramOf(modeler).setTitle("Renamed mid-drag");
      const renamed = committed.replace("title Gestures", "title Renamed mid-drag");
      expect(modeler.exportText()).toBe(renamed);
      expect(diagramOf(modeler).exportDSL()).toBe(renamed);
      expect(modeler.interaction.active()).toBe(false);

      release();
      await settle();
      expect(errors).toEqual([]);
      expect(modeler.exportText()).toBe(renamed);
      expect(current.changes()).toBe(1);
      expect(current.delivered).toEqual([true, false]);
      undo(modeler);
      expect(modeler.exportText()).toBe(committed);
    },
  );

  test.each(SHAPE_PREVIEWS)(
    "%s: an undo before the release keeps its redo step",
    async (_, start) => {
      const current = await session(GESTURE_MAP);
      const { modeler } = current;
      const committed = modeler.exportText();
      diagramOf(modeler).setTitle("Edited title");
      const release = await start(modeler);
      undo(modeler);
      expect(modeler.exportText()).toBe(committed);
      expect(diagramOf(modeler).exportDSL()).toBe(committed);

      release();
      await settle();
      expect(modeler.exportText()).toBe(committed);
      const commandStack = diagramOf(modeler).get<CommandStack>("commandStack");
      expect(commandStack.canRedo()).toBe(true);
      commandStack.redo();
      expect(modeler.exportText()).toBe(committed.replace("title Gestures", "title Edited title"));
    },
  );

  test.each(SHAPE_PREVIEWS)(
    "%s: the last export of a modeler destroyed mid-drag",
    async (_, start) => {
      const current = await session(GESTURE_MAP);
      const { modeler } = current;
      const committed = modeler.exportText();
      await start(modeler);
      modeler.destroy();
      expect(modeler.exportText()).toBe(committed);
    },
  );

  test.each(WARDLEY_GESTURES)(
    "%s: an import that fails half-way puts the committed document back",
    async (_, start) => {
      const current = await session(GESTURE_MAP);
      const { modeler } = current;
      const committed = modeler.exportText();
      const release = await start(modeler);
      await importFailingHalfWay(modeler);
      expect(modeler.exportText()).toBe(committed);
      expect(diagramOf(modeler).exportDSL()).toBe(committed);

      release();
      await settle();
      expect(errors).toEqual([]);
      expect(modeler.exportText()).toBe(committed);
      expect(modeler.interaction.active()).toBe(false);
    },
  );

  test("a label press while a label drag still runs ends that drag without a commit", async () => {
    const current = await session(GESTURE_MAP);
    const { modeler } = current;
    const committed = modeler.exportText();
    // The release of the first drag never reaches the document (the window lost focus mid-drag).
    dragNameOf(modeler, "Water");
    const to = dragNameOf(modeler, "Cup");
    mouse(document, "mouseup", to);
    await settle();
    expect(errors).toEqual([]);
    expect(modeler.interaction.active()).toBe(false);
    const dropped = modeler.exportText();
    expect(dropped).toBe(diagramOf(modeler).exportDSL());
    expect(linesAdded(committed, dropped)).toEqual([
      expect.stringMatching(/^component Cup \[0\.7, 0\.2\] label \[-?\d+, -?\d+\]$/),
    ]);
    expect(current.changes()).toBe(1);

    diagramOf(modeler)
      .get<WardleyModeling>("wardleyModeling")
      .evolveComponent(shapeNamed(modeler, "Water"), 0.6);
    expect(modeler.exportText()).toContain("evolve Water 0.6");
    expect(modeler.exportText()).toBe(diagramOf(modeler).exportDSL());

    const release = dragNameOf(modeler, "Water");
    mouse(document, "mouseup", release);
    expect(modeler.exportText()).toContain("evolve Water 0.6");
    expect(modeler.exportText()).toBe(diagramOf(modeler).exportDSL());
  });
});

describe("interaction reports no gesture", () => {
  test("for a press that never passes the drag threshold", async () => {
    const current = await session(GESTURE_MAP);
    const { modeler } = current;
    const at = middleOf(modeler, shapeNamed(modeler, "Cup"));
    mouse(graphicsOf(modeler, shapeNamed(modeler, "Cup").id), "mousedown", at);
    mouse(document, "mousemove", { x: at.x + 2, y: at.y + 1 });
    expect(modeler.interaction.active()).toBe(false);
    mouse(canvasSvgOf(modeler), "mouseup", { x: at.x + 2, y: at.y + 1 });
    expect(current.delivered).toEqual([]);
  });

  test("for a pan of the view", async () => {
    const current = await session(GESTURE_MAP);
    const { modeler } = current;
    const viewbox = diagramOf(modeler).get<Canvas>("canvas").viewbox();
    const to = pressAndDrag(graphicsOf(modeler, ROOT_ID), diagramPoint(modeler, 0.95, 0.4));
    expect(diagramOf(modeler).get<Canvas>("canvas").viewbox().x).not.toBe(viewbox.x);
    expect(modeler.interaction.active()).toBe(false);
    mouse(canvasSvgOf(modeler), "mouseup", to);
    expect(current.delivered).toEqual([]);
  });

  test("while the draw tool places the points of a line", async () => {
    const current = await session(GESTURE_MAP);
    const { modeler } = current;
    clickEntry(paletteEntry(modeler, "draw-tool"));
    const svg = canvasSvgOf(modeler);
    const first = diagramPoint(modeler, 0.6, 0.6);
    mouse(svg, "mousedown", first);
    mouse(svg, "mousemove", { x: first.x + 60, y: first.y + 30 });
    expect(modeler.interaction.active()).toBe(false);
    pressEscape(modeler);
    expect(current.delivered).toEqual([]);
  });
});

/** The tea shop as a peer wrote it without Cup: the import removes the shape a move holds. */
const TEA_SHOP_WITHOUT_CUP = teaShop
  .replace("component Cup [0.73, 0.78]\n", "")
  .replace("Cup of Tea -> Cup\n", "");

interface DropLog {
  entries: string[];
  reimport: () => Promise<ImportResult> | undefined;
  activeInListener: () => boolean | undefined;
}

/**
 * A host that echoes its change back through its store imports `text` from inside the drop's change
 * listener; the log takes the drag's end, every import and the settling of the import's Promise.
 */
function importFromChangeListener(current: Session, text: () => string): DropLog {
  const { modeler } = current;
  const entries: string[] = [];
  const eventBus = diagramOf(modeler).get<EventBus>("eventBus");
  eventBus.on(["drag.ended", "drag.canceled", "import.done"], (event: { type: string }) => {
    entries.push(event.type);
  });
  let reimport: Promise<ImportResult> | undefined;
  let activeInListener: boolean | undefined;
  modeler.onContentChanged(() => {
    activeInListener ??= modeler.interaction.active();
    reimport ??= modeler.importText(text()).then((result) => {
      entries.push("settled");
      return result;
    });
  });
  return { entries, reimport: () => reimport, activeInListener: () => activeInListener };
}

describe("an import from the change listener of a drop waits until the drop has ended (#248)", () => {
  test("a move, with another shape selected before the drag, and an import without the moved shape", async () => {
    const current = await session();
    const { modeler } = current;
    const log = importFromChangeListener(current, () => TEA_SHOP_WITHOUT_CUP);
    select(modeler, shapeNamed(modeler, "Tea"));
    const held = await startGesture(modeler, "move");

    held.drop();
    expect(errors).toEqual([]);
    expect(log.entries).toEqual(["drag.ended"]);
    expect(modeler.exportText()).toMatch(/^component Cup \[/m);
    expect(modeler.exportText()).not.toContain("component Cup [0.73, 0.78]");

    await expect(log.reimport()).resolves.toBeDefined();
    expect(log.entries).toEqual(["drag.ended", "import.done", "settled"]);
    expect(modeler.exportText()).toBe(TEA_SHOP_WITHOUT_CUP);
    expect(errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(log.activeInListener()).toBe(true);
    expect(current.delivered).toEqual([true, false]);
    expectNoRemovedElementSelected(modeler);
    addComponent(modeler);
    expect(current.changes()).toBe(2);
  });

  test("a palette create, with a shape selected before the drag, and an import without it", async () => {
    const current = await session();
    const { modeler } = current;
    const log = importFromChangeListener(current, () => TEA_SHOP_WITHOUT_CUP);
    select(modeler, shapeNamed(modeler, "Cup"));
    const held = await startGesture(modeler, "create");

    held.drop();
    expect(errors).toEqual([]);
    expect(log.entries).toEqual(["drag.ended"]);
    const components = (text: string) =>
      text.split("\n").filter((line) => line.startsWith("component ")).length;
    expect(components(modeler.exportText())).toBe(components(teaShop) + 1);

    await expect(log.reimport()).resolves.toBeDefined();
    expect(log.entries).toEqual(["drag.ended", "import.done", "settled"]);
    expect(modeler.exportText()).toBe(TEA_SHOP_WITHOUT_CUP);
    await settle();
    expect(errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(log.activeInListener()).toBe(true);
    expect(current.delivered).toEqual([true, false]);
    expectNoRemovedElementSelected(modeler);
    expect(
      diagramOf(modeler).get<WardleyLabelEditing>("wardleyLabelEditing").getActiveEdit(),
    ).toBeNull();
  });

  test("the name editor a create opens after its drop finds its element, and the echo keeps it open", async () => {
    const current = await session();
    const { modeler } = current;
    const diagram = diagramOf(modeler);
    const labelEditing = diagram.get<WardleyLabelEditing>("wardleyLabelEditing");
    const registry = diagram.get<ElementRegistry>("elementRegistry");
    const log = importFromChangeListener(current, () => modeler.exportText());
    const activate = labelEditing.activate.bind(labelEditing);
    labelEditing.activate = (element, options) => {
      log.entries.push(
        registry.get(element.id) === element ? "editor" : "editor on a removed shape",
      );
      activate(element, options);
    };
    select(modeler, shapeNamed(modeler, "Cup"));
    const held = await startGesture(modeler, "create");

    held.drop();
    const echo = log.reimport();
    expect(echo).toBeDefined();
    await echo;
    expect(log.entries.slice(0, 4)).toEqual(["drag.ended", "editor", "import.done", "editor"]);
    const created = registry.filter(
      (element) =>
        isWardleyShape(element) &&
        element.wardleyType === "component" &&
        !teaShop.includes(`component ${element.wardleyLabel} [`),
    );
    expect(created).toHaveLength(1);
    expect(labelEditing.getActiveEdit()?.elementId).toBe(created[0]!.id);
    expect(errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expectNoRemovedElementSelected(modeler);
  });

  test("a label drop, with an import without the shape the label names", async () => {
    const current = await session();
    const { modeler } = current;
    const log = importFromChangeListener(current, () => TEA_SHOP_WITHOUT_CUP);
    const label = graphicsOf(modeler, shapeNamed(modeler, "Cup").id).querySelector(
      ".wardley-label-handle",
    );
    if (!label) throw new Error("Cup has no label handle");
    const rect = label.getBoundingClientRect();
    const to = pressAndDrag(label, { x: rect.left + 4, y: rect.top + rect.height / 2 });
    mouse(document, "mouseup", to);
    expect(log.entries).toEqual([]);
    expect(modeler.exportText()).toContain("component Cup [0.73, 0.78] label [");

    await expect(log.reimport()).resolves.toBeDefined();
    expect(log.entries).toEqual(["import.done", "settled"]);
    expect(modeler.exportText()).toBe(TEA_SHOP_WITHOUT_CUP);
    expect(errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expectNoRemovedElementSelected(modeler);
  });

  test("an import called after the drop, while it settles, waits as well", async () => {
    const current = await session();
    const { modeler } = current;
    const held = await startGesture(modeler, "move");
    held.drop();
    let applied = false;
    const imported = modeler.importText(TEA_SHOP_WITHOUT_CUP).then((result) => {
      applied = true;
      return result;
    });
    await Promise.resolve();
    expect(applied).toBe(false);
    expect(modeler.exportText()).toMatch(/^component Cup \[/m);
    await imported;
    expect(modeler.exportText()).toBe(TEA_SHOP_WITHOUT_CUP);
  });

  test("an import without a drop applies at once", async () => {
    const current = await session();
    const { modeler } = current;
    const imported = modeler.importText(TEA_SHOP_WITHOUT_CUP);
    expect(modeler.exportText()).toBe(TEA_SHOP_WITHOUT_CUP);
    await imported;
  });

  test("a modeler destroyed while an import waits for a drop rejects the import", async () => {
    const current = await session();
    const { modeler } = current;
    const log = importFromChangeListener(current, () => TEA_SHOP_WITHOUT_CUP);
    const held = await startGesture(modeler, "move");
    held.drop();
    const waiting = log.reimport();
    modeler.destroy();
    await expect(waiting).rejects.toThrow(/destroyed/);
  });

  test("a host listener of interaction that throws stops neither the drop, the other listeners nor the waiting import", async () => {
    const current = await session();
    const { modeler } = current;
    const log = importFromChangeListener(current, () => TEA_SHOP_WITHOUT_CUP);
    const broken = new Error("a broken interaction listener");
    modeler.interaction.onChange(() => {
      throw broken;
    });
    const later: boolean[] = [];
    modeler.interaction.onChange((active) => later.push(active));
    select(modeler, shapeNamed(modeler, "Tea"));
    const held = await startGesture(modeler, "move");
    expect(modeler.interaction.active()).toBe(true);
    expect(later).toEqual([true]);

    held.drop();
    expect(log.entries).toEqual(["drag.ended"]);
    await expect(log.reimport()).resolves.toBeDefined();
    expect(log.entries).toEqual(["drag.ended", "import.done", "settled"]);
    expect(modeler.exportText()).toBe(TEA_SHOP_WITHOUT_CUP);
    expect(later).toEqual([true, false]);
    expect(current.delivered).toEqual([true, false]);
    expect(errors).toEqual([broken, broken]);

    const next = await startGesture(modeler, "create");
    next.drop();
    await settle();
    expect(later).toEqual([true, false, true, false]);
    await expect(modeler.importText(teaShop)).resolves.toBeDefined();
    expect(modeler.exportText()).toBe(teaShop);
  });

  test("a listener of the interaction event that throws still lets the waiting import run", async () => {
    const current = await session();
    const { modeler } = current;
    const log = importFromChangeListener(current, () => TEA_SHOP_WITHOUT_CUP);
    const broken = new Error("a broken event listener");
    diagramOf(modeler)
      .get<EventBus>("eventBus")
      .on(INTERACTION_CHANGED, (event: InteractionChangedEvent) => {
        if (!event.active) throw broken;
      });
    const held = await startGesture(modeler, "move");

    held.drop();
    expect(errors).toEqual([broken]);
    expect(modeler.interaction.active()).toBe(false);
    await expect(log.reimport()).resolves.toBeDefined();
    expect(modeler.exportText()).toBe(TEA_SHOP_WITHOUT_CUP);
    expect(current.delivered).toEqual([true, false]);
  });

  test("a drop whose cleanup throws still lets the waiting import run", async () => {
    const current = await session();
    const { modeler } = current;
    const diagram = diagramOf(modeler);
    const log = importFromChangeListener(current, () => TEA_SHOP_WITHOUT_CUP);
    diagram.get<EventBus>("eventBus").on("shape.move.cleanup", () => {
      throw new Error("a broken cleanup");
    });
    await startGesture(modeler, "move");

    // diagram-js rethrows the listener's error and never fires the drag's end.
    const release = new MouseEvent("mouseup", { bubbles: true, cancelable: true });
    expect(() => diagram.get<Dragging>("dragging").end(release)).toThrow("a broken cleanup");
    expect(log.entries).toEqual([]);
    expect(modeler.interaction.active()).toBe(true);

    await expect(log.reimport()).resolves.toBeDefined();
    expect(modeler.exportText()).toBe(TEA_SHOP_WITHOUT_CUP);
    expect(modeler.interaction.active()).toBe(false);
    expect(current.delivered).toEqual([true, false]);
  });
});
