import { afterEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement, Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  parseDocumentText,
  ROOT_ID,
  type CollaborativeTeamTopologiesModeler,
  type Modeler,
  type TtElement,
  type TtElementFactory,
  type TtLabelEditing,
} from "@miragon/team-topologies-renderer";
import { serializeDocument } from "@miragon/team-topologies-schema-model";
import onlineShop from "../../../../example/sample.tt?raw";
import {
  Pointer,
  centreOf,
  holdGesture,
  middle,
  paletteEntry,
  previewOf,
  shape,
} from "./support/pointer.js";

// A host with a live sync (designIQ, the VS Code webview) imports a peer's text while the user may
// be in the middle of a gesture. The import cancels the gesture the way Escape does, so its release
// applies nothing to the elements the import replaced.

interface Mounted {
  modeler: CollaborativeTeamTopologiesModeler;
  host: HTMLElement;
  stopCollecting: () => void;
}

const mounted: Mounted[] = [];

/** A spot below the sample's teams, where the real pointer starts no hover tooltip. */
const EMPTY_CANVAS_SPOT = { x: 640, y: 720 };

let realPointerUsed = false;

/** Clicks with Playwright's real pointer, which `afterEach` moves off the palette again. */
async function clickWithTheRealPointer(element: Element): Promise<void> {
  realPointerUsed = true;
  await userEvent.click(element);
}

afterEach(async () => {
  const topmost = mounted.at(-1);
  if (realPointerUsed && topmost) {
    // The real pointer stays where it clicked. Over a palette entry, it starts the entry's hover
    // tooltip in this diagram and in every diagram mounted under it later, and diagram-js's
    // tooltip timer throws once it outlives its destroyed diagram.
    await userEvent.hover(topmost.host, { position: EMPTY_CANVAS_SPOT });
  }
  realPointerUsed = false;
  for (const { modeler, host, stopCollecting } of mounted.splice(0)) {
    stopCollecting();
    modeler.destroy();
    host.remove();
  }
});

interface Session {
  modeler: CollaborativeTeamTopologiesModeler;
  diagram: Modeler;
  container: HTMLElement;
  pointer: Pointer;
  /** Change events of the contract since the session started. */
  changes: () => number;
  /** Errors thrown out of the canvas's DOM listeners since the session started. */
  errors: unknown[];
}

async function session(): Promise<Session> {
  const host = document.createElement("div");
  host.style.cssText = "position: fixed; left: 0; top: 0; width: 1280px; height: 800px;";
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
  await modeler.importText(onlineShop);
  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  const diagram = modeler.diagram as Modeler;
  return {
    modeler,
    diagram,
    container: diagram.get<Canvas>("canvas").getContainer(),
    pointer: new Pointer(diagram),
    changes: () => changes,
    errors,
  };
}

/** The sample with one node moved right: a peer's edit of an element the gesture does not hold. */
function peerMoves(nodeId: string, dx: number): string {
  const document = parseDocumentText(onlineShop);
  if (!document.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`the sample lost ${nodeId}`);
  }
  return serializeDocument({
    ...document,
    nodes: document.nodes.map((node) =>
      node.id === nodeId
        ? { ...node, position: { x: node.position.x + dx, y: node.position.y } }
        : node,
    ),
  });
}

/** What every gesture leaves behind once the import cancelled it and the pointer was released. */
function expectNothingApplied(current: Session, imported: string): void {
  const { modeler, diagram, container } = current;
  expect(current.errors).toEqual([]);
  expect(current.changes()).toBe(0);
  expect(modeler.exportText()).toBe(imported);
  expect(diagram.get<Dragging>("dragging").context()).toBeFalsy();
  expect(previewOf(container)).toBeNull();
  expectNoReplacedElementSelected(diagram);
}

function expectNoReplacedElementSelected(diagram: Modeler): void {
  const registry = diagram.get<ElementRegistry>("elementRegistry");
  for (const selected of diagram.get<Selection>("selection").get() as DiagramElement[]) {
    expect(registry.get(selected.id)).toBe(selected);
  }
}

function southEastHandle(container: HTMLElement, team: Shape): SVGElement {
  const handle = container.querySelector<SVGElement>(
    `.djs-resizer-${team.id}.djs-resizer-se .djs-resizer-hit`,
  );
  if (!handle) throw new Error("the selected team shows no south-east resize handle");
  return handle;
}

/** The command stack still reports the next edit: the cancelled gesture left no command open. */
function expectTheNextEditReported(current: Session, imported: string): void {
  const changesBefore = current.changes();
  current.diagram
    .get<Modeling>("modeling")
    .moveElements([shape(current.diagram, "team_discovery")], { x: 10, y: 0 });
  expect(current.changes()).toBe(changesBefore + 1);
  expect(current.modeler.exportText()).not.toBe(imported);
}

