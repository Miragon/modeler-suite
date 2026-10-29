import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { parseDSL, serializeDSL } from "@miragon/event-storming-dsl";
import { Modeler } from "../../src/index.js";
import type EventStormingLabelEditing from "../../src/label-editing/EventStormingLabelEditing.js";
import type EventStormingModeling from "../../src/modeling/EventStormingModeling.js";
import type EventStormingReadOnly from "../../src/read-only/EventStormingReadOnly.js";
import type EventStormingSpellingVariants from "../../src/vocabulary/EventStormingSpellingVariants.js";
import { isEventStormingShape, type EventStormingShape } from "../../src/model/di-types.js";
import "../../src/assets/event-storming.css";

const BOARD = `title Vocabulary
command Place Order [150, 120]
aggregate Order [420, 120]
aggregate order [720, 120]
aggregate Orders [1020, 120]
event Order Placed [420, 400]
event Order Shipped [720, 400]
event Payment Received [1020, 400]`;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe("the board's vocabulary on the canvas (real browser DOM)", () => {
  let container: HTMLElement;
  let modeler: Modeler;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    modeler = new Modeler({ container, width: "1280px", height: "800px" });
    await modeler.importDSL(BOARD);
  });

  afterEach(() => {
    modeler.destroy();
    container.remove();
  });

  const registry = () => modeler.get<ElementRegistry>("elementRegistry");
  const byLabel = (label: string): EventStormingShape => {
    const found = registry().find(
      (element) => isEventStormingShape(element) && element.eventStormingLabel === label,
    );
    if (!found) throw new Error(`no sticky "${label}"`);
    return found as EventStormingShape;
  };
  const dots = () => [
    ...container.querySelectorAll<HTMLElement>(".event-storming-spelling-variant"),
  ];
  const labelsOf = (kind: string) =>
    registry()
      .filter((element) => isEventStormingShape(element) && element.eventStormingType === kind)
      .map((element) => (element as EventStormingShape).eventStormingLabel);

  it("marks each spelling variant with a 12px dot on its sticky's top right corner", () => {
    expect(dots()).toHaveLength(3);
    for (const dot of dots()) {
      const sticky = registry().getGraphics(dot.dataset["elementId"]!).getBoundingClientRect();
      const mark = dot.getBoundingClientRect();
      expect(Math.abs(mark.left + mark.width / 2 - sticky.right)).toBeLessThan(1.5);
      expect(Math.abs(mark.top + mark.height / 2 - sticky.top)).toBeLessThan(1.5);
      const drawn = getComputedStyle(dot, "::after");
      expect(drawn.width).toBe("12px");
      expect(drawn.borderTopWidth).toBe("2px");
    }
  });

  it("keeps the dot's size at every zoom and leaves exports and the .storm text alone", async () => {
    const canvas = modeler.get<Canvas>("canvas");
    canvas.zoom(0.5);
    await tick();
    expect(dots()[0]!.getBoundingClientRect().width).toBeCloseTo(16, 0);
    const { svg } = await modeler.saveSVG();
    expect(svg).not.toContain("spelling");
    expect(modeler.exportDSL()).toBe(serializeDSL(parseDSL(BOARD)));
  });

  it("unifies a variant on the selected sticky's spelling as one undo step", async () => {
    const chosen = byLabel("order");
    modeler.get<Selection>("selection").select(chosen);
    await tick();
    const entry = container.querySelector<HTMLElement>(
      '.djs-context-pad [data-action="unify-spelling"]',
    );
    expect(entry).not.toBeNull();
    entry!.click();
    expect(labelsOf("aggregate")).toEqual(["order", "order", "order"]);
    expect(dots()).toHaveLength(0);
    expect(container.querySelector('[data-action="unify-spelling"]')).toBeNull();

    modeler.get<CommandStack>("commandStack").undo();
    expect(labelsOf("aggregate")).toEqual(["Order", "order", "Orders"]);
    expect(dots()).toHaveLength(3);
    expect(modeler.get<CommandStack>("commandStack").canUndo()).toBe(false);
  });

  it("keeps the dots through a re-import that keeps the stickies' ids", async () => {
    const variants = modeler.get<EventStormingSpellingVariants>("eventStormingSpellingVariants");
    const before = variants.markedIds().sort();
    await modeler.importDSL(BOARD);
    expect(dots()).toHaveLength(3);
    expect(variants.markedIds().sort()).toEqual(before);
    expect(
      dots()
        .map((dot) => dot.dataset["elementId"])
        .sort(),
    ).toEqual(before);
  });

  it("hides the dots while the board is read-only", () => {
    const lock = modeler.get<EventStormingReadOnly>("eventStormingReadOnly");
    lock.setReadOnly(true);
    expect(dots()).toHaveLength(0);
    lock.setReadOnly(false);
    expect(dots()).toHaveLength(3);
    expect(
      modeler.get<EventStormingSpellingVariants>("eventStormingSpellingVariants").markedIds(),
    ).toHaveLength(3);
  });

  it("lists the label suggestions under the editor, on the canvas layer, and closes them on a pan", async () => {
    const editing = modeler.get<EventStormingLabelEditing>("eventStormingLabelEditing");
    editing.activate(byLabel("Payment Received"));
    const field = container.querySelector<HTMLTextAreaElement>("textarea")!;
    field.value = "Order";
    field.dispatchEvent(new Event("input", { bubbles: true }));

    const list = container.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(
      [...list.querySelectorAll('[role="option"]')].map((option) => option.textContent),
    ).toEqual(["Order Placed", "Order Shipped"]);
    expect(getComputedStyle(list).zIndex).toBe("100");
    expect(list.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      field.getBoundingClientRect().bottom,
    );
    expect(document.activeElement).toBe(field);

    modeler.get<Canvas>("canvas").scroll({ dx: 40, dy: 0 });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(editing.openEdit()).toEqual({
      elementId: byLabel("Payment Received").id,
      value: "Order",
    });
  });

  it("offers no other kind's placeholder that a retyped sticky still carries, until it is renamed", async () => {
    await modeler.importDSL(`title Retyped
event Domain Event [150, 120] (id evt_new)
aggregate Domain Model [420, 120] (id agg_model)
aggregate Order [720, 120] (id agg_order)`);
    const modeling = modeler.get<EventStormingModeling>("eventStormingModeling");
    const retyped = registry().get("evt_new") as EventStormingShape;
    modeling.setStickyKind(retyped, "aggregate");
    expect([retyped.eventStormingType, retyped.eventStormingLabel]).toEqual([
      "aggregate",
      "Domain Event",
    ]);
    const editing = modeler.get<EventStormingLabelEditing>("eventStormingLabelEditing");
    const suggestedFor = (typed: string): string[] => {
      editing.activate(registry().get("agg_order") as EventStormingShape);
      const field = container.querySelector<HTMLTextAreaElement>("textarea")!;
      field.value = typed;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      const options = [...container.querySelectorAll('[role="listbox"] [role="option"]')].map(
        (option) => option.textContent ?? "",
      );
      editing.cancel();
      return options;
    };

    expect(suggestedFor("Dom")).toEqual(["Domain Model"]);

    modeling.updateLabel(retyped, "Domain Expert");
    expect(suggestedFor("Dom")).toEqual(["Domain Expert", "Domain Model"]);
  });

  it("Tab takes a suggestion and keeps the focus in the editor", () => {
    const editing = modeler.get<EventStormingLabelEditing>("eventStormingLabelEditing");
    editing.activate(byLabel("Payment Received"));
    const field = container.querySelector<HTMLTextAreaElement>("textarea")!;
    field.value = "Order S";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    field.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("Order Shipped");
    field.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(labelsOf("event")).toEqual(["Order Placed", "Order Shipped", "Order Shipped"]);
  });
});

