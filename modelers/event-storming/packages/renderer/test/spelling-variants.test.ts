// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Overlays from "diagram-js/lib/features/overlays/Overlays";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import { collectVocabulary } from "@miragon/event-storming-schema-model";
import EventStormingContextPadProvider from "../src/context-pad/EventStormingContextPadProvider.js";
import EventStormingModeling from "../src/modeling/EventStormingModeling.js";
import UpdateLabelsHandler, {
  type UpdateLabelsContext,
} from "../src/modeling/cmd/UpdateLabelsHandler.js";
import type { EventStormingShape } from "../src/model/di-types.js";
import { READ_ONLY_CHANGED_EVENT } from "../src/read-only/index.js";
import EventStormingSpellingVariants, {
  SPELLING_VARIANT_OVERLAY,
  spellingVariantText,
} from "../src/vocabulary/EventStormingSpellingVariants.js";

function shape(
  id: string,
  eventStormingType: EventStormingShape["eventStormingType"],
  eventStormingLabel: string,
): EventStormingShape {
  return {
    id,
    eventStormingType,
    eventStormingLabel,
    x: 0,
    y: 0,
    width: 180,
    height: 110,
  } as EventStormingShape;
}

interface AddedOverlay {
  id: string;
  element: EventStormingShape;
  type: string;
  attrs: { position: unknown; scale: unknown; html: HTMLElement };
}