describe("an import while a gesture runs cancels the gesture", () => {
  test("a move past the threshold drops nothing on the replaced element", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const start = middle(shape(diagram, "team_checkout"));
    pointer.press(pointer.graphics("team_checkout"), start);
    pointer.enter();
    pointer.moveTo({ x: start.x + 20, y: start.y + 10 });
    pointer.moveTo({ x: start.x + 60, y: start.y + 30 });
    expect(previewOf(container)).not.toBeNull();

    const imported = peerMoves("team_platform", 40);
    await modeler.importText(imported);
    expect(previewOf(container)).toBeNull();
    pointer.moveTo({ x: start.x + 80, y: start.y + 40 });
    pointer.releaseAt({ x: start.x + 80, y: start.y + 40 });

    expectNothingApplied(current, imported);
    expectTheNextEditReported(current, imported);
  });

  test("a move pressed but not yet past the threshold starts no drag after the import", async () => {
    const current = await session();
    const { modeler, diagram, pointer } = current;
    const start = middle(shape(diagram, "team_checkout"));
    pointer.press(pointer.graphics("team_checkout"), start);
    pointer.moveTo({ x: start.x + 2, y: start.y });

    const imported = peerMoves("team_platform", 40);
    await modeler.importText(imported);
    pointer.enter();
    pointer.moveTo({ x: start.x + 60, y: start.y + 30 });
    pointer.releaseAt({ x: start.x + 60, y: start.y + 30 });

    expectNothingApplied(current, imported);
    expectTheNextEditReported(current, imported);
  });

  test("a resize drops nothing on the replaced element", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const team = shape(diagram, "team_fraud");
    diagram.get<Selection>("selection").select(team);
    const corner = { x: team.x + team.width, y: team.y + team.height };
    pointer.press(southEastHandle(container, team), corner);
    pointer.moveTo({ x: corner.x + 30, y: corner.y + 20 });
    pointer.moveTo({ x: corner.x + 60, y: corner.y + 40 });
    expect(previewOf(container)).not.toBeNull();

    const imported = peerMoves("team_platform", 40);
    await modeler.importText(imported);
    pointer.moveTo({ x: corner.x + 70, y: corner.y + 50 });
    pointer.releaseAt({ x: corner.x + 70, y: corner.y + 50 });

    expectNothingApplied(current, imported);
    expectTheNextEditReported(current, imported);
  });

  test("a connect from an annotation's context pad attaches nothing", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const annotation = shape(diagram, "ann_fraud_handover");
    diagram.get<Selection>("selection").select(annotation);
    const connect = container.querySelector<HTMLElement>(
      '.djs-context-pad .entry[data-action="connect"]',
    );
    if (!connect) throw new Error("the annotation's context pad has no connect entry");
    pointer.clickOn(connect);
    const target = middle(shape(diagram, "team_fraud"));
    pointer.moveTo({ x: target.x - 40, y: target.y });
    pointer.enter("team_fraud");
    pointer.moveTo(target);
    expect(previewOf(container)).not.toBeNull();

    const imported = peerMoves("team_platform", 40);
    await modeler.importText(imported);
    pointer.enter("team_fraud");
    pointer.moveTo(target);
    pointer.releaseAt(target);

    expectNothingApplied(current, imported);
    expectTheNextEditReported(current, imported);
  });

  test("a lasso drag selects none of the replaced elements", async () => {
    const current = await session();
    const { modeler, container, pointer } = current;
    const start = { x: 0, y: 100 };
    pointer.press(pointer.graphics(ROOT_ID), start, { shiftKey: true });
    pointer.moveTo({ x: 200, y: 300 });
    pointer.moveTo({ x: 400, y: 450 });
    expect(previewOf(container)).not.toBeNull();

    const imported = peerMoves("team_platform", 40);
    await modeler.importText(imported);
    pointer.moveTo({ x: 420, y: 460 });
    pointer.releaseAt({ x: 420, y: 460 });

    expectNothingApplied(current, imported);
    expect(modeler.elements.selection()).toEqual([]);
    expectTheNextEditReported(current, imported);
  });

  test("a palette create with its preview on the canvas creates nothing", async () => {
    const current = await session();
    const { modeler, container, pointer } = current;
    pointer.clickOn(paletteEntry(container, "team.platform"));
    pointer.enter();
    const drop = { x: 1120, y: 120 };
    pointer.moveTo({ x: drop.x - 40, y: drop.y });
    pointer.moveTo(drop);
    expect(previewOf(container)).not.toBeNull();

    const imported = peerMoves("team_platform", 40);
    await modeler.importText(imported);
    expect(previewOf(container)).toBeNull();
    pointer.enter();
    pointer.moveTo({ x: drop.x + 10, y: drop.y });
    pointer.releaseAt({ x: drop.x + 10, y: drop.y });

    expectNothingApplied(current, imported);
    expectTheNextEditReported(current, imported);
  });

  test("a palette create whose pointer is still on the palette creates nothing", async () => {
    const current = await session();
    const { modeler, container, pointer } = current;
    const entry = paletteEntry(container, "team.stream-aligned");
    entry.dispatchEvent(
      new DragEvent("dragstart", { bubbles: true, cancelable: true, ...centreOf(entry) }),
    );
    pointer.moveOver(entry, { dx: 12, dy: 8 });
    const dragging = current.diagram.get<Dragging>("dragging");
    expect(dragging.context()).toMatchObject({ prefix: "create", active: true });
    expect(previewOf(container)).toBeNull();

    const imported = peerMoves("team_platform", 40);
    await modeler.importText(imported);
    expect(dragging.context()).toBeFalsy();
    const drop = { x: 1120, y: 120 };
    pointer.enter();
    pointer.moveTo({ x: drop.x - 40, y: drop.y });
    pointer.moveTo(drop);
    pointer.releaseAt(drop);

    expectNothingApplied(current, imported);
    expectTheNextEditReported(current, imported);
  });
});

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
  before: string,
): Promise<void> {
  const { modeler, diagram, container } = current;
  await expect(reimport).resolves.toBeDefined();
  expect(current.errors).toEqual([]);
  expect(current.changes()).toBe(1);
  const dropped = modeler.exportText();
  expect(dropped).not.toBe(before);
  expect(diagram.get<Dragging>("dragging").context()).toBeFalsy();
  expect(previewOf(container)).toBeNull();
  expectNoReplacedElementSelected(diagram);
  diagram
    .get<Modeling>("modeling")
    .moveElements([shape(diagram, "team_discovery")], { x: 10, y: 0 });
  expect(current.changes()).toBe(2);
  expect(modeler.exportText()).not.toBe(dropped);
}

