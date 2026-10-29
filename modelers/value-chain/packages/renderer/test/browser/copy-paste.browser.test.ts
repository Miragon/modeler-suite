import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type CopyPaste from "diagram-js/lib/features/copy-paste/CopyPaste";
import type Rules from "diagram-js/lib/features/rules/Rules";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import {
  parseDocumentJSON,
  type ChainConnection,
  type DiagramElement,
  type ValueChainDocument,
} from "@miragon/value-chain-schema-model";
import {
  createCollaborativeModeler,
  diagramShortcuts,
  type CollaborativeValueChainModeler,
  type ShortcutKeyNames,
  type ShortcutPlatform,
  type VcReadOnly,
} from "../../src/index.js";
import { PASTE_OFFSET } from "../../src/copy-paste/index.js";
import "../../src/assets/value-chain.css";
import ORDER_TO_CASH from "./fixtures/order-to-cash.vc.json?raw";
import { CanvasPointer, FREE_SPOT, type Point } from "./support/pointer.js";

/**
 * #286: Cmd/Ctrl+C, X, V and D on the focused canvas, pressed as the "Keyboard shortcuts…" dialog
 * names them. A copy gets fresh ids and keeps its labels, colour and link, and of the relations
 * only those between copied elements; each paste, cut and duplicate is one undo step and one
 * change event, and leaves what it placed selected.
 */

type EditAction = "Copy" | "Cut" | "Paste" | "Duplicate" | "Undo" | "Redo";

interface KeyboardLayout {
  readonly name: string;
  readonly platform: ShortcutPlatform;
  readonly keyNames: ShortcutKeyNames;
  /** `KeyboardEvent.code` of a letter key: QWERTZ swaps Y and Z. */
  readonly codeOf: (letter: string) => string;
}

const US_CODES = (letter: string): string => `Key${letter.toUpperCase()}`;
const GERMAN_CODES = (letter: string): string =>
  ({ y: "KeyZ", z: "KeyY" })[letter.toLowerCase()] ?? US_CODES(letter);

const LAYOUTS: readonly KeyboardLayout[] = [
  {
    name: "macOS",
    platform: "mac",
    keyNames: { ctrl: "Ctrl", shift: "Shift", plus: "Plus", minus: "Minus" },
    codeOf: US_CODES,
  },
  {
    name: "Windows and Linux",
    platform: "other",
    keyNames: { ctrl: "Ctrl", shift: "Shift", plus: "Plus", minus: "Minus" },
    codeOf: US_CODES,
  },
  {
    name: "Windows and Linux with the German key names",
    platform: "other",
    keyNames: { ctrl: "Strg", shift: "Umschalt", plus: "Plus", minus: "Minus" },
    codeOf: GERMAN_CODES,
  },
];

/** The first chip of `action` in the Edit group of the shortcuts dialog. */
function chipOf(action: EditAction, layout: KeyboardLayout): string {
  const groups = diagramShortcuts({
    platform: layout.platform,
    lang: "en",
    messages: {
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      zoomToActual: (percent) => `Zoom to ${percent}`,
      fit: "Fit",
      keyNames: layout.keyNames,
    },
  });
  const row = groups
    .find((group) => group.title === "Edit")
    ?.rows.find((candidate) => candidate.action === action);
  const chip = row?.keys[0];
  if (!chip) throw new Error(`the shortcuts dialog has no chip for ${action}`);
  return chip;
}

/** The keydown a chip such as `⌘⇧Z`, `Ctrl+C` or `Strg+Umschalt+Z` stands for. */
function keydownOf(chip: string, layout: KeyboardLayout): KeyboardEventInit {
  const modifiers =
    layout.platform === "mac" ? [...chip.slice(0, -1)] : chip.split("+").slice(0, -1);
  const letter = layout.platform === "mac" ? chip.slice(-1) : chip.split("+").at(-1)!;
  const shiftKey = modifiers.includes("⇧") || modifiers.includes(layout.keyNames.shift);
  return {
    key: shiftKey ? letter.toUpperCase() : letter.toLowerCase(),
    code: layout.codeOf(letter),
    metaKey: modifiers.includes("⌘"),
    ctrlKey: modifiers.includes(layout.keyNames.ctrl),
    shiftKey,
  };
}

const EMPTY_STRETCH: Point = { x: 820, y: 560 };

let modeler: CollaborativeValueChainModeler | undefined;
let pointer: CanvasPointer;
let changes = 0;
let errors: unknown[] = [];

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

function element(id: string): Element {
  const found = service<ElementRegistry>("elementRegistry").get(id);
  if (!found) throw new Error(`no element ${id}`);
  return found as Element;
}

