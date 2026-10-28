import { afterEach, describe, expect, test } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  parseDocumentText,
  ROOT_ID,
  type CollaborativeTeamTopologiesModeler,
  type Modeler,
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

afterEach(() => {
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

/** The command stack still reports the next edit: the cancelled gesture left no command open. */
function expectTheNextEditReported(current: Session, imported: string): void {
  current.diagram
    .get<Modeling>("modeling")
    .moveElements([shape(current.diagram, "team_discovery")], { x: 10, y: 0 });
  expect(current.changes()).toBe(1);
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
    const handle = container.querySelector<SVGElement>(
      `.djs-resizer-${team.id}.djs-resizer-se .djs-resizer-hit`,
    );
    if (!handle) throw new Error("the selected team shows no south-east resize handle");
    const corner = { x: team.x + team.width, y: team.y + team.height };
    pointer.press(handle, corner);
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