describe("an import from inside the change listener of a drop", () => {
  test("keeps the move the drop applied", async () => {
    const current = await session();
    const { modeler, diagram, pointer } = current;
    const reimport = reimportOnFirstChange(current);
    const before = modeler.exportText();
    const start = middle(shape(diagram, "team_checkout"));
    pointer.press(pointer.graphics("team_checkout"), start);
    pointer.enter();
    pointer.moveTo({ x: start.x + 20, y: start.y + 10 });
    pointer.moveTo({ x: start.x + 60, y: start.y + 30 });
    pointer.releaseAt({ x: start.x + 60, y: start.y + 30 });

    await expectTheDropKept(current, reimport(), before);
  });

  test("keeps the element a palette create dropped", async () => {
    const current = await session();
    const { modeler, container, pointer } = current;
    const reimport = reimportOnFirstChange(current);
    const before = modeler.exportText();
    pointer.clickOn(paletteEntry(container, "team.platform"));
    pointer.enter();
    const drop = { x: 1120, y: 120 };
    pointer.moveTo({ x: drop.x - 40, y: drop.y });
    pointer.moveTo(drop);
    pointer.releaseAt(drop);

    await expectTheDropKept(current, reimport(), before);
  });

  // #248: a host whose store answers the change with another text (a peer's state without the
  // team that was dragged). diagram-js's selection behaviour looks the moved team up again after
  // the move command, to restore what was selected before the drag.
  test("waits for the drop when the import removes the moved team", async () => {
    const current = await session();
    const { diagram, pointer } = current;
    const imported = sampleWithout("team_checkout");
    const events = recordDropAndImport(current, imported);
    const registry = diagram.get<ElementRegistry>("elementRegistry");
    // After the move command and after diagram-js's selection behaviour (priority 500).
    const movedTeamAfterTheCommand: (string | undefined)[] = [];
    diagram.on<{ context: { shape: DiagramElement } }>(
      "shape.move.end",
      (event) => {
        movedTeamAfterTheCommand.push(registry.get(event.context.shape.id)?.id);
      },
      250,
    );
    diagram.get<Selection>("selection").select(shape(diagram, "team_discovery"));
    const start = middle(shape(diagram, "team_checkout"));
    pointer.press(pointer.graphics("team_checkout"), start);
    pointer.enter();
    pointer.moveTo({ x: start.x + 20, y: start.y + 10 });
    pointer.moveTo({ x: start.x + 60, y: start.y + 30 });
    pointer.releaseAt({ x: start.x + 60, y: start.y + 30 });

    expect(registry.get("team_checkout")).toBeDefined();
    await events.imported();
    expect(movedTeamAfterTheCommand).toEqual(["team_checkout"]);
    expectTheImportAfterTheDrop(current, events, imported);
  });

  test("waits for the drop when the import leaves out the team a palette create dropped", async () => {
    const current = await session();
    const { modeler, diagram } = current;
    const events = recordDropAndImport(current, onlineShop);
    diagram.get<Selection>("selection").select(shape(diagram, "team_discovery"));
    const teamsBefore = modeler.elements.list().length;

    holdGesture(diagram, "create").drop();

    expect(modeler.elements.list()).toHaveLength(teamsBefore + 1);
    await events.imported();
    expectTheImportAfterTheDrop(current, events, onlineShop);
  });

  test("rejects a text it cannot import at once and leaves the drop as it was", async () => {
    const current = await session();
    const { modeler, diagram, pointer } = current;
    const before = modeler.exportText();
    let rejected: Promise<unknown> | undefined;
    modeler.onContentChanged(() => {
      rejected ??= modeler.importText('{"version": 3, "nodes": [');
    });
    const start = middle(shape(diagram, "team_checkout"));
    pointer.press(pointer.graphics("team_checkout"), start);
    pointer.enter();
    pointer.moveTo({ x: start.x + 60, y: start.y + 30 });
    pointer.releaseAt({ x: start.x + 60, y: start.y + 30 });

    await expect(rejected).rejects.toThrow();
    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(modeler.exportText()).not.toBe(before);
    expect(diagram.get<Dragging>("dragging").context()).toBeFalsy();
  });

  test("runs the imports made during the drop and right after it in the order they were made", async () => {
    const current = await session();
    const { modeler, diagram } = current;
    const first = peerMoves("team_platform", 40);
    const second = peerMoves("team_platform", 80);
    const settled: string[] = [];
    let duringTheDrop: Promise<unknown> | undefined;
    modeler.onContentChanged(() => {
      duringTheDrop ??= modeler.importText(first).then(() => settled.push("first"));
    });
    let afterTheDrop: Promise<unknown> | undefined;
    diagram.on("drag.ended", () => {
      afterTheDrop ??= modeler.importText(second).then(() => settled.push("second"));
    });

    holdGesture(diagram, "move").drop();

    await Promise.all([duringTheDrop, afterTheDrop]);
    expect(settled).toEqual(["first", "second"]);
    expect(modeler.exportText()).toBe(second);
    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
  });
});

