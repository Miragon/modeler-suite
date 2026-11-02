/*
 * The level every `c4.edit.refused` reaches the apps with (guide §9), from each place the renderer
 * fires it: `info` where the message explains a rule the edit would break, so the apps show no
 * alarm for it, and `danger` only where an edit went wrong.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Shape } from "diagram-js/lib/model/Types";
import type { CollaborativeDiagram } from "../../src/collaborative/index.js";
import type LabelEditing from "../../src/label-editing/LabelEditing.js";
import type C4Modeling from "../../src/modeling/C4Modeling.js";
import { READ_ONLY_MESSAGE } from "../../src/modeling/C4Modeling.js";
import type C4Dialogs from "../../src/navigation/C4Dialogs.js";
import { NO_CONFIRMATION_MESSAGE } from "../../src/navigation/C4Dialogs.js";
import type ReadOnly from "../../src/read-only/ReadOnly.js";
import { EDIT_REFUSED_EVENT, type EditRefusedEvent } from "../../src/services.js";
import { BOOKSHOP } from "./fixtures/texts.js";
import { pointerOn, type Point } from "./support/pointer.js";
import { createTestModeler, removeHosts, type ProbedEngine } from "./support/stack.js";

const CONTEXT_SYSTEM_RULE =
  "A system context view always shows its system. To leave it out, delete the view.";

let modeler: CollaborativeDiagram;
let engine: ProbedEngine;
let heard: EditRefusedEvent[];

beforeEach(async () => {
  ({ modeler, engine } = createTestModeler());
  await modeler.importText(BOOKSHOP);
  modeler.views.open("BookshopContext", { cause: "user" });
  heard = [];
  service<EventBus>("eventBus").on(EDIT_REFUSED_EVENT, (event: EditRefusedEvent) => {
    const { reason, message, level } = event;
    heard.push({ reason, message, ...(level === undefined ? {} : { level }) });
  });
});

afterEach(() => {
  modeler.destroy();
  removeHosts();
});

function service<T>(name: string): T {
  return modeler.diagram.get<T>(name);
}

function shape(id: string): Shape {
  const found = service<ElementRegistry>("elementRegistry").get(id);
  if (!found) throw new Error(`no ${id} on the canvas`);
  return found as Shape;
}

function centreOf(id: string): Point {
  const { x, y, width, height } = shape(id);
  return { x: x + width / 2, y: y + height / 2 };
}

describe("a refusal that explains a rule is info", () => {
  it("Delete on the system of its own system context view", () => {
    service<C4Modeling>("modeling").removeElements([shape("bookshop")]);

    expect(heard).toEqual([{ reason: "not-allowed", message: CONTEXT_SYSTEM_RULE, level: "info" }]);
    expect(modeler.exportText()).toBe(BOOKSHOP);
  });

  it("a relationship the edit layer refuses, from a menu or a dialog", () => {
    modeler.c4.createRelationship("customer", "customer");

    expect(heard).toEqual([
      {
        reason: "not-allowed",
        message: "An element can't have a relationship to itself.",
        level: "info",
      },
    ]);
  });

  it("a connect dropped on its own source", () => {
    const pointer = pointerOn(modeler.diagram);
    const graphics = service<ElementRegistry>("elementRegistry").getGraphics("customer");
    service<{ start(event: MouseEvent, start: Shape, autoActivate: boolean): void }>(
      "connect",
    ).start(pointer.event("mousedown", centreOf("customer")), shape("customer"), true);
    graphics.dispatchEvent(pointer.event("mouseout", centreOf("customer")));
    pointer.hover(centreOf("customer"), graphics);
    pointer.release(centreOf("customer"));

    expect(heard).toEqual([
      {
        reason: "not-allowed",
        message: "An element can't have a relationship to itself.",
        level: "info",
      },
    ]);
  });

  it("a value the label editor drops on a click away", () => {
    const labelEditing = service<LabelEditing>("labelEditing");
    labelEditing.activate(shape("payments") as never);
    const field = modeler.diagram.container.querySelector<HTMLTextAreaElement>(
      "textarea.diagram-label-editor",
    );
    if (!field) throw new Error("no label editor is open");
    field.value = "Bookshop";

    labelEditing.complete({ dropRefused: true });

    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ reason: "name-taken", level: "info" });
    expect(heard[0]?.message).toContain("Bookshop");
  });

  it("the read-only lock of an invalid file, whose alarm is the status box", () => {
    service<ReadOnly>("readOnly").setReadOnly(true);
    modeler.c4.editElement("payments", { name: "Payment Provider" });

    expect(heard).toEqual([{ reason: "read-only", message: READ_ONLY_MESSAGE, level: "info" }]);
  });

  it("Delete from model without a chrome to ask on", () => {
    service<C4Dialogs>("c4Dialogs").deleteFromModel({ ids: ["payments"], relationships: [] });

    expect(heard).toEqual([
      { reason: "not-allowed", message: NO_CONFIRMATION_MESSAGE, level: "info" },
    ]);
  });
});

describe("a refusal that reports a failed edit is danger", () => {
  it("a splice that failed the edit layer's verification", () => {
    const message = "Couldn't write this change into the DSL. Edit the text instead.";
    engine.refuseNext("verification-failed", message);
    modeler.c4.editElement("payments", { name: "Payment Provider" });

    expect(heard).toEqual([{ reason: "verification-failed", message, level: "danger" }]);
    expect(modeler.exportText()).toBe(BOOKSHOP);
  });
});
