/*
 * The template's gestures test (the new-modeler kit's gestures.browser.test.ts), ported onto the
 * kit's fixtures and the shipped stack (SPEC 9.4): `order` is `customer`, `pay` is `bookshop` and
 * `payments` is `LIBRARY`. Then what C4 adds: every gesture is one verified document command
 * (SPEC 1.3, 1.4), the drags of the pad, the bendpoints, the resizer and a boundary, each ended by
 * an import and by a host's view switch, and the views on one root (SPEC 1.7).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GestureKind, HeldGesture } from "@miragon/modeler-api/conformance";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Connection, Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  type CollaborativeDiagram,
} from "../../src/collaborative/index.js";
import type Gestures from "../../src/gestures/Gestures.js";
import type LabelEditing from "../../src/label-editing/LabelEditing.js";
import type C4Modeling from "../../src/modeling/C4Modeling.js";
import { C4UnsupportedOperationError } from "../../src/modeling/errors.js";
import type SceneService from "../../src/scene/SceneService.js";
import { RELATIONSHIP_PREVIEW, type C4ElementShape } from "../../src/scene/types.js";
import {
  EDIT_REFUSED_EVENT,
  VIEW_CHANGED_EVENT,
  type ViewChangedEvent,
} from "../../src/services.js";
import { BOOKSHOP, BOOKSHOP_LOOSE, LIBRARY, UNCLOSED } from "./fixtures/texts.js";
import {
  FREE_SPOT,
  GESTURE_KINDS,
  armLasso,
  createSystem,
  harnessHost,
  holdGesture,
  mountModeler,
  mountViewer,
  mutate,
  removeHarnessHosts,
  shapeIn,
  labelFieldOf,
} from "./support/harness.js";
import { expectCanvasMatchesDocument } from "./support/invariant.js";
import { pointerOn, pressEscape, type Point } from "./support/pointer.js";
import { engineModule, probedEngine, type ProbedEngine } from "./support/stack.js";

interface ClientPoint {
  clientX: number;
  clientY: number;
}

let lastEngine: ProbedEngine | undefined;

/** The editing mount on the probed real engine, so a test can make the edit layer refuse. */
async function probedModeler(): Promise<CollaborativeDiagram> {
  lastEngine = probedEngine();
  return mountModeler({ additionalModules: [engineModule(lastEngine)] });
}

let modeler: CollaborativeDiagram;
let engine: ProbedEngine;
let changes = 0;
let errors: unknown[] = [];
let createdNodes = 0;
let destroyed = false;

function recordError(event: ErrorEvent): void {
  errors.push(event.error);
}