/** The sample without one of its teams: a peer's state the drop's own change did not reach. */
function sampleWithout(nodeId: string): string {
  const document = parseDocumentText(onlineShop);
  if (!document.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`the sample lost ${nodeId}`);
  }
  return serializeDocument({
    ...document,
    nodes: document.nodes.filter((node) => node.id !== nodeId),
  });
}

interface DropAndImport {
  /** The import's promise, once the drop's change listener made it. */
  imported(): Promise<unknown>;
  /** The drop's last events and the import's settling, in the order they came. */
  order: string[];
}

/** The first change of the drop makes the host import `text`, as a store that answers it would. */
function recordDropAndImport(current: Session, text: string): DropAndImport {
  const order: string[] = [];
  let imported: Promise<unknown> | undefined;
  current.modeler.onContentChanged(() => {
    imported ??= current.modeler.importText(text).then(() => order.push("imported"));
  });
  current.diagram.on("drag.ended", () => {
    order.push("drag.ended");
  });
  current.diagram.on("drag.canceled", () => {
    order.push("drag.canceled");
  });
  return {
    order,
    imported: () => imported ?? Promise.reject(new Error("the drop changed nothing")),
  };
}

/** The drop ended as a drop, the import came after it, and the canvas is the imported text. */
function expectTheImportAfterTheDrop(current: Session, events: DropAndImport, text: string): void {
  const { modeler, diagram, container } = current;
  expect(current.errors).toEqual([]);
  expect(events.order).toEqual(["drag.ended", "imported"]);
  expect(current.changes()).toBe(1);
  expect(modeler.exportText()).toBe(text);
  expect(diagram.get<Dragging>("dragging").context()).toBeFalsy();
  expect(previewOf(container)).toBeNull();
  expectNoReplacedElementSelected(diagram);
  diagram
    .get<Modeling>("modeling")
    .moveElements([shape(diagram, "team_discovery")], { x: 10, y: 0 });
  expect(current.changes()).toBe(2);
  expect(modeler.exportText()).not.toBe(text);
}

/** The open label editor, as the user types into it. */
function labelEditor(container: HTMLElement): HTMLTextAreaElement {
  const editor = container.querySelector<HTMLTextAreaElement>("textarea.tt-label-editor");
  if (!editor) throw new Error("no label editor is open");
  return editor;
}

/** Enter in the label editor. */
function commitTheEdit(container: HTMLElement): void {
  labelEditor(container).dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );
}

function typeAndCommit(container: HTMLElement, text: string): void {
  labelEditor(container).value = text;
  commitTheEdit(container);
}

/** Opens the label editor on `id` and types `text` into it, without committing. */
function startTyping(current: Session, id: string, text: string): void {
  current.diagram
    .get<TtLabelEditing>("ttLabelEditing")
    .activate(shape(current.diagram, id) as unknown as TtElement);
  labelEditor(current.container).value = text;
}

/** The task after an import, in which the label editor it took down is open again. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function contextPadEntry(container: HTMLElement, action: string): HTMLElement {
  const entry = container.querySelector<HTMLElement>(
    `.djs-context-pad .entry[data-action="${action}"]`,
  );
  if (!entry) throw new Error(`the context pad has no ${action} entry`);
  return entry;
}

/** Enter or Space on a palette entry: the chrome's click without a pointer behind it. */
function keyboardClick(entry: HTMLElement): void {
  entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
}

function nameOf(current: Session, id: string): string | undefined {
  return current.modeler.elements.list().find((element) => element.id === id)?.name;
}

function boundsOf(current: Session, id: string): unknown {
  return current.modeler.elements.bounds(id);
}

/**
 * The action that made the element and opened its label editor ran to its end before the import:
 * the editor is open again on the imported element with the same id, and the name the user types
 * there reaches the export, with one change for the action and one for the name.
 */
