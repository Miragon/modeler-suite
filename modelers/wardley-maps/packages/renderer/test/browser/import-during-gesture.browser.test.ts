import { afterEach, describe, expect, test } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement, Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  ROOT_ID,
  type CollaborativeWardleyModeler,
  type Modeler,
} from "../../src/index.js";
import type EvolutionGrid from "../../src/evolution-grid/EvolutionGrid.js";
import type WardleyDrawTool from "../../src/draw-tool/WardleyDrawTool.js";
import type WardleyLabelEditing from "../../src/label-editing/WardleyLabelEditing.js";
import { isWardleyShape, type WardleyShape } from "../../src/model/di-types.js";
import "../../src/assets/wardley.css";

// A host with a live sync (designIQ, the VS Code webview) imports a peer's text while the user may
// be in the middle of a gesture, and a host that echoes its own change back through its store
// imports from inside the change listener of the drop that made it.

const MAP = `title Gestures
component Kettle [0.5, 0.5]
component Water [0.3, 0.3]
component Cup [0.7, 0.2]
line [[0.85, 0.15], [0.9, 0.3], [0.8, 0.4]]
Kettle -> Water
`;

interface Point {
  x: number;
  y: number;
}

interface Mounted {
  modeler: CollaborativeWardleyModeler;
  host: HTMLElement;
  stopCollecting: () => void;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { modeler, host, stopCollecting } of mounted.splice(0)) {
    stopCollecting();
    modeler.destroy();
    host.remove();
  }
});

interface Session {
  modeler: CollaborativeWardleyModeler;
  diagram: Modeler;
  container: HTMLElement;
  pointer: Pointer;
  /** The map before any gesture or peer edit. */
  initial: string;
  /** Change events of the contract since the session started. */
  changes: () => number;
  /** Errors thrown out of the canvas's DOM listeners since the session started. */
  errors: unknown[];
}

async function session(): Promise<Session> {
  const host = document.createElement("div");
  host.style.cssText = "position: fixed; left: 0; top: 0; width: 1280px; height: 840px;";
  document.body.append(host);
  const modeler = createCollaborativeModeler();
  modeler.attachTo(host);
  const errors: unknown[] = [];
  const collect = (event: ErrorEvent) => errors.push(event.error ?? event.message);
  window.addEventListener("error", collect);
  mounted.push({
    modeler,
    host,
    stopCollecting: () => window.removeEventListener("error", collect),
  });
  await modeler.importText(MAP);
  expect(modeler.exportText()).toBe(MAP);
  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  const diagram = modeler.diagram as Modeler;
  return {
    modeler,
    diagram,
    container: diagram.get<Canvas>("canvas").getContainer(),
    pointer: new Pointer(diagram),
    initial: MAP,
    changes: () => changes,
    errors,
  };
}

/** The map with Cup moved: a peer's edit of an element the gesture does not hold. */
function peerMovesCup(current: Session): string {
  const moved = current.initial.replace("component Cup [0.7, 0.2]", "component Cup [0.65, 0.25]");
  if (moved === current.initial) throw new Error("the map lost the line of Cup");
  return moved;
}

/** The mouse as diagram-js sees it: presses on a target, then moves and releases on `document`. */
class Pointer {
  constructor(private readonly diagram: Modeler) {}

  private client(point: Point): MouseEventInit {
    const canvas = this.diagram.get<Canvas>("canvas");
    const rect = canvas.getContainer().getBoundingClientRect();
    const viewbox = canvas.viewbox();
    return {
      clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
      clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
    };
  }

  graphics(id: string): SVGElement {
    const graphics = this.diagram.get<ElementRegistry>("elementRegistry").getGraphics(id);
    if (!graphics) throw new Error(`no graphics for ${id}`);
    return graphics;
  }

  private svg(): SVGSVGElement {
    return this.diagram
      .get<Canvas>("canvas")
      .getContainer()
      .querySelector<SVGSVGElement>(":scope > svg")!;
  }

