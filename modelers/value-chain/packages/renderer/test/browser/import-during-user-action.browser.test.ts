import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { parseDocumentJSON, serializeDocument } from "@miragon/value-chain-schema-model";
import {
  createCollaborativeModeler,
  type CollaborativeValueChainModeler,
  type VcLabelEditingProvider,
  type VcModeling,
  type VcReadOnly,
} from "../../src/index.js";
import "../../src/assets/value-chain.css";
import ORDER_TO_CASH from "./fixtures/order-to-cash.vc.json?raw";
import { CanvasPointer, FREE_SPOT } from "./support/pointer.js";

/**
 * #285: a host that imports (or clears) from its change listener does so while the user's action
 * that made the change still runs. A drop waits until its drag has ended
 * (`import-during-drop.browser.test.ts`, #248); every other action that runs a command, an undo or
 * a redo waits until the handler that ran it has returned. Without that, the label editor of a
 * click append or a keyboard create opened on a shape the import had replaced and lost the name
 * typed into it, and a press on the palette that committed a label threw in diagram-js's
 * `Dragging.init`. A drag's activation waits as well (#336): an import from the selection
 * listener, which hears diagram-js empty the selection there, threw in `Dragging.move`.
 */

let modeler: CollaborativeValueChainModeler | undefined;
let pointer: CanvasPointer;
let changes = 0;
let errors: unknown[] = [];
let dragEnds: string[] = [];

function recordError(event: ErrorEvent): void {
  errors.push(event.error);
}

function editor(): CollaborativeValueChainModeler {
  if (!modeler) throw new Error("no modeler mounted");
  return modeler;
}

function service<T>(name: string): T {
  return editor().diagram.get<T>(name);
}

function eventBus(): EventBus {
  return service<EventBus>("eventBus");
}

/** Calls `react` in the change listener of the first change only, as an echoing host does. */
function onFirstChange(react: () => void): void {
  const unsubscribe = editor().onContentChanged(() => {
    unsubscribe();
    react();
  });
}

beforeEach(async () => {
  modeler = createCollaborativeModeler({ fitOnImport: false });
  modeler.attachTo(attachedHost(1000, 700));
  await modeler.importText(ORDER_TO_CASH);
  pointer = new CanvasPointer(modeler);
  changes = 0;
  errors = [];
  dragEnds = [];
  modeler.onContentChanged(() => (changes += 1));
  eventBus().on(["drag.ended", "drag.canceled"], (event: { type: string }) => {
    dragEnds.push(event.type);
  });
  window.addEventListener("error", recordError);
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  vi.restoreAllMocks();
  modeler?.destroy();
  modeler = undefined;
});

interface DirectEditingService {
  isActive(): boolean;
  complete(): void;
}

function labelEditing(): VcLabelEditingProvider {
  return service<VcLabelEditingProvider>("vcLabelEditingProvider");
}

function textBox(): HTMLElement {
  const content = editor().diagram.container.querySelector<HTMLElement>(
    ".djs-direct-editing-content",
  );
  if (!content) throw new Error("no label editor text box");
  return content;
}

/** Types into the open label editor and commits it, as Enter does. */
function typeAndCommit(text: string): void {
  textBox().innerText = text;
  service<DirectEditingService>("directEditing").complete();
}

/** Opens the label editor of `id` with a double click and types into it, without a commit. */
function startTyping(id: string, text: string): void {
  pointer
    .graphics(id)
    .dispatchEvent(pointer.event("dblclick", pointer.centreOf(id), { detail: 2 }));
  textBox().innerText = text;
}

/**
 * Moves the real pointer off the palette while the modeler still lives, to a spot no later test's
 * diagram covers: diagram-js's tooltip timer of a hovered entry outlives a destroyed modeler and
 * throws, and a palette drawn under a resting pointer would start one.
 */