async function expectTheNewElementNamed(
  current: Session,
  reimport: Promise<unknown> | undefined,
  idsBefore: readonly string[],
  typed: string,
): Promise<void> {
  const { diagram, container } = current;
  await expect(reimport).resolves.toBeDefined();
  await nextTask();
  const edit = diagram.get<TtLabelEditing>("ttLabelEditing").openEdit();
  if (!edit) throw new Error("the import left no label editor open");
  expect(idsBefore).not.toContain(edit.elementId);
  const edited = shape(diagram, edit.elementId);
  expect(diagram.get<Canvas>("canvas").hasMarker(edited, "tt-label-editing")).toBe(true);

  typeAndCommit(container, typed);

  expect(current.errors).toEqual([]);
  expect(current.changes()).toBe(2);
  expect(nameOf(current, edit.elementId)).toBe(typed);
  expect(diagram.get<Dragging>("dragging").context()).toBeFalsy();
  expectNoReplacedElementSelected(diagram);
}

function elementIds(current: Session): string[] {
  return current.modeler.elements.list().map((element) => element.id);
}

/** The change of a label commit, the start of the drag a press begins and the import, in order. */
function recordCommitDragAndImport(current: Session): string[] {
  const order: string[] = [];
  current.modeler.onContentChanged(() => {
    order.push("change");
  });
  current.diagram.on("drag.init", () => {
    order.push("drag.init");
  });
  current.diagram.on("import.done", () => {
    order.push("imported");
  });
  return order;
}

