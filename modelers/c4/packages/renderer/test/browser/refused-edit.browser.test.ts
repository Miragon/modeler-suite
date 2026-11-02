/*
 * An edit the DSL cannot take is refused before anything executes (SPEC 1.3, 9.4): no command,
 * no change event, every shape where it was (a dragged one snaps back) and one `c4.edit.refused`
 * with the reason, so the apps can say why. The canvas still equals a fresh import afterwards.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Connection, Shape } from "diagram-js/lib/model/Types";
import type { CollaborativeDiagram } from "../../src/collaborative/index.js";
import type C4ElementFactory from "../../src/modeling/C4ElementFactory.js";
import type C4Modeling from "../../src/modeling/C4Modeling.js";
import { READ_ONLY_MESSAGE } from "../../src/modeling/C4Modeling.js";
import type ReadOnly from "../../src/read-only/ReadOnly.js";
import { EDIT_REFUSED_EVENT, type EditRefusedEvent } from "../../src/services.js";
import { SHOP } from "./support/documents.js";
import { canvasState, expectCanvasMatchesDocument, type CanvasState } from "./support/invariant.js";
import { pointerOn } from "./support/pointer.js";
import { createTestModeler, removeHosts, type ProbedEngine } from "./support/stack.js";

let modeler: CollaborativeDiagram;
let engine: ProbedEngine;
let changes = 0;
let commands = 0;
let errors: unknown[] = [];
let refusals: EditRefusedEvent[] = [];

function recordError(event: ErrorEvent): void {
  errors.push(event.error);
}

function service<T>(name: string): T {
  return modeler.diagram.get<T>(name);
}

function element(id: string): Shape {
  const found = service<ElementRegistry>("elementRegistry").get(id);
  if (!found) throw new Error(`no ${id} on the canvas`);
  return found as Shape;
}

function centreOf(id: string): { x: number; y: number } {
  const { x, y, width, height } = element(id);
  return { x: x + width / 2, y: y + height / 2 };
}

beforeEach(async () => {
  ({ modeler, engine } = createTestModeler());
  await modeler.importText(SHOP);
  modeler.views.open("ShopContainers", { cause: "user" });
  changes = 0;
  commands = 0;
  errors = [];
  refusals = [];
  modeler.onContentChanged(() => (changes += 1));
  const eventBus = service<EventBus>("eventBus");
  eventBus.on("commandStack.changed", () => (commands += 1));
  eventBus.on(EDIT_REFUSED_EVENT, (event: EditRefusedEvent) => {
    refusals.push({ reason: event.reason, message: event.message });
  });
  window.addEventListener("error", recordError);
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  modeler.destroy();
  removeHosts();
});

/** Nothing ran: the text, the history, the canvas as it was, and the one refusal. */
function expectRefusedOnce(before: CanvasState, reason: string): void {
  expect(errors).toEqual([]);
  expect(changes).toBe(0);
  expect(commands).toBe(0);
  expect(modeler.exportText()).toBe(SHOP);
  expect(service<CommandStack>("commandStack").canUndo()).toBe(false);
  expect(refusals.map(({ reason: refused }) => refused)).toEqual([reason]);
  expect(refusals[0]?.message).not.toBe("");
  expect(canvasState(modeler.diagram)).toEqual(before);
  expectCanvasMatchesDocument(modeler);
}