async function parkPointerBelowTheDiagrams(): Promise<void> {
  const spot = document.createElement("div");
  spot.style.cssText = "position:absolute;left:0;top:860px;width:10px;height:10px";
  document.body.append(spot);
  await userEvent.hover(spot);
  spot.remove();
}

/** Every microtask has run by then, the import or clear a user action held back included. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The import has run, and a label edit it took down has had its task to reopen. */
async function settled(work: Promise<unknown> | undefined): Promise<void> {
  expect(work).toBeDefined();
  await work;
  await nextTask();
}

function exportedElement(id: string): { elementType: string; name?: string } | undefined {
  return parseDocumentJSON(editor().exportText()).elements.find((element) => element.id === id);
}

function importsDone(): string[] {
  const done: string[] = [];
  eventBus().on("import.done", () => {
    done.push("imported");
  });
  return done;
}

function clickAppend(action: string): void {
  pointer.click(
    pointer.contextPadEntry("step-delivery", action),
    pointer.centreOf("step-delivery"),
  );
}

/** What a host's chrome dispatches for Enter or Space on a palette entry: a click with detail 0. */
function keyboardCreate(action: string): void {
  pointer
    .paletteEntry(action)
    .entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
}

const ELEMENT_COUNT = parseDocumentJSON(ORDER_TO_CASH).elements.length;

/** A peer's edit of the document on the canvas: one element further right, in canonical form. */
function withElementMoved(text: string, id: string, dx: number): string {
  const document = parseDocumentJSON(text);
  return serializeDocument({
    ...document,
    elements: document.elements.map((element) =>
      element.id === id
        ? { ...element, bounds: { ...element.bounds, x: element.bounds.x + dx } }
        : element,
    ),
  });
}

const PEER_EDIT = withElementMoved(ORDER_TO_CASH, "step-invoice", 40);