// #285, #305: these actions run a command and then go on with the element it made or changed, in
// the same handler: select it, open its label editor, start a drag. An echoing host imports from
// the command's change listener, so the rest of the action would hold a replaced element.
describe("an import from inside the change listener of a user action", () => {
  for (const by of ["a pointer", "Enter"] as const) {
    test(`waits for an annotation appended from the context pad by ${by}`, async () => {
      const current = await session();
      const { diagram, container, pointer } = current;
      const reimport = reimportOnFirstChange(current);
      const idsBefore = elementIds(current);
      diagram.get<Selection>("selection").select(shape(diagram, "team_checkout"));
      const entry = contextPadEntry(container, "append-annotation");
      if (by === "a pointer") pointer.clickOn(entry);
      else
        entry.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
        );

      await expectTheNewElementNamed(current, reimport(), idsBefore, "Checkout handover notes");
    });
  }

  test("waits for a keyboard create from the palette", async () => {
    const current = await session();
    const reimport = reimportOnFirstChange(current);
    const idsBefore = elementIds(current);
    keyboardClick(paletteEntry(current.container, "team.platform"));

    await expectTheNewElementNamed(current, reimport(), idsBefore, "Payments platform");
  });

  test("waits for a keyboard create whose selection makes the host import", async () => {
    const current = await session();
    const { modeler } = current;
    let reimport: Promise<unknown> | undefined;
    modeler.elements.onSelection(() => {
      reimport ??= modeler.importText(modeler.exportText());
    });
    const idsBefore = elementIds(current);
    keyboardClick(paletteEntry(current.container, "team.platform"));

    await expectTheNewElementNamed(current, reimport, idsBefore, "Payments platform");
  });

  test("waits for a label commit by Enter, and the committed editor stays closed", async () => {
    const current = await session();
    const { diagram, container } = current;
    const order = recordCommitDragAndImport(current);
    const reimport = reimportOnFirstChange(current);
    startTyping(current, "team_discovery", "Discovery squad");
    commitTheEdit(container);
    expect(order).toEqual(["change"]);

    await expect(reimport()).resolves.toBeDefined();
    await nextTask();
    expect(order).toEqual(["change", "imported"]);
    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(nameOf(current, "team_discovery")).toBe("Discovery squad");
    expect(diagram.get<TtLabelEditing>("ttLabelEditing").openEdit()).toBeUndefined();
  });

  // A click with no press before it (assistive technology, a host's synthetic click) leaves the
  // editor focused, so the label commit comes from `drag.init` inside the create's start.
  test("waits for the label commit inside a palette create a click without a press starts; the import ends that create", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const order = recordCommitDragAndImport(current);
    const reimport = reimportOnFirstChange(current);
    startTyping(current, "team_discovery", "Discovery squad");
    pointer.clickOn(paletteEntry(container, "team.platform"));

    await expect(reimport()).resolves.toBeDefined();
    expect(order).toEqual(["change", "drag.init", "imported"]);
    expect(current.errors).toEqual([]);
    expect(diagram.get<Dragging>("dragging").context()).toBeFalsy();
    expect(previewOf(container)).toBeNull();
    const imported = modeler.exportText();
    const drop = { x: 1120, y: 120 };
    pointer.enter();
    pointer.moveTo({ x: drop.x - 40, y: drop.y });
    pointer.moveTo(drop);
    pointer.releaseAt(drop);

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(nameOf(current, "team_discovery")).toBe("Discovery squad");
    expect(modeler.exportText()).toBe(imported);
    expectNoReplacedElementSelected(diagram);
    expectTheNextEditReported(current, imported);
  });

  test("keeps the palette create of a real click: the editor's blur commits the label before it", async () => {
    await page.viewport(1280, 800);
    const current = await session();
    const { diagram, container, pointer } = current;
    const order = recordCommitDragAndImport(current);
    const reimport = reimportOnFirstChange(current);
    const idsBefore = elementIds(current);
    startTyping(current, "team_discovery", "Discovery squad");
    await clickWithTheRealPointer(paletteEntry(container, "team.platform"));

    await expect(reimport()).resolves.toBeDefined();
    expect(order).toEqual(["change", "imported", "drag.init"]);
    expect(diagram.get<Dragging>("dragging").context()).toBeTruthy();
    const drop = { x: 1120, y: 120 };
    pointer.enter();
    pointer.moveTo({ x: drop.x - 40, y: drop.y });
    pointer.moveTo(drop);
    pointer.releaseAt(drop);

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(2);
    expect(nameOf(current, "team_discovery")).toBe("Discovery squad");
    expect(elementIds(current).filter((id) => !idsBefore.includes(id))).toHaveLength(1);
    expect(diagram.get<Dragging>("dragging").context()).toBeFalsy();
    expectNoReplacedElementSelected(diagram);
  });

  test("waits for the label commit of a press on a resize handle; the import ends the resize it started", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const order = recordCommitDragAndImport(current);
    const reimport = reimportOnFirstChange(current);
    const fraudBefore = boundsOf(current, "team_fraud");
    startTyping(current, "team_discovery", "Discovery squad");
    const team = shape(diagram, "team_fraud");
    diagram.get<Selection>("selection").select(team);
    const corner = { x: team.x + team.width, y: team.y + team.height };
    pointer.press(southEastHandle(container, team), corner);

    await expect(reimport()).resolves.toBeDefined();
    expect(order).toEqual(["change", "drag.init", "imported"]);
    expect(current.errors).toEqual([]);
    expect(diagram.get<Dragging>("dragging").context()).toBeFalsy();
    expect(previewOf(container)).toBeNull();
    const imported = modeler.exportText();
    pointer.moveTo({ x: corner.x + 30, y: corner.y + 20 });
    pointer.moveTo({ x: corner.x + 60, y: corner.y + 40 });
    pointer.releaseAt({ x: corner.x + 60, y: corner.y + 40 });

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(nameOf(current, "team_discovery")).toBe("Discovery squad");
    expect(boundsOf(current, "team_fraud")).toEqual(fraudBefore);
    expect(previewOf(container)).toBeNull();
    expectNoReplacedElementSelected(diagram);
    expectTheNextEditReported(current, imported);
  });

  test("waits for the label commit of a press on another team; the import ends the move it started", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const order = recordCommitDragAndImport(current);
    const reimport = reimportOnFirstChange(current);
    const checkoutBefore = boundsOf(current, "team_checkout");
    startTyping(current, "team_discovery", "Discovery squad");
    const start = middle(shape(diagram, "team_checkout"));
    pointer.press(pointer.graphics("team_checkout"), start);

    await expect(reimport()).resolves.toBeDefined();
    expect(order).toEqual(["change", "drag.init", "imported"]);
    expect(current.errors).toEqual([]);
    expect(diagram.get<Dragging>("dragging").context()).toBeFalsy();
    const imported = modeler.exportText();
    pointer.enter();
    pointer.moveTo({ x: start.x + 20, y: start.y + 10 });
    pointer.moveTo({ x: start.x + 60, y: start.y + 30 });
    pointer.releaseAt({ x: start.x + 60, y: start.y + 30 });

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
    expect(nameOf(current, "team_discovery")).toBe("Discovery squad");
    expect(boundsOf(current, "team_checkout")).toEqual(checkoutBefore);
    expect(previewOf(container)).toBeNull();
    expectNoReplacedElementSelected(diagram);
    expectTheNextEditReported(current, imported);
  });

  test("runs the imports made during an action and right after it in the order they were made", async () => {
    const current = await session();
    const { modeler, container } = current;
    const first = peerMoves("team_platform", 40);
    const second = peerMoves("team_platform", 80);
    const settled: string[] = [];
    let duringTheAction: Promise<unknown> | undefined;
    modeler.onContentChanged(() => {
      duringTheAction ??= modeler.importText(first).then(() => settled.push("first"));
    });
    keyboardClick(paletteEntry(container, "team.platform"));
    const afterTheAction = modeler.importText(second).then(() => settled.push("second"));

    await Promise.all([duringTheAction, afterTheAction]);
    expect(settled).toEqual(["first", "second"]);
    expect(modeler.exportText()).toBe(second);
    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(1);
  });

  // These commands deselect a team while they run, before their change: diagram-js deselects an
  // element its canvas removes.
  const deselectingCommands: Record<string, (diagram: Modeler) => () => void> = {
    "a delete": (diagram) => {
      diagram.get<Selection>("selection").select(shape(diagram, "team_checkout"));
      return () =>
        diagram.get<Modeling>("modeling").removeElements([shape(diagram, "team_checkout")]);
    },
    "an undo": (diagram) => {
      const team = diagram.get<TtElementFactory>("ttElementFactory").createNewTeam("platform");
      const created = diagram
        .get<Modeling>("modeling")
        .createShape(team as unknown as Shape, { x: 1120, y: 120 }, shape(diagram, ROOT_ID));
      diagram.get<Selection>("selection").select(created);
      return () => diagram.undo();
    },
    "a redo": (diagram) => {
      diagram.get<Modeling>("modeling").removeElements([shape(diagram, "team_checkout")]);
      diagram.undo();
      diagram.get<Selection>("selection").select(shape(diagram, "team_checkout"));
      return () => diagram.redo();
    },
  };

  for (const [name, prepare] of Object.entries(deselectingCommands)) {
    test(`waits for ${name} whose selection change makes the host import`, async () => {
      const current = await session();
      const { modeler, diagram } = current;
      const imported = peerMoves("team_platform", 40);
      const run = prepare(diagram);
      await nextTask();
      const changesBefore = current.changes();
      let reimport: Promise<unknown> | undefined;
      modeler.elements.onSelection(() => {
        reimport ??= modeler.importText(imported);
      });
      run();

      await expect(reimport).resolves.toBeDefined();
      expect(current.errors).toEqual([]);
      expect(current.changes()).toBe(changesBefore + 1);
      expect(modeler.exportText()).toBe(imported);
      expectNoReplacedElementSelected(diagram);
      expectTheNextEditReported(current, imported);
      // An import inside the command would clear the history under it and leave it wedged.
      diagram.undo();
      expect(modeler.exportText()).toBe(imported);
      expect(diagram.canUndo()).toBe(false);
    });
  }
});