  press(target: EventTarget, at: Point, init: MouseEventInit = {}): void {
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...this.client(at),
        ...init,
      }),
    );
  }

  /** A pointer click on chrome outside the canvas, at the centre of `target`. */
  clickOn(target: HTMLElement): void {
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, button: 0, detail: 1, ...centreOf(target) }),
    );
  }

  /** The pointer enters the canvas: diagram-js takes a drop target from the hover events. */
  enter(): void {
    this.svg().dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  }

  moveTo(at: Point): void {
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, ...this.client(at) }));
  }

  releaseAt(at: Point): void {
    this.svg().dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, ...this.client(at) }),
    );
  }
}

function centreOf(target: Element): { clientX: number; clientY: number } {
  const rect = target.getBoundingClientRect();
  return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
}

function shapeNamed(diagram: Modeler, name: string): WardleyShape {
  const shape = diagram
    .get<ElementRegistry>("elementRegistry")
    .find((element) => isWardleyShape(element) && element.wardleyLabel === name);
  if (!shape) throw new Error(`the map has no ${name}`);
  return shape as WardleyShape;
}

/** The one component the session added to the map's Kettle, Water and Cup. */
function theCreatedComponent(diagram: Modeler): WardleyShape {
  const created = diagram
    .get<ElementRegistry>("elementRegistry")
    .filter(
      (element) =>
        isWardleyShape(element) &&
        element.wardleyType === "component" &&
        !["Kettle", "Water", "Cup"].includes(element.wardleyLabel ?? ""),
    );
  if (created.length !== 1)
    throw new Error(`expected one created component, found ${created.length}`);
  return created[0] as WardleyShape;
}

function theDrawing(diagram: Modeler): WardleyShape {
  const drawing = diagram
    .get<ElementRegistry>("elementRegistry")
    .find((element) => isWardleyShape(element) && element.wardleyType === "drawing");
  if (!drawing) throw new Error("the map has no drawing");
  return drawing as WardleyShape;
}

function middle(element: Shape): Point {
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
}

function at(diagram: Modeler, visibility: number, evolution: number): Point {
  return diagram.get<EvolutionGrid>("evolutionGrid").toCanvas({ evolution, visibility });
}

function paletteEntry(container: HTMLElement, action: string): HTMLElement {
  const entry = container.querySelector<HTMLElement>(
    `.djs-palette .entry[data-action="${action}"]`,
  );
  if (!entry) throw new Error(`the palette has no ${action} entry`);
  return entry;
}

const DRAG_PREVIEW = ".djs-drag-group, .djs-dragger, .djs-lasso-overlay";
const POINT_DRAG_PREVIEW = ".layer-wardley-drawing-handles :is(polyline, polygon)";

function expectNoReplacedElementSelected(diagram: Modeler): void {
  const registry = diagram.get<ElementRegistry>("elementRegistry");
  for (const selected of diagram.get<Selection>("selection").get() as DiagramElement[]) {
    expect(registry.get(selected.id)).toBe(selected);
  }
}

/** The command stack still reports the next edit: no command was left open. */
function expectTheNextEditReported(current: Session, before: number): void {
  current.diagram
    .get<Modeling>("modeling")
    .moveElements([shapeNamed(current.diagram, "Kettle") as unknown as Shape], { x: 12, y: 0 });
  expect(current.changes()).toBe(before + 1);
}

/**
 * A host that echoes every change back through its store (a CRDT observer that does not filter its
 * own origin) imports inside `onContentChanged`, while the drop that made the change still runs.
 */
function reimportOnFirstChange(current: Session): () => Promise<unknown> | undefined {
  let reimport: Promise<unknown> | undefined;
  current.modeler.onContentChanged(() => {
    reimport ??= current.modeler.importText(current.modeler.exportText());
  });
  return () => reimport;
}