function has(id: string): boolean {
  return service<ElementRegistry>("elementRegistry").get(id) !== undefined;
}

function select(ids: readonly string[]): void {
  service<Selection>("selection").select(ids.map(element));
}

function selectedIds(): string[] {
  return service<Selection>("selection")
    .get()
    .map((selected) => (selected as Element).id)
    .sort();
}

function exported(): ValueChainDocument {
  return parseDocumentJSON(editor().exportText());
}

function press(action: EditAction, layout: KeyboardLayout = LAYOUTS[1]!): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...keydownOf(chipOf(action, layout), layout),
  });
  pointer.canvasSvg().dispatchEvent(event);
  return event;
}

/** The pointer moves over the canvas at `at`, so a paste follows it from there. */
function pointAt(at: Point): void {
  pointer.canvasSvg().dispatchEvent(pointer.event("mousemove", at));
}

/** The pointer leaves the canvas, so a paste has no pointer to follow (the keyboard alone). */
function leaveCanvas(): void {
  service<Canvas>("canvas")
    .getContainer()
    .dispatchEvent(new MouseEvent("mouseleave", { bubbles: false, cancelable: false }));
}

interface Added {
  elements: DiagramElement[];
  connections: ChainConnection[];
}

function addedSince(before: ValueChainDocument): Added {
  const after = exported();
  const known = new Set([
    ...before.elements.map((entry) => entry.id),
    ...before.connections.map((entry) => entry.id),
  ]);
  return {
    elements: after.elements.filter((entry) => !known.has(entry.id)),
    connections: after.connections.filter((entry) => !known.has(entry.id)),
  };
}

function named(elements: readonly DiagramElement[], name: string): DiagramElement {
  const found = elements.find((entry) => entry.name === name);
  if (!found) throw new Error(`no element named ${name}`);
  return found;
}

function shifted(original: DiagramElement, by: number, id: string): DiagramElement {
  return {
    ...original,
    id,
    bounds: { ...original.bounds, x: original.bounds.x + by, y: original.bounds.y + by },
  };
}

function canUndo(): boolean {
  return service<CommandStack>("commandStack").canUndo();
}