interface DeselectingGesture {
  /** The element selected before the gesture, which diagram-js deselects when it starts it. */
  selected: string;
  /** Starts the gesture the way a user does; diagram-js deselects inside its start. */
  start(current: Session): void;
  /** Moves on and releases the pointer, as the user goes on after the import. */
  release(current: Session): void;
}

const NEW_TEAM_DROP = { x: 1120, y: 120 };

function releaseOnCanvasAt(current: Session, drop: { x: number; y: number }): void {
  current.pointer.enter();
  current.pointer.moveTo({ x: drop.x - 40, y: drop.y });
  current.pointer.moveTo(drop);
  current.pointer.releaseAt(drop);
}

// #336: diagram-js deselects at a drag's start, inside its `Dragging.move`, and reads the drag right
// after; an import from the selection listener there ended the drag under it and threw.
const gesturesThatDeselectAtTheirStart: Record<string, DeselectingGesture> = {
  "a press on another team moved past the drag threshold": {
    selected: "team_discovery",
    start({ diagram, pointer }) {
      const start = middle(shape(diagram, "team_checkout"));
      pointer.press(pointer.graphics("team_checkout"), start);
      pointer.enter();
      pointer.moveTo({ x: start.x + 60, y: start.y });
    },
    release({ diagram, pointer }) {
      const start = middle(shape(diagram, "team_checkout"));
      pointer.moveTo({ x: start.x + 80, y: start.y + 20 });
      pointer.releaseAt({ x: start.x + 80, y: start.y + 20 });
    },
  },
  "a palette create clicked": {
    selected: "team_discovery",
    start({ container, pointer }) {
      pointer.clickOn(paletteEntry(container, "team.platform"));
    },
    release: (current) => releaseOnCanvasAt(current, NEW_TEAM_DROP),
  },
  "a palette create dragged off its entry": {
    selected: "team_discovery",
    start({ container }) {
      const entry = paletteEntry(container, "team.stream-aligned");
      entry.dispatchEvent(
        new DragEvent("dragstart", { bubbles: true, cancelable: true, ...centreOf(entry) }),
      );
    },
    release: (current) => releaseOnCanvasAt(current, NEW_TEAM_DROP),
  },
  "a resize from the selected team's handle": {
    selected: "team_fraud",
    start({ diagram, container, pointer }) {
      const team = shape(diagram, "team_fraud");
      pointer.press(southEastHandle(container, team), {
        x: team.x + team.width,
        y: team.y + team.height,
      });
    },
    release({ diagram, pointer }) {
      const team = shape(diagram, "team_fraud");
      const corner = { x: team.x + team.width + 60, y: team.y + team.height + 40 };
      pointer.moveTo(corner);
      pointer.releaseAt(corner);
    },
  },
  "a connect from the selected annotation's context pad": {
    selected: "ann_fraud_handover",
    start({ diagram, container, pointer }) {
      pointer.clickOn(contextPadEntry(container, "connect"));
      const target = middle(shape(diagram, "team_fraud"));
      pointer.moveTo({ x: target.x - 40, y: target.y });
    },
    release({ diagram, pointer }) {
      const target = middle(shape(diagram, "team_fraud"));
      pointer.enter("team_fraud");
      pointer.moveTo(target);
      pointer.releaseAt(target);
    },
  },
};