describe("an import from the change listener of a click append or a keyboard create waits until the action has finished (#285)", () => {
  const actions = [
    {
      how: "a click on the context pad's append step",
      act: () => clickAppend("append.step"),
      elementType: "step",
    },
    {
      how: "a click on the context pad's append sub-step",
      act: () => clickAppend("append.sub-step"),
      elementType: "step",
    },
    {
      how: "a click on the context pad's append organizational unit",
      act: () => clickAppend("append.org-unit"),
      elementType: "orgUnit",
    },
    {
      how: "Enter or Space on the palette's Step",
      act: () => keyboardCreate("create.step"),
      elementType: "step",
    },
    {
      how: "Enter or Space on the palette's Organizational unit",
      act: () => keyboardCreate("create.org-unit"),
      elementType: "orgUnit",
    },
  ];

  it.each(actions)(
    "$how, echoed: the label editor opens on the live element, open again after the import, and the typed name reaches the export",
    async ({ act, elementType }) => {
      const registry = service<ElementRegistry>("elementRegistry");
      const imported = importsDone();
      let reimport: Promise<unknown> | undefined;
      onFirstChange(() => {
        reimport = editor().importText(editor().exportText());
      });

      act();
      const opened = labelEditing().openEdit()?.element;
      if (!opened) throw new Error("no label editor open");
      expect(registry.get(opened.id)).toBe(opened);
      expect(imported).toEqual([]);

      await settled(reimport);
      expect(imported).toEqual(["imported"]);
      const reopened = labelEditing().openEdit()?.element;
      expect(reopened?.id).toBe(opened.id);
      expect(registry.get(opened.id)).toBe(reopened);

      typeAndCommit("Typed after the action");
      expect(exportedElement(opened.id)).toMatchObject({
        elementType,
        name: "Typed after the action",
      });
      expect(changes).toBe(2);
      expect(errors).toEqual([]);
    },
  );

  it.each(actions)(
    "$how, cleared: the diagram is empty once the action has finished, and no label editor stays open",
    async ({ act }) => {
      onFirstChange(() => editor().diagram.clear());

      act();
      expect(labelEditing().openEdit()).toBeDefined();
      expect(editor().diagram.exportDocument().elements).toHaveLength(ELEMENT_COUNT + 1);

      await nextTask();
      expect(editor().diagram.exportDocument().elements).toEqual([]);
      expect(labelEditing().openEdit()).toBeUndefined();
      expect(service<DirectEditingService>("directEditing").isActive()).toBe(false);
      expect(service<Selection>("selection").get()).toEqual([]);
      expect(errors).toEqual([]);
    },
  );

  it("settles after the action has returned and the import has run", async () => {
    const order: string[] = [];
    eventBus().on("directEditing.activate", () => {
      order.push("label editor opened");
    });
    eventBus().on("import.done", () => {
      order.push("imported");
    });
    let reimport: Promise<unknown> | undefined;
    onFirstChange(() => {
      order.push("import called");
      reimport = editor()
        .importText(editor().exportText())
        .then(() => order.push("settled"));
    });

    keyboardCreate("create.step");
    expect(order).toEqual(["import called", "label editor opened"]);

    await settled(reimport);
    expect(order).toEqual([
      "import called",
      "label editor opened",
      "imported",
      "settled",
      "label editor opened",
    ]);
  });

  it("an import from the selection listener of a keyboard create waits as well", async () => {
    const registry = service<ElementRegistry>("elementRegistry");
    let reimport: Promise<unknown> | undefined;
    const unsubscribe = editor().elements.onSelection(() => {
      unsubscribe();
      reimport = editor().importText(editor().exportText());
    });

    keyboardCreate("create.step");
    const opened = labelEditing().openEdit()?.element;
    if (!opened) throw new Error("no label editor open");
    expect(registry.get(opened.id)).toBe(opened);

    await settled(reimport);
    expect(labelEditing().openEdit()?.element).toBe(registry.get(opened.id));
    typeAndCommit("Typed after the create");
    expect(exportedElement(opened.id)?.name).toBe("Typed after the create");
    expect(errors).toEqual([]);
  });

  it("rejects when the modeler is destroyed before the action's import ran", async () => {
    let reimport: Promise<unknown> | undefined;
    onFirstChange(() => {
      reimport = editor().importText(editor().exportText());
    });

    keyboardCreate("create.step");
    editor().destroy();

    await expect(reimport).rejects.toThrow("The modeler was destroyed.");
  });
});