/** Every microtask has run by then, an import a user action held back included. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  modeler = createCollaborativeModeler({ fitOnImport: false });
  modeler.attachTo(attachedHost(1000, 700));
  await modeler.importText(ORDER_TO_CASH);
  pointer = new CanvasPointer(modeler);
  changes = 0;
  errors = [];
  modeler.onContentChanged(() => (changes += 1));
  window.addEventListener("error", recordError);
  pointer.canvasSvg().focus();
});

afterEach(() => {
  window.removeEventListener("error", recordError);
  vi.restoreAllMocks();
  modeler?.destroy();
  modeler = undefined;
  expect(errors).toEqual([]);
});

describe.each(LAYOUTS)("the keys of the shortcuts dialog on $name", (layout) => {
  it("Copy, then Paste: a copy with fresh ids, its labels, colour and link, next to the original", () => {
    const before = exported();
    select(["step-invoice", "org-finance", "assign-2"]);

    expect(press("Copy", layout).defaultPrevented).toBe(true);
    expect(changes).toBe(0);
    leaveCanvas();
    expect(press("Paste", layout).defaultPrevented).toBe(true);

    expect(changes).toBe(1);
    const added = addedSince(before);
    expect(added.elements).toHaveLength(2);
    const invoice = named(added.elements, "Invoicing");
    const finance = named(added.elements, "Finance");
    expect(invoice.id).toMatch(/^step_[0-9a-z]{8}$/);
    expect(finance.id).toMatch(/^org_[0-9a-z]{8}$/);
    expect(invoice).toEqual(shifted(named(before.elements, "Invoicing"), PASTE_OFFSET, invoice.id));
    expect(finance).toEqual(shifted(named(before.elements, "Finance"), PASTE_OFFSET, finance.id));
    expect(invoice).toMatchObject({ color: "hsl(150, 86%, 34%)", link: "billing-details" });
    expect(added.connections).toEqual([
      expect.objectContaining({
        connectionType: "assignment",
        source: invoice.id,
        target: finance.id,
      }),
    ]);
    expect(added.connections[0]!.id).toMatch(/^assignment_[0-9a-z]{8}$/);
    expect(selectedIds()).toEqual([invoice.id, finance.id, added.connections[0]!.id].sort());

    const pasted = editor().exportText();
    expect(press("Undo", layout).defaultPrevented).toBe(true);
    expect(exported()).toEqual(before);
    expect(canUndo()).toBe(false);
    press("Redo", layout);
    expect(editor().exportText()).toBe(pasted);
    expect(changes).toBe(3);
  });

  it("Cut removes the selection in one step, and Paste puts it back where it was", () => {
    const before = exported();
    select(["step-delivery"]);

    expect(press("Cut", layout).defaultPrevented).toBe(true);
    expect(changes).toBe(1);
    expect(has("step-delivery")).toBe(false);
    expect(has("seq-2")).toBe(false);
    expect(has("seq-3")).toBe(false);

    leaveCanvas();
    press("Paste", layout);
    expect(changes).toBe(2);
    const added = addedSince(before);
    expect(added.connections).toEqual([]);
    const [delivery] = added.elements;
    expect(delivery).toEqual({ ...named(before.elements, "Delivery"), id: delivery!.id });
    expect(delivery!.id).not.toBe("step-delivery");
    expect(selectedIds()).toEqual([delivery!.id]);

    press("Undo", layout);
    expect(has(delivery!.id)).toBe(false);
    press("Undo", layout);
    expect(exported()).toEqual(before);
    expect(canUndo()).toBe(false);
    expect(changes).toBe(4);
  });

  it("Duplicate places a copy next to the original at once, also with the pointer on the canvas", () => {
    const before = exported();
    select(["step-credit", "step-delivery", "seq-2"]);
    pointAt(FREE_SPOT);

    expect(press("Duplicate", layout).defaultPrevented).toBe(true);

    expect(editor().interaction.active()).toBe(false);
    expect(changes).toBe(1);
    const added = addedSince(before);
    const credit = named(added.elements, "Credit check");
    const delivery = named(added.elements, "Delivery");
    expect(added.elements).toHaveLength(2);
    expect(credit).toEqual(
      shifted(named(before.elements, "Credit check"), PASTE_OFFSET, credit.id),
    );
    expect(delivery).toEqual(
      shifted(named(before.elements, "Delivery"), PASTE_OFFSET, delivery.id),
    );
    expect(added.connections).toEqual([
      expect.objectContaining({
        connectionType: "sequence",
        source: credit.id,
        target: delivery.id,
      }),
    ]);
    expect(selectedIds()).toEqual([credit.id, delivery.id, added.connections[0]!.id].sort());

    press("Undo", layout);
    expect(exported()).toEqual(before);
    expect(canUndo()).toBe(false);
  });
});

describe("what a copy takes along", () => {
  it("the rules let steps, org units and relations be copied, a relation only with both ends", () => {
    const rules = service<Rules>("rules");
    for (const id of ["step-credit", "org-sales", "seq-1"]) {
      expect(rules.allowed("element.copy", { element: element(id), elements: [] })).toBe(true);
    }
    expect(
      rules.allowed("element.copy", { element: service<Canvas>("canvas").getRootElement() }),
    ).toBe(false);

    const tree = service<CopyPaste>("copyPaste").copy(
      ["step-order", "step-credit", "seq-1", "hier-1"].map(element),
    ) as Record<string, { id: string }[]>;
    const copied = Object.values(tree)
      .flat()
      .map((descriptor) => descriptor.id)
      .sort();
    expect(copied).toEqual(["seq-1", "step-credit", "step-order"]);
  });

  it("of the relations only those between copied elements", () => {
    const before = exported();
    select(["step-order", "step-capture", "org-sales"]);

    press("Duplicate");

    const added = addedSince(before);
    const order = named(added.elements, "Order handling");
    const capture = named(added.elements, "Capture order");
    const sales = named(added.elements, "Sales");
    expect(
      added.connections
        .map(({ connectionType, source, target }) => ({ connectionType, source, target }))
        .sort((left, right) => left.connectionType.localeCompare(right.connectionType)),
    ).toEqual([
      { connectionType: "assignment", source: capture.id, target: sales.id },
      { connectionType: "hierarchy", source: order.id, target: capture.id },
    ]);
  });

  it("a copy of a lone relation pastes nothing", () => {
    const before = editor().exportText();
    select(["seq-1"]);

    press("Copy");
    leaveCanvas();
    press("Paste");
    press("Duplicate");

    expect(editor().exportText()).toBe(before);
    expect(changes).toBe(0);
  });
});

describe("where a paste lands", () => {
  it("without a pointer on the canvas, each paste one offset further than the one before", () => {
    const before = exported();
    select(["step-credit"]);
    press("Copy");
    leaveCanvas();

    press("Paste");
    press("Paste");

    const credit = named(before.elements, "Credit check");
    const offsets = addedSince(before)
      .elements.map((copy) => copy.bounds.x - credit.bounds.x)
      .sort((left, right) => left - right);
    expect(offsets).toEqual([PASTE_OFFSET, 2 * PASTE_OFFSET]);
    expect(changes).toBe(2);
  });

  it("with the pointer on the canvas, the copy follows it until a click places it there", () => {
    const before = exported();
    select(["step-credit"]);
    press("Copy");
    pointAt(EMPTY_STRETCH);

    press("Paste");
    expect(editor().interaction.active()).toBe(true);
    expect(changes).toBe(0);
    pointer.hover(pointer.canvasSvg(), FREE_SPOT);
    pointer.release();

    expect(editor().interaction.active()).toBe(false);
    expect(changes).toBe(1);
    const [credit] = addedSince(before).elements;
    expect(credit).toMatchObject({
      name: "Credit check",
      bounds: { x: FREE_SPOT.x - 80, y: FREE_SPOT.y - 30, width: 160, height: 60 },
    });
    expect(selectedIds()).toEqual([credit!.id]);
  });

  it("Escape ends the preview without a change and gives the selection back", () => {
    const before = editor().exportText();
    select(["step-credit"]);
    press("Copy");
    pointAt(FREE_SPOT);
    press("Paste");

    pointer.escape();

    expect(editor().interaction.active()).toBe(false);
    expect(editor().exportText()).toBe(before);
    expect(changes).toBe(0);
    expect(selectedIds()).toEqual(["step-credit"]);
  });

  it("Cmd/Ctrl+D and X typed on the real keyboard act as the dispatched keys do", async () => {
    const before = exported();
    select(["step-stock"]);

    await userEvent.keyboard("{Control>}d{/Control}");
    const [copy] = addedSince(before).elements;
    expect(copy).toEqual(shifted(named(before.elements, "Check stock"), PASTE_OFFSET, copy!.id));

    await userEvent.keyboard("{Control>}x{/Control}");
    expect(has(copy!.id)).toBe(false);
    expect(changes).toBe(2);
  });
});

describe("imports", () => {
  it("an import ends a paste preview without a change, and the clipboard pastes on after it", async () => {
    const before = exported();
    select(["step-credit"]);
    press("Copy");
    pointAt(FREE_SPOT);
    press("Paste");

    await editor().importText(ORDER_TO_CASH);

    expect(editor().interaction.active()).toBe(false);
    expect(changes).toBe(0);
    expect(exported()).toEqual(before);
    pointer.release();
    expect(changes).toBe(0);

    pointer.canvasSvg().focus();
    leaveCanvas();
    press("Paste");
    const [credit] = addedSince(before).elements;
    expect(credit).toEqual(
      shifted(named(before.elements, "Credit check"), PASTE_OFFSET, credit!.id),
    );
    expect(changes).toBe(1);
  });

  it.each<EditAction>(["Paste", "Duplicate", "Cut"])(
    "a host that re-imports from the change listener of %s imports once the keys have finished",
    async (action) => {
      const imported: string[] = [];
      let selectedWhenImported: string[] = [];
      editor().onContentChanged(() => {
        const text = editor().exportText();
        void editor()
          .importText(text)
          .then(() => imported.push(text));
      });
      const diagram = editor().diagram;
      const importDocument = diagram.importDocument.bind(diagram);
      vi.spyOn(diagram, "importDocument").mockImplementation((document) => {
        selectedWhenImported = selectedIds();
        return importDocument(document);
      });
      select(["step-credit", "step-delivery", "seq-2"]);
      press("Copy");
      leaveCanvas();

      press(action);
      const afterKeys = editor().exportText();
      expect(imported).toEqual([]);
      await nextTask();

      expect(imported).toEqual([afterKeys]);
      expect(editor().exportText()).toBe(afterKeys);
      expect(selectedWhenImported.length).toBe(action === "Cut" ? 0 : 3);
      expect(changes).toBe(1);
      expect(canUndo()).toBe(false);
    },
  );
});

describe("the edit lock (vcReadOnly)", () => {
  it("leaves Copy working and makes Cut, Paste and Duplicate change nothing", () => {
    const original = exported();
    const before = editor().exportText();
    const lock = service<VcReadOnly>("vcReadOnly");
    lock.setReadOnly(true);
    select(["step-credit"]);

    expect(press("Copy").defaultPrevented).toBe(true);
    leaveCanvas();
    press("Paste");
    press("Duplicate");
    press("Cut");
    pointAt(FREE_SPOT);
    press("Paste");

    expect(editor().interaction.active()).toBe(false);
    expect(editor().exportText()).toBe(before);
    expect(changes).toBe(0);
    expect(has("step-credit")).toBe(true);

    lock.setReadOnly(false);
    leaveCanvas();
    press("Paste");
    expect(changes).toBe(1);
    const [credit] = addedSince(original).elements;
    expect(credit).toEqual(
      shifted(named(original.elements, "Credit check"), PASTE_OFFSET, credit!.id),
    );
  });
});