const CROWDED_BOARD = [
  "title Crowded",
  ..."ABCDEFGH".split("").map((letter, index) => `aggregate Order ${letter} [${index * 220}, 0]`),
  "aggregate Invoice [770, 300]",
  "aggregate Customer [770, 600]",
].join("\n");

/** What the modeler shell's chrome covers on a wide window (guide §5.9). */
const CHROME_INSETS = { top: 88, right: 24, bottom: 64, left: 24 };

describe("the label suggestions on a low canvas (real browser DOM)", () => {
  let container: HTMLElement;
  let modeler: Modeler;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    modeler = new Modeler({
      container,
      width: "1280px",
      height: "420px",
      freeArea: { insets: () => CHROME_INSETS },
    });
    await modeler.importDSL(CROWDED_BOARD);
  });

  afterEach(() => {
    modeler.destroy();
    container.remove();
  });

  function openSuggestions(): { field: HTMLTextAreaElement; list: HTMLElement } {
    const invoice = modeler
      .get<ElementRegistry>("elementRegistry")
      .find(
        (element) => isEventStormingShape(element) && element.eventStormingLabel === "Invoice",
      ) as EventStormingShape;
    modeler.get<EventStormingLabelEditing>("eventStormingLabelEditing").activate(invoice);
    const field = container.querySelector<HTMLTextAreaElement>("textarea")!;
    field.value = "Ord";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return { field, list: container.querySelector<HTMLElement>('[role="listbox"]')! };
  }

  it("keeps the whole list in the free area, 8px beside the field and never over it", () => {
    const { field, list } = openSuggestions();
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(8);
    const canvasBox = modeler.get<Canvas>("canvas").getContainer().getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    const fieldBox = field.getBoundingClientRect();
    expect(listBox.top).toBeGreaterThanOrEqual(canvasBox.top + CHROME_INSETS.top);
    expect(listBox.bottom).toBeLessThanOrEqual(canvasBox.bottom - CHROME_INSETS.bottom);
    const overlaps = listBox.top < fieldBox.bottom && listBox.bottom > fieldBox.top;
    expect(overlaps).toBe(false);
    const gap =
      listBox.top >= fieldBox.bottom
        ? listBox.top - fieldBox.bottom
        : fieldBox.top - listBox.bottom;
    expect(gap).toBeCloseTo(8, 0);
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    expect(getComputedStyle(list).overflowY).toBe("auto");
  });

  it("scrolls the list, never the canvas, to show the active option", () => {
    const { field, list } = openSuggestions();
    const djsContainer = modeler.get<Canvas>("canvas").getContainer();
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
    );
    const active = list.querySelector<HTMLElement>('[aria-selected="true"]')!;
    expect(active.textContent).toBe("Order H");
    expect(djsContainer.scrollTop).toBe(0);
    expect(djsContainer.scrollLeft).toBe(0);
    expect(list.scrollTop).toBeGreaterThan(0);
    const listBox = list.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    expect(activeBox.top).toBeGreaterThanOrEqual(listBox.top);
    expect(activeBox.bottom).toBeLessThanOrEqual(listBox.bottom);
  });
});