/** The drop applied once and the re-import inside it left the drag finished and the canvas usable. */
async function expectTheDropKept(
  current: Session,
  reimport: Promise<unknown> | undefined,
): Promise<string> {
  const { modeler, diagram, container } = current;
  await expect(reimport).resolves.toBeDefined();
  expect(current.errors).toEqual([]);
  expect(current.changes()).toBe(1);
  const dropped = modeler.exportText();
  expect(dropped).not.toBe(current.initial);
  expect(diagram.get<Dragging>("dragging").context()).toBeFalsy();
  expect(container.querySelector(`${DRAG_PREVIEW}, ${POINT_DRAG_PREVIEW}`)).toBeNull();
  expectNoReplacedElementSelected(diagram);
  expectTheNextEditReported(current, 1);
  expect(modeler.exportText()).not.toBe(dropped);
  return dropped;
}

describe("an import from inside the change listener of a drop", () => {
  test("keeps the move the drop applied", async () => {
    const current = await session();
    const { diagram, pointer } = current;
    const reimport = reimportOnFirstChange(current);
    const water = shapeNamed(diagram, "Water");
    // Selected before the drag: diagram-js hands the drop the selection it took away at the start.
    diagram.get<Selection>("selection").select(water as unknown as DiagramElement);
    const start = middle(water as unknown as Shape);
    pointer.press(pointer.graphics(water.id), start);
    pointer.enter();
    pointer.moveTo({ x: start.x + 20, y: start.y });
    pointer.moveTo({ x: start.x + 60, y: start.y });
    pointer.releaseAt({ x: start.x + 60, y: start.y });

    const dropped = await expectTheDropKept(current, reimport());
    expect(dropped).not.toContain("component Water [0.3, 0.3]");
  });

  test("keeps the element a palette create dropped", async () => {
    const current = await session();
    const { container, pointer, diagram } = current;
    const reimport = reimportOnFirstChange(current);
    pointer.clickOn(paletteEntry(container, "create.component"));
    pointer.enter();
    const drop = at(diagram, 0.6, 0.85);
    pointer.moveTo({ x: drop.x - 40, y: drop.y });
    pointer.moveTo(drop);
    pointer.releaseAt(drop);

    const dropped = await expectTheDropKept(current, reimport());
    expect(dropped.split("\n").filter((line) => line.startsWith("component "))).toHaveLength(4);
    // The label editor a create opens after the drop would name the shape the import removed.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector(".wardley-label-input")).toBeNull();
    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(2);
  });

  test("keeps the point a drawing's handle dropped", async () => {
    const current = await session();
    const { container, diagram, pointer } = current;
    const reimport = reimportOnFirstChange(current);
    diagram.get<Selection>("selection").select(theDrawing(diagram) as unknown as DiagramElement);
    const first = at(diagram, 0.85, 0.15);
    pointer.press(container.querySelector(".wardley-drawing-handle")!, first);
    pointer.moveTo({ x: first.x + 30, y: first.y + 20 });
    pointer.releaseAt({ x: first.x + 30, y: first.y + 20 });

    await expectTheDropKept(current, reimport());
  });
});

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The three ways to create a component without a pointer, each opening the name editor at once. */
const KEYBOARD_CREATES: ReadonlyArray<readonly [string, (current: Session) => Promise<void>]> = [
  [
    "the palette entry with Enter",
    async ({ container }) => {
      const entry = paletteEntry(container, "create.component");
      entry.focus();
      entry.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    },
  ],
  [
    "the quick-create key C",
    async ({ container }) => {
      const svg = container.querySelector<SVGSVGElement>(":scope > svg")!;
      svg.focus();
      svg.dispatchEvent(
        new KeyboardEvent("keydown", { key: "c", bubbles: true, cancelable: true }),
      );
    },
  ],
  [
    "the context pad's append entry with Enter",
    async ({ diagram, container }) => {
      diagram
        .get<Selection>("selection")
        .select(shapeNamed(diagram, "Kettle") as unknown as DiagramElement);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const entry = container.querySelector<HTMLElement>(
        '.djs-context-pad.open .entry[data-action="append"]',
      );
      if (!entry) throw new Error("the context pad has no append entry");
      entry.focus();
      entry.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    },
  ],
];

