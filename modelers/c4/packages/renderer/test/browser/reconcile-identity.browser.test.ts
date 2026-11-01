/*
 * The in-place sync keeps what it can (SPEC 1.5, 9.4): a kept id keeps its shape object, so the
 * selection, a running label edit and diagram-js's own references survive every command, an
 * undo, a re-import of the same text and a view switch. An id the document re-keys moves with its
 * object. After every step the canvas equals a fresh import (the invariant).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type GraphicsFactory from "diagram-js/lib/core/GraphicsFactory";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Connection, Element, Shape } from "diagram-js/lib/model/Types";
import type { CollaborativeDiagram } from "../../src/collaborative/index.js";
import type LabelEditing from "../../src/label-editing/LabelEditing.js";
import type C4Modeling from "../../src/modeling/C4Modeling.js";
import type Reconciler from "../../src/reconcile/Reconciler.js";
import type SceneService from "../../src/scene/SceneService.js";
import { isRelationshipConnection, type C4ElementShape } from "../../src/scene/types.js";
import { SHOP } from "./support/documents.js";
import { expectCanvasMatchesDocument } from "./support/invariant.js";
import { pointerOn } from "./support/pointer.js";
import { createTestModeler, removeHosts } from "./support/stack.js";

let modeler: CollaborativeDiagram;
let changes = 0;
let errors: unknown[] = [];

function recordError(event: ErrorEvent): void {
  errors.push(event.error);
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

function service<T>(name: string): T {
  return modeler.diagram.get<T>(name);
}

function shape(id: string): C4ElementShape {
  const found = service<ElementRegistry>("elementRegistry").get(id);
  if (!found) throw new Error(`no ${id} on the canvas`);
  return found as C4ElementShape;
}

/** Every element object of the canvas, by canvas id. */
function objects(): Map<string, Element> {
  const all = service<ElementRegistry>("elementRegistry").getAll() as Element[];
  return new Map(all.map((element) => [element.id, element]));
}

function labelField(): HTMLTextAreaElement {
  const field = modeler.diagram.container.querySelector<HTMLTextAreaElement>(
    "textarea.diagram-label-editor",
  );
  if (!field) throw new Error("no label editor is open");
  return field;
}

beforeEach(async () => {
  ({ modeler } = createTestModeler());
  await modeler.importText(SHOP);
  modeler.views.open("ShopContainers", { cause: "user" });
  changes = 0;
  errors = [];
  modeler.onContentChanged(() => (changes += 1));
  window.addEventListener("error", recordError);
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  expect(errors).toEqual([]);
  modeler.destroy();
  removeHosts();
});

