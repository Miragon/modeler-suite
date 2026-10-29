import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import { parseDocumentJSON, serializeDocument } from "@miragon/value-chain-schema-model";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeValueChainModeler,
} from "../../src/index.js";
import "../../src/assets/value-chain.css";
import ORDER_TO_CASH from "./fixtures/order-to-cash.vc.json?raw";
import {
  armTool,
  CanvasPointer,
  FREE_SPOT,
  startGesture,
  type GestureKind,
  type Point,
} from "./support/pointer.js";

/**
 * Contract 1.5 `interaction` (`packages/api/README.md`, "Cases for the 1.5 surfaces"): `active()`
 * from a gesture's start until its drop or cancel, `onChange` once each way. An armed palette tool
 * and a pan are no gesture (#170).
 */

const PEER_EDIT = (() => {
  const document = parseDocumentJSON(ORDER_TO_CASH);
  return serializeDocument({
    ...document,
    elements: document.elements.map((element) =>
      element.id === "step-invoice"
        ? { ...element, bounds: { ...element.bounds, x: element.bounds.x + 40 } }
        : element,
    ),
  });
})();

let modeler: CollaborativeValueChainModeler | undefined;
let pointer: CanvasPointer;
let calls: boolean[] = [];
let errors: unknown[] = [];

function recordError(event: ErrorEvent): void {
  errors.push(event.error);
}

function editor(): CollaborativeValueChainModeler {
  if (!modeler) throw new Error("no modeler mounted");
  return modeler;
}

function active(): boolean {
  return editor().interaction.active();
}

function dragPrefix(): string | undefined {
  const context = editor().diagram.get<Dragging>("dragging").context() as {
    prefix: string;
  } | null;
  return context?.prefix;
}

beforeEach(async () => {
  modeler = createCollaborativeModeler({ fitOnImport: false });
  modeler.attachTo(attachedHost(1000, 700));
  await modeler.importText(ORDER_TO_CASH);
  pointer = new CanvasPointer(modeler);
  calls = [];
  errors = [];
  modeler.interaction.onChange((value) => calls.push(value));
  window.addEventListener("error", recordError);
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  modeler?.destroy();
  modeler = undefined;
  expect(errors).toEqual([]);
});