describe("an import from the change listener of a label commit at a press waits until the press has returned (#285)", () => {
  const TYPED = "Credit check, typed";

  beforeEach(() => {
    startTyping("step-credit", TYPED);
  });

  /**
   * A pointer click on a palette entry gives the canvas the focus, which commits the label before
   * the create starts. In a page without the focus nothing moves it, and the create's own
   * `drag.init` commits the label, inside diagram-js's `Dragging.init`.
   */
  const paletteCommits = [
    { where: "where the canvas takes the focus", focusMoves: true },
    { where: "in a page without the focus, at the create's start", focusMoves: false },
  ];

  it.each(paletteCommits)(
    "a press on the palette's Step, $where: no error, and the import ends the create it started",
    async ({ focusMoves }) => {
      if (!focusMoves) vi.spyOn(service<Canvas>("canvas"), "focus").mockImplementation(() => {});
      const committedAt: string[] = [];
      eventBus().on("drag.init", 100_001, () => {
        committedAt.push("drag.init");
      });
      eventBus().on("commandStack.changed", () => {
        committedAt.push("committed");
      });
      const seen: boolean[] = [];
      editor().interaction.onChange((active) => seen.push(active));
      let reimport: Promise<unknown> | undefined;
      onFirstChange(() => {
        reimport = editor().importText(editor().exportText());
      });

      pointer.pickFromPalette("create.step");
      expect(committedAt).toEqual(
        focusMoves ? ["committed", "drag.init"] : ["drag.init", "committed"],
      );
      expect(errors).toEqual([]);
      expect(editor().interaction.active()).toBe(true);

      await reimport;
      expect(editor().interaction.active()).toBe(false);
      expect(seen).toEqual([true, false]);
      pointer.hover(pointer.canvasSvg(), FREE_SPOT);
      pointer.release(FREE_SPOT);

      expect(exportedElement("step-credit")?.name).toBe(TYPED);
      expect(editor().elements.list()).toHaveLength(ELEMENT_COUNT);
      expect(changes).toBe(1);
      expect(errors).toEqual([]);
    },
  );

  it("a real pointer on the palette's Step commits the label at its mousedown: the import runs before the click, and the create the click starts survives", async () => {
    const committedAt: string[] = [];
    eventBus().on("drag.init", 100_001, () => {
      committedAt.push("drag.init");
    });
    eventBus().on("commandStack.changed", () => {
      committedAt.push("committed");
    });
    eventBus().on("import.done", () => {
      committedAt.push("imported");
    });
    let reimport: Promise<unknown> | undefined;
    onFirstChange(() => {
      reimport = editor().importText(editor().exportText());
    });

    await userEvent.click(pointer.paletteEntry("create.step").entry);
    expect(committedAt).toEqual(["committed", "imported", "drag.init"]);
    await reimport;
    expect(editor().interaction.active()).toBe(true);
    pointer.hover(pointer.canvasSvg(), FREE_SPOT);
    pointer.release(FREE_SPOT);

    expect(exportedElement("step-credit")?.name).toBe(TYPED);
    expect(editor().elements.list()).toHaveLength(ELEMENT_COUNT + 1);
    expect(changes).toBe(2);
    expect(errors).toEqual([]);
    await parkPointerBelowTheDiagrams();
  });

  it("a press on another step: the import runs once the press has returned and ends the drag it started", async () => {
    const imported = importsDone();
    let reimport: Promise<unknown> | undefined;
    onFirstChange(() => {
      reimport = editor().importText(editor().exportText());
    });
    const start = pointer.centreOf("step-order");

    pointer.press(pointer.graphics("step-order"), start);
    expect(errors).toEqual([]);
    expect(imported).toEqual([]);
    expect(service<Dragging>("dragging").context()).not.toBeNull();

    await reimport;
    expect(imported).toEqual(["imported"]);
    expect(service<Dragging>("dragging").context()).toBeNull();
    pointer.moveTo({ x: start.x + 30, y: start.y });
    pointer.moveTo({ x: start.x + 60, y: start.y });
    pointer.release();

    expect(pointer.shape("step-order").x).toBe(40);
    expect(exportedElement("step-credit")?.name).toBe(TYPED);
    expect(changes).toBe(1);
    expect(dragEnds).toEqual([]);
    expect(errors).toEqual([]);
  });

  const presses = [
    { on: "the palette's Step", press: () => void pointer.pickFromPalette("create.step") },
    {
      on: "another step",
      press: () => pointer.press(pointer.graphics("step-order"), pointer.centreOf("step-order")),
    },
  ];

  it.each(presses)(
    "a press on $on, cleared: the diagram is empty once the press has returned, and its release changes nothing",
    async ({ press }) => {
      onFirstChange(() => editor().diagram.clear());

      press();
      expect(errors).toEqual([]);

      await nextTask();
      expect(editor().diagram.exportDocument().elements).toEqual([]);
      expect(service<Dragging>("dragging").context()).toBeNull();
      pointer.hover(pointer.canvasSvg(), FREE_SPOT);
      pointer.release(FREE_SPOT);

      expect(editor().diagram.exportDocument().elements).toEqual([]);
      expect(editor().interaction.active()).toBe(false);
      expect(errors).toEqual([]);
    },
  );
});

