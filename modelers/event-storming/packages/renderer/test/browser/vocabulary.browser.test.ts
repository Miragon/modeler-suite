import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { parseDSL, serializeDSL } from "@miragon/event-storming-dsl";
import { Modeler } from "../../src/index.js";
import type EventStormingLabelEditing from "../../src/label-editing/EventStormingLabelEditing.js";
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
