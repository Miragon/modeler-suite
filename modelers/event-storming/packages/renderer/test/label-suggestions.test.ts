// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import { PLACEHOLDER_LABELS } from "@miragon/event-storming-schema-model";
import { STICKY_STYLES } from "../src/draw/styles.js";
import EventStormingLabelEditing from "../src/label-editing/EventStormingLabelEditing.js";
import type EventStormingModeling from "../src/modeling/EventStormingModeling.js";
import { STICKY_KINDS, type EventStormingShape } from "../src/model/di-types.js";
import { LabelSuggestionList } from "../src/vocabulary/LabelSuggestionList.js";
import { boardStickies } from "../src/vocabulary/board-stickies.js";

function press(field: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  field.dispatchEvent(event);
  return event;
}

function type(field: HTMLTextAreaElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function shape(
  id: string,
  eventStormingType: EventStormingShape["eventStormingType"],
  eventStormingLabel: string,
  extra: Partial<EventStormingShape> = {},
): EventStormingShape {
  return {
    id,
    eventStormingType,
    eventStormingLabel,
    x: 0,
    y: 0,
    width: 130,
    height: 90,
    ...extra,
  } as EventStormingShape;
}

describe("LabelSuggestionList", () => {
  let container: HTMLElement;
  let field: HTMLTextAreaElement;
  let accepted: number;
  let list: LabelSuggestionList;
  const names = ["Order Placed", "Order Shipped", "Order Cancelled"];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    field = document.createElement("textarea");
    container.appendChild(field);
    field.focus();
    accepted = 0;
    list = new LabelSuggestionList(
      field,
      container,
      (typed) => (typed.startsWith("Ord") ? names : []),
      () => (accepted += 1),
    );
  });

  afterEach(() => {
    list.destroy();
    container.remove();
  });

  const listbox = () => container.querySelector<HTMLElement>('[role="listbox"]');
  const options = () => [...container.querySelectorAll<HTMLElement>('[role="option"]')];
  const key = (name: string): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { key: name, cancelable: true });
    list.handleKey(event);
    return event;
  };

  it("marks the field as a text box with a list of suggestions", () => {
    expect(field.getAttribute("aria-autocomplete")).toBe("list");
    expect(field.getAttribute("aria-haspopup")).toBe("listbox");
    expect(listbox()).toBeNull();
  });

  it("opens on typing with the suggestions as options, none of them active", () => {
    type(field, "Ord");
    expect(listbox()?.getAttribute("aria-label")).toBe("Label suggestions");
    expect(field.getAttribute("aria-controls")).toBe(listbox()!.id);
    expect(options().map((option) => option.textContent)).toEqual(names);
    expect(options().map((option) => option.getAttribute("aria-selected"))).toEqual([
      "false",
      "false",
      "false",
    ]);
    expect(field.hasAttribute("aria-activedescendant")).toBe(false);
    expect(list.shownOptions()).toEqual(names);
  });

  it("closes once nothing fits the text", () => {
    type(field, "Ord");
    type(field, "Pay");
    expect(listbox()).toBeNull();
    expect(field.hasAttribute("aria-controls")).toBe(false);
  });

  it("moves the active option with ↑ and ↓ in a circle and names it on the field", () => {
    type(field, "Ord");
    const selected = () =>
      options().findIndex((option) => option.getAttribute("aria-selected") === "true");
    expect(key("ArrowDown").defaultPrevented).toBe(true);
    expect(selected()).toBe(0);
    expect(field.getAttribute("aria-activedescendant")).toBe(options()[0]!.id);
    key("ArrowDown");
    key("ArrowDown");
    key("ArrowDown");
    expect(selected()).toBe(0);
    key("ArrowUp");
    expect(selected()).toBe(2);
    expect(field.getAttribute("aria-activedescendant")).toBe(options()[2]!.id);
  });

  it("starts ↑ at the last option", () => {
    type(field, "Ord");
    list.handleKey(new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true }));
    expect(options()[2]!.getAttribute("aria-selected")).toBe("true");
  });

  it("takes the active option with Enter, and leaves Enter to the field while none is active", () => {
    type(field, "Ord");
    const lineBreak = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    expect(list.handleKey(lineBreak)).toBe(false);
    expect(lineBreak.defaultPrevented).toBe(false);
    key("ArrowDown");
    key("ArrowDown");
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    expect(list.handleKey(enter)).toBe(true);
    expect(enter.defaultPrevented).toBe(true);
    expect(field.value).toBe("Order Shipped");
    expect(field.selectionStart).toBe("Order Shipped".length);
    expect(listbox()).toBeNull();
    expect(accepted).toBe(1);
  });

  it("takes the first option with Tab while none is active, and keeps the focus in the field", () => {
    type(field, "Ord");
    const tab = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    expect(list.handleKey(tab)).toBe(true);
    expect(tab.defaultPrevented).toBe(true);
    expect(field.value).toBe("Order Placed");
    expect(document.activeElement).toBe(field);
  });

  it("leaves Shift+Tab and modified arrows to the field", () => {
    type(field, "Ord");
    for (const init of [
      { key: "Tab", shiftKey: true },
      { key: "ArrowDown", altKey: true },
      { key: "Enter", metaKey: true },
      { key: "Enter", ctrlKey: true },
    ]) {
      const event = new KeyboardEvent("keydown", { ...init, cancelable: true });
      expect(list.handleKey(event), JSON.stringify(init)).toBe(false);
    }
    expect(list.isOpen()).toBe(true);
  });

  it("closes on Escape, leaving the field and its text", () => {
    type(field, "Ord");
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    expect(list.handleKey(escape)).toBe(true);
    expect(escape.defaultPrevented).toBe(true);
    expect(listbox()).toBeNull();
    expect(field.value).toBe("Ord");
    expect(list.handleKey(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(false);
  });

  it("ignores the keys of an input method composition", () => {
    type(field, "Ord");
    const composing = new KeyboardEvent("keydown", { key: "ArrowDown", isComposing: true });
    expect(list.handleKey(composing)).toBe(false);
  });

  it("takes an option on a click, and a press on the list keeps the focus in the field", () => {
    type(field, "Ord");
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    options()[1]!.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    options()[1]!.click();
    expect(field.value).toBe("Order Shipped");
    expect(listbox()).toBeNull();
  });

  it("closes on a press outside the list and the field, as chrome that keeps the focus gives", () => {
    const pressOn = (target: Element) =>
      target.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    type(field, "Ord");
    pressOn(field);
    pressOn(options()[0]!);
    expect(list.isOpen()).toBe(true);
    pressOn(document.body);
    expect(list.isOpen()).toBe(false);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("Ord");
  });

  it("leaves the field as it found it once destroyed", () => {
    type(field, "Ord");
    list.destroy();
    expect(listbox()).toBeNull();
    expect(field.hasAttribute("aria-autocomplete")).toBe(false);
    type(field, "Ord");
    expect(listbox()).toBeNull();
  });
});