describe("an import from inside the change listener of a create without a pointer", () => {
  test.each(KEYBOARD_CREATES)(
    "keeps the element %s created selected, with its name editor open",
    async (_, create) => {
      const current = await session();
      const { modeler, diagram, container } = current;
      const reimport = reimportOnFirstChange(current);
      const before = current.initial.split("\n").filter((line) => line.startsWith("component "));

      await create(current);

      await expect(reimport()).resolves.toBeDefined();
      await nextTask();
      expect(current.errors).toEqual([]);
      expect(current.changes()).toBe(1);
      const components = modeler
        .exportText()
        .split("\n")
        .filter((line) => line.startsWith("component "));
      expect(components).toHaveLength(before.length + 1);
      const created = theCreatedComponent(diagram);
      expect(diagram.get<Selection>("selection").get()).toEqual([created]);
      expectNoReplacedElementSelected(diagram);
      expect(diagram.get<WardleyLabelEditing>("wardleyLabelEditing").getActiveEdit()).toEqual({
        elementId: created.id,
        value: created.wardleyLabel,
        selection: { start: 0, end: created.wardleyLabel!.length },
      });

      const field = container.querySelector<HTMLTextAreaElement>(".wardley-label-input")!;
      expect(document.activeElement).toBe(field);
      field.value = "Tea";
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      expect(current.changes()).toBe(2);
      expect(modeler.exportText()).toContain("component Tea [");
      expect(container.querySelector(".wardley-label-input")).toBeNull();
      expectTheNextEditReported(current, 2);
    },
  );
});

describe("an import from inside the change listener of an edit", () => {
  test("runs once the edit has returned: the edit sees its own element", async () => {
    const current = await session();
    const { modeler, diagram } = current;
    const reimport = reimportOnFirstChange(current);
    const kettle = shapeNamed(diagram, "Kettle");
    diagram.get<Modeling>("modeling").moveElements([kettle as unknown as Shape], { x: 12, y: 0 });
    expect(diagram.get<ElementRegistry>("elementRegistry").get(kettle.id)).toBe(kettle);

    await expect(reimport()).resolves.toBeDefined();
    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(diagram.get<ElementRegistry>("elementRegistry").get(kettle.id)).not.toBe(kettle);
    expect(modeler.exportText()).not.toBe(current.initial);
  });

  test("rejects when the modeler is destroyed before the edit has returned", async () => {
    const current = await session();
    const { modeler, diagram } = current;
    const reimport = reimportOnFirstChange(current);
    diagram
      .get<Modeling>("modeling")
      .moveElements([shapeNamed(diagram, "Kettle") as unknown as Shape], { x: 12, y: 0 });
    modeler.destroy();

    await expect(reimport()).rejects.toThrow("The modeler was destroyed.");
    expect(current.errors).toEqual([]);
  });
});