describe("interaction: active() follows every gesture", () => {
  it("is false before the first import, before attachTo and at rest", () => {
    const fresh = createCollaborativeModeler();
    expect(fresh.interaction.active()).toBe(false);
    fresh.attachTo(attachedHost(1000, 700));
    expect(fresh.interaction.active()).toBe(false);
    fresh.destroy();
    expect(active()).toBe(false);
    expect(calls).toEqual([]);
  });

  it.each<GestureKind>(["move", "create", "createOffCanvas"])(
    "%s: true while held, false after the drop, once each way",
    (kind) => {
      const gesture = startGesture(editor(), kind);
      expect(active()).toBe(true);
      expect(calls).toEqual([true]);

      gesture.drop();
      expect(active()).toBe(false);
      expect(calls).toEqual([true, false]);
    },
  );

  it.each<GestureKind>(["move", "create", "createOffCanvas"])(
    "%s: true while held, false after Escape, once each way",
    (kind) => {
      const gesture = startGesture(editor(), kind);
      expect(calls).toEqual([true]);

      gesture.cancel();
      expect(active()).toBe(false);
      expect(calls).toEqual([true, false]);
      expect(dragPrefix()).toBeUndefined();
    },
  );

  it("a press that has not reached the drag threshold is no gesture yet", () => {
    const start = pointer.centreOf("step-credit");
    pointer.press(pointer.graphics("step-credit"), start);
    pointer.moveTo({ x: start.x + 2, y: start.y });
    expect(dragPrefix()).toBe("shape.move");
    expect(active()).toBe(false);

    pointer.moveTo({ x: start.x + 40, y: start.y });
    expect(active()).toBe(true);
    pointer.release();
    expect(calls).toEqual([true, false]);
  });

  it("resizing a shape by its handle", () => {
    editor().elements.reveal("step-credit");
    const handle = editor().diagram.container.querySelector(
      ".djs-resizer-step-credit.djs-resizer-se",
    );
    if (!handle) throw new Error("no resize handle");
    const corner = { x: 400, y: 140 };
    pointer.press(handle, corner);
    pointer.moveTo({ x: corner.x + 30, y: corner.y + 30 });
    expect(active()).toBe(true);

    pointer.release();
    expect(active()).toBe(false);
    expect(calls).toEqual([true, false]);
  });

  it("connecting from the context pad onto another shape", () => {
    const entry = pointer.contextPadEntry("step-stock", "connect.sequence");
    const start = pointer.centreOf("step-stock");
    pointer.click(entry, start);
    pointer.moveTo({ x: start.x + 20, y: start.y });
    pointer.hover(pointer.graphics("step-delivery"), pointer.centreOf("step-delivery"));
    expect(active()).toBe(true);

    pointer.release();
    expect(active()).toBe(false);
    expect(calls).toEqual([true, false]);
  });

  it("appending a step dragged out of the context pad, its preview held over the canvas", () => {
    const entry = pointer.contextPadEntry("step-delivery", "append.step");
    entry.dispatchEvent(pointer.event("dragstart", pointer.centreOf("step-delivery")));
    pointer.hover(pointer.canvasSvg(), FREE_SPOT);
    expect(active()).toBe(true);

    pointer.release(FREE_SPOT);
    expect(active()).toBe(false);
    expect(calls).toEqual([true, false]);
  });

  it("a lasso with Shift and a press", () => {
    pointer.press(pointer.canvasSvg(), { x: 20, y: 60 }, { shiftKey: true });
    pointer.moveTo({ x: 300, y: 160 });
    expect(active()).toBe(true);

    pointer.release();
    expect(active()).toBe(false);
    expect(calls).toEqual([true, false]);
  });

  it("a lasso that the armed lasso tool starts with its press", () => {
    armTool(editor());
    pointer.hover(pointer.canvasSvg(), { x: 20, y: 60 });
    expect(active()).toBe(false);

    pointer.press(pointer.canvasSvg(), { x: 20, y: 60 });
    expect(dragPrefix()).toBe("lasso");
    expect(active()).toBe(true);
    pointer.moveTo({ x: 300, y: 160 });
    pointer.release();

    expect(active()).toBe(false);
    expect(calls).toEqual([true, false]);
  });

  it("making space, which the armed space tool starts with its press", () => {
    pointer.pickFromPalette("space-tool");
    const start = { x: 410, y: 40 };
    pointer.hover(pointer.canvasSvg(), start);
    expect(active()).toBe(false);

    pointer.press(pointer.canvasSvg(), start);
    pointer.moveTo({ x: start.x + 60, y: start.y });
    expect(active()).toBe(true);
    pointer.release();

    expect(dragPrefix()).toBe("spaceTool.selection");
    expect(active()).toBe(false);
    expect(calls).toEqual([true, false]);
  });
});