describe("a gesture whose edit is refused leaves no trace", () => {
  it("a move: the dragged element snaps back", () => {
    const before = canvasState(modeler.diagram);
    engine.refuseNext("verification-failed", "Couldn't write this change into the DSL.");

    pointerOn(modeler.diagram).grab("web", { x: 80, y: 120 }).drop();

    expectRefusedOnce(before, "verification-failed");
    expect(modeler.diagram.container.querySelector(".djs-drag-group")).toBeNull();
  });

  it("a pointer create: no shape, nothing selected, no name editor", async () => {
    const before = canvasState(modeler.diagram);
    engine.refuseNext("not-allowed", "Not here.");
    const pointer = pointerOn(modeler.diagram);
    pointer.clickPalette("create.container");
    const free = { x: 1200, y: 100 };
    pointer.hover(free);
    pointer.release(free);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expectRefusedOnce(before, "not-allowed");
    expect(modeler.elements.selection()).toEqual([]);
    expect(modeler.diagram.container.querySelector("textarea.diagram-label-editor")).toBeNull();
  });

  it("a keyboard create: nothing is selected and no editor opens", () => {
    const before = canvasState(modeler.diagram);
    engine.refuseNext("not-allowed", "Not here.");

    pointerOn(modeler.diagram).pressPalette("create.softwareSystem");

    expectRefusedOnce(before, "not-allowed");
    expect(modeler.elements.selection()).toEqual([]);
    expect(modeler.diagram.container.querySelector("textarea.diagram-label-editor")).toBeNull();
  });

  it("a connection drawn from one element to another", () => {
    const before = canvasState(modeler.diagram);
    engine.refuseNext("verification-failed", "Couldn't write this change into the DSL.");
    const pointer = pointerOn(modeler.diagram);
    const connect = service<{ start(event: MouseEvent, source: Shape, auto?: boolean): void }>(
      "connect",
    );
    const from = centreOf("db");
    connect.start(
      new MouseEvent("mousedown", { bubbles: true, ...pointer.client(from) }),
      element("db"),
      true,
    );
    const to = centreOf("mail");
    pointer.hover(to, service<ElementRegistry>("elementRegistry").getGraphics("mail"));
    pointer.release(to);

    expectRefusedOnce(before, "verification-failed");
    expect(service<Selection>("selection").get()).toEqual([]);
  });

  it("a resize: the box stays", () => {
    const before = canvasState(modeler.diagram);
    engine.refuseNext("verification-failed", "Couldn't write this change into the DSL.");

    service<C4Modeling>("modeling").resizeShape(element("api"), {
      x: 400,
      y: 320,
      width: 400,
      height: 300,
    });

    expectRefusedOnce(before, "verification-failed");
  });

  it("a bendpoint: the line stays straight", () => {
    const before = canvasState(modeler.diagram);
    engine.refuseNext("verification-failed", "Couldn't write this change into the DSL.");
    const connection = element("rel:web->api") as unknown as Connection;
    const [start, end] = connection.waypoints;
    if (!start || !end) throw new Error("no waypoints");

    service<C4Modeling>("modeling").updateWaypoints(connection, [start, { x: 300, y: 600 }, end]);

    expectRefusedOnce(before, "verification-failed");
  });

  it("Delete on a selected element", () => {
    const before = canvasState(modeler.diagram);
    engine.refuseNext("referenced-by-opaque", "A script may use web. Edit the text instead.");
    service<Selection>("selection").select(element("web"));
    const selected = canvasState(modeler.diagram);
    service<Canvas>("canvas").focus();

    pointerOn(modeler.diagram).svg.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
    );

    expect(selected.items).toEqual(before.items);
    expectRefusedOnce(before, "referenced-by-opaque");
    expect(modeler.elements.selection()).toEqual(["web"]);
  });
});

describe("refusals of the edit layer itself", () => {
  it("a name another element of the namespace has", () => {
    const before = canvasState(modeler.diagram);
    const outcome = modeler.c4.editElement("payments", { name: "Mail" });

    expect(outcome?.ok).toBe(false);
    expectRefusedOnce(before, "name-taken");
  });

  it("an identifier that is taken", () => {
    const before = canvasState(modeler.diagram);
    const outcome = modeler.c4.renameIdentifier("web", "api");

    expect(outcome).toMatchObject({ ok: false, reason: "identifier-taken" });
    expectRefusedOnce(before, "identifier-taken");
  });

  it("any edit while the canvas is locked, with the lock's message", () => {
    service<ReadOnly>("readOnly").setReadOnly(true);
    const before = canvasState(modeler.diagram);
    const factory = service<C4ElementFactory>("c4ElementFactory");

    const created = service<C4Modeling>("modeling").createShape(
      factory.createNew("softwareSystem", "Locked"),
      { x: 1200, y: 100 },
    );
    expect(created).toBeUndefined();
    expect(modeler.c4.editWorkspace({ name: "Locked" })).toMatchObject({ reason: "read-only" });

    expect(refusals).toEqual([
      { reason: "read-only", message: READ_ONLY_MESSAGE },
      { reason: "read-only", message: READ_ONLY_MESSAGE },
    ]);
    refusals = refusals.slice(1);
    expectRefusedOnce(before, "read-only");
  });

  it("a no-op edit is no refusal and runs no command", () => {
    const outcome = modeler.c4.editElement("web", { name: "Web App" });
    expect(outcome?.ok).toBe(true);
    expect(commands).toBe(0);
    expect(changes).toBe(0);
    expect(refusals).toEqual([]);
    expect(modeler.exportText()).toBe(SHOP);
  });
});
