/*
 * One view on the canvas at a time (SPEC 1.4, 1.6, 1.7, 9.4): a switch ends a gesture, takes a
 * label edit down and brings it back, holds an import a host makes meanwhile, and writes nothing.
 * Undo and redo return to the view of their edit; writing a draft and undoing that is no switch;
 * an edit that removes the view shown moves to the nearest view left, and its undo comes back.
 * After every step the canvas equals a fresh import (the invariant).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { CollaborativeDiagram } from "../../src/collaborative/index.js";
import type Gestures from "../../src/gestures/Gestures.js";
import type LabelEditing from "../../src/label-editing/LabelEditing.js";
import type C4Modeling from "../../src/modeling/C4Modeling.js";
import type { C4ElementShape } from "../../src/scene/types.js";
import { VIEW_CHANGED_EVENT, type ViewChangedEvent } from "../../src/services.js";
import { SHOP } from "./support/documents.js";
import { expectCanvasMatchesDocument } from "./support/invariant.js";
import { pointerOn } from "./support/pointer.js";
import { createTestModeler, removeHosts } from "./support/stack.js";

let modeler: CollaborativeDiagram;
let changes = 0;
let errors: unknown[] = [];
let switches: ViewChangedEvent[] = [];

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

function shown(id: string): boolean {
  return service<ElementRegistry>("elementRegistry").get(id) !== undefined;
}

function undo(): void {
  service<CommandStack>("commandStack").undo();
}

function redo(): void {
  service<CommandStack>("commandStack").redo();
}

function labelField(): HTMLTextAreaElement {
  const field = modeler.diagram.container.querySelector<HTMLTextAreaElement>(
    "textarea.diagram-label-editor",
  );
  if (!field) throw new Error("no label editor is open");
  return field;
}

function typeInto(id: string, text: string): void {
  service<LabelEditing>("labelEditing").activate(shape(id));
  labelField().value = text;
  labelField().dispatchEvent(new Event("input", { bubbles: true }));
}

function causes(): string[] {
  return switches.map(({ previous, view, cause }) => `${previous} -> ${view} (${cause})`);
}

beforeEach(async () => {
  ({ modeler } = createTestModeler());
  await modeler.importText(SHOP);
  changes = 0;
  errors = [];
  switches = [];
  modeler.onContentChanged(() => (changes += 1));
  service<EventBus>("eventBus").on(VIEW_CHANGED_EVENT, (event: ViewChangedEvent) => {
    switches.push({ view: event.view, previous: event.previous, cause: event.cause });
  });
  window.addEventListener("error", recordError);
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  expect(errors).toEqual([]);
  modeler.destroy();
  removeHosts();
});

describe("a switch outside a command (SPEC 1.7)", () => {
  it("shows the other view in place, writes nothing and keeps the history", () => {
    service<C4Modeling>("modeling").moveElements([shape("customer")], { x: 40, y: 0 });
    const text = modeler.exportText();

    expect(modeler.views.open("ShopContainers", { cause: "user" })).toBe(true);

    expect(modeler.views.active().key).toBe("ShopContainers");
    expect(modeler.getViewState()?.view).toBe("ShopContainers");
    expect(shown("web")).toBe(true);
    expect(shown("boundary:shop")).toBe(true);
    expect(causes()).toEqual(["Landscape -> ShopContainers (user)"]);
    expect(modeler.exportText()).toBe(text);
    expect(changes).toBe(1);
    expect(service<CommandStack>("commandStack").canUndo()).toBe(true);
    expectCanvasMatchesDocument(modeler);
  });

  it("an unknown view and the view shown already change nothing", () => {
    expect(modeler.views.open("Nowhere", { cause: "user" })).toBe(false);
    expect(modeler.views.open("Landscape", { cause: "user" })).toBe(true);
    expect(switches).toEqual([]);
    expectCanvasMatchesDocument(modeler);
  });

  it("remembers the viewbox the view was left at", () => {
    const canvas = service<Canvas>("canvas");
    canvas.viewbox({ x: -100, y: -50, width: 400, height: 300 });
    const left = canvas.viewbox();

    modeler.views.open("ShopContext", { cause: "user" });

    expect(modeler.views.viewboxFor("Landscape")).toEqual({
      x: left.x,
      y: left.y,
      width: left.width,
      height: left.height,
    });
    modeler.views.open("Landscape", { cause: "user" });
    expect(canvas.viewbox().x).toBeCloseTo(left.x, 3);
    expect(canvas.viewbox().width).toBeCloseTo(left.width, 3);
    expectCanvasMatchesDocument(modeler);
  });

  it("ends a running gesture the way Escape does", async () => {
    const pointer = pointerOn(modeler.diagram);
    const gesture = pointer.grab("customer", { x: 90, y: 60 });
    await nextTask();
    expect(modeler.interaction.active()).toBe(true);

    modeler.views.open("ShopContext", { cause: "user" });
    expect(pointer.dragPrefix()).toBeUndefined();
    expect(modeler.interaction.active()).toBe(false);
    gesture.drop();

    expect(changes).toBe(0);
    expect(modeler.exportText()).toBe(SHOP);
    expect(modeler.diagram.container.querySelector(".djs-drag-group")).toBeNull();
    expectCanvasMatchesDocument(modeler);
  });

  describe("ends every other kind of gesture as well, and its release applies nothing", () => {
    interface Started {
      readonly release: { x: number; y: number };
    }
    const gestures: ReadonlyArray<readonly [string, () => Started]> = [
      [
        "a boundary drag",
        () => {
          const pointer = pointerOn(modeler.diagram);
          pointer.grab("boundary:shop", { x: 60, y: 90 });
          return { release: { x: 600, y: 600 } };
        },
      ],
      [
        "a resize",
        () => {
          const api = shape("api");
          const corner = { x: api.x + api.width, y: api.y + api.height };
          const pointer = pointerOn(modeler.diagram);
          service<{ activate(event: MouseEvent, shape: unknown, direction: string): void }>(
            "resize",
          ).activate(new MouseEvent("mousedown", pointer.client(corner)), api, "se");
          pointer.moveTo({ x: corner.x + 40, y: corner.y + 40 });
          pointer.moveTo({ x: corner.x + 80, y: corner.y + 60 });
          return { release: { x: corner.x + 80, y: corner.y + 60 } };
        },
      ],
      [
        "a bendpoint drag",
        () => {
          const connection = service<ElementRegistry>("elementRegistry").get(
            "rel:web->api",
          ) as unknown as { waypoints: { x: number; y: number }[] };
          const [start, end] = connection.waypoints;
          if (!start || !end) throw new Error("no waypoints");
          const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
          const pointer = pointerOn(modeler.diagram);
          service<{
            start(event: MouseEvent, connection: unknown, index: number, insert: boolean): void;
          }>("bendpointMove").start(
            new MouseEvent("mousedown", pointer.client(middle)),
            connection,
            1,
            true,
          );
          pointer.moveTo({ x: middle.x, y: middle.y + 40 });
          pointer.moveTo({ x: middle.x, y: middle.y + 80 });
          return { release: { x: middle.x, y: middle.y + 80 } };
        },
      ],
      [
        "a connect",
        () => {
          const from = shape("db");
          const at = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
          const pointer = pointerOn(modeler.diagram);
          service<{ start(event: MouseEvent, source: unknown, autoActivate?: boolean): void }>(
            "connect",
          ).start(new MouseEvent("mousedown", pointer.client(at)), from);
          pointer.moveTo({ x: at.x + 60, y: at.y });
          pointer.moveTo({ x: at.x + 200, y: at.y - 100 });
          return { release: { x: at.x + 200, y: at.y - 100 } };
        },
      ],
    ];

    for (const [what, start] of gestures) {
      it(what, async () => {
        modeler.views.open("ShopContainers", { cause: "user" });
        const pointer = pointerOn(modeler.diagram);
        const { release } = start();
        expect(pointer.dragPrefix()).toBeDefined();
        expect(modeler.interaction.active()).toBe(true);

        modeler.views.open("ShopContext", { cause: "user" });
        expect(pointer.dragPrefix()).toBeUndefined();
        expect(modeler.interaction.active()).toBe(false);
        pointer.release(release);
        await nextTask();

        expect(changes).toBe(0);
        expect(modeler.exportText()).toBe(SHOP);
        expect(modeler.diagram.container.querySelector(".djs-drag-group")).toBeNull();
        expectCanvasMatchesDocument(modeler);
      });
    }
  });

  it("takes a label edit down without committing it and reopens it where the element is shown", async () => {
    typeInto("customer", "typed, not committed");

    modeler.views.open("ShopContext", { cause: "user" });
    await nextTask();

    expect(service<LabelEditing>("labelEditing").openEdit()).toEqual({
      elementId: "customer",
      text: "typed, not committed",
      field: "name",
    });
    expect(changes).toBe(0);
    expect(modeler.exportText()).toBe(SHOP);
    expectCanvasMatchesDocument(modeler);
  });

  it("holds an import the switch's selection change makes until the switch has drawn the view", async () => {
    service<Selection>("selection").select(shape("customer"));
    const order: string[] = [];
    let reimport: Promise<unknown> | undefined;
    modeler.elements.onSelection(() => {
      reimport ??= modeler.importText(modeler.exportText());
    });
    service<EventBus>("eventBus").on("import.render.start", () => order.push("import"));
    service<EventBus>("eventBus").on(VIEW_CHANGED_EVENT, () => order.push("switched"));

    modeler.views.open("SystemContext-mail", { cause: "user" });
    expect(reimport).toBeDefined();
    expect(order).toEqual(["switched"]);
    await reimport;

    expect(order).toEqual(["switched", "import"]);
    expect(modeler.views.active().key).toBe("Landscape");
    expectCanvasMatchesDocument(modeler);
  });
});

describe("setViewState with a view (SPEC 1.7)", () => {
  it("switches without an event of its own kind and sets the box", () => {
    modeler.setViewState({ view: "ShopContainers", x: 10, y: 20, width: 400, height: 300 });

    expect(modeler.views.active().key).toBe("ShopContainers");
    expect(causes()).toEqual(["Landscape -> ShopContainers (host)"]);
    const state = modeler.getViewState();
    expect(Object.keys(state ?? {})).toEqual(["view", "x", "y", "width", "height"]);
    expect(state?.x).toBeCloseTo(10, 3);
    expect(changes).toBe(0);
    expectCanvasMatchesDocument(modeler);
  });

  it("an unknown view is ignored, the box still applies", () => {
    modeler.setViewState({ view: "Nowhere", x: 10, y: 20, width: 400, height: 300 });
    expect(modeler.views.active().key).toBe("Landscape");
    expect(modeler.getViewState()?.x).toBeCloseTo(10, 3);
    expect(switches).toEqual([]);
    expectCanvasMatchesDocument(modeler);
  });

  it("waits during the user's action and joins the import queue, which resets after it", async () => {
    const order: string[] = [];
    const eventBus = service<EventBus>("eventBus");
    eventBus.on(VIEW_CHANGED_EVENT, (event: ViewChangedEvent) => order.push(event.view));
    eventBus.on("import.render.start", () => order.push("import"));
    const release = service<Gestures>("gestures").holdAction();
    modeler.setViewState({ view: "ShopContainers", x: 0, y: 0, width: 800, height: 600 });
    expect(modeler.views.active().key).toBe("Landscape");

    let reimport: Promise<unknown> | undefined;
    modeler.onContentChanged(() => {
      reimport ??= modeler.importText(modeler.exportText());
    });
    pointerOn(modeler.diagram).grab("customer", { x: 0, y: 120 }).drop();
    expect(changes).toBe(1);
    expect(reimport).toBeDefined();
    expect(order).toEqual([]);
    release();
    await reimport;

    // The switch the host asked for first, then the import, which shows the default view.
    expect(order).toEqual(["ShopContainers", "import"]);
    expect(modeler.views.active().key).toBe("Landscape");
    await nextTask();
    modeler.setViewState({ view: "ShopContext", x: 0, y: 0, width: 800, height: 600 });
    expect(modeler.views.active().key).toBe("ShopContext");
    expectCanvasMatchesDocument(modeler);
  });

  it("brings a parked label edit back once the view shows its element (SPEC 5.5)", async () => {
    modeler.views.open("ShopContainers", { cause: "user" });
    await nextTask();
    typeInto("web", "typed, not committed");

    await modeler.importText(modeler.exportText());
    await nextTask();
    expect(modeler.views.active().key).toBe("Landscape");
    expect(service<LabelEditing>("labelEditing").openEdit()).toBeUndefined();

    modeler.setViewState({ view: "ShopContainers", x: 0, y: 0, width: 800, height: 600 });
    await nextTask();

    expect(service<LabelEditing>("labelEditing").openEdit()).toEqual({
      elementId: "web",
      text: "typed, not committed",
      field: "name",
    });
    expect(modeler.exportText()).toBe(SHOP);
    expect(changes).toBe(0);
    expectCanvasMatchesDocument(modeler);
  });
});

describe("undo and redo across views (SPEC 1.4, 1.6)", () => {
  it("undo shows the edit's view, inside the command, and the change listener reads it already", () => {
    service<C4Modeling>("modeling").moveElements([shape("customer")], { x: 40, y: 0 });
    modeler.views.open("ShopContainers", { cause: "user" });
    const seen: Array<string | undefined> = [];
    modeler.onContentChanged(() => seen.push(modeler.getViewState()?.view));

    undo();
    expect(modeler.views.active().key).toBe("Landscape");
    expect(modeler.exportText()).toBe(SHOP);
    expectCanvasMatchesDocument(modeler);

    modeler.views.open("ShopContext", { cause: "user" });
    redo();
    expect(modeler.views.active().key).toBe("Landscape");
    expect(seen).toEqual(["Landscape", "Landscape"]);
    expect(causes()).toEqual([
      "Landscape -> ShopContainers (user)",
      "ShopContainers -> Landscape (undo)",
      "Landscape -> ShopContext (user)",
      "ShopContext -> Landscape (redo)",
    ]);
    expectCanvasMatchesDocument(modeler);
  });

  it("writing a draft and undoing that keep the view's key: no switch", () => {
    modeler.views.open("Components-api", { cause: "user" });
    expect(modeler.views.active().state).toBe("draft");
    switches = [];

    service<C4Modeling>("modeling").moveElements([shape("orders")], { x: 40, y: 40 });
    expect(modeler.views.active()).toMatchObject({ key: "Components-api", state: "written" });
    expect(modeler.exportText()).toContain('component api "Components-api" {');
    expectCanvasMatchesDocument(modeler);

    undo();
    expect(modeler.views.active()).toMatchObject({ key: "Components-api", state: "draft" });
    expect(modeler.exportText()).toBe(SHOP);
    expectCanvasMatchesDocument(modeler);
    redo();
    expect(modeler.views.active().state).toBe("written");
    expect(switches).toEqual([]);
    expectCanvasMatchesDocument(modeler);
  });

  it("deleting the view shown moves to its parent; undo comes back, redo leaves again", () => {
    modeler.views.open("ShopContext", { cause: "user" });
    switches = [];

    modeler.c4.deleteView("ShopContext");
    expect(modeler.views.active().key).toBe("Landscape");
    expect(modeler.exportText()).not.toContain('"ShopContext"');
    expectCanvasMatchesDocument(modeler);

    undo();
    expect(modeler.views.active().key).toBe("ShopContext");
    expect(modeler.exportText()).toBe(SHOP);
    expectCanvasMatchesDocument(modeler);

    redo();
    expect(modeler.views.active().key).toBe("Landscape");
    expect(causes()).toEqual([
      "ShopContext -> Landscape (removed)",
      "Landscape -> ShopContext (undo)",
      "ShopContext -> Landscape (removed)",
    ]);
    expectCanvasMatchesDocument(modeler);
  });

  it("deleting the scope of the written view shown removes it with its views; undo comes back", () => {
    modeler.views.open("ShopContainers", { cause: "user" });
    switches = [];

    modeler.c4.deleteFromModel(["shop"], []);
    expect(modeler.views.active().key).toBe("Landscape");
    expect(modeler.exportText()).not.toContain("ShopContainers");
    expect(shown("customer")).toBe(true);
    expectCanvasMatchesDocument(modeler);

    undo();
    expect(modeler.views.active().key).toBe("ShopContainers");
    expect(modeler.exportText()).toBe(SHOP);
    expect(causes()).toEqual([
      "ShopContainers -> Landscape (removed)",
      "Landscape -> ShopContainers (undo)",
    ]);
    expectCanvasMatchesDocument(modeler);
  });

  it("deleting the scope of the draft shown moves to its parent; undo comes back", () => {
    modeler.views.open("Containers-payments", { cause: "user" });
    expect(modeler.views.active().state).toBe("draft");
    expect(shown("boundary:payments")).toBe(true);
    switches = [];

    modeler.c4.deleteFromModel(["payments"], []);
    expect(modeler.views.active().key).toBe("Landscape");
    expect(shown("payments")).toBe(false);
    expectCanvasMatchesDocument(modeler);

    undo();
    expect(modeler.views.active().key).toBe("Containers-payments");
    expect(modeler.exportText()).toBe(SHOP);
    expect(causes()).toEqual([
      "Containers-payments -> Landscape (removed)",
      "Landscape -> Containers-payments (undo)",
    ]);
    expectCanvasMatchesDocument(modeler);
  });

  it("re-keying the draft shown keeps the place the user looks at, through undo and redo (SPEC 4.2)", () => {
    modeler.views.open("Components-api", { cause: "user" });
    const canvas = service<Canvas>("canvas");
    canvas.viewbox({ x: -333, y: -222, width: 500, height: 400 });
    const place = canvas.viewbox();
    switches = [];
    const expectPlaceKept = () => {
      const viewbox = canvas.viewbox();
      expect(viewbox.x).toBeCloseTo(place.x, 3);
      expect(viewbox.y).toBeCloseTo(place.y, 3);
      expect(viewbox.width).toBeCloseTo(place.width, 3);
    };

    modeler.c4.renameIdentifier("api", "backend");
    expect(modeler.views.active().key).toBe("Components-backend");
    expectPlaceKept();
    expect(modeler.views.viewboxFor("Components-api")).toBeUndefined();
    expectCanvasMatchesDocument(modeler);

    undo();
    expect(modeler.views.active().key).toBe("Components-api");
    expectPlaceKept();
    expectCanvasMatchesDocument(modeler);

    redo();
    expect(modeler.views.active().key).toBe("Components-backend");
    expectPlaceKept();
    expect(causes()).toEqual([
      "Components-api -> Components-backend (rekey)",
      "Components-backend -> Components-api (undo)",
      "Components-api -> Components-backend (rekey)",
    ]);
    expectCanvasMatchesDocument(modeler);
  });

  it("deleting the view shown forgets its place, so its undo fits again (SPEC 7.5)", () => {
    modeler.views.open("ShopContext", { cause: "user" });
    const canvas = service<Canvas>("canvas");
    canvas.viewbox({ x: -333, y: -222, width: 500, height: 400 });

    modeler.c4.deleteView("ShopContext");
    expect(modeler.views.viewboxFor("ShopContext")).toBeUndefined();

    undo();
    expect(modeler.views.active().key).toBe("ShopContext");
    expect(canvas.viewbox().x).not.toBeCloseTo(-333, 0);
    expectCanvasMatchesDocument(modeler);
  });

  it("a new view is shown by the command that writes it", () => {
    modeler.c4.createView("systemContext", "payments", "Payments in context");
    const created = modeler.views.active();
    expect(created.state).toBe("written");
    expect(created.scopeId).toBe("payments");
    expect(causes()).toEqual([`Landscape -> ${created.key} (user)`]);
    expectCanvasMatchesDocument(modeler);

    undo();
    expect(modeler.views.active().key).toBe("Landscape");
    expect(modeler.exportText()).toBe(SHOP);
    expectCanvasMatchesDocument(modeler);
  });
});
