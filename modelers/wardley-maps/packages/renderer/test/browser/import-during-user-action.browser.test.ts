import { afterEach, describe, expect, test } from "vitest";
import type { ImportResult } from "@miragon/modeler-api";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement, Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  type CollaborativeWardleyModeler,
  type Modeler,
} from "../../src/index.js";
import type EvolutionGrid from "../../src/evolution-grid/EvolutionGrid.js";
import type WardleyInteraction from "../../src/interaction/WardleyInteraction.js";
import type WardleyLabelEditing from "../../src/label-editing/WardleyLabelEditing.js";
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyShape,
} from "../../src/model/di-types.js";
import {
  canvasSvgOf,
  centreOf,
  clickEntry,
  clientAt,
  enterCanvas,
  graphicsOf,
  mouse,
  paletteEntry,
  shapeNamed,
  type Point,
} from "./support/gesture-harness.js";
import "../../src/assets/wardley.css";

// Dominik's decision on #285 and #305 generalises #248: an `importText` called while a user's
// action runs waits until the action has finished, together with the steps it defers, and its
// Promise settles after that import. A host that echoes its own change back through its store
// imports from the change listener of the action. The drops are pinned in
// interaction.browser.test.ts, the three creates without a pointer under one echo in
// import-during-gesture.browser.test.ts; this file holds the click append, the keyboard creates
// under a host that echoes every change, the saves of a name editor, the presses that save one,
// the listeners a command calls while it runs, and the selection listener at a drag's start (#336).

const MAP = `title Actions
component Kettle [0.5, 0.5]
component Water [0.3, 0.3]
component Cup [0.7, 0.2]
evolve Cup 0.6
Kettle -> Water
`;

/** A peer's edit of an element the user's action does not hold. */
const PEER_MAP = MAP.replace("component Kettle [0.5, 0.5]", "component Kettle [0.55, 0.45]");

interface Session {
  modeler: CollaborativeWardleyModeler;
  diagram: Modeler;
  svg: SVGSVGElement;
  labelEditing: WardleyLabelEditing;
  /** Change events of the contract since the session started. */
  changes: () => number;
  /** Errors thrown out of the canvas's DOM listeners since the session started. */
  errors: unknown[];
  /** In order: each name editor that opened (on a live or a removed shape) and each import. */
  log: string[];
  /** Every value `interaction.onChange` delivered. */
  delivered: boolean[];
}

const mounted: Array<{
  modeler: CollaborativeWardleyModeler;
  host: HTMLElement;
  stop: () => void;
}> = [];

afterEach(() => {
  for (const { modeler, host, stop } of mounted.splice(0)) {
    stop();
    modeler.destroy();
    host.remove();
  }
});

async function session(text: string = MAP): Promise<Session> {
  const host = document.createElement("div");
  host.style.cssText = "position: fixed; left: 0; top: 0; width: 1280px; height: 840px;";
  document.body.append(host);
  const modeler = createCollaborativeModeler();
  modeler.attachTo(host);
  const errors: unknown[] = [];
  const collect = (event: ErrorEvent) => errors.push(event.error ?? event.message);
  window.addEventListener("error", collect);
  mounted.push({ modeler, host, stop: () => window.removeEventListener("error", collect) });
  await modeler.importText(text);
  expect(modeler.exportText()).toBe(text);

  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  const diagram = modeler.diagram as Modeler;
  const registry = diagram.get<ElementRegistry>("elementRegistry");
  const labelEditing = diagram.get<WardleyLabelEditing>("wardleyLabelEditing");
  const log: string[] = [];
  const activate = labelEditing.activate.bind(labelEditing);
  labelEditing.activate = (element, options) => {
    log.push(registry.get(element.id) === element ? "editor" : "editor on a removed shape");
    activate(element, options);
  };
  diagram.get<EventBus>("eventBus").on("import.done", () => log.push("import"));
  const delivered: boolean[] = [];
  modeler.interaction.onChange((active) => delivered.push(active));
  return {
    modeler,
    diagram,
    svg: canvasSvgOf(modeler),
    labelEditing,
    changes: () => changes,
    errors,
    log,
    delivered,
  };
}

interface Echo {
  /** The import of the first change's text, called inside its change listener. */
  reimport: () => Promise<ImportResult> | undefined;
  /** Whether the import has settled. */
  settled: () => boolean;
}