describe("a kept id keeps its shape object (SPEC 1.5)", () => {
  it("a move by pointer, its undo and its redo keep the object, the selection and the other objects", () => {
    const before = objects();
    const web = shape("web");
    service<Selection>("selection").select(web);

    pointerOn(modeler.diagram).grab("web", { x: 60, y: 90 }).drop();

    expect(changes).toBe(1);
    expect(shape("web")).toBe(web);
    // Pointer coordinates round to whole screen pixels at the fitted zoom.
    expect(Math.abs(web.x - 100)).toBeLessThanOrEqual(2);
    const moved = web.x;
    expect(service<Selection>("selection").get()).toEqual([web]);
    for (const [id, element] of objects()) expect(before.get(id)).toBe(element);
    expectCanvasMatchesDocument(modeler);

    service<CommandStack>("commandStack").undo();
    expect(shape("web")).toBe(web);
    expect(web.x).toBe(40);
    expect(modeler.exportText()).toBe(SHOP);
    expectCanvasMatchesDocument(modeler);

    service<CommandStack>("commandStack").redo();
    expect(shape("web")).toBe(web);
    expect(web.x).toBe(moved);
    expect(modeler.elements.selection()).toEqual(["web"]);
    expectCanvasMatchesDocument(modeler);
  });

  it("a move redraws what it changes, and only that: the boundary when a member moved", () => {
    const changed: string[][] = [];
    service<EventBus>("eventBus").on("elements.changed", (event: { elements: Element[] }) => {
      changed.push(event.elements.map(({ id }) => id).sort());
    });
    const modeling = service<C4Modeling>("modeling");

    modeling.moveElements([shape("mail")], { x: 80, y: 0 });
    expect(changed).toEqual([["mail", "rel:api->mail"]]);
    expectCanvasMatchesDocument(modeler);

    modeling.moveElements([shape("web")], { x: -40, y: 0 });
    expect(changed[1]).toEqual(["boundary:shop", "rel:customer->web", "rel:web->api", "web"]);
    expectCanvasMatchesDocument(modeler);
  });

  it("a boundary drag moves what it frames, also in the preview, and nothing else", () => {
    const pointer = pointerOn(modeler.diagram);
    const before = new Map(["web", "api", "db", "customer", "mail"].map((id) => [id, shape(id).x]));
    const gesture = pointer.grab("boundary:shop", { x: 60, y: 90 });
    const dragged = [...modeler.diagram.container.querySelectorAll(".djs-dragger")].length;
    expect(dragged).toBeGreaterThanOrEqual(4);
    gesture.drop();

    expect(changes).toBe(1);
    const delta = shape("web").x - (before.get("web") ?? 0);
    expect(Math.abs(delta - 60)).toBeLessThanOrEqual(2);
    for (const id of ["api", "db"]) expect(shape(id).x).toBe((before.get(id) ?? 0) + delta);
    for (const id of ["customer", "mail"]) expect(shape(id).x).toBe(before.get(id));
    expectCanvasMatchesDocument(modeler);
  });

  it("an outer boundary takes the inner one and its members along", () => {
    modeler.views.open("Components-api", { cause: "user" });
    const outer = service<ElementRegistry>("elementRegistry").get("boundary:shop") as Element;
    const before = new Map(["orders", "billing", "db", "payments"].map((id) => [id, shape(id).x]));

    service<C4Modeling>("modeling").moveElements([outer], { x: 40, y: 0 });

    for (const id of ["orders", "billing", "db"]) {
      expect(shape(id).x).toBe((before.get(id) ?? 0) + 40);
    }
    expect(shape("payments").x).toBe(before.get("payments"));
    expect(modeler.views.active().state).toBe("written");
    expectCanvasMatchesDocument(modeler);
  });

  it("a resize keeps the object and stores the size", () => {
    const api = shape("api");
    service<C4Modeling>("modeling").resizeShape(api, { x: 400, y: 320, width: 320, height: 200 });

    expect(shape("api")).toBe(api);
    expect(api.width).toBe(320);
    expect(modeler.exportText()).toContain('"c4modeler.element.api" "400,320,320,200"');
    expectCanvasMatchesDocument(modeler);
  });

  it("a resize drag stops at the minimum size, a person's square (SPEC 5.7)", () => {
    const pointer = pointerOn(modeler.diagram);
    const resize = service<{
      activate(event: MouseEvent, shape: unknown, direction: string): void;
    }>("resize");
    const shrink = (id: string) => {
      const target = shape(id);
      const corner = { x: target.x + target.width, y: target.y + target.height };
      resize.activate(new MouseEvent("mousedown", pointer.client(corner)), target, "se");
      pointer.moveTo({ x: corner.x - 60, y: corner.y - 60 });
      pointer.moveTo({ x: target.x + 10, y: target.y + 10 });
      pointer.release({ x: target.x + 10, y: target.y + 10 });
      const { width, height } = shape(id);
      return { width, height };
    };

    expect(shrink("api")).toEqual({ width: 140, height: 100 });
    expect(shrink("customer")).toEqual({ width: 140, height: 140 });
    expect(changes).toBe(2);
    expect(modeler.exportText()).toContain('"c4modeler.element.api" "400,320,140,100"');
    expectCanvasMatchesDocument(modeler);
  });

  it("a rename redraws the element in place, and its undo draws it as it was", () => {
    const web = shape("web");
    service<Selection>("selection").select(web);
    const gfx = service<ElementRegistry>("elementRegistry").getGraphics(web);
    const visual = () => gfx.querySelector(".djs-visual")?.innerHTML;
    const drawn = visual();

    modeler.c4.editElement("web", { name: "Storefront" });

    expect(shape("web")).toBe(web);
    expect(service<ElementRegistry>("elementRegistry").getGraphics(web)).toBe(gfx);
    expect(gfx.textContent).toContain("Storefront");
    expect(service<Selection>("selection").get()).toEqual([web]);
    expectCanvasMatchesDocument(modeler);

    service<CommandStack>("commandStack").undo();
    expect(visual()).toBe(drawn);
    expectCanvasMatchesDocument(modeler);
  });

  it("a re-import of the same text replaces nothing and redraws nothing", async () => {
    const before = objects();
    const web = shape("web");
    service<Selection>("selection").select(web);
    const redrawn: string[] = [];
    service<EventBus>("eventBus").on(
      ["shape.changed", "connection.changed"],
      (event: { element: Element }) => {
        redrawn.push(event.element.id);
      },
    );

    await modeler.importText(SHOP, { view: "ShopContainers" });

    expect(redrawn).toEqual([]);
    for (const [id, element] of objects()) expect(before.get(id)).toBe(element);
    expect(objects().size).toBe(before.size);
    expect(service<Selection>("selection").get()).toEqual([web]);
    expect(changes).toBe(0);
    expectCanvasMatchesDocument(modeler);
  });

  it("a view switch keeps the objects of what both views show, and their selection", () => {
    const customer = shape("customer");
    const web = shape("web");
    service<Selection>("selection").select([customer, web]);

    modeler.views.open("ShopContext", { cause: "user" });
    expectCanvasMatchesDocument(modeler);
    expect(shape("customer")).toBe(customer);
    expect(service<ElementRegistry>("elementRegistry").get("web")).toBeUndefined();
    expect(service<Selection>("selection").get()).toEqual([customer]);
    expect(customer.x).toBe(0);

    modeler.views.open("ShopContainers", { cause: "user" });
    expect(shape("customer")).toBe(customer);
    expect(customer.x).toBe(40);
    expect(changes).toBe(0);
    expectCanvasMatchesDocument(modeler);
  });

  it("the sync returns what changed, and a second sync of the same scene nothing", () => {
    const reconciler = service<Reconciler>("c4Reconciler");
    const scene = service<SceneService>("c4Scene").current();
    expect(reconciler.sync(scene)).toEqual([]);
    expect(
      reconciler.sync(service<SceneService>("c4Scene").of("ShopContext")).length,
    ).toBeGreaterThan(0);
    expect(reconciler.sync(scene).map(({ id }) => id)).toContain("web");
    expect(reconciler.sync(scene)).toEqual([]);
    expectCanvasMatchesDocument(modeler);
  });
});