describe("an import while the user drags a point of a drawing", () => {
  test("ends the point drag: the release changes no drawing", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    diagram.get<Selection>("selection").select(theDrawing(diagram) as unknown as DiagramElement);
    const first = at(diagram, 0.85, 0.15);
    pointer.press(container.querySelector(".wardley-drawing-handle")!, first);
    pointer.moveTo({ x: first.x + 30, y: first.y + 20 });
    expect(container.querySelector(POINT_DRAG_PREVIEW)).not.toBeNull();

    const imported = peerMovesCup(current);
    await modeler.importText(imported);
    expect(container.querySelector(POINT_DRAG_PREVIEW)).toBeNull();
    pointer.moveTo({ x: first.x + 60, y: first.y + 40 });
    pointer.releaseAt({ x: first.x + 60, y: first.y + 40 });

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(0);
    expect(modeler.exportText()).toBe(imported);
    expect(diagram.get<CommandStack>("commandStack").canUndo()).toBe(false);
    expect(container.querySelector(POINT_DRAG_PREVIEW)).toBeNull();
    expectNoReplacedElementSelected(diagram);
    expectTheNextEditReported(current, 0);
  });

  test("ends the point drag when its drawing is deleted mid-drag", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const drawing = theDrawing(diagram);
    diagram.get<Selection>("selection").select(drawing as unknown as DiagramElement);
    const first = at(diagram, 0.85, 0.15);
    pointer.press(container.querySelector(".wardley-drawing-handle")!, first);
    pointer.moveTo({ x: first.x + 30, y: first.y + 20 });

    diagram.get<Modeling>("modeling").removeElements([drawing as unknown as DiagramElement]);
    expect(current.changes()).toBe(1);
    pointer.moveTo({ x: first.x + 60, y: first.y + 40 });
    pointer.releaseAt({ x: first.x + 60, y: first.y + 40 });

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(container.querySelector(POINT_DRAG_PREVIEW)).toBeNull();
    diagram.get<CommandStack>("commandStack").undo();
    expect(modeler.exportText()).toBe(current.initial);
    expect(diagram.get<CommandStack>("commandStack").canUndo()).toBe(false);
  });
});

/** A key pressed on the canvas, which has the focus since the handle was pressed. */
function pressKeyOnCanvas(current: Session, init: KeyboardEventInit): void {
  const svg = current.container.querySelector<SVGSVGElement>(":scope > svg")!;
  svg.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

/** Presses the drawing's first handle and moves it: the point drag runs, its preview drawn. */
function startPointDrag(current: Session): Point {
  const { diagram, container, pointer } = current;
  diagram.get<Selection>("selection").select(theDrawing(diagram) as unknown as DiagramElement);
  const first = at(diagram, 0.85, 0.15);
  pointer.press(container.querySelector(".wardley-drawing-handle")!, first);
  pointer.moveTo({ x: first.x + 30, y: first.y + 20 });
  expect(container.querySelector(POINT_DRAG_PREVIEW)).not.toBeNull();
  return first;
}

describe("a command while the user drags a point of a drawing", () => {
  test("an undo ends the point drag: the release keeps the undone drawing and the redo", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const commandStack = diagram.get<CommandStack>("commandStack");
    diagram
      .get<Modeling>("modeling")
      .moveElements([theDrawing(diagram) as unknown as Shape], { x: 24, y: 0 });
    const moved = modeler.exportText();
    expect(moved).not.toBe(current.initial);
    const first = startPointDrag(current);

    pressKeyOnCanvas(current, { key: "z", ctrlKey: true });
    expect(current.changes()).toBe(2);
    expect(modeler.exportText()).toBe(current.initial);
    expect(container.querySelector(POINT_DRAG_PREVIEW)).toBeNull();
    pointer.moveTo({ x: first.x + 60, y: first.y + 40 });
    pointer.releaseAt({ x: first.x + 60, y: first.y + 40 });

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(2);
    expect(modeler.exportText()).toBe(current.initial);
    expect(container.querySelector(POINT_DRAG_PREVIEW)).toBeNull();
    expect(commandStack.canRedo()).toBe(true);
    commandStack.redo();
    expect(modeler.exportText()).toBe(moved);
  });

  test("an arrow-key nudge ends the point drag: the release keeps the nudged drawing", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const first = startPointDrag(current);

    pressKeyOnCanvas(current, { key: "ArrowRight" });
    expect(current.changes()).toBe(1);
    const nudged = modeler.exportText();
    expect(nudged).not.toBe(current.initial);
    expect(container.querySelector(POINT_DRAG_PREVIEW)).toBeNull();
    pointer.moveTo({ x: first.x + 60, y: first.y + 40 });
    pointer.releaseAt({ x: first.x + 60, y: first.y + 40 });

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(modeler.exportText()).toBe(nudged);
    expect(container.querySelector(POINT_DRAG_PREVIEW)).toBeNull();
    diagram.get<CommandStack>("commandStack").undo();
    expect(modeler.exportText()).toBe(current.initial);
  });

  test("its own release still commits the dragged point as one step", async () => {
    const current = await session();
    const { modeler, diagram, pointer } = current;
    const first = startPointDrag(current);
    pointer.releaseAt({ x: first.x + 30, y: first.y + 20 });

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(modeler.exportText()).not.toBe(current.initial);
    diagram.get<CommandStack>("commandStack").undo();
    expect(modeler.exportText()).toBe(current.initial);
  });
});