function variantsHarness(shapes: EventStormingShape[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const handlers = new Map<string, Array<(event?: unknown) => void>>();
  const eventBus = {
    on: (events: string | string[], callback: (event?: unknown) => void) => {
      for (const name of [events].flat())
        handlers.set(name, [...(handlers.get(name) ?? []), callback]);
    },
  } as unknown as EventBus;
  const fire = (name: string, event?: unknown) =>
    handlers.get(name)?.forEach((handler) => handler(event));
  const canvas = { getContainer: () => container, focus: vi.fn() } as unknown as Canvas;
  const registry = {
    getAll: () => shapes,
    get: (id: string) => shapes.find((candidate) => candidate.id === id),
  } as unknown as ElementRegistry;
  let overlayCount = 0;
  const overlays: AddedOverlay[] = [];
  const overlayService = {
    add: (element: EventStormingShape, type: string, attrs: AddedOverlay["attrs"]) => {
      overlayCount += 1;
      const id = `ov_${overlayCount}`;
      overlays.push({ id, element, type, attrs });
      container.appendChild(attrs.html);
      return id;
    },
    remove: (id: string) => {
      const index = overlays.findIndex((overlay) => overlay.id === id);
      if (index >= 0) overlays.splice(index, 1)[0]!.attrs.html.remove();
    },
  } as unknown as Overlays;
  const selection = { select: vi.fn() } as unknown as Selection;
  const updateLabels = vi.fn();
  const modeling = { updateLabels } as unknown as EventStormingModeling;
  let readOnly = false;
  const variants = new EventStormingSpellingVariants(
    eventBus,
    canvas,
    registry,
    overlayService,
    selection,
    modeling,
    { isReadOnly: () => readOnly },
  );
  const setReadOnly = (value: boolean) => {
    readOnly = value;
    fire(READ_ONLY_CHANGED_EVENT);
  };
  /** What diagram-js does on removing a shape: its overlays go, then `shape.remove` fires. */
  const removeShape = (element: EventStormingShape) => {
    for (const overlay of overlays.filter((candidate) => candidate.element === element)) {
      overlayService.remove(overlay.id);
    }
    fire("shape.remove", { element });
  };
  const dotOf = (id: string) => overlays.find((overlay) => overlay.element.id === id)!.attrs.html;
  return {
    container,
    variants,
    overlays,
    fire,
    updateLabels,
    selection,
    setReadOnly,
    removeShape,
    dotOf,
  };
}

describe("EventStormingSpellingVariants", () => {
  const shapes = [
    shape("agg_1", "aggregate", "Order"),
    shape("agg_2", "aggregate", "order"),
    shape("agg_3", "aggregate", "Orders"),
    shape("agg_4", "aggregate", "Order"),
    shape("agg_5", "aggregate", "Customer"),
    shape("read_1", "readmodel", "order"),
    shape("hot_1", "hotspot", "Order?"),
    shape("hot_2", "hotspot", "order?"),
  ];
  let harness: ReturnType<typeof variantsHarness>;

  beforeEach(() => {
    vi.useFakeTimers();
    harness = variantsHarness(shapes);
  });

  afterEach(() => {
    vi.useRealTimers();
    harness.container.remove();
  });

  it("marks every sticky of a term the board writes in more than one way, per kind", () => {
    harness.fire("import.done");
    expect(harness.variants.markedIds().sort()).toEqual(["agg_1", "agg_2", "agg_3", "agg_4"]);
    expect(harness.overlays.map((overlay) => overlay.type)).toEqual(
      Array(4).fill(SPELLING_VARIANT_OVERLAY),
    );
    const [first] = harness.overlays;
    expect(first!.attrs.position).toEqual({ top: 0, right: 0 });
    expect(first!.attrs.scale).toBe(false);
    expect(first!.attrs.html.className).toBe("event-storming-spelling-variant");
    expect(first!.attrs.html.getAttribute("role")).toBe("img");
    expect(first!.attrs.html.getAttribute("aria-label")).toBe("Spelling variant");
  });

  it("follows the board: a rename that unifies takes the dots away, the undo brings them back", () => {
    harness.fire("import.done");
    const before = harness.overlays.map((overlay) => overlay.id);
    harness.fire("elements.changed");
    expect(harness.overlays.map((overlay) => overlay.id)).toEqual(before);
    shapes[1]!.eventStormingLabel = "Order";
    shapes[2]!.eventStormingLabel = "Order";
    harness.fire("elements.changed");
    expect(harness.variants.markedIds()).toEqual([]);
    expect(harness.overlays).toEqual([]);
    shapes[1]!.eventStormingLabel = "order";
    shapes[2]!.eventStormingLabel = "Orders";
    harness.fire("elements.changed");
    expect(harness.variants.markedIds()).toHaveLength(4);
  });

  it("hides the dots under the read-only lock", () => {
    harness.fire("import.done");
    harness.setReadOnly(true);
    expect(harness.overlays).toEqual([]);
    harness.setReadOnly(false);
    expect(harness.overlays).toHaveLength(4);
  });

  it("forgets its dots when the diagram clears them", () => {
    harness.fire("import.done");
    harness.fire("diagram.clear");
    expect(harness.variants.markedIds()).toEqual([]);
  });

  it("draws the dots again after a re-import that removed the shapes and kept their ids", () => {
    harness.fire("import.done");
    for (const sticky of shapes) harness.removeShape(sticky);
    expect(harness.overlays).toEqual([]);
    expect(harness.variants.markedIds()).toEqual([]);
    harness.fire("import.done");
    expect(harness.variants.markedIds().sort()).toEqual(["agg_1", "agg_2", "agg_3", "agg_4"]);
    expect(harness.overlays).toHaveLength(4);
  });

  it("hides the tooltip on Escape and leaves the key to the canvas", () => {
    harness.fire("import.done");
    harness.dotOf("agg_1").dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(300);
    expect(harness.container.querySelector('[role="tooltip"]')).not.toBeNull();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.body.dispatchEvent(escape);
    expect(harness.container.querySelector('[role="tooltip"]')).toBeNull();
    expect(escape.defaultPrevented).toBe(false);
    expect(harness.dotOf("agg_1").hasAttribute("aria-describedby")).toBe(false);
  });

  it("drops a waiting tooltip when Escape comes before the delay", () => {
    harness.fire("import.done");
    harness.dotOf("agg_1").dispatchEvent(new Event("pointerenter"));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(harness.container.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("drops a waiting tooltip whose dot a change takes away", () => {
    harness.fire("import.done");
    harness.dotOf("agg_1").dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(100);
    const renamed = shapes.slice(0, 4).map((sticky) => sticky.eventStormingLabel);
    for (const sticky of shapes.slice(0, 4)) sticky.eventStormingLabel = "Order";
    try {
      harness.fire("elements.changed");
      vi.advanceTimersByTime(300);
      expect(harness.variants.markedIds()).toEqual([]);
      expect(harness.container.querySelector('[role="tooltip"]')).toBeNull();
    } finally {
      shapes.slice(0, 4).forEach((sticky, index) => (sticky.eventStormingLabel = renamed[index]!));
    }
  });

  it("takes a shown tooltip down when its dot's text changes", () => {
    harness.fire("import.done");
    harness.dotOf("agg_1").dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(300);
    expect(harness.container.querySelector('[role="tooltip"]')?.textContent).toContain("“Orders”");
    shapes[2]!.eventStormingLabel = "Order";
    try {
      harness.fire("elements.changed");
      expect(harness.container.querySelector('[role="tooltip"]')).toBeNull();
      expect(harness.variants.markedIds().sort()).toEqual(["agg_1", "agg_2", "agg_3", "agg_4"]);
    } finally {
      shapes[2]!.eventStormingLabel = "Orders";
    }
  });

  it("shows the tooltip after hovering the dot, under the dot, and hides it on leaving", () => {
    harness.fire("import.done");
    const dot = harness.overlays.find((overlay) => overlay.element.id === "agg_1")!.attrs.html;
    dot.dispatchEvent(new Event("pointerenter"));
    expect(harness.container.querySelector('[role="tooltip"]')).toBeNull();
    vi.advanceTimersByTime(300);
    const tooltip = harness.container.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(tooltip.className).toBe("event-storming-spelling-tooltip");
    expect(tooltip.textContent).toBe(
      "Also spelled “order” and “Orders” on this board. Unify spelling from the context pad.",
    );
    expect(dot.getAttribute("aria-describedby")).toBe(tooltip.id);
    dot.dispatchEvent(new Event("pointerleave"));
    expect(harness.container.querySelector('[role="tooltip"]')).toBeNull();
    expect(dot.hasAttribute("aria-describedby")).toBe(false);
  });

  it("hides the tooltip on pan and zoom", () => {
    harness.fire("import.done");
    harness.overlays[0]!.attrs.html.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(300);
    harness.fire("canvas.viewbox.changing");
    expect(harness.container.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("selects the sticky on a click on its dot, so its context pad offers to unify", () => {
    harness.fire("import.done");
    harness.overlays.find((overlay) => overlay.element.id === "agg_2")!.attrs.html.click();
    expect(harness.selection.select).toHaveBeenCalledWith(shapes[1]);
  });

  it("unifies on the sticky's own spelling, in one call", () => {
    harness.fire("import.done");
    expect(harness.variants.unify(shapes[2]!)).toBe(true);
    expect(harness.updateLabels).toHaveBeenCalledTimes(1);
    expect(harness.updateLabels).toHaveBeenCalledWith([
      { element: shapes[0], label: "Orders" },
      { element: shapes[3], label: "Orders" },
      { element: shapes[1], label: "Orders" },
      { element: shapes[2], label: "Orders" },
    ]);
    expect(harness.variants.unify(shapes[4]!)).toBe(false);
    expect(harness.variants.unify(shapes[5]!)).toBe(false);
  });

  it("leaves another kind's default name out of the dots and a unify, where a board means it as a name", () => {
    const policies = [
      shape("policy", "aggregate", "Policy"),
      shape("policies", "aggregate", "Policies"),
      shape("policies_lower", "aggregate", "policies"),
      shape("insurance", "aggregate", "Insurance Policy"),
      shape("insurances", "aggregate", "Insurance Policies"),
    ];
    const board = variantsHarness(policies);
    board.fire("import.done");
    expect(board.variants.markedIds().sort()).toEqual([
      "insurance",
      "insurances",
      "policies",
      "policies_lower",
    ]);
    expect(board.variants.unify(policies[0]!)).toBe(false);
    expect(board.variants.unify(policies[1]!)).toBe(true);
    expect(board.updateLabels).toHaveBeenCalledWith([
      { element: policies[1], label: "Policies" },
      { element: policies[2], label: "Policies" },
    ]);
    board.container.remove();
  });

  it("names a line break in a spelling, which would read like a space", () => {
    const term = collectVocabulary([
      { id: "a", elementType: "event", label: "Order Placed" },
      { id: "b", elementType: "event", label: "Order\nPlaced" },
    ])[0]!;
    expect(spellingVariantText(shape("a", "event", "Order Placed"), term)).toBe(
      "Also spelled “Order↵Placed” on this board. Unify spelling from the context pad.",
    );
  });
});

describe("UpdateLabelsHandler", () => {
  it("renames every sticky, and the revert gives each its old label back", () => {
    const first = shape("agg_1", "aggregate", "order");
    const second = shape("agg_2", "aggregate", "Orders");
    const context: UpdateLabelsContext = {
      changes: [
        { element: first, label: "Order" },
        { element: second, label: "Order" },
      ],
    };
    const handler = new UpdateLabelsHandler();
    expect(handler.execute(context)).toEqual([first, second]);
    expect([first.eventStormingLabel, second.eventStormingLabel]).toEqual(["Order", "Order"]);
    expect(handler.revert(context)).toEqual([first, second]);
    expect([first.eventStormingLabel, second.eventStormingLabel]).toEqual(["order", "Orders"]);
  });
});

describe("EventStormingModeling.updateLabels", () => {
  function modelingWith(execute: ReturnType<typeof vi.fn>) {
    const commandStack = { registerHandler: vi.fn(), execute } as unknown as CommandStack;
    return new EventStormingModeling(commandStack, {} as Canvas, {} as ElementRegistry);
  }

  it("runs ONE command for every rename, the stickies that keep their label included", () => {
    const execute = vi.fn();
    const same = shape("agg_1", "aggregate", "Order");
    const other = shape("agg_2", "aggregate", "order");
    const changes = [
      { element: same, label: "Order" },
      { element: other, label: "Order" },
    ];
    modelingWith(execute).updateLabels(changes);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("elements.updateLabels", { changes });
  });

  it("runs nothing when nothing changes, and refuses notes, which resize to their text", () => {
    const execute = vi.fn();
    const modeling = modelingWith(execute);
    modeling.updateLabels([{ element: shape("agg_1", "aggregate", "Order"), label: "Order" }]);
    expect(execute).not.toHaveBeenCalled();
    expect(() =>
      modeling.updateLabels([{ element: shape("note_1", "note", "a"), label: "b" }]),
    ).toThrow(/fixed-size stickies/);
  });
});

describe("EventStormingContextPadProvider: Unify spelling", () => {
  function padWith(variantOf: (shape: EventStormingShape) => unknown, unify = vi.fn()) {
    const provider = new EventStormingContextPadProvider(
      { registerProvider: vi.fn() } as never,
      { removeElements: vi.fn() } as never,
      { start: vi.fn() } as never,
      { start: vi.fn() } as never,
      { open: vi.fn() } as never,
      { setStrokeStyle: vi.fn(), getLevel: () => "design" } as never,
      { activate: vi.fn(), activateConnection: vi.fn() } as never,
      { createProvisional: vi.fn() } as never,
      { open: vi.fn() } as never,
      undefined,
      undefined,
      { focus: vi.fn(), getContainer: () => document.createElement("div") } as never,
      { variantOf, unify } as never,
    );
    return { provider, unify };
  }

  it("offers the entry on a sticky the board also writes another way, with its spelling", () => {
    const sticky = shape("agg_1", "aggregate", 'Order "A" <b>');
    const { provider, unify } = padWith(() => ({ label: "Order" }));
    const entry = provider.getContextPadEntries(sticky as unknown as Element)["unify-spelling"]!;
    expect(entry.title).toBe('Unify spelling to “Order "A" <b>”');
    expect(entry.html).toContain('title="Unify spelling to “Order &quot;A&quot; &lt;b&gt;”"');
    expect(entry.html).not.toContain("<b>");
    (entry.action as { click: (event: Event) => void }).click(new Event("click"));
    expect(unify).toHaveBeenCalledWith(sticky);
  });

  it("offers no entry where the board writes the name one way only", () => {
    const { provider } = padWith(() => undefined);
    const entries = provider.getContextPadEntries(shape("agg_1", "aggregate", "Order") as never);
    expect(entries["unify-spelling"]).toBeUndefined();
  });
});