describe("an import from a listener inside a command, an undo or a redo waits until it has finished", () => {
  let deleteEntry: Element | undefined;

  const commands = [
    {
      what: "a delete from the context pad",
      before: () => {
        deleteEntry = pointer.contextPadEntry("step-credit", "delete");
      },
      run: () => {
        if (!deleteEntry) throw new Error("no delete entry");
        pointer.click(deleteEntry, pointer.centreOf("step-credit"));
      },
    },
    {
      what: "an undo of a keyboard create",
      before: () => keyboardCreate("create.step"),
      run: () => service<CommandStack>("commandStack").undo(),
    },
    {
      what: "a redo of a delete",
      before: () => {
        editor().elements.reveal("step-credit");
        service<{ removeElements(elements: unknown[]): void }>("modeling").removeElements([
          pointer.shape("step-credit"),
        ]);
        service<CommandStack>("commandStack").undo();
        editor().elements.reveal("step-credit");
      },
      run: () => service<CommandStack>("commandStack").redo(),
    },
  ];

  it.each(commands)(
    "$what, whose selection listener imports: the command runs whole, then the import replaces it",
    async ({ before, run }) => {
      before();
      await nextTask();
      changes = 0;
      let reimport: Promise<unknown> | undefined;
      const unsubscribe = editor().elements.onSelection(() => {
        unsubscribe();
        reimport = editor().importText(ORDER_TO_CASH);
      });

      run();
      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(() => editor().exportText()).not.toThrow();

      await reimport;
      expect(editor().exportText()).toBe(ORDER_TO_CASH);
      expect(service<CommandStack>("commandStack").canUndo()).toBe(false);
      expect(service<CommandStack>("commandStack").canRedo()).toBe(false);
      expect(errors).toEqual([]);
    },
  );
});