describe("an import from the selection listener at a drag's start", () => {
  for (const [name, gesture] of Object.entries(gesturesThatDeselectAtTheirStart)) {
    test(`${name}: the import waits until diagram-js has started the drag, then ends it`, async () => {
      const current = await session();
      const { modeler, diagram, container } = current;
      const dragging = diagram.get<Dragging>("dragging");
      diagram.get<Selection>("selection").select(shape(diagram, gesture.selected));
      const imported = peerMoves("team_platform", 40);
      const order: string[] = [];
      let reimport: Promise<unknown> | undefined;
      modeler.elements.onSelection((ids) => {
        order.push(`selection ${ids.length}`);
        reimport ??= modeler.importText(imported);
      });
      diagram.on("drag.start", () => {
        order.push("drag.start");
      });
      diagram.on("import.done", () => {
        order.push("imported");
      });

      gesture.start(current);
      expect(order).toEqual(["drag.start", "selection 0"]);
      expect(dragging.context()).toMatchObject({ active: true });

      await expect(reimport).resolves.toBeDefined();
      expect(order).toEqual(["drag.start", "selection 0", "imported"]);
      expect(current.errors).toEqual([]);
      expect(modeler.exportText()).toBe(imported);
      expect(dragging.context()).toBeFalsy();
      expect(previewOf(container)).toBeNull();
      expect(modeler.interaction.active()).toBe(false);

      gesture.release(current);

      expectNothingApplied(current, imported);
      expect(modeler.elements.selection()).toEqual([]);
      expectTheNextEditReported(current, imported);
    });
  }
});

/**
 * Read before the destroy, since a service read afterwards would build a fresh diagram: once the
 * input's handler has returned, the modeler is destroyed, no error reached the window, the drag
 * and the canvas are gone, the release changes nothing, and the modeler keeps its text.
 */
function destroyedCleanly(current: Session): () => Promise<void> {
  const { modeler, diagram, container } = current;
  const dragging = diagram.get<Dragging>("dragging");
  const box = container.getBoundingClientRect();
  const release = new MouseEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: box.left + box.width / 2,
    clientY: box.top + box.height / 2,
  });
  const before = modeler.exportText();
  return async () => {
    await nextTask();
    expect(current.errors).toEqual([]);
    expect(dragging.context()).toBeFalsy();
    expect(container.isConnected).toBe(false);
    document.dispatchEvent(release);
    await nextTask();
    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(0);
    expect(modeler.interaction.active()).toBe(false);
    expect(modeler.exportText()).toBe(before);
  };
}

describe("a destroy from a listener at a drag's start throws nothing, and nothing reaches the host afterwards (#346)", () => {
  for (const [name, gesture] of Object.entries(gesturesThatDeselectAtTheirStart)) {
    test(`${name}, from the selection listener: the listener hears nothing more`, async () => {
      const current = await session();
      const { modeler, diagram } = current;
      diagram.get<Selection>("selection").select(shape(diagram, gesture.selected));
      const expectDestroyedCleanly = destroyedCleanly(current);
      const reported: boolean[] = [];
      modeler.interaction.onChange((active) => reported.push(active));
      const heard: string[][] = [];
      modeler.elements.onSelection((ids) => {
        heard.push(ids);
        modeler.destroy();
      });

      gesture.start(current);
      expect(heard).toEqual([[]]);
      await expectDestroyedCleanly();
      expect(heard).toEqual([[]]);
      expect(reported).toEqual([]);
    });
  }

  for (const name of [
    "a press on another team moved past the drag threshold",
    "a palette create clicked",
  ]) {
    test(`${name}, from the interaction listener: no later listener hears of it`, async () => {
      const gesture = gesturesThatDeselectAtTheirStart[name];
      if (!gesture) throw new Error(`no gesture ${name}`);
      const current = await session();
      const { modeler, diagram } = current;
      diagram.get<Selection>("selection").select(shape(diagram, gesture.selected));
      const expectDestroyedCleanly = destroyedCleanly(current);
      const later: boolean[] = [];
      modeler.interaction.onChange(() => modeler.destroy());
      modeler.interaction.onChange((active) => later.push(active));

      gesture.start(current);
      await expectDestroyedCleanly();
      expect(later).toEqual([]);
    });
  }
});

describe("an import while a palette tool only waits for its press", () => {
  test("leaves the lasso tool armed, and its next drag selects the imported elements", async () => {
    const current = await session();
    const { modeler, diagram, container, pointer } = current;
    const lassoEntry = paletteEntry(container, "lasso-tool");
    pointer.clickOn(lassoEntry);
    pointer.enter();
    pointer.moveTo({ x: 600, y: 60 });

    const imported = peerMoves("team_platform", 40);
    await modeler.importText(imported);
    expect(diagram.get<Dragging>("dragging").context()?.prefix).toBe("lasso.selection");
    expect(lassoEntry.classList.contains("highlighted-entry")).toBe(true);

    // The frame encloses the enabling team and the facilitating glyphs beside it only.
    pointer.press(pointer.graphics(ROOT_ID), { x: 30, y: 140 });
    pointer.moveTo({ x: 140, y: 260 });
    pointer.moveTo({ x: 240, y: 380 });
    pointer.releaseAt({ x: 240, y: 380 });

    expect(current.errors).toEqual([]);
    expect(current.changes()).toBe(0);
    expect(modeler.exportText()).toBe(imported);
    expect([...modeler.elements.selection()].sort()).toEqual([
      "int_testing_checkout",
      "int_testing_discovery",
      "team_test_automation",
    ]);
    expectNoReplacedElementSelected(diagram);
    expect(lassoEntry.classList.contains("highlighted-entry")).toBe(false);
  });
});