describe("relationships dock on the drawn outline (SPEC 1.3, 5.7)", () => {
  /** Whether `point` lies on the outline the renderer gives `shape`, within a unit and a half. */
  function onOutline(element: Element, point: { x: number; y: number }): boolean {
    const outline = service<GraphicsFactory>("graphicsFactory").getShapePath(element as Shape);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", outline);
    path.setAttribute("stroke-width", "3");
    svg.append(path);
    document.body.append(svg);
    try {
      const probe = svg.createSVGPoint();
      probe.x = point.x;
      probe.y = point.y;
      return path.isPointInStroke(probe);
    } finally {
      svg.remove();
    }
  }

  for (const view of ["Landscape", "ShopContext", "ShopContainers", "Components-api"]) {
    it(`both ends of every relationship in ${view}`, () => {
      modeler.views.open(view, { cause: "user" });
      const connections = (service<ElementRegistry>("elementRegistry").getAll() as Element[])
        .filter(isRelationshipConnection)
        .map((element) => element as unknown as Connection);
      expect(connections.length).toBeGreaterThan(0);
      for (const connection of connections) {
        const first = connection.waypoints[0];
        const last = connection.waypoints.at(-1);
        if (!first || !last) throw new Error(`${connection.id} has no waypoints`);
        expect(onOutline(connection.source as Element, first), `${connection.id} start`).toBe(true);
        expect(onOutline(connection.target as Element, last), `${connection.id} end`).toBe(true);
      }
    });
  }

  it("a person docks on its head when the line passes it", () => {
    modeler.views.open("ShopContext", { cause: "user" });
    const modeling = service<C4Modeling>("modeling");
    modeling.moveElements([shape("customer")], { x: 320, y: 600 });
    const customer = shape("customer");
    const connection = service<ElementRegistry>("elementRegistry").get(
      "rel:implied:customer->shop",
    ) as unknown as Connection;
    const [start] = connection.waypoints;
    if (!start) throw new Error("no waypoints");
    // The line leaves straight up: above the body, through the head's top.
    expect(start.y).toBeLessThan(customer.y + customer.width / 2.5);
    expect(onOutline(customer, start)).toBe(true);
    expectCanvasMatchesDocument(modeler);
  });
});

describe("an id the document re-keys moves with its object (SPEC 1.5 step 1)", () => {
  it("renaming an identifier keeps the object, its selection and its connections", () => {
    const api = shape("api");
    service<Selection>("selection").select(api);

    modeler.c4.renameIdentifier("api", "backend");

    expect(shape("backend")).toBe(api);
    expect(api.c4.id).toBe("backend");
    expect(service<ElementRegistry>("elementRegistry").get("api")).toBeUndefined();
    expect(modeler.elements.selection()).toEqual(["backend"]);
    const connection = service<ElementRegistry>("elementRegistry").get("rel:web->backend");
    expect(connection).toBeDefined();
    expect((connection as unknown as { target: Shape }).target).toBe(api);
    expect(modeler.exportText()).toContain('"c4modeler.element.backend" "400,320"');
    expectCanvasMatchesDocument(modeler);

    service<CommandStack>("commandStack").undo();
    expect(shape("api")).toBe(api);
    expect(api.c4.id).toBe("api");
    expect(modeler.exportText()).toBe(SHOP);
    expectCanvasMatchesDocument(modeler);
  });

  it("the first name of a fresh element re-keys it, and Tab opens the next field on the same object", async () => {
    pointerOn(modeler.diagram).pressPalette("create.container");
    const editing = service<LabelEditing>("labelEditing");
    const fresh = editing.openEdit()?.elementId ?? "";
    expect(fresh).toMatch(/^container_[0-9a-z]{4}$/);
    const created = shape(fresh);
    expectCanvasMatchesDocument(modeler);

    labelField().value = "Search";
    labelField().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await nextTask();

    expect(shape("search")).toBe(created);
    expect(editing.openEdit()?.elementId).toBe("search");
    expect(editing.openEdit()?.field).not.toBe("name");
    expect(modeler.exportText()).toContain('search = container "Search"');
    expect(modeler.exportText()).not.toContain(fresh);
    expectCanvasMatchesDocument(modeler);
  });
});