describe("an import from the selection listener at a drag's start runs once diagram-js has activated the drag, and ends it (#336)", () => {
  let entry: Element | undefined;

  function heldEntry(): Element {
    if (!entry) throw new Error("no context pad entry");
    return entry;
  }

  /** Each gesture starts with a shape selected, which diagram-js deselects as it activates the drag. */
  const gestures = [
    {
      what: "a press on another step, moved past the drag threshold",
      select: () => editor().elements.reveal("step-credit"),
      activate: () => {
        const start = pointer.centreOf("step-order");
        pointer.press(pointer.graphics("step-order"), start);
        pointer.moveTo({ x: start.x + 60, y: start.y });
      },
    },
    {
      what: "a click on the palette's Step",
      select: () => editor().elements.reveal("step-credit"),
      activate: () => void pointer.pickFromPalette("create.step"),
    },
    {
      what: "an append dragged out of the context pad",
      select: () => {
        entry = pointer.contextPadEntry("step-delivery", "append.step");
      },
      activate: () =>
        heldEntry().dispatchEvent(pointer.event("dragstart", pointer.centreOf("step-delivery"))),
    },
    {
      what: "a connect from the context pad, moved past the drag threshold",
      select: () => {
        entry = pointer.contextPadEntry("step-stock", "connect.sequence");
      },
      activate: () => {
        const start = pointer.centreOf("step-stock");
        pointer.click(heldEntry(), start);
        pointer.moveTo({ x: start.x + 40, y: start.y });
      },
    },
  ];

  function releaseOnAFreeSpot(): void {
    pointer.hover(pointer.canvasSvg(), FREE_SPOT);
    pointer.release(FREE_SPOT);
  }

  it.each(gestures)(
    "$what: no error, the import applies, the release changes nothing and the next edit saves",
    async ({ select, activate }) => {
      select();
      const imported = importsDone();
      const seen: boolean[] = [];
      editor().interaction.onChange((active) => seen.push(active));
      let reimport: Promise<unknown> | undefined;
      const unsubscribe = editor().elements.onSelection(() => {
        unsubscribe();
        reimport = editor().importText(PEER_EDIT);
      });

      activate();
      expect(errors).toEqual([]);
      expect(reimport).toBeDefined();
      expect(imported).toEqual([]);
      expect(editor().interaction.active()).toBe(true);

      await reimport;
      expect(imported).toEqual(["imported"]);
      expect(service<Dragging>("dragging").context()).toBeNull();
      expect(seen).toEqual([true, false]);
      expect(dragEnds).toEqual(["drag.canceled"]);
      releaseOnAFreeSpot();

      expect(editor().exportText()).toBe(PEER_EDIT);
      expect(changes).toBe(0);
      expect(errors).toEqual([]);
      service<VcModeling>("vcModeling").updateLabel(pointer.shape("step-credit"), "Credit limit");
      expect(changes).toBe(1);
      expect(exportedElement("step-credit")?.name).toBe("Credit limit");
    },
  );

  it.each(gestures)(
    "$what, cleared: the diagram is empty once diagram-js has activated the drag, and the release changes nothing",
    async ({ select, activate }) => {
      select();
      const unsubscribe = editor().elements.onSelection(() => {
        unsubscribe();
        editor().diagram.clear();
      });

      activate();
      expect(errors).toEqual([]);
      expect(editor().elements.list()).toHaveLength(ELEMENT_COUNT);

      await nextTask();
      expect(editor().diagram.exportDocument().elements).toEqual([]);
      expect(service<Dragging>("dragging").context()).toBeNull();
      const changesOfTheClear = changes;
      releaseOnAFreeSpot();

      expect(editor().diagram.exportDocument().elements).toEqual([]);
      expect(changes).toBe(changesOfTheClear);
      expect(editor().interaction.active()).toBe(false);
      expect(errors).toEqual([]);
    },
  );

  it("a drag whose start is refused holds nothing: under the edit lock a press on a step moved past the threshold starts no move, and the next importText applies at once", async () => {
    service<VcReadOnly>("vcReadOnly").setReadOnly(true);
    const start = pointer.centreOf("step-order");
    pointer.press(pointer.graphics("step-order"), start);
    pointer.moveTo({ x: start.x + 60, y: start.y });
    expect(service<Dragging>("dragging").context()).toBeNull();
    pointer.release();

    const imported = importsDone();
    const reimport = editor().importText(PEER_EDIT);
    expect(imported).toEqual(["imported"]);
    await reimport;
    expect(editor().exportText()).toBe(PEER_EDIT);
    expect(errors).toEqual([]);
  });
});

describe("a destroy from a listener at a drag's start throws nothing, and nothing runs on the modeler afterwards (#346)", () => {
  /** Each starts with a step selected, which diagram-js deselects as it activates the drag. */
  const starts = [
    {
      what: "a press on another step, moved past the drag threshold",
      activate: () => {
        const start = pointer.centreOf("step-order");
        pointer.press(pointer.graphics("step-order"), start);
        pointer.moveTo({ x: start.x + 60, y: start.y });
      },
    },
    {
      what: "a click on the palette's Step",
      activate: () => void pointer.pickFromPalette("create.step"),
    },
  ];

  /**
   * Read before the destroy, which a later read of a service would undo with a fresh diagram: once
   * the input's handler has returned, the modeler is destroyed, no error reached the window, the
   * drag and the canvas are gone, the release changes nothing, and the modeler keeps its text.
   */
  function destroyedCleanly(): () => Promise<void> {
    const dragging = service<Dragging>("dragging");
    const svg = pointer.canvasSvg();
    const release = pointer.event("mouseup", FREE_SPOT);
    const before = editor().exportText();
    return async () => {
      await nextTask();
      expect(errors).toEqual([]);
      expect(dragging.context()).toBeNull();
      expect(svg.isConnected).toBe(false);
      document.dispatchEvent(release);
      await nextTask();
      expect(errors).toEqual([]);
      expect(changes).toBe(0);
      expect(editor().interaction.active()).toBe(false);
      expect(editor().exportText()).toBe(before);
    };
  }

  it.each(starts)(
    "$what, from the selection listener: the listener hears nothing more",
    async ({ activate }) => {
      editor().elements.reveal("step-credit");
      const expectDestroyedCleanly = destroyedCleanly();
      const heard: string[][] = [];
      const delivered: boolean[] = [];
      editor().interaction.onChange((active) => delivered.push(active));
      editor().elements.onSelection((ids) => {
        heard.push(ids);
        editor().destroy();
      });

      activate();
      expect(heard).toEqual([[]]);
      await expectDestroyedCleanly();
      expect(heard).toEqual([[]]);
      expect(delivered).toEqual([]);
    },
  );

  it.each(starts)(
    "$what, from the interaction listener: no later listener hears of it",
    async ({ activate }) => {
      const expectDestroyedCleanly = destroyedCleanly();
      const later: boolean[] = [];
      editor().interaction.onChange(() => editor().destroy());
      editor().interaction.onChange((active) => later.push(active));

      activate();
      await expectDestroyedCleanly();
      expect(later).toEqual([]);
    },
  );
});