/**
 * The next task, where a user's next input comes: the action of the input before has finished, and
 * an edit an import took down has opened again.
 */
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the gestures of the template and the C4 modeling, on the real engine", () => {
  beforeEach(async () => {
    modeler = await probedModeler();
    engine = lastEngine as ProbedEngine;
    await modeler.importText(BOOKSHOP);
    changes = 0;
    errors = [];
    modeler.onContentChanged(() => (changes += 1));
    window.addEventListener("error", recordError);
    destroyed = false;
    const destroy = modeler.destroy;
    modeler.destroy = () => {
      destroyed = true;
      destroy();
    };
  });

  afterEach(() => {
    window.removeEventListener("error", recordError);
    try {
      // Whatever the test left, the canvas at rest is what a fresh import draws (SPEC 9.4).
      if (!destroyed) expectCanvasMatchesDocument(modeler);
    } finally {
      // A canvas that fails the invariant must not leave its modeler to the next test.
      modeler.destroy();
      removeHarnessHosts();
    }
  });

  function service<T>(name: string): T {
    return modeler.diagram.get<T>(name);
  }

  function node(id: string): C4ElementShape {
    return shapeIn(modeler, id);
  }

  function nameOf(id: string): string | undefined {
    return service<SceneService>("c4Scene")
      .current()
      .elements.find((element) => element.id === id)?.name;
  }

  function centreOf(id: string): Point {
    const { x, y, width, height } = node(id);
    return { x: x + width / 2, y: y + height / 2 };
  }

  function client(point: Point): ClientPoint {
    return pointerOn(modeler.diagram).client(point);
  }

  function pointer(type: string, at: Point, init: MouseEventInit = {}): MouseEvent {
    return pointerOn(modeler.diagram).event(type, at, init);
  }

  function press(target: EventTarget, at: Point, init: MouseEventInit = {}): void {
    target.dispatchEvent(pointer("mousedown", at, init));
  }

  function moveTo(at: Point): void {
    document.dispatchEvent(pointer("mousemove", at));
  }

  function hover(target: EventTarget, at: Point): void {
    target.dispatchEvent(pointer("mouseover", at));
    moveTo(at);
  }

  function release(at: Point): void {
    document.dispatchEvent(pointer("mouseup", at));
  }

  function canvasSvg(): SVGSVGElement {
    return pointerOn(modeler.diagram).svg;
  }

  function graphics(id: string): SVGElement {
    return service<ElementRegistry>("elementRegistry").getGraphics(node(id));
  }

  function paletteEntry(action: string): { entry: Element; at: Point } {
    return pointerOn(modeler.diagram).paletteEntry(action);
  }

  function clickPalette(action: string): Point {
    return pointerOn(modeler.diagram).clickPalette(action);
  }

  function dragPrefix(): string | undefined {
    return (service<Dragging>("dragging").context() as { prefix: string } | null)?.prefix;
  }

  function startGesture(kind: GestureKind): HeldGesture {
    return holdGesture(modeler, kind);
  }

  function armTool(): void {
    armLasso(modeler);
  }

  function addNode(): Shape {
    createdNodes += 1;
    const created = createSystem(modeler, `Node ${createdNodes}`);
    if (!created) throw new Error("the create was refused");
    return created;
  }

  function recordInteraction(): boolean[] {
    const calls: boolean[] = [];
    modeler.interaction.onChange((active) => calls.push(active));
    return calls;
  }

  /** The import replaced the document and the gesture applied nothing, also on its release. */
  function expectImportOnly(text: string): void {
    expect(errors).toEqual([]);
    expect(changes).toBe(0);
    expect(modeler.exportText()).toBe(text);
    service<CommandStack>("commandStack").undo();
    expect(changes).toBe(0);
    expect(modeler.exportText()).toBe(text);
    addNode();
    expect(changes).toBe(1);
  }

  const elementCount = (text: string) =>
    text.split("\n").filter((line) => / = (person|softwareSystem) /.test(line)).length;

  describe("an accepted import ends a running gesture the way Escape does", () => {
    for (const kind of GESTURE_KINDS) {
      for (const [which, text] of [
        ["another document", LIBRARY],
        ["the same document again", BOOKSHOP],
      ] as const) {
        it(`${kind}, importing ${which}`, async () => {
          const gesture = startGesture(kind);
          await nextTask();
          expect(modeler.interaction.active()).toBe(true);
          const calls = recordInteraction();

          const imported = modeler.importText(text);
          expect(dragPrefix()).toBeUndefined();
          expect(modeler.interaction.active()).toBe(false);
          expect(calls).toEqual([false]);
          await imported;
          gesture.drop();

          expectImportOnly(text);
          expect(modeler.diagram.container.querySelector(".djs-drag-group")).toBeNull();
        });
      }
    }

    it("a press that has not reached the drag threshold yet", async () => {
      const start = centreOf("customer");
      press(graphics("customer"), start);
      moveTo({ x: start.x + 2, y: start.y });
      expect(dragPrefix()).toBe("shape.move");
      expect(modeler.interaction.active()).toBe(false);

      await modeler.importText(LIBRARY);
      expect(dragPrefix()).toBeUndefined();
      moveTo({ x: start.x + 80, y: start.y });
      release({ x: start.x + 80, y: start.y });

      expectImportOnly(LIBRARY);
    });

    it("a lasso drawn with Shift and a press on the canvas", async () => {
      const start = { x: 20, y: 300 };
      press(canvasSvg(), start, { shiftKey: true });
      moveTo({ x: 300, y: 20 });
      expect(dragPrefix()).toBe("lasso");

      await modeler.importText(BOOKSHOP);
      moveTo({ x: 700, y: 20 });
      release({ x: 700, y: 20 });

      expect(service<Selection>("selection").get()).toEqual([]);
      expectImportOnly(BOOKSHOP);
    });

    it("a rejected import leaves the gesture running, and its drop applies", async () => {
      const gesture = startGesture("move");
      const calls = recordInteraction();

      await expect(modeler.importText(UNCLOSED)).rejects.toThrow();
      expect(dragPrefix()).toBe("shape.move");
      expect(modeler.interaction.active()).toBe(true);
      expect(calls).toEqual([]);
      gesture.drop();

      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(calls).toEqual([false]);
      expect(node("customer").x).toBe(100);
    });
  });

  describe("a drag that holds no element runs on through an import", () => {
    it("the lasso the palette armed stays armed for the next press", async () => {
      armTool();
      const calls = recordInteraction();

      await modeler.importText(LIBRARY);
      expect(dragPrefix()).toBe("lasso.selection");
      expect(modeler.interaction.active()).toBe(false);
      expect(calls).toEqual([]);

      const start = { x: 20, y: 300 };
      hover(canvasSvg(), start);
      press(canvasSvg(), start);
      expect(dragPrefix()).toBe("lasso");
    });

    it("the hand the palette armed stays armed", async () => {
      const at = clickPalette("hand-tool");
      moveTo({ x: at.x + 60, y: at.y + 60 });

      await modeler.importText(LIBRARY);
      expect(dragPrefix()).toBe("hand");
      expect(modeler.interaction.active()).toBe(false);
    });

    function pressPan(start: Point): ClientPoint {
      const at = clickPalette("hand-tool");
      hover(canvasSvg(), { x: at.x + 60, y: at.y + 60 });
      hover(canvasSvg(), start);
      press(canvasSvg(), start);
      expect(dragPrefix()).toBe("hand.move");
      return client(start);
    }

    function startPan(): ClientPoint {
      const start = { x: 300, y: 400 };
      pressPan(start);
      moveTo({ x: start.x + 30, y: start.y });
      const pointerAt = client({ x: start.x + 60, y: start.y });
      panTo(pointerAt);
      expect(dragPrefix()).toBe("hand.move");
      return pointerAt;
    }

    function panTo({ clientX, clientY }: ClientPoint): void {
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX, clientY }));
    }

    it("the hand tool's pan goes on from the view the import fitted", async () => {
      const calls = recordInteraction();
      const { clientX, clientY } = startPan();

      await modeler.importText(LIBRARY);
      expect(dragPrefix()).toBe("hand.move");
      const fitted = service<Canvas>("canvas").viewbox();
      panTo({ clientX: clientX + 40, clientY });
      const panned = service<Canvas>("canvas").viewbox();

      // diagram-js rounds the distance a pan moved to whole diagram units.
      expect(panned.x).toBeCloseTo(fitted.x - Math.round(40 / fitted.scale), 3);
      expect(panned.y).toBeCloseTo(fitted.y, 3);
      expect(modeler.interaction.active()).toBe(false);
      expect(calls).toEqual([]);
      expect(changes).toBe(0);
    });

    it("the pan goes on from the view a host restores after the import (L5)", async () => {
      const { clientX, clientY } = startPan();
      const before = service<Canvas>("canvas").viewbox();
      const snapshot = modeler.getViewState();

      await modeler.importText(LIBRARY);
      modeler.setViewState(snapshot);
      const restored = service<Canvas>("canvas").viewbox();
      panTo({ clientX: clientX + 40, clientY });
      const panned = service<Canvas>("canvas").viewbox();

      expect(restored.x).toBeCloseTo(before.x, 3);
      expect(restored.y).toBeCloseTo(before.y, 3);
      expect(panned.x).toBeCloseTo(restored.x - 40 / restored.scale, 3);
      expect(panned.y).toBeCloseTo(restored.y, 3);
      expect(dragPrefix()).toBe("hand.move");
    });

    it("the pan goes on from a view the host sets while it runs", () => {
      const { clientX, clientY } = startPan();
      const { x, y, width, height } = service<Canvas>("canvas").viewbox();
      modeler.setViewState({ x: x + 500, y: y - 300, width: width * 2, height: height * 2 });
      const changed = service<Canvas>("canvas").viewbox();
      panTo({ clientX: clientX + 40, clientY: clientY + 20 });
      const panned = service<Canvas>("canvas").viewbox();

      expect(panned.x).toBeCloseTo(changed.x - 40 / changed.scale, 3);
      expect(panned.y).toBeCloseTo(changed.y - 20 / changed.scale, 3);
    });

    it("a slow pan at a zoom above 200 % keeps the diagram under the pointer (#382)", () => {
      const canvas = service<Canvas>("canvas");
      const rect = canvas.getContainer().getBoundingClientRect();
      const { x, y } = canvas.viewbox();
      modeler.setViewState({ x, y, width: rect.width / 3, height: rect.height / 3 });
      const zoomed = canvas.viewbox();
      expect(zoomed.scale).toBeCloseTo(3, 3);
      const start = pressPan({ x: x + zoomed.width / 2, y: y + zoomed.height / 2 });

      for (let moved = 1; moved <= 30; moved += 1) {
        panTo({ clientX: start.clientX + moved, clientY: start.clientY });
      }

      expect(dragPrefix()).toBe("hand.move");
      expect(Math.abs(canvas.viewbox().x - (zoomed.x - 30 / zoomed.scale))).toBeLessThanOrEqual(
        0.5,
      );
      expect(canvas.viewbox().y).toBeCloseTo(zoomed.y, 3);
    });

    it("a view listener that fails during a pan ends it, and the next pan goes on from a view the host sets", () => {
      const eventBus = service<EventBus>("eventBus");
      const dragging = service<Dragging>("dragging");
      const failingListener = (): never => {
        eventBus.off("canvas.viewbox.changed", failingListener);
        throw new Error("view listener failed");
      };
      const { clientX, clientY } = startPan();
      eventBus.on("canvas.viewbox.changed", failingListener);
      expect(() =>
        dragging.move(
          new MouseEvent("mousemove", {
            bubbles: true,
            cancelable: true,
            clientX: clientX + 30,
            clientY,
          }),
          false,
        ),
      ).toThrow("view listener failed");
      expect(dragPrefix()).toBeUndefined();

      const start = pressPan({ x: 300, y: 400 });
      const { x, y, width, height } = service<Canvas>("canvas").viewbox();
      modeler.setViewState({ x: x + 500, y, width, height });
      const changed = service<Canvas>("canvas").viewbox();
      panTo({ clientX: start.clientX + 40, clientY: start.clientY });
      const panned = service<Canvas>("canvas").viewbox();

      expect(dragPrefix()).toBe("hand.move");
      expect(panned.x).toBeCloseTo(changed.x - 40 / changed.scale, 3);
      expect(panned.y).toBeCloseTo(changed.y, 3);
    });
  });

  describe("an import called during a user action waits until the action has finished (#248, #285)", () => {
    function watchDrop(): { importsDuringDrop: number; endings: string[] } {
      const watch = { importsDuringDrop: 0, endings: [] as string[] };
      let dropping = false;
      const eventBus = service<EventBus>("eventBus");
      eventBus.on("drag.end", 200_000, () => {
        dropping = true;
      });
      eventBus.on(["drag.ended", "drag.canceled"], 1, (event: { type: string }) => {
        watch.endings.push(event.type);
        dropping = false;
      });
      eventBus.on("import.render.start", () => {
        if (dropping) watch.importsDuringDrop += 1;
      });
      return watch;
    }

    it("a move with an element selected before the drag, onto a document without the moved element", async () => {
      const watch = watchDrop();
      let reimport: Promise<unknown> | undefined;
      let settled = false;
      modeler.onContentChanged(() => {
        reimport ??= modeler.importText(LIBRARY).then(() => (settled = true));
      });
      service<Selection>("selection").select(node("bookshop"));

      startGesture("move").drop();
      expect(reimport).toBeDefined();
      expect(settled).toBe(false);
      expect(watch.endings).toEqual(["drag.ended"]);
      await reimport;

      expect(errors).toEqual([]);
      expect(watch.importsDuringDrop).toBe(0);
      expect(modeler.exportText()).toBe(LIBRARY);
    });

    for (const kind of ["create", "createOffCanvas"] as const) {
      it(`a ${kind} whose change a host imports back as it is`, async () => {
        const watch = watchDrop();
        let reimport: Promise<unknown> | undefined;
        modeler.onContentChanged(() => {
          reimport ??= modeler.importText(modeler.exportText());
        });

        startGesture(kind).drop();
        const created = modeler.exportText();
        await reimport;

        expect(errors).toEqual([]);
        expect(watch.importsDuringDrop).toBe(0);
        expect(watch.endings).toEqual(["drag.ended"]);
        expect(changes).toBe(1);
        expect(modeler.exportText()).toBe(created);
        expect(modeler.elements.list()).toHaveLength(4);
      });
    }

    it("imports run in call order, also one called after the drop while an earlier one waits", async () => {
      const order: string[] = [];
      const imports: Array<Promise<unknown>> = [];
      modeler.onContentChanged(() => {
        if (imports.length > 0) return;
        imports.push(
          modeler.importText(LIBRARY).then(() => order.push("library")),
          modeler.importText(BOOKSHOP).then(() => order.push("bookshop")),
        );
      });

      startGesture("move").drop();
      imports.push(modeler.importText(LIBRARY).then(() => order.push("library again")));
      await Promise.all(imports);

      expect(order).toEqual(["library", "bookshop", "library again"]);
      expect(modeler.exportText()).toBe(LIBRARY);
      expect(errors).toEqual([]);
    });

    it("a rejected text rejects once the drop has ended, which applied", async () => {
      let reimport: Promise<unknown> | undefined;
      modeler.onContentChanged(() => {
        reimport ??= modeler.importText(UNCLOSED);
      });

      startGesture("move").drop();

      await expect(reimport).rejects.toThrow();
      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(node("customer").x).toBe(100);
    });

    it("the diagram's own importText leaves a drop that is applied to finish", async () => {
      const watch = watchDrop();
      let echoed = false;
      modeler.onContentChanged(() => {
        if (echoed) return;
        echoed = true;
        modeler.diagram.importText(modeler.exportText());
      });

      startGesture("move").drop();

      expect(echoed).toBe(true);
      expect(errors).toEqual([]);
      expect(watch.endings).toEqual(["drag.ended"]);
      expect(node("customer").x).toBe(100);
    });

    function echoOnce(): () => Promise<unknown> | undefined {
      let reimport: Promise<unknown> | undefined;
      modeler.onContentChanged(() => {
        reimport ??= modeler.importText(modeler.exportText());
      });
      return () => reimport;
    }

    function countImports(): { rendered: number } {
      const count = { rendered: 0 };
      service<EventBus>("eventBus").on("import.render.start", () => (count.rendered += 1));
      return count;
    }

    function labelField(): HTMLTextAreaElement {
      return labelFieldOf(modeler);
    }

    function editLabel(id: string, text: string): void {
      service<LabelEditing>("labelEditing").activate(node(id));
      labelField().value = text;
    }

    function commitLabel(text: string): void {
      labelField().value = text;
      labelField().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }

    function createWithKeyboard(): void {
      const { entry } = paletteEntry("create.softwareSystem");
      entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    }

    for (const [count, which] of [
      [1, "one import"],
      [2, "two imports"],
    ] as const) {
      it(`a keyboard create: the name typed after ${which} from its change lands`, async () => {
        const imports: Array<Promise<unknown>> = [];
        modeler.onContentChanged(() => {
          if (imports.length > 0) return;
          const text = modeler.exportText();
          for (let index = 0; index < count; index += 1) imports.push(modeler.importText(text));
        });
        const watch = countImports();

        createWithKeyboard();
        const opened = service<LabelEditing>("labelEditing").openEdit();
        expect(imports).toHaveLength(count);
        expect(watch.rendered).toBe(0);
        await Promise.all(imports);
        await nextTask();

        expect(watch.rendered).toBe(count);
        expect(opened).toBeDefined();
        expect(service<LabelEditing>("labelEditing").openEdit()?.elementId).toBe(opened?.elementId);
        commitLabel("Typed name");

        expect(errors).toEqual([]);
        expect(changes).toBe(2);
        expect(nameOf(opened?.elementId ?? "")).toBe("Typed name");
        expect(modeler.exportText()).toContain('"Typed name"');
      });
    }

    it("an import that fails to render reopens the edit it took down, and no later import does", async () => {
      const labelEditing = service<LabelEditing>("labelEditing");
      editLabel("bookshop", "Typed, not committed");
      const importer = service<{ import(render: unknown): void }>("importer");
      const render = importer.import.bind(importer);
      let failures = 1;
      importer.import = (document) => {
        if (failures === 0) return render(document);
        failures -= 1;
        throw new Error("render failed");
      };

      await expect(modeler.importText(LIBRARY)).rejects.toThrow("render failed");
      await nextTask();
      expect(modeler.exportText()).toBe(BOOKSHOP);
      expect(labelEditing.openEdit()).toEqual({
        elementId: "bookshop",
        text: "Typed, not committed",
        field: "name",
      });

      labelEditing.cancel();
      await modeler.importText(BOOKSHOP);
      await nextTask();
      expect(labelEditing.openEdit()).toBeUndefined();
      expect(changes).toBe(0);
    });

    it("a label commit at a press on another element: the import ends the drag the press started", async () => {
      const reimport = echoOnce();
      const watch = countImports();
      editLabel("bookshop", "Paid");

      const start = centreOf("customer");
      press(graphics("customer"), start);
      expect(reimport()).toBeDefined();
      expect(watch.rendered).toBe(0);
      expect(dragPrefix()).toBe("shape.move");
      await reimport();
      expect(dragPrefix()).toBeUndefined();
      moveTo({ x: start.x + 20, y: start.y + 40 });
      moveTo({ x: start.x + 60, y: start.y + 160 });
      release({ x: start.x + 60, y: start.y + 160 });

      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(nameOf("bookshop")).toBe("Paid");
      expect(node("customer").x).toBe(40);
      expect(modeler.interaction.active()).toBe(false);
    });

    it("a label commit at the start of a palette create: the import ends the create, without an error", async () => {
      const reimport = echoOnce();
      const watch = countImports();
      editLabel("bookshop", "Paid");

      const gesture = startGesture("create");
      expect(reimport()).toBeDefined();
      expect(watch.rendered).toBe(0);
      expect(modeler.interaction.active()).toBe(true);
      await reimport();
      expect(modeler.interaction.active()).toBe(false);
      gesture.drop();

      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(nameOf("bookshop")).toBe("Paid");
      expect(modeler.elements.list()).toHaveLength(3);
    });

    describe("an import from the selection listener inside a command waits for the command", () => {
      async function expectImportAfterTheCommand(text: string, command: () => void): Promise<void> {
        let reimport: Promise<unknown> | undefined;
        modeler.elements.onSelection(() => {
          reimport ??= modeler.importText(text);
        });
        const watch = countImports();
        changes = 0;

        command();
        expect(reimport).toBeDefined();
        expect(watch.rendered).toBe(0);
        await reimport;

        expect(errors).toEqual([]);
        expect(changes).toBe(1);
        expect(modeler.exportText()).toBe(text);
        expect(canvasSvg().querySelectorAll(".djs-shape")).toHaveLength(
          modeler.elements.list().length,
        );
        addNode();
        expect(changes).toBe(2);
        service<CommandStack>("commandStack").undo();
        expect(modeler.exportText()).toBe(text);
      }

      it("the Delete key on a selected element", async () => {
        service<Selection>("selection").select(node("bookshop"));
        service<Canvas>("canvas").focus();

        await expectImportAfterTheCommand(BOOKSHOP, () =>
          canvasSvg().dispatchEvent(
            new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
          ),
        );
      });

      it("an undo of the create of a selected element", async () => {
        service<Selection>("selection").select(addNode());
        await nextTask();
        const created = modeler.exportText();

        await expectImportAfterTheCommand(created, () =>
          service<CommandStack>("commandStack").undo(),
        );
      });

      it("a redo of the delete of a selected element", async () => {
        service<C4Modeling>("modeling").removeShape(node("bookshop"));
        service<CommandStack>("commandStack").undo();
        service<Selection>("selection").select(node("bookshop"));
        await nextTask();
        const restored = modeler.exportText();

        await expectImportAfterTheCommand(restored, () =>
          service<CommandStack>("commandStack").redo(),
        );
      });
    });

    describe("an import from the selection listener at a drag's start runs once the drag has started (#336)", () => {
      for (const kind of GESTURE_KINDS) {
        it(`a ${kind} while an element is selected: the import ends it, without an error`, async () => {
          service<Selection>("selection").select(node("bookshop"));
          let reimport: Promise<unknown> | undefined;
          modeler.elements.onSelection(() => {
            reimport ??= modeler.importText(modeler.exportText());
          });
          const watch = countImports();

          const gesture = startGesture(kind);
          expect(reimport).toBeDefined();
          expect(watch.rendered).toBe(0);
          expect(modeler.interaction.active()).toBe(true);
          await reimport;
          expect(watch.rendered).toBe(1);
          expect(modeler.interaction.active()).toBe(false);
          expect(dragPrefix()).toBeUndefined();
          gesture.drop();

          expectImportOnly(BOOKSHOP);
          expect(modeler.diagram.container.querySelector(".djs-drag-group")).toBeNull();
        });
      }

      it("an import in the task that starts a drag waits for that task, then ends the drag", async () => {
        const gesture = startGesture("move");
        const imported = modeler.importText(LIBRARY);
        expect(modeler.exportText()).toBe(BOOKSHOP);
        expect(modeler.interaction.active()).toBe(true);
        await imported;
        expect(modeler.interaction.active()).toBe(false);
        gesture.drop();

        expectImportOnly(LIBRARY);
      });
    });

    it("a step the action scheduled for later holds the import until it has run", async () => {
      const gestures = service<Gestures>("gestures");
      let stepFoundItsElement: boolean | undefined;
      service<EventBus>("eventBus").on("shape.move.end", (event: { shape: Shape }) => {
        const moved = event.shape;
        const hold = gestures.holdAction();
        setTimeout(() => {
          stepFoundItsElement = service<ElementRegistry>("elementRegistry").get(moved.id) === moved;
          hold();
        }, 0);
      });
      const reimport = echoOnce();

      startGesture("move").drop();
      await reimport();

      expect(stepFoundItsElement).toBe(true);
      expect(errors).toEqual([]);
      expect(node("customer").x).toBe(100);
    });

    it("an import waiting for a step that never runs rejects once the modeler is destroyed", async () => {
      service<Gestures>("gestures").holdAction();
      const imported = modeler.importText(LIBRARY);
      modeler.destroy();
      await expect(imported).rejects.toThrow("destroyed");
    });

    it("an import in the task of a command waits for that task, also one called after the command", async () => {
      addNode();
      const imported = modeler.importText(LIBRARY);
      expect(modeler.exportText()).not.toBe(LIBRARY);
      await imported;
      expect(modeler.exportText()).toBe(LIBRARY);
    });

    it("an import outside a user action runs at once, also right after the task of a command", async () => {
      void modeler.importText(LIBRARY);
      expect(modeler.exportText()).toBe(LIBRARY);
      addNode();
      await nextTask();
      void modeler.importText(BOOKSHOP);
      expect(modeler.exportText()).toBe(BOOKSHOP);
    });

    it("a pointer create opens the name editor after its drop, and an import from its change waits for it", async () => {
      let reimport: Promise<unknown> | undefined;
      const editorOpenAtImport: Array<string | undefined> = [];
      const labelEditing = service<LabelEditing>("labelEditing");
      const suspend = labelEditing.suspend.bind(labelEditing);
      // The import takes the open editor down first: what it finds there is what had opened.
      labelEditing.suspend = () => {
        editorOpenAtImport.push(labelEditing.openEdit()?.elementId);
        suspend();
      };
      modeler.onContentChanged(() => {
        reimport ??= modeler.importText(modeler.exportText());
      });

      const before = new Set(modeler.elements.list().map(({ id }) => id));
      startGesture("create").drop();
      const [created] = modeler.elements.list().filter(({ id }) => !before.has(id));
      await reimport;
      await nextTask();

      expect(created).toBeDefined();
      expect(editorOpenAtImport).toEqual([created?.id]);
      expect(service<LabelEditing>("labelEditing").openEdit()?.elementId).toBe(created?.id);
      expect(errors).toEqual([]);
    });

    it("a destroy from the change listener of a pointer create's drop opens no editor on the torn-down diagram", async () => {
      modeler.onContentChanged(() => modeler.destroy());

      startGesture("create").drop();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errors).toEqual([]);
    });
  });

  describe("interaction (contract 1.5)", () => {
    it("is false before the first import and at rest", async () => {
      const fresh = createCollaborativeModeler();
      expect(fresh.interaction.active()).toBe(false);
      fresh.attachTo(harnessHost());
      expect(fresh.interaction.active()).toBe(false);
      await fresh.importText(BOOKSHOP);
      expect(fresh.interaction.active()).toBe(false);
      fresh.destroy();
      expect(modeler.interaction.active()).toBe(false);
    });

    for (const kind of GESTURE_KINDS) {
      for (const ending of ["drop", "cancel"] as const) {
        it(`follows a ${kind} until its ${ending}, with one call each way`, () => {
          const calls: Array<[boolean, boolean]> = [];
          modeler.interaction.onChange((active) =>
            calls.push([active, modeler.interaction.active()]),
          );

          const gesture = startGesture(kind);
          expect(modeler.interaction.active()).toBe(true);
          expect(calls).toEqual([[true, true]]);
          gesture[ending]();

          expect(modeler.interaction.active()).toBe(false);
          expect(calls).toEqual([
            [true, true],
            [false, false],
          ]);
          expect(changes).toBe(ending === "drop" ? 1 : 0);
        });
      }
    }

    it("is false while a palette tool is only armed, and calls nothing", () => {
      const calls = recordInteraction();
      armTool();
      expect(dragPrefix()).toBe("lasso.selection");
      expect(modeler.interaction.active()).toBe(false);
      expect(calls).toEqual([]);
    });

    it("stops calling once unsubscribed", () => {
      const calls: boolean[] = [];
      const unsubscribe = modeler.interaction.onChange((active) => calls.push(active));
      startGesture("move").cancel();
      unsubscribe();
      startGesture("move").cancel();
      expect(calls).toEqual([true, false]);
    });

    it("reports a listener that throws and keeps the gesture as it was", () => {
      const reported: unknown[] = [];
      const listener = (event: ErrorEvent) => {
        reported.push(event.error);
        event.preventDefault();
      };
      window.addEventListener("error", listener);
      modeler.interaction.onChange(() => {
        throw new Error("a host listener failed");
      });
      const calls = recordInteraction();

      startGesture("move").drop();
      window.removeEventListener("error", listener);

      expect(reported).toHaveLength(2);
      expect(calls).toEqual([true, false]);
      expect(changes).toBe(1);
      errors = [];
    });

    it("calls nothing after destroy, a running gesture included", async () => {
      const calls = recordInteraction();
      const dragging = service<Dragging>("dragging");
      startGesture("move");
      await Promise.resolve();
      modeler.destroy();
      expect(dragging.context()).toBeNull();
      expect(calls).toEqual([true]);
      expect(modeler.interaction.active()).toBe(false);
    });

    it("is false on the viewer, which has no editing gesture", async () => {
      const viewer = await mountViewer();
      await viewer.importText(BOOKSHOP);
      const unsubscribe = viewer.interaction.onChange(() => {
        throw new Error("the viewer has no gesture");
      });
      expect(viewer.interaction.active()).toBe(false);
      unsubscribe();
      viewer.destroy();
    });
  });

  describe("a destroy from a listener at a drag's start throws nothing, and nothing reaches the host afterwards (#346)", () => {
    const activations = [
      {
        what: "a press on an element, moved past the drag threshold",
        activate: () => {
          const start = centreOf("customer");
          press(graphics("customer"), start);
          moveTo({ x: start.x + 40, y: start.y + 80 });
        },
      },
      {
        what: "a click on the palette's software system",
        activate: () => void clickPalette("create.softwareSystem"),
      },
    ];

    function destroyedCleanly(): () => Promise<void> {
      const dragging = service<Dragging>("dragging");
      let commands = 0;
      service<EventBus>("eventBus").on("commandStack.changed", () => (commands += 1));
      const svg = canvasSvg();
      const releaseEvent = pointer("mouseup", FREE_SPOT);
      const before = modeler.exportText();
      return async () => {
        await nextTask();
        expect(errors).toEqual([]);
        expect(dragging.context()).toBeNull();
        expect(svg.isConnected).toBe(false);
        document.dispatchEvent(releaseEvent);
        await nextTask();
        expect(errors).toEqual([]);
        expect(commands).toBe(0);
        expect(modeler.interaction.active()).toBe(false);
        expect(modeler.exportText()).toBe(before);
      };
    }

    for (const { what, activate } of activations) {
      it(`${what}, from the selection listener: the listener hears nothing more`, async () => {
        service<Selection>("selection").select(node("bookshop"));
        const expectDestroyedCleanly = destroyedCleanly();
        const calls = recordInteraction();
        const heard: string[][] = [];
        modeler.elements.onSelection((ids) => {
          heard.push(ids);
          modeler.destroy();
        });

        activate();
        expect(heard).toEqual([[]]);
        await expectDestroyedCleanly();
        expect(heard).toEqual([[]]);
        expect(calls).toEqual([]);
      });

      it(`${what}, from the interaction listener: no later listener hears of it`, async () => {
        const expectDestroyedCleanly = destroyedCleanly();
        modeler.interaction.onChange(() => modeler.destroy());
        const later = recordInteraction();

        activate();
        await expectDestroyedCleanly();
        expect(later).toEqual([]);
      });
    }
  });

  describe("a destroy from a listener at a drop, at Escape or at a keyboard create throws nothing, and nothing reaches the host afterwards", () => {
    let rejections: unknown[] = [];
    const recordRejection = (event: PromiseRejectionEvent) => rejections.push(event.reason);

    beforeEach(() => {
      rejections = [];
      window.addEventListener("unhandledrejection", recordRejection);
    });

    afterEach(() => {
      window.removeEventListener("unhandledrejection", recordRejection);
    });

    function destroyedCleanly(): (textAtDestroy: string | undefined) => Promise<void> {
      const dragging = service<Dragging>("dragging");
      const svg = canvasSvg();
      return async (textAtDestroy) => {
        await nextTask();
        expect(errors).toEqual([]);
        expect(rejections).toEqual([]);
        expect(textAtDestroy).toBeDefined();
        expect(dragging.context()).toBeFalsy();
        expect(svg.isConnected).toBe(false);
        expect(() => modeler.destroy()).not.toThrow();
        expect(modeler.interaction.active()).toBe(false);
        expect(modeler.exportText()).toBe(textAtDestroy);
      };
    }

    const handlerReturned = () => Promise.resolve();

    for (const kind of GESTURE_KINDS) {
      for (const ending of ["drop", "cancel"] as const) {
        it(`a ${kind} at its ${ending}, from the interaction listener: no later listener hears of it`, async () => {
          const expectDestroyedCleanly = destroyedCleanly();
          let textAtDestroy: string | undefined;
          modeler.interaction.onChange((active) => {
            if (active) return;
            textAtDestroy = modeler.exportText();
            modeler.destroy();
          });
          const later = recordInteraction();

          const gesture = startGesture(kind);
          await handlerReturned();
          gesture[ending]();

          expect(later).toEqual([true]);
          await expectDestroyedCleanly(textAtDestroy);
          expect(later).toEqual([true]);
          expect(changes).toBe(ending === "drop" ? 1 : 0);
        });
      }
    }

    const changesMade: { what: string; elements: number; make: () => Promise<void> }[] = [
      ...GESTURE_KINDS.map((kind) => ({
        what: `the drop of a ${kind}`,
        elements: kind === "move" ? 0 : 1,
        make: async () => {
          const gesture = startGesture(kind);
          await handlerReturned();
          gesture.drop();
        },
      })),
      {
        what: "Enter or Space on the palette's software system (a click without a pointer)",
        elements: 1,
        make: async () => {
          paletteEntry("create.softwareSystem").entry.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
          );
        },
      },
    ];

    for (const { what, elements, make } of changesMade) {
      it(`${what}, from the change listener: neither a later change listener nor the selection listener hears more`, async () => {
        const expectDestroyedCleanly = destroyedCleanly();
        const before = modeler.exportText();
        const selections: string[][] = [];
        modeler.elements.onSelection((ids) => selections.push(ids));
        let textAtDestroy: string | undefined;
        let selectionsAtDestroy = -1;
        modeler.onContentChanged(() => {
          textAtDestroy = modeler.exportText();
          selectionsAtDestroy = selections.length;
          modeler.destroy();
        });
        let later = 0;
        modeler.onContentChanged(() => (later += 1));

        await make();

        await expectDestroyedCleanly(textAtDestroy);
        expect(later).toBe(0);
        expect(selections).toHaveLength(selectionsAtDestroy);
        expect(textAtDestroy).not.toBe(before);
        expect(elementCount(textAtDestroy ?? before)).toBe(elementCount(before) + elements);
      });
    }

    it("no later selection listener hears of a selection whose first listener destroyed the modeler", async () => {
      service<Selection>("selection").select(node("bookshop"));
      const expectDestroyedCleanly = destroyedCleanly();
      const text = modeler.exportText();
      modeler.elements.onSelection(() => modeler.destroy());
      const later: string[][] = [];
      modeler.elements.onSelection((ids) => later.push(ids));

      startGesture("move");

      await expectDestroyedCleanly(text);
      expect(later).toEqual([]);
    });
  });

  describe("no delivery reaches a listener that an earlier listener of it unsubscribed", () => {
    it("of a change", () => {
      let unsubscribeLater: () => void = () => undefined;
      modeler.onContentChanged(() => unsubscribeLater());
      let later = 0;
      unsubscribeLater = modeler.onContentChanged(() => (later += 1));

      startGesture("move").drop();

      expect(later).toBe(0);
      expect(errors).toEqual([]);
    });

    it("of the interaction", () => {
      let unsubscribeLater: () => void = () => undefined;
      modeler.interaction.onChange(() => unsubscribeLater());
      const later: boolean[] = [];
      unsubscribeLater = modeler.interaction.onChange((active) => later.push(active));

      startGesture("move").cancel();

      expect(later).toEqual([]);
      expect(errors).toEqual([]);
    });

    it("of the selection", () => {
      let unsubscribeLater: () => void = () => undefined;
      modeler.elements.onSelection(() => unsubscribeLater());
      const later: string[][] = [];
      unsubscribeLater = modeler.elements.onSelection((ids) => later.push(ids));

      modeler.elements.reveal("bookshop");

      expect(later).toEqual([]);
    });

    it("of the selection, also when the earlier listener unsubscribed itself first", () => {
      const unsubscribes: (() => void)[] = [];
      unsubscribes.push(
        modeler.elements.onSelection(() => {
          for (const unsubscribe of unsubscribes) unsubscribe();
        }),
      );
      const later: string[][] = [];
      unsubscribes.push(modeler.elements.onSelection((ids) => later.push(ids)));

      modeler.elements.reveal("bookshop");

      expect(later).toEqual([]);
    });
  });

  describe("a destroy from a listener that a host's call reaches (#415)", () => {
    let rejections: unknown[] = [];
    const recordRejection = (event: PromiseRejectionEvent) => rejections.push(event.reason);

    beforeEach(() => {
      rejections = [];
      window.addEventListener("unhandledrejection", recordRejection);
    });

    afterEach(() => {
      window.removeEventListener("unhandledrejection", recordRejection);
    });

    const mounts = [
      { mount: "modeler", create: probedModeler },
      { mount: "viewer", create: mountViewer },
    ];

    for (const { mount, create } of mounts) {
      it(`reveal on the ${mount}: it scrolls to the element first, and nothing reaches the host afterwards`, async () => {
        const revealing = await create();
        await revealing.importText(BOOKSHOP);
        const { x, y, width, height } = revealing.diagram.get<Canvas>("canvas").viewbox();
        revealing.setViewState({ x: x + 5000, y: y + 5000, width, height });
        const steps: string[] = [];
        const eventBus = revealing.diagram.get<EventBus>("eventBus");
        eventBus.on("canvas.viewbox.changing", () => steps.push("scroll"));
        eventBus.on("diagram.destroy", () => steps.push("teardown"));
        const container = revealing.diagram.get<Canvas>("canvas").getContainer();
        const text = revealing.exportText();
        revealing.elements.onSelection(() => revealing.destroy());
        const later: unknown[] = [];
        revealing.elements.onSelection((ids) => later.push(ids));
        revealing.interaction.onChange((active) => later.push(active));
        revealing.onContentChanged(() => later.push("change"));

        expect(revealing.elements.reveal("bookshop")).toBe(true);
        expect(steps).toEqual(["scroll"]);
        await nextTask();
        expect(errors).toEqual([]);
        expect(rejections).toEqual([]);
        expect(steps).toEqual(["scroll", "teardown"]);
        expect(container.isConnected).toBe(false);
        expect(later).toEqual([]);
        expect(() => revealing.destroy()).not.toThrow();
        expect(revealing.exportText()).toBe(text);
      });
    }

    async function exportedAfterImporting(text: string): Promise<string> {
      const reference = await mountViewer();
      await reference.importText(text);
      const exported = reference.exportText();
      reference.destroy();
      return exported;
    }

    function recordImportSteps(diagram: CollaborativeDiagram): string[] {
      const steps: string[] = [];
      const eventBus = diagram.diagram.get<EventBus>("eventBus");
      eventBus.on("import.done", () => {
        steps.push("drawn");
      });
      eventBus.on("diagram.destroy", () => {
        steps.push("teardown");
      });
      return steps;
    }

    for (const { mount, create } of mounts) {
      it(`an import on the ${mount}, whose sync empties the selection: it draws, then rejects as destroyed, and nothing reaches the host afterwards`, async () => {
        const imported = await exportedAfterImporting(LIBRARY);
        const importing = await create();
        await importing.importText(BOOKSHOP);
        importing.elements.reveal("bookshop");
        const steps = recordImportSteps(importing);
        const container = importing.diagram.get<Canvas>("canvas").getContainer();
        const heard: string[][] = [];
        importing.elements.onSelection((ids) => {
          heard.push(ids);
          importing.destroy();
        });
        const later: unknown[] = [];
        importing.elements.onSelection((ids) => later.push(ids));
        importing.interaction.onChange((active) => later.push(active));
        importing.onContentChanged(() => later.push("change"));

        const result = importing.importText(LIBRARY);

        expect(steps).toEqual(["drawn"]);
        await expect(result).rejects.toThrow("The modeler was destroyed.");
        expect(heard).toEqual([[]]);
        await nextTask();
        expect(errors).toEqual([]);
        expect(rejections).toEqual([]);
        expect(steps).toEqual(["drawn", "teardown"]);
        expect(container.isConnected).toBe(false);
        expect(later).toEqual([]);
        expect(() => importing.destroy()).not.toThrow();
        expect(importing.exportText()).toBe(imported);
      });
    }

    for (const kind of GESTURE_KINDS) {
      it(`an import that ends a held ${kind}, heard by the interaction listener: it draws, then rejects as destroyed, and nothing reaches the host afterwards`, async () => {
        const imported = await exportedAfterImporting(LIBRARY);
        const dragging = service<Dragging>("dragging");
        const container = service<Canvas>("canvas").getContainer();
        startGesture(kind);
        await Promise.resolve();
        expect(modeler.interaction.active()).toBe(true);
        const steps = recordImportSteps(modeler);
        const heard: boolean[] = [];
        modeler.interaction.onChange((active) => {
          heard.push(active);
          modeler.destroy();
        });
        const later: unknown[] = [];
        modeler.interaction.onChange((active) => later.push(active));
        modeler.elements.onSelection((ids) => later.push(ids));
        modeler.onContentChanged(() => later.push("change"));

        const result = modeler.importText(LIBRARY);

        expect(steps).toEqual(["drawn"]);
        await expect(result).rejects.toThrow("The modeler was destroyed.");
        expect(heard).toEqual([false]);
        await nextTask();
        expect(errors).toEqual([]);
        expect(rejections).toEqual([]);
        expect(steps).toEqual(["drawn", "teardown"]);
        expect(dragging.context()).toBeFalsy();
        expect(container.isConnected).toBe(false);
        expect(later).toEqual([]);
        expect(() => modeler.destroy()).not.toThrow();
        expect(modeler.exportText()).toBe(imported);
      });
    }
  });

  // What the gate adds to the template: the C4 modeling's own promises (SPEC 1.3-1.5).

  describe("every gesture is one verified document command (SPEC 1.3, 1.4)", () => {
    it("a refused drop runs no command, fires no change and leaves the element where it was", () => {
      const refused: unknown[] = [];
      service<EventBus>("eventBus").on(EDIT_REFUSED_EVENT, (event: { reason: string }) => {
        refused.push(event.reason);
      });
      engine.refuseNext("verification-failed", "Couldn't write this change into the DSL.");

      startGesture("move").drop();

      expect(errors).toEqual([]);
      expect(changes).toBe(0);
      expect(refused).toEqual(["verification-failed"]);
      expect(node("customer").x).toBe(40);
      expect(modeler.exportText()).toBe(BOOKSHOP);
      expect(service<CommandStack>("commandStack").canUndo()).toBe(false);
    });

    it("a refused pointer create adds no shape and selects nothing", () => {
      engine.refuseNext("not-allowed", "Not here.");

      startGesture("create").drop();

      expect(errors).toEqual([]);
      expect(changes).toBe(0);
      expect(modeler.elements.list().map(({ id }) => id)).toEqual([
        "customer",
        "bookshop",
        "payments",
      ]);
      expect(modeler.elements.selection()).toEqual([]);
    });

    it("a move, its undo, its redo and a re-import of the same text keep the shape object and the selection", async () => {
      const shape = node("customer");
      service<Selection>("selection").select(shape);
      startGesture("move").drop();
      expect(node("customer")).toBe(shape);
      expect(shape.x).toBe(100);
      expect(modeler.exportText()).toContain('"c4modeler.element.customer" "100,200"');
      expectCanvasMatchesDocument(modeler);

      service<CommandStack>("commandStack").undo();
      expect(node("customer")).toBe(shape);
      expect(shape.x).toBe(40);
      expect(modeler.exportText()).toBe(BOOKSHOP);
      expectCanvasMatchesDocument(modeler);

      service<CommandStack>("commandStack").redo();
      expect(shape.x).toBe(100);
      expectCanvasMatchesDocument(modeler);
      await modeler.importText(modeler.exportText());
      expect(node("customer")).toBe(shape);
      expect(modeler.elements.selection()).toEqual(["customer"]);
      expect(changes).toBe(3);
    });

    it("the first name of a fresh element renames its identifier, and the shape and its selection stay", async () => {
      paletteEntry("create.softwareSystem").entry.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
      );
      const editing = service<LabelEditing>("labelEditing");
      const fresh = editing.openEdit()?.elementId ?? "";
      expect(fresh).toMatch(/^softwareSystem_[0-9a-z]{4}$/);
      const shape = node(fresh);

      labelFieldOf(modeler).value = "Warehouse";
      labelFieldOf(modeler).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );

      expect(node("warehouse")).toBe(shape);
      expect(shape.c4.id).toBe("warehouse");
      expect(service<Selection>("selection").get()).toEqual([shape]);
      expect(modeler.elements.selection()).toEqual(["warehouse"]);
      expect(modeler.exportText()).toContain('warehouse = softwareSystem "Warehouse"');
      expect(modeler.exportText()).toContain('"c4modeler.element.warehouse"');
      expect(modeler.exportText()).not.toContain(fresh);
      expectCanvasMatchesDocument(modeler);
      service<CommandStack>("commandStack").undo();
      expect(node(fresh)).toBe(shape);
      expect(errors).toEqual([]);
    });

    it("the first move in an unpinned view writes one properties block with every box", async () => {
      await modeler.importText(BOOKSHOP_LOOSE);
      changes = 0;
      const before = new Map(
        modeler.elements.list().map(({ id }) => [id, modeler.elements.bounds(id)]),
      );
      service<C4Modeling>("modeling").moveElements([node("customer")], { x: 0, y: 400 });

      expect(changes).toBe(1);
      expect(modeler.elements.bounds("bookshop")).toEqual(before.get("bookshop"));
      expect(modeler.elements.bounds("mail")).toEqual(before.get("mail"));
      const text = modeler.exportText();
      // The keyless view and the anonymous element get the key and the identifier the layout
      // keys name; the block follows the file's tabs and CRLF.
      expect(text).toContain('\t\tsystemlandscape "SystemLandscape-001" {\r\n');
      expect(text).toContain("\t\tmail = softwaresystem Mail\r\n");
      expect(text).toContain('\t\t\tproperties {\r\n\t\t\t\t"c4modeler.element.bookshop" "');
      expect(text.startsWith("# The bookshop, typed by hand\r\n")).toBe(true);
      expect(modeler.views.active().key).toBe("SystemLandscape-001");
      expectCanvasMatchesDocument(modeler);
      service<CommandStack>("commandStack").undo();
      expect(modeler.exportText()).toBe(BOOKSHOP_LOOSE);
    });

    it("a drag of a lassoed selection moves its elements, the relationship between them included", () => {
      const connection = service<ElementRegistry>("elementRegistry").get("rel:customer->bookshop");
      service<Selection>("selection").select([node("customer"), node("bookshop"), connection]);

      startGesture("move").drop();

      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(modeler.exportText()).toContain('"c4modeler.element.customer" "100,200"');
      expect(modeler.exportText()).toContain('"c4modeler.element.bookshop" "460,228"');
    });

    it("an arrow key moves a selection that holds a relationship, and none that holds only one", () => {
      const connection = service<ElementRegistry>("elementRegistry").get("rel:customer->bookshop");
      const keyboardMove = service<{ moveSelection(direction: string): void }>(
        "keyboardMoveSelection",
      );
      service<Selection>("selection").select([connection]);
      keyboardMove.moveSelection("right");
      expect(changes).toBe(0);

      service<Selection>("selection").select([node("customer"), connection]);
      keyboardMove.moveSelection("right");

      expect(changes).toBe(1);
      expect(modeler.exportText()).toContain('"c4modeler.element.customer" "41,40"');
      expect(modeler.exportText()).toContain('"c4modeler.element.bookshop" "400,68"');
    });

    it("a move of both ends of a relationship takes its vertices along", () => {
      const connection = service<ElementRegistry>("elementRegistry").get(
        "rel:customer->bookshop",
      ) as Connection;
      const [start, end] = connection.waypoints;
      if (!start || !end) throw new Error("no waypoints");
      const modeling = service<C4Modeling>("modeling");
      modeling.updateWaypoints(connection, [start, { x: 330, y: 400 }, end]);

      modeling.moveElements([node("customer")], { x: 10, y: 20 });
      expect(modeler.exportText()).toContain(
        '"c4modeler.relationship.customer->bookshop" "330,400"',
      );
      modeling.moveElements([node("customer"), node("bookshop")], { x: 10, y: 20 });

      expect(modeler.exportText()).toContain(
        '"c4modeler.relationship.customer->bookshop" "340,420"',
      );
      expect(connection.waypoints[1]).toEqual({ x: 340, y: 420 });
    });

    it("the rules let a relationship's bendpoints move, an implied one only with a key, and none under the lock", () => {
      const connection = service<ElementRegistry>("elementRegistry").get(
        "rel:customer->bookshop",
      ) as Connection & { c4: { key: string; implied: boolean } };
      const rules = service<{ allowed(action: string, context: object): unknown }>("rules");
      const bend = () => rules.allowed("connection.updateWaypoints", { connection });
      // The answer is what the drag draws while it runs: the relationship's preview line.
      expect(bend()).toEqual(RELATIONSHIP_PREVIEW);

      connection.c4.implied = true;
      expect(bend()).toEqual(RELATIONSHIP_PREVIEW);
      connection.c4.key = "customer->bookshop#2";
      expect(bend()).toBe(false);
      connection.c4.key = "customer->bookshop";
      connection.c4.implied = false;

      service<{ setReadOnly(readOnly: boolean): void }>("readOnly").setReadOnly(true);
      expect(bend()).toBe(false);
    });

    it("a new element goes in below the relationships, on the canvas and in the SVG", () => {
      const created = addNode();
      const root = service<Canvas>("canvas").getRootElement();
      const order = [
        node("customer").id,
        node("bookshop").id,
        node("payments").id,
        created.id,
        "rel:customer->bookshop",
        "rel:bookshop->payments",
      ];

      expect(root.children.map((child: { id: string }) => child.id)).toEqual(order);
      const container = service<Canvas>("canvas").getContainer();
      const drawn = [...container.querySelectorAll("[data-element-id]:not(.c4-label)")]
        .map((gfx) => gfx.getAttribute("data-element-id"))
        .filter((id) => id !== root.id);
      expect(drawn).toEqual(order);
      // The labels lie in a layer of their own above every line, in the lines' order.
      const labels = [...container.querySelectorAll(".layer-c4-labels > .c4-label")].map((gfx) =>
        gfx.getAttribute("data-element-id"),
      );
      expect(labels).toEqual(order.filter((id) => id.startsWith("rel:")));
    });

    it("a connection drawn with diagram-js's connect is one relationship", () => {
      const source = node("bookshop");
      const target = node("customer");
      const pointerOnCanvas = pointerOn(modeler.diagram);
      service<{ start(event: MouseEvent, source: Shape, autoActivate?: boolean): void }>(
        "connect",
      ).start(pointerOnCanvas.event("mousedown", centreOf("bookshop")), source, true);
      pointerOnCanvas.hover(centreOf("customer"), graphics("customer"));
      pointerOnCanvas.release(centreOf("customer"));

      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(modeler.exportText()).toContain("bookshop -> customer\n");
      const connection = service<ElementRegistry>("elementRegistry").get("rel:bookshop->customer");
      expect((connection as Connection).source).toBe(source);
      expect((connection as Connection).target).toBe(target);
      expect(service<Selection>("selection").get()).toEqual([connection]);
    });

    it("a bendpoint stores the relationship's vertices, which its ends dock on", () => {
      const connection = service<ElementRegistry>("elementRegistry").get(
        "rel:customer->bookshop",
      ) as Connection;
      const [start, end] = connection.waypoints;
      if (!start || !end) throw new Error("no waypoints");
      service<C4Modeling>("modeling").updateWaypoints(connection, [start, { x: 330, y: 400 }, end]);

      expect(modeler.exportText()).toContain(
        '"c4modeler.relationship.customer->bookshop" "330,400"',
      );
      expect(connection.waypoints).toHaveLength(3);
      expect(connection.waypoints[1]).toEqual({ x: 330, y: 400 });
      expectCanvasMatchesDocument(modeler);
      service<CommandStack>("commandStack").undo();
      expect(connection.waypoints).toHaveLength(2);
    });

    it("a press on a straight segment inserts a bendpoint, and starts nothing under the read-only lock", () => {
      const refused: string[] = [];
      service<EventBus>("eventBus").on(EDIT_REFUSED_EVENT, (event: { reason: string }) => {
        refused.push(event.reason);
      });
      const connection = service<ElementRegistry>("elementRegistry").get(
        "rel:customer->bookshop",
      ) as Connection;
      const [start, end] = connection.waypoints;
      if (!start || !end) throw new Error("no waypoints");
      expect(start.y).toBe(end.y);
      const before = JSON.stringify(connection.waypoints);
      const middle = { x: (start.x + end.x) / 2, y: start.y };
      const segmentMove = service<{
        start(event: MouseEvent, connection: Connection, index: number): void;
      }>("connectionSegmentMove");
      const dragSegment = () => {
        segmentMove.start(pointer("mousedown", middle), connection, 1);
        moveTo({ x: middle.x, y: middle.y + 30 });
        moveTo({ x: middle.x, y: middle.y + 60 });
      };

      service<{ setReadOnly(readOnly: boolean): void }>("readOnly").setReadOnly(true);
      dragSegment();
      expect(dragPrefix()).toBeUndefined();
      release({ x: middle.x, y: middle.y + 60 });
      expect(JSON.stringify(connection.waypoints)).toBe(before);

      service<{ setReadOnly(readOnly: boolean): void }>("readOnly").setReadOnly(false);
      dragSegment();
      expect(dragPrefix()).toBe("bendpoint.move");
      pressEscape();

      expect(errors).toEqual([]);
      expect(refused).toEqual([]);
      expect(changes).toBe(0);
      expect(JSON.stringify(connection.waypoints)).toBe(before);
    });

    it("a resize stores the new size", () => {
      service<C4Modeling>("modeling").resizeShape(node("bookshop"), {
        x: 400,
        y: 68,
        width: 320,
        height: 200,
      });

      expect(modeler.exportText()).toContain('"c4modeler.element.bookshop" "400,68,320,200"');
      expect(node("bookshop").width).toBe(320);
    });

    it("a stock call the notation has no edit for throws a named error", () => {
      expect(() => service<C4Modeling>("modeling").reconnect()).toThrow(
        C4UnsupportedOperationError,
      );
    });

    it("a formatting-only change rebases without a render, keeps a drag running and clears the history", async () => {
      startGesture("move").drop();
      expect(service<CommandStack>("commandStack").canUndo()).toBe(true);
      const shape = node("customer");
      const gesture = startGesture("move");
      await nextTask();
      const formatted = `// a comment from the text editor\n${modeler.exportText()}`;

      expect(modeler.rebaseText(formatted)).toBe(true);
      expect(modeler.exportText()).toBe(formatted);
      expect(modeler.interaction.active()).toBe(true);
      expect(service<CommandStack>("commandStack").canUndo()).toBe(false);
      gesture.drop();
      expect(node("customer")).toBe(shape);
      expect(modeler.exportText().startsWith("// a comment from the text editor\n")).toBe(true);
      expect(modeler.rebaseText(LIBRARY)).toBe(false);
    });
  });

  describe("the drags C4 adds end at an import and at a host's view switch, and their release applies nothing (SPEC 1.7, 9.4)", () => {
    interface HeldDrag {
      readonly prefix: string;
      release(): void;
    }

    interface Drag {
      readonly what: string;
      /** The document the drag runs on, and a view of it that the drag does not run in. */
      readonly text: string;
      readonly otherView: string;
      start(): HeldDrag;
      /** What the drop writes. */
      applied(text: string): void;
    }

    /** From the pad of `customer` onto `payments`, which it has no relationship to yet. */
    function connectFromThePad(): HeldDrag {
      service<Selection>("selection").select(node("customer"));
      const entry = modeler.diagram.container.querySelector(
        '.djs-context-pad [data-action="connect"]',
      );
      if (!entry) throw new Error("no connect entry in the context pad");
      const start = centreOf("customer");
      entry.dispatchEvent(pointer("click", start, { detail: 1 }));
      moveTo({ x: start.x + 20, y: start.y });
      const target = centreOf("payments");
      const targetGraphics = graphics("payments");
      hover(targetGraphics, target);
      return {
        prefix: "connect",
        release() {
          hover(targetGraphics, target);
          release(target);
        },
      };
    }

    /** A new bendpoint pressed on the middle of `customer -> bookshop` and pulled down. */
    function dragABendpoint(): HeldDrag {
      const connection = service<ElementRegistry>("elementRegistry").get(
        "rel:customer->bookshop",
      ) as Connection;
      const [first, last] = connection.waypoints;
      if (!first || !last) throw new Error("no waypoints");
      const middle = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
      service<{
        start(event: MouseEvent, connection: Connection, index: number, insert: boolean): void;
      }>("bendpointMove").start(pointer("mousedown", middle), connection, 1, true);
      moveTo({ x: middle.x, y: middle.y + 30 });
      moveTo({ x: middle.x, y: middle.y + 60 });
      const end = { x: middle.x, y: middle.y + 90 };
      return {
        prefix: "bendpoint.move",
        release() {
          moveTo(end);
          release(end);
        },
      };
    }

    /** The south-east handle of the selected `bookshop`, pulled out. */
    function resizeByTheHandle(): HeldDrag {
      service<Selection>("selection").select(node("bookshop"));
      const handle = modeler.diagram.container.querySelector(
        ".djs-resizer-bookshop.djs-resizer-se",
      );
      if (!handle) throw new Error("no resize handle");
      const shape = node("bookshop");
      const corner = { x: shape.x + shape.width, y: shape.y + shape.height };
      press(handle, corner);
      moveTo({ x: corner.x + 30, y: corner.y + 30 });
      const end = { x: corner.x + 80, y: corner.y + 40 };
      return {
        prefix: "resize",
        release() {
          moveTo(end);
          release(end);
        },
      };
    }

    /** `LIBRARY`'s boundary, pressed on its caption band and dragged right with what it frames. */
    function moveTheBoundary(): HeldDrag {
      const boundary = service<ElementRegistry>("elementRegistry").get("boundary:library") as Shape;
      const start = { x: boundary.x + 40, y: boundary.y + boundary.height - 12 };
      press(service<ElementRegistry>("elementRegistry").getGraphics(boundary), start);
      moveTo({ x: start.x + 40, y: start.y });
      moveTo({ x: start.x + 80, y: start.y });
      const end = { x: start.x + 120, y: start.y };
      return {
        prefix: "shape.move",
        release() {
          hover(canvasSvg(), end);
          release(end);
        },
      };
    }

    const DRAGS: readonly Drag[] = [
      {
        what: "a connect from the pad",
        text: BOOKSHOP,
        otherView: "BookshopContext",
        start: connectFromThePad,
        applied: (text) => expect(text).toContain("        customer -> payments\n"),
      },
      {
        what: "a bendpoint drag",
        text: BOOKSHOP,
        otherView: "BookshopContext",
        start: dragABendpoint,
        // The vertex lies where the pointer let go, below the docked line's middle.
        applied: (text) =>
          expect(text).toMatch(/"c4modeler\.relationship\.customer->bookshop" "\d+,238"\n/),
      },
      {
        what: "a resize by its handle",
        text: BOOKSHOP,
        otherView: "BookshopContext",
        start: resizeByTheHandle,
        applied: (text) => expect(text).toContain('"c4modeler.element.bookshop" "400,68,320,200"'),
      },
      {
        what: "a boundary move",
        text: LIBRARY,
        otherView: "SystemLandscape",
        start: moveTheBoundary,
        applied(text) {
          expect(text).toContain('"c4modeler.element.catalogue" "280,400"');
          expect(text).toContain('"c4modeler.element.loans" "640,400"');
          expect(text).toContain('"c4modeler.element.reader" "312,0"');
        },
      },
    ];

    async function showText(text: string): Promise<void> {
      if (modeler.exportText() !== text) await modeler.importText(text);
    }

    for (const drag of DRAGS) {
      it(`${drag.what}, dropped, is one document command`, async () => {
        await showText(drag.text);
        const held = drag.start();
        expect(dragPrefix()).toBe(held.prefix);
        expect(modeler.interaction.active()).toBe(true);
        held.release();

        expect(errors).toEqual([]);
        expect(changes).toBe(1);
        drag.applied(modeler.exportText());
        expectCanvasMatchesDocument(modeler);
        service<CommandStack>("commandStack").undo();
        expect(modeler.exportText()).toBe(drag.text);
      });

      for (const ending of ["an import of the same text", "a host's view switch"] as const) {
        it(`${drag.what}, ended by ${ending}`, async () => {
          await showText(drag.text);
          const held = drag.start();
          // A host's call comes in a later task, once the drag's start has been applied.
          await nextTask();
          expect(dragPrefix()).toBe(held.prefix);
          expect(modeler.interaction.active()).toBe(true);
          const calls = recordInteraction();

          if (ending === "an import of the same text") {
            await modeler.importText(drag.text);
          } else {
            const { x, y, width, height } = service<Canvas>("canvas").viewbox();
            modeler.setViewState({ view: drag.otherView, x, y, width, height });
            expect(modeler.views.active().key).toBe(drag.otherView);
          }
          expect(dragPrefix()).toBeUndefined();
          expect(modeler.interaction.active()).toBe(false);
          expect(calls).toEqual([false]);
          expectCanvasMatchesDocument(modeler);
          held.release();

          expect(errors).toEqual([]);
          expect(changes).toBe(0);
          expect(modeler.exportText()).toBe(drag.text);
          expect(modeler.diagram.container.querySelector(".djs-drag-group")).toBeNull();
          addNode();
          expect(changes).toBe(1);
        });
      }
    }
  });

  describe("the palette's connect tool waits for its press as no gesture (SPEC 1.9, 5.2)", () => {
    function armConnect(): Element {
      const { entry, at } = paletteEntry("global-connect-tool");
      entry.dispatchEvent(pointer("click", at, { detail: 1 }));
      expect(dragPrefix()).toBe("global-connect");
      return entry;
    }

    /** The armed tool's press on `from`, then the pointer leaves it for `to`, where it lets go. */
    function connectWithTheTool(from: string, to: string): void {
      const start = centreOf(from);
      hover(graphics(from), start);
      press(graphics(from), start);
      graphics(from).dispatchEvent(pointer("mouseout", start));
      const target = centreOf(to);
      hover(graphics(to), target);
      expect(dragPrefix()).toBe("connect");
      expect(modeler.interaction.active()).toBe(true);
      release(target);
    }

    it("stays armed through an import, and its next press draws a relationship", async () => {
      const calls = recordInteraction();
      armConnect();
      hover(graphics("customer"), centreOf("customer"));

      await modeler.importText(BOOKSHOP);
      expect(dragPrefix()).toBe("global-connect");
      expect(modeler.interaction.active()).toBe(false);
      expect(calls).toEqual([]);
      expectCanvasMatchesDocument(modeler);
      connectWithTheTool("customer", "payments");

      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(calls).toEqual([true, false]);
      expect(modeler.exportText()).toContain("        customer -> payments\n");
      const connection = service<ElementRegistry>("elementRegistry").get(
        "rel:customer->payments",
      ) as Connection;
      expect(connection.source).toBe(node("customer"));
      expect(connection.target).toBe(node("payments"));
    });

    it("stays armed through a host's view switch, and connects in the view it switched to", () => {
      armConnect();
      const { x, y, width, height } = service<Canvas>("canvas").viewbox();
      modeler.setViewState({ view: "BookshopContext", x, y, width, height });
      expect(dragPrefix()).toBe("global-connect");
      expect(modeler.interaction.active()).toBe(false);
      expectCanvasMatchesDocument(modeler);

      connectWithTheTool("customer", "mail");

      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(modeler.views.active().key).toBe("BookshopContext");
      expect(modeler.exportText()).toContain("        customer -> mail\n");
    });
  });

  it("the harness's mutate on LIBRARY creates a member of its container view (SPEC 1.10)", async () => {
    await modeler.importText(LIBRARY);
    const before = new Set(modeler.elements.list().map(({ id }) => id));

    mutate(modeler);

    const created = modeler.elements.list().filter(({ id }) => !before.has(id));
    expect(created).toHaveLength(1);
    const [{ id } = { id: "" }] = created;
    expect(changes).toBe(1);
    expect(modeler.views.active().key).toBe("LibraryContainers");
    // `include *` of a container view takes no unconnected software system.
    expect(modeler.exportText()).toContain(`            include ${id}\n`);
    const viewer = await mountViewer();
    await viewer.importText(modeler.exportText());
    expect(viewer.views.active().key).toBe("LibraryContainers");
    expect(viewer.elements.list().map((element) => element.id)).toContain(id);
    viewer.destroy();
  });

  describe("views on one root (SPEC 1.7)", () => {
    // BOOKSHOP's default view `Landscape` leaves `mail` out; `BookshopContext` shows it.
    const IN_LANDSCAPE = ["customer", "bookshop", "payments"];
    const IN_CONTEXT = ["customer", "bookshop", "payments", "mail"];

    function listed(): string[] {
      return modeler.elements.list().map(({ id }) => id);
    }

    it("a switch shows the other view in place and fires c4.view.changed, and undo returns to the edit's view", () => {
      const switches: ViewChangedEvent[] = [];
      service<EventBus>("eventBus").on(VIEW_CHANGED_EVENT, (event: ViewChangedEvent) => {
        switches.push({ view: event.view, previous: event.previous, cause: event.cause });
      });
      const customer = node("customer");
      startGesture("move").drop();
      expect(changes).toBe(1);

      expect(modeler.views.open("BookshopContext", { cause: "user" })).toBe(true);
      expect(modeler.views.active().key).toBe("BookshopContext");
      expect(listed()).toEqual(IN_CONTEXT);
      expect(node("customer")).toBe(customer);
      expect(modeler.getViewState()?.view).toBe("BookshopContext");
      expect(changes).toBe(1);
      expectCanvasMatchesDocument(modeler);

      service<CommandStack>("commandStack").undo();
      expect(modeler.views.active().key).toBe("Landscape");
      expect(listed()).toEqual(IN_LANDSCAPE);
      expect(modeler.exportText()).toBe(BOOKSHOP);
      expect(switches).toEqual([
        { view: "BookshopContext", previous: "Landscape", cause: "user" },
        { view: "Landscape", previous: "BookshopContext", cause: "undo" },
      ]);
      expect(errors).toEqual([]);
    });

    it("an undo and a redo across views switch inside the command, and the change listener already reads the new view", () => {
      const switches: string[] = [];
      service<EventBus>("eventBus").on(VIEW_CHANGED_EVENT, (event: ViewChangedEvent) => {
        switches.push(`${event.previous}>${event.view}:${event.cause}`);
      });
      const readByHost: string[] = [];
      modeler.onContentChanged(() => readByHost.push(modeler.getViewState()?.view ?? "none"));
      startGesture("move").drop();

      modeler.views.open("BookshopContext", { cause: "user" });
      service<CommandStack>("commandStack").undo();
      expectCanvasMatchesDocument(modeler);
      modeler.views.open("BookshopContext", { cause: "user" });
      expectCanvasMatchesDocument(modeler);
      service<CommandStack>("commandStack").redo();

      expect(errors).toEqual([]);
      expect(switches).toEqual([
        "Landscape>BookshopContext:user",
        "BookshopContext>Landscape:undo",
        "Landscape>BookshopContext:user",
        "BookshopContext>Landscape:redo",
      ]);
      expect(readByHost).toEqual(["Landscape", "Landscape", "Landscape"]);
      expect(modeler.exportText()).toContain('"c4modeler.element.customer" "100,200"');
    });

    it("an import shows the view it is asked for when the text has it, else the default view", async () => {
      await modeler.importText(BOOKSHOP, { view: "BookshopContext" });
      expect(modeler.views.active().key).toBe("BookshopContext");
      expect(listed()).toEqual(IN_CONTEXT);
      expectCanvasMatchesDocument(modeler);

      await modeler.importText(BOOKSHOP, { view: "Gone" });
      expect(modeler.views.active().key).toBe("Landscape");
      modeler.views.open("BookshopContext", { cause: "user" });
      await modeler.importText(BOOKSHOP);
      expect(modeler.views.active().key).toBe("Landscape");
      expect(listed()).toEqual(IN_LANDSCAPE);
    });

    it("a view switch takes an open label edit down without committing it and reopens it where the element is shown", async () => {
      service<LabelEditing>("labelEditing").activate(node("customer"));
      labelFieldOf(modeler).value = "typed, not committed";

      modeler.views.open("BookshopContext", { cause: "user" });
      expect(service<LabelEditing>("labelEditing").openEdit()).toBeUndefined();
      await nextTask();

      expect(service<LabelEditing>("labelEditing").openEdit()).toEqual({
        elementId: "customer",
        text: "typed, not committed",
        field: "name",
      });
      expect(modeler.exportText()).toBe(BOOKSHOP);
      expect(changes).toBe(0);
    });

    it("setViewState naming another view switches; one named during a drop waits for it", async () => {
      const box = { x: 0, y: 0, width: 400, height: 300 };
      modeler.setViewState({ view: "BookshopContext", ...box });
      expect(modeler.views.active().key).toBe("BookshopContext");
      expect(modeler.getViewState()).toEqual({
        view: "BookshopContext",
        x: 0,
        y: 0,
        width: 400,
        height: 300,
      });

      modeler.setViewState({ view: "Landscape", ...box });
      const switches: string[] = [];
      service<EventBus>("eventBus").on(VIEW_CHANGED_EVENT, (event: ViewChangedEvent) => {
        switches.push(`${event.view}:${event.cause}`);
      });
      let reimport: Promise<unknown> | undefined;
      modeler.onContentChanged(() => {
        modeler.setViewState({ view: "BookshopContext", ...box });
        expect(modeler.views.active().key).toBe("Landscape");
        reimport ??= modeler.importText(modeler.exportText());
      });
      startGesture("move").drop();
      await reimport;
      expect(errors).toEqual([]);
      // The import ran after the queued switch: a contract import shows the default view.
      expect(switches).toEqual(["BookshopContext:host"]);
      expect(modeler.views.active().key).toBe("Landscape");
      await nextTask();
      modeler.setViewState({ view: "BookshopContext", ...box });
      expect(modeler.views.active().key).toBe("BookshopContext");
    });

    it("reveal of an element the view does not show switches to a view that shows it", () => {
      expect(listed()).not.toContain("mail");
      expect(modeler.elements.reveal("mail")).toBe(true);
      expect(modeler.views.active().key).toBe("BookshopContext");
      expect(modeler.elements.selection()).toEqual(["mail"]);
    });

    it("Delete removes an element another written view shows from this view only", () => {
      service<C4Modeling>("modeling").removeElements([node("customer")]);

      expect(modeler.exportText()).toContain("exclude customer");
      expect(modeler.exportText()).toContain('customer = person "Customer"');
      expect(listed()).toEqual(["bookshop", "payments"]);
      expectCanvasMatchesDocument(modeler);
      modeler.views.open("BookshopContext", { cause: "user" });
      expect(listed()).toEqual(IN_CONTEXT);
      expectCanvasMatchesDocument(modeler);
      service<CommandStack>("commandStack").undo();
      expect(modeler.exportText()).toBe(BOOKSHOP);
      expect(modeler.views.active().key).toBe("Landscape");
      expect(listed()).toEqual(IN_LANDSCAPE);
    });
  });
});