/** The host of the reproductions in #285 and #305: it echoes the first change it hears of. */
function echoFirstChange({ modeler }: Session): Echo {
  let reimport: Promise<ImportResult> | undefined;
  let settled = false;
  modeler.onContentChanged(() => {
    reimport ??= modeler.importText(modeler.exportText()).finally(() => (settled = true));
  });
  return { reimport: () => reimport, settled: () => settled };
}

/** A host whose store echoes every change: each change listener imports the new text. */
function echoEveryChange({ modeler }: Session): {
  started: () => number;
  settled: () => Promise<unknown>;
} {
  const imports: Promise<ImportResult>[] = [];
  modeler.onContentChanged(() => imports.push(modeler.importText(modeler.exportText())));
  return { started: () => imports.length, settled: () => Promise.all(imports) };
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function registryOf(current: Session): ElementRegistry {
  return current.diagram.get<ElementRegistry>("elementRegistry");
}

/** Whether each shape is still the one the map holds under its id: no import has replaced it. */
function onTheMap(current: Session, ...shapes: WardleyShape[]): boolean {
  return shapes.every((shape) => registryOf(current).get(shape.id) === shape);
}

function middleOf(current: Session, shape: WardleyShape): Point {
  return clientAt(current.modeler, { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 });
}

function gridPoint(current: Session, visibility: number, evolution: number): Point {
  return clientAt(
    current.modeler,
    current.diagram.get<EvolutionGrid>("evolutionGrid").toCanvas({ evolution, visibility }),
  );
}

function select(current: Session, element: unknown): void {
  current.diagram.get<Selection>("selection").select(element as DiagramElement);
}

function selected(current: Session): unknown[] {
  return current.diagram.get<Selection>("selection").get();
}

function nameField(): HTMLTextAreaElement | HTMLInputElement | null {
  return document.querySelector<HTMLTextAreaElement | HTMLInputElement>(".wardley-label-input");
}

/** Opens the name editor of `name` the way a double click does, and types `typed` into it. */
function typeName(current: Session, name: string, typed: string): HTMLElement {
  const shape = shapeNamed(current.modeler, name);
  select(current, shape);
  mouse(graphicsOf(current.modeler, shape.id), "dblclick", middleOf(current, shape));
  return typeInto(typed);
}

function typeInto(typed: string): HTMLElement {
  const field = nameField();
  if (!field) throw new Error("no name editor is open");
  field.value = typed;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return field;
}

function pressKey(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function linesOf(text: string, start: string): string[] {
  return text.split("\n").filter((line) => line.startsWith(start));
}

/** The shape the session added to the map, the one whose name the map did not have. */
function theCreatedShape(current: Session): WardleyShape {
  const created = registryOf(current).filter(
    (element) =>
      isWardleyShape(element) &&
      !["Kettle", "Water", "Cup", ""].includes(element.wardleyLabel ?? ""),
  );
  if (created.length !== 1) throw new Error(`expected one created shape, found ${created.length}`);
  return created[0] as WardleyShape;
}

/** The command stack still reports the next edit: no command was left open. */
function expectTheNextEditReported(current: Session): void {
  const before = current.changes();
  current.diagram
    .get<Modeling>("modeling")
    .moveElements([shapeNamed(current.modeler, "Cup") as unknown as Shape], { x: 12, y: 0 });
  expect(current.changes()).toBe(before + 1);
}

function expectTheActionFinishedCleanly(current: Session): void {
  expect(current.errors).toEqual([]);
  expect(current.log).not.toContain("editor on a removed shape");
  expect(current.diagram.get<Dragging>("dragging").context()).toBeFalsy();
  expect(current.modeler.interaction.active()).toBe(false);
  const registry = registryOf(current);
  for (const element of selected(current) as DiagramElement[]) {
    expect(registry.get(element.id)).toBe(element);
  }
  expectTheNextEditReported(current);
}

/** Selects the shape `name` and waits for the `action` entry of its context pad. */
async function contextPadEntry(
  current: Session,
  name: string,
  action: string,
): Promise<HTMLElement> {
  const shape = shapeNamed(current.modeler, name);
  select(current, shape);
  await nextFrame();
  const entry = current.diagram
    .get<ContextPad>("contextPad")
    .getPad(shape as unknown as DiagramElement)
    .html.querySelector<HTMLElement>(`.entry[data-action="${action}"]`);
  if (!entry) throw new Error(`the context pad of ${name} has no ${action} entry`);
  return entry;
}

/** Selects Kettle and waits for its context pad. */
function appendEntryOfKettle(current: Session): Promise<HTMLElement> {
  return contextPadEntry(current, "Kettle", "append");
}

/** A pointer click on the context pad's append entry, then a click where the component goes. */
async function appendWithClicks(current: Session): Promise<void> {
  const entry = await appendEntryOfKettle(current);
  mouse(entry, "click", centreOf(entry), { detail: 1 });
  enterCanvas(current.modeler);
  const place = gridPoint(current, 0.35, 0.75);
  mouse(document, "mousemove", { x: place.x - 20, y: place.y });
  mouse(document, "mousemove", place);
  mouse(current.svg, "mouseup", place);
}

describe("an import from the change listener of a click append (#285)", () => {
  test("waits for the name editor the append opens a task after its drop, then reopens it on the appended component", async () => {
    const current = await session();
    const { modeler } = current;
    const echo = echoFirstChange(current);

    await appendWithClicks(current);
    expect(current.changes()).toBe(1);
    expect(echo.reimport()).toBeDefined();
    expect(current.log).toEqual([]);

    await expect(echo.reimport()).resolves.toBeDefined();
    expect(current.log).toEqual(["editor", "import", "editor"]);
    const appended = theCreatedShape(current);
    expect(current.labelEditing.getActiveEdit()?.elementId).toBe(appended.id);
    expect(document.activeElement).toBe(nameField());

    pressKey(typeInto("Teapot"), "Enter");
    expect(current.changes()).toBe(2);
    const exported = modeler.exportText();
    expect(linesOf(exported, "component Teapot [")).toHaveLength(1);
    expect(exported).toContain("Kettle -> Teapot\n");
    expect(current.delivered).toEqual([true, false]);
    expectTheActionFinishedCleanly(current);
  });

  test("keeps the name typed after it, with a host that echoes every change", async () => {
    const current = await session();
    const { modeler } = current;
    const echo = echoEveryChange(current);

    await appendWithClicks(current);
    await echo.settled();
    pressKey(typeInto("Teapot"), "Enter");
    await echo.settled();

    expect(echo.started()).toBe(2);
    expect(current.changes()).toBe(2);
    expect(modeler.exportText()).toContain("Kettle -> Teapot\n");
    expect(modeler.elements.selection()).toEqual(["cmp_teapot"]);
    expect(current.labelEditing.getActiveEdit()).toBeNull();
    expectTheActionFinishedCleanly(current);
  });
});

/** The ways to create a named element without a pointer, each opening its name editor at once. */
const KEYBOARD_CREATES: ReadonlyArray<
  readonly [string, string, (current: Session) => Promise<void>]
> = [
  [
    "the palette entry with Enter",
    "component",
    async ({ modeler }) => {
      const entry = paletteEntry(modeler, "create.component");
      entry.focus();
      pressKey(entry, "Enter");
    },
  ],
  [
    "the palette entry with Space",
    "pipeline",
    async ({ modeler }) => {
      const entry = paletteEntry(modeler, "create.pipeline");
      entry.focus();
      pressKey(entry, " ");
    },
  ],
  [
    "the quick-create key U",
    "anchor",
    async ({ svg }) => {
      svg.focus();
      pressKey(svg, "u");
    },
  ],
  [
    "the context pad's append entry with Enter",
    "component",
    async (current) => {
      const entry = await appendEntryOfKettle(current);
      entry.focus();
      pressKey(entry, "Enter");
    },
  ],
];

describe("an import from the change listener of a keyboard create (#285, #305)", () => {
  test.each(KEYBOARD_CREATES)(
    "%s keeps the typed name, with a host that echoes every change",
    async (_, type, create) => {
      const current = await session();
      const { modeler } = current;
      const echo = echoEveryChange(current);

      await create(current);
      expect(current.changes()).toBe(1);
      const created = theCreatedShape(current);
      expect(onTheMap(current, created)).toBe(true);
      expect(selected(current)).toEqual([created]);
      expect(current.labelEditing.getActiveEdit()?.elementId).toBe(created.id);
      await echo.settled();
      expect(current.log).toEqual(["editor", "import", "editor"]);

      pressKey(typeInto("Teapot"), "Enter");
      await echo.settled();

      expect(echo.started()).toBe(2);
      expect(current.changes()).toBe(2);
      expect(linesOf(modeler.exportText(), `${type} Teapot [`)).toHaveLength(1);
      expect(selected(current)).toEqual([shapeNamed(modeler, "Teapot")]);
      expect(current.labelEditing.getActiveEdit()).toBeNull();
      expectTheActionFinishedCleanly(current);
    },
  );

  test("waits as well when the host imports from the selection listener the create calls", async () => {
    const current = await session();
    const { modeler } = current;
    let reimport: Promise<ImportResult> | undefined;
    modeler.elements.onSelection(() => {
      reimport ??= modeler.importText(modeler.exportText());
    });

    const entry = paletteEntry(modeler, "create.component");
    entry.focus();
    pressKey(entry, "Enter");
    const created = theCreatedShape(current);
    expect(reimport).toBeDefined();
    expect(onTheMap(current, created)).toBe(true);
    expect(current.labelEditing.getActiveEdit()?.elementId).toBe(created.id);

    await expect(reimport).resolves.toBeDefined();
    expect(current.log).toEqual(["editor", "import", "editor"]);
    const echoed = theCreatedShape(current);
    expect(echoed).not.toBe(created);
    expect(selected(current)).toEqual([echoed]);
    expect(current.labelEditing.getActiveEdit()?.elementId).toBe(echoed.id);
    pressKey(typeInto("Teapot"), "Enter");
    expect(current.changes()).toBe(2);
    expect(modeler.exportText()).toContain("component Teapot [");
    expectTheActionFinishedCleanly(current);
  });
});

describe("an import from the change listener of a name editor's save", () => {
  test("with Enter runs once the save has returned: the renamed element keeps the selection, its context pad and the canvas the focus", async () => {
    const current = await session();
    const { modeler, diagram, svg } = current;
    const echo = echoFirstChange(current);
    const kettle = shapeNamed(modeler, "Kettle");
    const field = typeName(current, "Kettle", "Teapot");

    pressKey(field, "Enter");
    expect(current.changes()).toBe(1);
    expect(echo.reimport()).toBeDefined();
    expect(onTheMap(current, kettle)).toBe(true);
    await expect(echo.reimport()).resolves.toBeDefined();
    await nextFrame();

    expect(modeler.exportText()).toBe(MAP.replaceAll("Kettle", "Teapot"));
    const teapot = shapeNamed(modeler, "Teapot");
    expect(teapot).not.toBe(kettle);
    expect(selected(current)).toEqual([teapot]);
    expect(diagram.get<ContextPad>("contextPad").isOpen(teapot as unknown as DiagramElement)).toBe(
      true,
    );
    expect(document.activeElement).toBe(svg);
    expect(current.labelEditing.getActiveEdit()).toBeNull();
    expect(current.changes()).toBe(1);
    expectTheActionFinishedCleanly(current);
  });

  test("on blur keeps the saved name and the selection", async () => {
    const current = await session();
    const { modeler } = current;
    const echo = echoFirstChange(current);
    const field = typeName(current, "Kettle", "Teapot");

    field.blur();
    expect(current.changes()).toBe(1);
    await expect(echo.reimport()).resolves.toBeDefined();

    expect(modeler.exportText()).toBe(MAP.replaceAll("Kettle", "Teapot"));
    expect(modeler.elements.selection()).toEqual(["cmp_teapot"]);
    expect(current.labelEditing.getActiveEdit()).toBeNull();
    expect(current.changes()).toBe(1);
    expectTheActionFinishedCleanly(current);
  });

  test("of a link's annotation with Enter keeps the annotation", async () => {
    const current = await session();
    const { modeler } = current;
    const echo = echoFirstChange(current);
    const link = registryOf(current).find(isWardleyConnection);
    if (!link) throw new Error("the map has no link");
    mouse(graphicsOf(modeler, link.id), "dblclick", centreOf(graphicsOf(modeler, link.id)));

    pressKey(typeInto("heats"), "Enter");
    expect(current.changes()).toBe(1);
    await expect(echo.reimport()).resolves.toBeDefined();

    expect(modeler.exportText()).toContain("Kettle -> Water; heats\n");
    expect(current.labelEditing.getActiveEdit()).toBeNull();
    expect(current.changes()).toBe(1);
    expectTheActionFinishedCleanly(current);
  });
});

/** Presses `target` at `from` and leaves the pointer there, as the press's own handler does. */
function press(target: EventTarget, from: Point): void {
  mouse(target, "mousedown", from);
}

/** Moves the pointer past the drag threshold, 60 px right of `from`, and releases it there. */
function dragOnAndRelease(current: Session, from: Point, releaseOn: EventTarget = document): void {
  enterCanvas(current.modeler);
  mouse(document, "mousemove", { x: from.x + 20, y: from.y });
  mouse(document, "mousemove", { x: from.x + 60, y: from.y });
  mouse(releaseOn, "mouseup", { x: from.x + 60, y: from.y });
}

const RENAMED = MAP.replaceAll("Kettle", "Teapot");

describe("an import from the change listener of the save a press makes", () => {
  test("on another component runs once the press has been handled, and ends the move the press started", async () => {
    const current = await session();
    const { modeler } = current;
    const echo = echoFirstChange(current);
    const water = shapeNamed(modeler, "Water");
    const from = middleOf(current, water);
    typeName(current, "Kettle", "Teapot");

    press(graphicsOf(modeler, water.id), from);
    expect(current.changes()).toBe(1);
    expect(echo.reimport()).toBeDefined();
    expect(onTheMap(current, water)).toBe(true);
    await expect(echo.reimport()).resolves.toBeDefined();
    dragOnAndRelease(current, from);

    expect(modeler.exportText()).toBe(RENAMED);
    expect(current.changes()).toBe(1);
    expect(current.delivered).toEqual([]);
    expectTheActionFinishedCleanly(current);

    const echoed = shapeNamed(modeler, "Water");
    press(graphicsOf(modeler, echoed.id), from);
    dragOnAndRelease(current, from, current.svg);
    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(3);
    expect(linesOf(modeler.exportText(), "component Water [")).not.toEqual([
      "component Water [0.3, 0.3]",
    ]);
  });

  test("with a pointer click on a palette entry runs after the click, and ends the create the click started", async () => {
    const current = await session();
    const { modeler } = current;
    const echo = echoFirstChange(current);
    typeName(current, "Kettle", "Teapot");

    clickEntry(paletteEntry(modeler, "create.component"));
    expect(current.changes()).toBe(1);
    expect(echo.reimport()).toBeDefined();
    expect(modeler.interaction.active()).toBe(true);
    await expect(echo.reimport()).resolves.toBeDefined();
    expect(modeler.interaction.active()).toBe(false);
    const place = gridPoint(current, 0.35, 0.75);
    dragOnAndRelease(current, place, current.svg);
    await nextTask();

    expect(modeler.exportText()).toBe(RENAMED);
    expect(current.changes()).toBe(1);
    expect(current.delivered).toEqual([true, false]);
    expect(current.labelEditing.getActiveEdit()).toBeNull();
    expectTheActionFinishedCleanly(current);

    clickEntry(paletteEntry(modeler, "create.component"));
    dragOnAndRelease(current, place, current.svg);
    await nextTask();
    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(3);
    expect(linesOf(modeler.exportText(), "component ")).toHaveLength(4);
    expect(current.labelEditing.getActiveEdit()?.elementId).toBe(
      shapeNamed(modeler, "Component").id,
    );
  });

  test("on a component's label runs once the press has been handled, and ends the label drag", async () => {
    const current = await session();
    const { modeler } = current;
    const echo = echoFirstChange(current);
    const water = shapeNamed(modeler, "Water");
    const label = graphicsOf(modeler, water.id).querySelector(".wardley-label-handle");
    if (!label) throw new Error("Water has no label handle");
    const rect = label.getBoundingClientRect();
    const from = { x: rect.left + 4, y: rect.top + rect.height / 2 };
    typeName(current, "Kettle", "Teapot");

    press(label, from);
    expect(current.changes()).toBe(1);
    expect(onTheMap(current, water)).toBe(true);
    await expect(echo.reimport()).resolves.toBeDefined();
    dragOnAndRelease(current, from);

    expect(modeler.exportText()).toBe(RENAMED);
    expect(current.changes()).toBe(1);
    expect(current.delivered).toEqual([]);
    expectTheActionFinishedCleanly(current);
  });

  test("on a component's evolve target runs once the press has been handled, and ends its drag", async () => {
    const current = await session();
    const { modeler } = current;
    const echo = echoFirstChange(current);
    const cup = shapeNamed(modeler, "Cup");
    const handle = graphicsOf(modeler, cup.id).querySelector(".wardley-evolve-handle");
    if (!handle) throw new Error("Cup has no evolve target");
    const from = centreOf(handle);
    typeName(current, "Kettle", "Teapot");

    press(handle, from);
    expect(current.changes()).toBe(1);
    expect(onTheMap(current, cup)).toBe(true);
    await expect(echo.reimport()).resolves.toBeDefined();
    dragOnAndRelease(current, from);

    expect(modeler.exportText()).toBe(RENAMED);
    expect(current.changes()).toBe(1);
    expect(current.delivered).toEqual([]);
    expectTheActionFinishedCleanly(current);
  });
});

function commandStackOf(current: Session): CommandStack {
  return current.diagram.get<CommandStack>("commandStack");
}

/** A host that imports `text` from the first selection change it hears of. */
function importOnFirstSelection(
  current: Session,
  text: string,
): () => Promise<ImportResult> | undefined {
  let reimport: Promise<ImportResult> | undefined;
  current.modeler.elements.onSelection(() => {
    reimport ??= current.modeler.importText(text);
  });
  return () => reimport;
}

/** Lets the setup's own commands finish, so that only the command under test can hold the import. */
async function untilNoActionRuns(current: Session): Promise<void> {
  await nextTask();
  const interaction = current.diagram.get<WardleyInteraction>("wardleyInteraction");
  expect(interaction.afterUserAction()).toBeUndefined();
}

/** The history was cleared by the import and still records: one undo, then nothing to undo. */
function expectAFreshHistory(current: Session, imported: string): void {
  expectTheNextEditReported(current);
  const commandStack = commandStackOf(current);
  commandStack.undo();
  expect(current.modeler.exportText()).toBe(imported);
  expect(commandStack.canUndo()).toBe(false);
}

describe("an import from a listener a command calls while it runs waits until the command has returned", () => {
  test("a delete of a selected component, whose removal deselects it", async () => {
    const current = await session();
    const { modeler, svg } = current;
    const water = shapeNamed(modeler, "Water");
    select(current, water);
    const reimport = importOnFirstSelection(current, PEER_MAP);

    svg.focus();
    pressKey(svg, "Delete");
    expect(reimport()).toBeDefined();
    expect(modeler.exportText()).not.toContain("component Water [");
    await expect(reimport()).resolves.toBeDefined();

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(modeler.exportText()).toBe(PEER_MAP);
    expectAFreshHistory(current, PEER_MAP);
  });

  test("an undo of a create, which deselects the component it removes", async () => {
    const current = await session();
    const { modeler } = current;
    const entry = paletteEntry(modeler, "create.component");
    entry.focus();
    pressKey(entry, "Enter");
    current.labelEditing.cancel();
    expect(selected(current)).toEqual([theCreatedShape(current)]);
    await untilNoActionRuns(current);
    const reimport = importOnFirstSelection(current, PEER_MAP);

    commandStackOf(current).undo();
    expect(reimport()).toBeDefined();
    expect(modeler.exportText()).toBe(MAP);
    await expect(reimport()).resolves.toBeDefined();

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(2);
    expect(modeler.exportText()).toBe(PEER_MAP);
    expectAFreshHistory(current, PEER_MAP);
  });

  test("a redo of a delete, which deselects the component it removes", async () => {
    const current = await session();
    const { modeler } = current;
    const commandStack = commandStackOf(current);
    current.diagram
      .get<Modeling>("modeling")
      .removeElements([shapeNamed(modeler, "Water") as unknown as DiagramElement]);
    commandStack.undo();
    select(current, shapeNamed(modeler, "Water"));
    await untilNoActionRuns(current);
    const reimport = importOnFirstSelection(current, PEER_MAP);

    commandStack.redo();
    expect(reimport()).toBeDefined();
    expect(modeler.exportText()).not.toContain("component Water [");
    await expect(reimport()).resolves.toBeDefined();

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(3);
    expect(modeler.exportText()).toBe(PEER_MAP);
    expectAFreshHistory(current, PEER_MAP);
  });
});

/** The session's map with a region to resize. */
const DRAG_MAP = MAP.replace("evolve Cup 0.6", "pioneers [0.98, 0.05, 0.75, 0.3]\nevolve Cup 0.6");

const DRAG_PEER_MAP = DRAG_MAP.replace(
  "component Kettle [0.5, 0.5]",
  "component Kettle [0.55, 0.45]",
);

interface DragSteps {
  /** The input that makes diagram-js activate the drag, which clears the selection. */
  activate: () => void;
  /** Moves the pointer on to where the drop would apply, and releases it there. */
  release: () => void;
}

/** Moves the pointer 60 px right of `from` and releases it on the canvas there. */
function releaseRightOf(current: Session, from: Point): () => void {
  return () => {
    const to = { x: from.x + 60, y: from.y };
    mouse(document, "mousemove", to);
    mouse(current.svg, "mouseup", to);
  };
}

/** Presses `target` at `from` and moves the pointer 20 px right, past the drag threshold. */
function pressAndPassTheThreshold(current: Session, target: EventTarget, from: Point): void {
  press(target, from);
  enterCanvas(current.modeler);
  mouse(document, "mousemove", { x: from.x + 20, y: from.y });
}

/** A click on a context pad entry, then a move of the pointer onto the canvas. */
async function startFromTheContextPad(
  current: Session,
  name: string,
  action: string,
): Promise<DragSteps> {
  const entry = await contextPadEntry(current, name, action);
  const from = centreOf(entry);
  return {
    activate: () => {
      mouse(entry, "click", from, { detail: 1 });
      enterCanvas(current.modeler);
      mouse(document, "mousemove", { x: from.x + 20, y: from.y + 20 });
    },
    release: releaseRightOf(current, { x: from.x + 20, y: from.y + 20 }),
  };
}

/** A key on the canvas, with the pointer over it, that starts a drag at the pointer. */
function startWithAKey(current: Session, key: string, at: Point): DragSteps {
  mouse(current.svg, "mousemove", at);
  return {
    activate: () => {
      current.svg.focus();
      pressKey(current.svg, key);
    },
    release: releaseRightOf(current, at),
  };
}

// Each starts while an element is selected: diagram-js's Dragging.move fires the drag's start,
// clears the selection and goes on with the drag.
const DRAGS_THAT_CLEAR_THE_SELECTION: ReadonlyArray<
  readonly [string, (current: Session) => Promise<DragSteps>]
> = [
  [
    "a move of a component past the drag threshold",
    async (current) => {
      select(current, shapeNamed(current.modeler, "Kettle"));
      const water = shapeNamed(current.modeler, "Water");
      const from = middleOf(current, water);
      return {
        activate: () =>
          pressAndPassTheThreshold(current, graphicsOf(current.modeler, water.id), from),
        release: releaseRightOf(current, { x: from.x + 20, y: from.y }),
      };
    },
  ],
  [
    "a resize of a region",
    async (current) => {
      const region = registryOf(current).find(
        (element) => isWardleyShape(element) && element.wardleyType === "attitude",
      );
      select(current, region);
      const handle = current.svg.querySelector(".djs-resizer-se .djs-resizer-hit");
      if (!handle) throw new Error("the region has no resize handle");
      const from = centreOf(handle);
      return {
        activate: () => pressAndPassTheThreshold(current, handle, from),
        release: releaseRightOf(current, { x: from.x + 20, y: from.y }),
      };
    },
  ],
  [
    "a create from the palette, which a pointer click activates at once",
    async (current) => {
      select(current, shapeNamed(current.modeler, "Kettle"));
      const entry = paletteEntry(current.modeler, "create.component");
      const place = gridPoint(current, 0.35, 0.75);
      return {
        activate: () => clickEntry(entry),
        release: () => {
          enterCanvas(current.modeler);
          mouse(document, "mousemove", place);
          mouse(current.svg, "mouseup", place);
        },
      };
    },
  ],
  [
    "an append from the context pad",
    (current) => startFromTheContextPad(current, "Kettle", "append"),
  ],
  [
    "a connect from the context pad",
    (current) => startFromTheContextPad(current, "Kettle", "connect"),
  ],
  [
    "the evolve placement of the context pad",
    (current) => startFromTheContextPad(current, "Kettle", "evolve"),
  ],
  [
    "a create the quick-create key C starts at the pointer",
    async (current) => {
      select(current, shapeNamed(current.modeler, "Kettle"));
      return startWithAKey(current, "c", gridPoint(current, 0.35, 0.75));
    },
  ],
  [
    "a connect the key A starts from the selected component",
    async (current) => {
      select(current, shapeNamed(current.modeler, "Cup"));
      return startWithAKey(current, "a", gridPoint(current, 0.35, 0.75));
    },
  ],
];

describe("an import from the selection listener at a drag's start (#336)", () => {
  test.each(DRAGS_THAT_CLEAR_THE_SELECTION)(
    "%s: runs once diagram-js has activated the drag, then ends it",
    async (_, start) => {
      const current = await session(DRAG_MAP);
      const { modeler } = current;
      const steps = await start(current);
      const reimport = importOnFirstSelection(current, DRAG_PEER_MAP);

      steps.activate();
      expect(reimport()).toBeDefined();
      expect(current.errors).toEqual([]);
      expect(modeler.interaction.active()).toBe(true);
      expect(current.log).not.toContain("import");
      await expect(reimport()).resolves.toBeDefined();
      expect(modeler.exportText()).toBe(DRAG_PEER_MAP);
      expect(modeler.interaction.active()).toBe(false);

      steps.release();
      await nextTask();
      expect(current.changes()).toBe(0);
      expect(modeler.exportText()).toBe(DRAG_PEER_MAP);
      expect(current.delivered).toEqual([true, false]);
      expect(current.labelEditing.getActiveEdit()).toBeNull();
      expectTheActionFinishedCleanly(current);
    },
  );
});

/** The drag the table names `what`. */
function dragNamed(what: string): (current: Session) => Promise<DragSteps> {
  const found = DRAGS_THAT_CLEAR_THE_SELECTION.find(([name]) => name === what);
  if (!found) throw new Error(`no drag ${what}`);
  return found[1];
}

/**
 * Once the input's handler has returned, the modeler is destroyed: no error reached the window, the
 * drag and the canvas are gone, the release changes nothing, and the modeler keeps its text.
 */
async function expectDestroyedCleanly(
  current: Session,
  dragging: Dragging,
  steps: DragSteps,
): Promise<void> {
  await nextTask();
  expect(current.errors).toEqual([]);
  expect(dragging.context()).toBeNull();
  expect(current.svg.isConnected).toBe(false);
  steps.release();
  await nextTask();
  expect(current.errors).toEqual([]);
  expect(current.changes()).toBe(0);
  expect(current.modeler.interaction.active()).toBe(false);
  expect(current.modeler.exportText()).toBe(DRAG_MAP);
}

describe("a destroy from a listener at a drag's start throws nothing, and nothing reaches the host afterwards (#346)", () => {
  test.each(DRAGS_THAT_CLEAR_THE_SELECTION)(
    "%s, from the selection listener: the listener hears nothing more",
    async (_, start) => {
      const current = await session(DRAG_MAP);
      const dragging = current.diagram.get<Dragging>("dragging");
      const steps = await start(current);
      const heard: string[][] = [];
      current.modeler.elements.onSelection((ids) => {
        heard.push(ids);
        current.modeler.destroy();
      });

      steps.activate();
      expect(heard).toEqual([[]]);
      await expectDestroyedCleanly(current, dragging, steps);
      expect(heard).toEqual([[]]);
      expect(current.delivered).toEqual([]);
    },
  );

  test.each([
    "a move of a component past the drag threshold",
    "a create from the palette, which a pointer click activates at once",
  ])("%s, from the interaction listener: no later listener hears of it", async (what) => {
    const current = await session(DRAG_MAP);
    const dragging = current.diagram.get<Dragging>("dragging");
    const steps = await dragNamed(what)(current);
    const later: boolean[] = [];
    current.modeler.interaction.onChange(() => current.modeler.destroy());
    current.modeler.interaction.onChange((active) => later.push(active));

    steps.activate();
    await expectDestroyedCleanly(current, dragging, steps);
    expect(current.delivered).toEqual([true]);
    expect(later).toEqual([]);
  });
});

describe("waiting imports", () => {
  test("an import called in the task of a command waits until that task has returned", async () => {
    const current = await session();
    const { modeler, diagram } = current;
    const kettle = shapeNamed(modeler, "Kettle");
    diagram.get<Modeling>("modeling").moveElements([kettle as unknown as Shape], { x: 12, y: 0 });

    const imported = modeler.importText(PEER_MAP);
    expect(onTheMap(current, kettle)).toBe(true);
    await imported;
    expect(modeler.exportText()).toBe(PEER_MAP);
  });

  test("keep their call order: one called right after an action's wait has ended imports after the waiting one", async () => {
    const current = await session();
    const { modeler } = current;
    const echo = echoFirstChange(current);
    pressKey(typeName(current, "Kettle", "Teapot"), "Enter");
    expect(echo.reimport()).toBeDefined();

    await Promise.resolve();
    const peer = modeler.importText(PEER_MAP);
    await Promise.all([echo.reimport(), peer]);

    expect(current.log.filter((entry) => entry === "import")).toHaveLength(2);
    expect(modeler.exportText()).toBe(PEER_MAP);
    expect(current.errors).toEqual([]);
  });

  test("reject when the modeler is destroyed before the action has finished", async () => {
    const current = await session();
    const { modeler } = current;
    const echo = echoFirstChange(current);
    pressKey(typeName(current, "Kettle", "Teapot"), "Enter");
    expect(echo.reimport()).toBeDefined();
    modeler.destroy();

    await expect(echo.reimport()).rejects.toThrow("The modeler was destroyed.");
    expect(current.errors).toEqual([]);
  });
});