describe("importDocument keeps the order of the calls before it", () => {
  /** A host's own command, such as a rename from its UI: the hold cannot tell it from the user's. */
  function hostCommand(): void {
    service<{ updateLabel(element: unknown, label: string): void }>("vcModeling").updateLabel(
      pointer.shape("step-credit"),
      "Renamed by the host",
    );
  }

  it("a clear() held back by a command, then importDocument in the same task: the import stays", async () => {
    hostCommand();
    editor().diagram.clear();
    editor().diagram.importDocument(parseDocumentJSON(ORDER_TO_CASH));

    expect(editor().elements.list()).toHaveLength(ELEMENT_COUNT);
    await nextTask();
    expect(editor().elements.list()).toHaveLength(ELEMENT_COUNT);
    expect(editor().exportText()).toBe(ORDER_TO_CASH);
    expect(service<CommandStack>("commandStack").canUndo()).toBe(false);
    expect(errors).toEqual([]);
  });

  it("an importText held back by a command, then importDocument in the same task: the later document stays", async () => {
    const first = parseDocumentJSON(ORDER_TO_CASH);
    const later = {
      ...first,
      elements: first.elements.map((element) =>
        element.id === "step-order" ? { ...element, name: "The later document" } : element,
      ),
    };
    hostCommand();
    const held = editor().importText(ORDER_TO_CASH);
    editor().diagram.importDocument(later);

    await expect(held).resolves.toEqual({ warnings: [] });
    await nextTask();
    expect(exportedElement("step-order")?.name).toBe("The later document");
    expect(editor().elements.list()).toHaveLength(ELEMENT_COUNT);
    expect(errors).toEqual([]);
  });

  it("an import that a held importText runs takes nothing else from the queue ahead of it", async () => {
    const done: string[] = [];
    hostCommand();
    const first = editor()
      .importText(ORDER_TO_CASH)
      .then(() => done.push("first"));
    editor().diagram.clear();
    const second = editor()
      .importText(ORDER_TO_CASH)
      .then(() => done.push("second"));

    await Promise.all([first, second]);
    expect(done).toEqual(["first", "second"]);
    expect(editor().elements.list()).toHaveLength(ELEMENT_COUNT);
    expect(errors).toEqual([]);
  });
});

describe("clear() outside a user action", () => {
  it("reports its emptied history as no user action: an import from that change runs at once", async () => {
    const imported = importsDone();
    let reimport: Promise<unknown> | undefined;
    onFirstChange(() => {
      reimport = editor().importText(ORDER_TO_CASH);
    });

    editor().diagram.clear();
    expect(imported).toEqual(["imported"]);

    await reimport;
    expect(editor().exportText()).toBe(ORDER_TO_CASH);
  });
});