/** The armed lasso tool's next press and drag: a frame around Water only. */
function lassoAroundWater(current: Session): void {
  const { diagram, pointer } = current;
  const from = at(diagram, 0.38, 0.22);
  const to = at(diagram, 0.22, 0.38);
  pointer.press(pointer.graphics(ROOT_ID), from);
  pointer.moveTo({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  pointer.moveTo(to);
  pointer.releaseAt(to);
}

function draggingPrefix(diagram: Modeler): string | undefined {
  return (diagram.get<Dragging>("dragging").context() as { prefix?: string } | null)?.prefix;
}

describe("an import while a palette tool only waits for its press", () => {
  test("leaves the lasso tool armed, and its next drag selects the imported elements", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const lassoEntry = paletteEntry(container, "lasso-tool");
    pointer.clickOn(lassoEntry);
    pointer.enter();
    pointer.moveTo(at(diagram, 0.95, 0.05));

    const imported = peerMovesCup(current);
    await modeler.importText(imported);
    expect(draggingPrefix(diagram)).toBe("lasso.selection");
    expect(lassoEntry.classList.contains("highlighted-entry")).toBe(true);

    lassoAroundWater(current);

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(0);
    expect(modeler.exportText()).toBe(imported);
    expect(modeler.elements.selection()).toEqual([shapeNamed(diagram, "Water").id]);
    expectNoReplacedElementSelected(diagram);
    expect(lassoEntry.classList.contains("highlighted-entry")).toBe(false);
  });

  test("leaves the lasso tool that L armed armed, and its next drag selects", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    pointer.enter();
    pointer.moveTo(at(diagram, 0.95, 0.05));
    const svg = container.querySelector<SVGSVGElement>(":scope > svg")!;
    svg.focus();
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "l", bubbles: true, cancelable: true }));
    expect(draggingPrefix(diagram)).toBe("lasso.selection");

    const imported = peerMovesCup(current);
    await modeler.importText(imported);
    expect(draggingPrefix(diagram)).toBe("lasso.selection");

    lassoAroundWater(current);

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(0);
    expect(modeler.exportText()).toBe(imported);
    expect(modeler.elements.selection()).toEqual([shapeNamed(diagram, "Water").id]);
  });

  test("leaves the draw tool armed, and its next line lands on the imported map", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const drawEntry = paletteEntry(container, "draw-tool");
    pointer.clickOn(drawEntry);
    const drawTool = diagram.get<WardleyDrawTool>("wardleyDrawTool");
    expect(drawTool.isActive()).toBe(true);

    const imported = peerMovesCup(current);
    await modeler.importText(imported);
    expect(drawTool.isActive()).toBe(true);
    expect(drawEntry.classList.contains("highlighted-entry")).toBe(true);

    const svg = container.querySelector<SVGSVGElement>(":scope > svg")!;
    const points = [at(diagram, 0.6, 0.6), at(diagram, 0.5, 0.7), at(diagram, 0.5, 0.7)];
    for (const point of points) pointer.press(svg, point);

    expect(current.errors).toEqual([]);
    expect(drawTool.isActive()).toBe(false);
    expect(current.changes()).toBe(1);
    const lines = modeler.exportText().split("\n");
    expect(lines.filter((line) => line.startsWith("line "))).toHaveLength(2);
    expect(lines.find((line) => line.startsWith("component Cup "))).toBe(
      "component Cup [0.65, 0.25]",
    );
  });
});