describe("interaction: no gesture", () => {
  it.each([
    ["lasso-tool", "lasso.selection"],
    ["hand-tool", "hand"],
    ["space-tool", "spaceTool.selection"],
    ["global-connect-tool", "global-connect"],
  ])("the %s while it only waits for its next press", (action, prefix) => {
    pointer.pickFromPalette(action);
    pointer.hover(pointer.canvasSvg(), FREE_SPOT);
    pointer.moveTo({ x: FREE_SPOT.x + 40, y: FREE_SPOT.y + 40 });

    expect(dragPrefix()).toBe(prefix);
    expect(active()).toBe(false);
    expect(calls).toEqual([]);
  });

  it("a pan with the palette's hand tool", () => {
    pointer.pickFromPalette("hand-tool");
    pointer.hover(pointer.canvasSvg(), FREE_SPOT);
    pointer.press(pointer.canvasSvg(), FREE_SPOT);
    pointer.moveTo({ x: FREE_SPOT.x + 60, y: FREE_SPOT.y });
    expect(dragPrefix()).toBe("hand.move");
    pointer.release();

    expect(active()).toBe(false);
    expect(calls).toEqual([]);
  });

  it("a pan with Space held", () => {
    const canvas = pointer.canvasSvg();
    canvas.focus();
    pointer.hover(canvas, FREE_SPOT);
    canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }),
    );
    pointer.moveTo({ x: FREE_SPOT.x + 60, y: FREE_SPOT.y });
    expect(dragPrefix()).toBe("hand.move");
    canvas.dispatchEvent(
      new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true, cancelable: true }),
    );

    expect(active()).toBe(false);
    expect(calls).toEqual([]);
  });

  it("a pan with Ctrl or Cmd and a press", () => {
    pointer.hover(pointer.canvasSvg(), FREE_SPOT);
    pointer.press(pointer.canvasSvg(), FREE_SPOT, { ctrlKey: true, metaKey: true });
    pointer.moveTo({ x: FREE_SPOT.x + 60, y: FREE_SPOT.y });
    expect(dragPrefix()).toBe("hand.move");
    pointer.release();

    expect(active()).toBe(false);
    expect(calls).toEqual([]);
  });

  it("a label being typed", () => {
    pointer
      .graphics("step-credit")
      .dispatchEvent(pointer.event("dblclick", pointer.centreOf("step-credit")));
    expect(editor().diagram.container.querySelector(".djs-direct-editing-content")).not.toBeNull();

    expect(active()).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("interaction: the listener", () => {
  it("reads the value it gets from active(), and stops with its unsubscribe", () => {
    const seen: [boolean, boolean][] = [];
    const unsubscribe = editor().interaction.onChange((value) => seen.push([value, active()]));

    startGesture(editor(), "move").drop();
    expect(seen).toEqual([
      [true, true],
      [false, false],
    ]);

    unsubscribe();
    startGesture(editor(), "move").drop();
    expect(seen).toHaveLength(2);
    expect(calls).toEqual([true, false, true, false]);
  });

  it("that throws costs the user neither the gesture nor the other listeners", () => {
    const report = vi.spyOn(globalThis, "reportError").mockImplementation(() => undefined);
    const failure = new Error("host listener failed");
    editor().interaction.onChange(() => {
      throw failure;
    });
    const later: boolean[] = [];
    editor().interaction.onChange((value) => later.push(value));
    try {
      const start = pointer.centreOf("step-credit");
      pointer.press(pointer.graphics("step-credit"), start);
      pointer.moveTo({ x: start.x + 40, y: start.y });
      expect(dragPrefix()).toBe("shape.move");
      pointer.release();

      expect(pointer.shape("step-credit").x).toBe(280);
      expect(later).toEqual([true, false]);
      expect(report).toHaveBeenCalledWith(failure);
    } finally {
      report.mockRestore();
    }
  });

  it("hears the end of a drop whose cleanup listener threw, which diagram-js then never announces", async () => {
    const eventBus = editor().diagram.get<EventBus>("eventBus");
    const failingCleanup = (): never => {
      throw new Error("cleanup failed");
    };
    eventBus.on("shape.move.cleanup", failingCleanup);
    startGesture(editor(), "move");
    expect(() =>
      editor()
        .diagram.get<Dragging>("dragging")
        .end(pointer.event("mouseup", pointer.centreOf("step-credit"))),
    ).toThrow("cleanup failed");
    eventBus.off("shape.move.cleanup", failingCleanup);
    expect(dragPrefix()).toBeUndefined();

    await Promise.resolve();
    expect(active()).toBe(false);
    expect(calls).toEqual([true, false]);
  });

  it("that destroys the modeler leaves the later listeners uncalled and the drag ended", () => {
    const later: boolean[] = [];
    editor().interaction.onChange(() => editor().destroy());
    editor().interaction.onChange((value) => later.push(value));
    const start = pointer.centreOf("step-credit");
    const end = { x: start.x + 60, y: start.y };
    const furtherMove = pointer.event("mousemove", end);
    const release = pointer.event("mouseup", end);
    pointer.press(pointer.graphics("step-credit"), start);
    pointer.moveTo({ x: start.x + 40, y: start.y });
    document.dispatchEvent(furtherMove);
    document.dispatchEvent(release);

    expect(calls).toEqual([true]);
    expect(later).toEqual([]);
    expect(editor().interaction.active()).toBe(false);
  });

  it("unsubscribed by an earlier listener is not called in the same delivery", () => {
    const later: boolean[] = [];
    let unsubscribeLater = (): void => undefined;
    editor().interaction.onChange(() => unsubscribeLater());
    unsubscribeLater = editor().interaction.onChange((value) => later.push(value));

    startGesture(editor(), "move").drop();

    expect(later).toEqual([]);
    expect(calls).toEqual([true, false]);
  });

  it("is not called once the modeler is destroyed, also not for the gesture it ends", () => {
    startGesture(editor(), "move");
    expect(calls).toEqual([true]);

    editor().destroy();

    expect(calls).toEqual([true]);
    expect(editor().interaction.active()).toBe(false);
  });
});

describe("interaction: an import during a gesture", () => {
  it.each<GestureKind>(["move", "create", "createOffCanvas"])(
    "%s: the cancel reports false once before importText resolves",
    async (kind) => {
      const gesture = startGesture(editor(), kind);
      let settled = false;
      const imported = editor()
        .importText(PEER_EDIT)
        .then(() => {
          settled = true;
        });
      expect(calls).toEqual([true, false]);
      expect(settled).toBe(false);
      expect(active()).toBe(false);

      await imported;
      gesture.drop();
      expect(calls).toEqual([true, false]);
      expect(editor().exportText()).toBe(PEER_EDIT);
    },
  );

  it("a rejected text leaves the gesture running, and active() true until the drop", async () => {
    const gesture = startGesture(editor(), "move");

    await expect(editor().importText('{ "schemaVersion": 99 }')).rejects.toThrow();
    expect(active()).toBe(true);
    expect(calls).toEqual([true]);

    gesture.drop();
    expect(calls).toEqual([true, false]);
  });

  it("a pan stays no gesture across the import", async () => {
    pointer.pickFromPalette("hand-tool");
    pointer.hover(pointer.canvasSvg(), FREE_SPOT);
    pointer.press(pointer.canvasSvg(), FREE_SPOT);
    pointer.moveTo({ x: FREE_SPOT.x + 60, y: FREE_SPOT.y });

    await editor().importText(PEER_EDIT);
    expect(dragPrefix()).toBe("hand.move");
    pointer.moveTo({ x: FREE_SPOT.x + 90, y: FREE_SPOT.y });
    pointer.release();

    expect(calls).toEqual([]);
  });
});

describe("interaction: the viewer", () => {
  it("reports no gesture, a pan included", async () => {
    const viewer = createCollaborativeViewer({ fitOnImport: false });
    viewer.attachTo(attachedHost(1000, 700));
    await viewer.importText(ORDER_TO_CASH);
    const seen: boolean[] = [];
    const unsubscribe = viewer.interaction.onChange((value) => seen.push(value));
    const viewerPointer = new CanvasPointer(viewer);
    const canvas = viewer.diagram.get<Canvas>("canvas");
    const before = canvas.viewbox().x;
    const start: Point = FREE_SPOT;
    viewerPointer.press(viewerPointer.canvasSvg(), start);
    viewerPointer.moveTo({ x: start.x + 60, y: start.y });
    viewerPointer.release();

    expect(canvas.viewbox().x).not.toBe(before);
    expect(viewer.interaction.active()).toBe(false);
    expect(seen).toEqual([]);
    unsubscribe();
    viewer.destroy();
  });
});