describe("boardStickies", () => {
  it("reads the stickies of the vocabulary kinds, without placeholders, blanks or the one edited", () => {
    const shapes = [
      shape("event_a", "event", "Order Placed"),
      shape("event_b", "event", "Domain Event"),
      shape("event_c", "event", "Domain Event 2"),
      shape("event_d", "event", "Domain Event Two"),
      shape("event_e", "event", "", { provisional: true }),
      shape("hotspot_a", "hotspot", "Why?"),
      shape("note_a", "note", "Ask legal"),
      shape("cmd_a", "command", "Place Order"),
    ];
    const registry = { getAll: () => [...shapes, { id: "arrow_1", waypoints: [] }] };
    expect(boardStickies(registry as unknown as ElementRegistry, "cmd_a")).toEqual([
      { id: "event_a", elementType: "event", label: "Order Placed" },
      { id: "event_d", elementType: "event", label: "Domain Event Two" },
    ]);
  });

  it("leaves out the placeholder the palette and the keys give a new sticky of each kind", () => {
    for (const kind of STICKY_KINDS) {
      expect(STICKY_STYLES[kind].label).toBe(PLACEHOLDER_LABELS[kind]);
      const shapes = [
        shape(`${kind}_new`, kind, STICKY_STYLES[kind].label),
        shape(`${kind}_next`, kind, `${STICKY_STYLES[kind].label} 12`),
      ];
      const registry = { getAll: () => shapes };
      expect(boardStickies(registry as unknown as ElementRegistry)).toEqual([]);
    }
  });
});

/** The label editor with a registry, so the suggestions read the board. */
function editingHarness(shapes: EventStormingShape[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const handlers = new Map<string, Array<() => void>>();
  const eventBus = {
    on: (events: string | string[], callback: () => void) => {
      for (const name of [events].flat())
        handlers.set(name, [...(handlers.get(name) ?? []), callback]);
    },
  } as unknown as EventBus;
  const canvas = {
    getContainer: () => container,
    zoom: () => 1,
    viewbox: () => ({ x: 0, y: 0 }),
  } as unknown as Canvas;
  const labels: unknown[][] = [];
  const modeling = {
    updateLabel: (...args: unknown[]) => labels.push(args),
  } as unknown as EventStormingModeling;
  const registry = {
    getAll: () => shapes,
    get: (id: string) => shapes.find((candidate) => candidate.id === id),
  } as unknown as ElementRegistry;
  const editing = new EventStormingLabelEditing(eventBus, canvas, modeling, registry);
  const fire = (name: string) => handlers.get(name)?.forEach((handler) => handler());
  return { container, editing, labels, fire };
}

describe("EventStormingLabelEditing: suggestions from the board", () => {
  const shapes = [
    shape("event_placed", "event", "Order Placed"),
    shape("event_shipped", "event", "Order Shipped"),
    shape("event_edited", "event", "Order Paid"),
    shape("cmd_place", "command", "Place Order"),
    shape("hotspot_a", "hotspot", "Order unclear"),
    shape("hotspot_b", "hotspot", "Order lost?"),
  ];
  let harness: ReturnType<typeof editingHarness>;

  beforeEach(() => {
    harness = editingHarness(shapes);
  });

  afterEach(() => {
    harness.editing.cancel();
    harness.container.remove();
  });

  const field = () => harness.container.querySelector("textarea")!;
  const shown = () =>
    [...harness.container.querySelectorAll('[role="option"]')].map((option) => option.textContent);

  it("suggests the names of the same kind, not the edited sticky's own", () => {
    harness.editing.activate(shapes[2]!);
    type(field(), "Ord");
    expect(shown()).toEqual(["Order Placed", "Order Shipped"]);
  });

  it("suggests nothing for a hotspot, which is free text", () => {
    harness.editing.activate(shapes[4]!);
    type(field(), "Ord");
    expect(shown()).toEqual([]);
  });

  it("Escape closes the list first and keeps the editor open, a second one discards", () => {
    harness.editing.activate(shapes[2]!);
    type(field(), "Order Pl");
    press(field(), "Escape");
    expect(shown()).toEqual([]);
    expect(harness.editing.openEdit()).toEqual({ elementId: "event_edited", value: "Order Pl" });
    press(field(), "Escape");
    expect(harness.editing.openEdit()).toBeUndefined();
    expect(harness.labels).toEqual([]);
  });

  it("Tab takes a suggestion without leaving the editor; Cmd/Ctrl+Enter then saves it", () => {
    harness.editing.activate(shapes[2]!);
    type(field(), "Order S");
    expect(press(field(), "Tab").defaultPrevented).toBe(true);
    expect(harness.editing.openEdit()).toEqual({
      elementId: "event_edited",
      value: "Order Shipped",
    });
    press(field(), "Enter", { ctrlKey: true });
    expect(harness.labels).toEqual([[shapes[2], "Order Shipped"]]);
  });

  it("plain Enter still breaks the line while no option is active", () => {
    harness.editing.activate(shapes[2]!);
    type(field(), "Ord");
    expect(press(field(), "Enter").defaultPrevented).toBe(false);
    expect(harness.editing.openEdit()).toBeDefined();
  });

  it("a pan or zoom closes the list and leaves the editor open (guide §5.13)", () => {
    harness.editing.activate(shapes[2]!);
    type(field(), "Ord");
    harness.fire("canvas.viewbox.changing");
    expect(shown()).toEqual([]);
    expect(harness.editing.openEdit()).toEqual({ elementId: "event_edited", value: "Ord" });
  });

  it("the list goes with the editor", () => {
    harness.editing.activate(shapes[2]!);
    type(field(), "Ord");
    field().dispatchEvent(new Event("blur"));
    expect(harness.container.querySelector('[role="listbox"]')).toBeNull();
  });
});
