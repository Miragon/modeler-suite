import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  PLACEHOLDER_LABELS,
  groupByAggregate,
  normalizeLabel,
  type AggregateGroup,
  type ArrowEnds,
  type ElementType,
  type EventStormingBoard,
  type NamedStickies,
  type PlacedSticky,
} from "../src/index.js";

function sticky(
  id: string,
  elementType: ElementType,
  label: string,
  x: number,
  y = 0,
): PlacedSticky {
  return { id, elementType, label, position: { x, y } };
}

function arrow(from: string, to: string): ArrowEnds {
  return { from, to };
}

function labels(names: readonly NamedStickies[]): string[] {
  return names.map((name) => name.label);
}

function pairsOf(group: AggregateGroup): string[] {
  return group.pairs.map((pair) => `${pair.command.label} -> ${pair.event.label}`);
}

function only(groups: readonly AggregateGroup[]): AggregateGroup {
  expect(groups).toHaveLength(1);
  return groups[0]!;
}

/** Two steps of one checkout, the aggregate repeated at each (repeat, never reuse). */
const CHECKOUT = {
  elements: [
    sticky("place", "command", "Place Order", 100),
    sticky("order_1", "aggregate", "Order", 300),
    sticky("placed", "event", "Order Placed", 500),
    sticky("ship", "command", "Ship Order", 700),
    sticky("order_2", "aggregate", "Order", 900),
    sticky("shipped", "event", "Order Shipped", 1100),
  ],
  edges: [
    arrow("place", "order_1"),
    arrow("order_1", "placed"),
    arrow("ship", "order_2"),
    arrow("order_2", "shipped"),
  ],
};

describe("groupByAggregate", () => {
  it("brings an aggregate the timeline repeats together, with its commands and events", () => {
    const group = only(groupByAggregate(CHECKOUT));

    expect(group.aggregate).toEqual({
      key: "order",
      label: "Order",
      spellings: [{ label: "Order", elementIds: ["order_1", "order_2"] }],
      elementIds: ["order_1", "order_2"],
    });
    expect(labels(group.commands)).toEqual(["Place Order", "Ship Order"]);
    expect(labels(group.events)).toEqual(["Order Placed", "Order Shipped"]);
  });

  it("pairs a command with an event only through one and the same aggregate sticky", () => {
    const group = only(groupByAggregate(CHECKOUT));

    expect(pairsOf(group)).toEqual(["Place Order -> Order Placed", "Ship Order -> Order Shipped"]);
    expect(group.pairs[0]!.command).toBe(group.commands[0]);
    expect(group.pairs[0]!.event).toBe(group.events[0]);
  });

  it("groups spelling variants of an aggregate under the spelling most of them use", () => {
    const group = only(
      groupByAggregate({
        elements: [
          sticky("a", "aggregate", "orders", 100),
          sticky("b", "aggregate", "Order", 300),
          sticky("c", "aggregate", "Order", 500),
          sticky("d", "aggregate", "ORDER ", 700),
        ],
        edges: [],
      }),
    );

    expect(group.aggregate.key).toBe("order");
    expect(group.aggregate.label).toBe("Order");
    expect(group.aggregate.spellings).toEqual([
      { label: "Order", elementIds: ["b", "c"] },
      { label: "orders", elementIds: ["a"] },
      { label: "ORDER ", elementIds: ["d"] },
    ]);
    expect(group.aggregate.elementIds).toEqual(["a", "b", "c", "d"]);
  });

  it("takes the spelling first on the timeline when two are used equally often", () => {
    const group = only(
      groupByAggregate({
        elements: [
          sticky("late", "aggregate", "order", 900),
          sticky("early", "aggregate", "Order", 100),
        ],
        edges: [],
      }),
    );

    expect(group.aggregate.label).toBe("Order");
    expect(group.aggregate.elementIds).toEqual(["early", "late"]);
  });

  it("lists a repeated command or event once, with every sticky of its name", () => {
    const group = only(
      groupByAggregate({
        elements: [
          sticky("place_1", "command", "Place Order", 100),
          sticky("order_1", "aggregate", "Order", 300),
          sticky("placed_1", "event", "Order Placed", 500),
          sticky("place_2", "command", "place order", 700),
          sticky("order_2", "aggregate", "Order", 900),
          sticky("placed_2", "event", "Order Placed", 1100),
        ],
        edges: [
          arrow("place_1", "order_1"),
          arrow("order_1", "placed_1"),
          arrow("place_2", "order_2"),
          arrow("order_2", "placed_2"),
        ],
      }),
    );

    expect(group.commands).toHaveLength(1);
    expect(group.commands[0]!.elementIds).toEqual(["place_1", "place_2"]);
    expect(group.commands[0]!.label).toBe("Place Order");
    expect(group.events).toHaveLength(1);
    expect(group.events[0]!.elementIds).toEqual(["placed_1", "placed_2"]);
    expect(pairsOf(group)).toEqual(["Place Order -> Order Placed"]);
  });

  it("pairs every command into an aggregate sticky with every event out of it", () => {
    const group = only(
      groupByAggregate({
        elements: [
          sticky("place", "command", "Place Order", 100, 0),
          sticky("reorder", "command", "Reorder", 100, 200),
          sticky("order", "aggregate", "Order", 300),
          sticky("placed", "event", "Order Placed", 500, 0),
          sticky("billed", "event", "Invoice Requested", 500, 200),
        ],
        edges: [
          arrow("reorder", "order"),
          arrow("place", "order"),
          arrow("order", "billed"),
          arrow("order", "placed"),
        ],
      }),
    );

    expect(pairsOf(group)).toEqual([
      "Place Order -> Order Placed",
      "Place Order -> Invoice Requested",
      "Reorder -> Order Placed",
      "Reorder -> Invoice Requested",
    ]);
  });

  it("keeps an aggregate without arrows as a group with empty lists", () => {
    expect(
      groupByAggregate({ elements: [sticky("order", "aggregate", "Order", 0)], edges: [] }),
    ).toEqual([
      {
        aggregate: {
          key: "order",
          label: "Order",
          spellings: [{ label: "Order", elementIds: ["order"] }],
          elementIds: ["order"],
        },
        commands: [],
        events: [],
        pairs: [],
      },
    ]);
  });

  it("lists a command without an event and an event without a command, each without a pair", () => {
    const group = only(
      groupByAggregate({
        elements: [
          sticky("cancel", "command", "Cancel Order", 100),
          sticky("order_1", "aggregate", "Order", 300),
          sticky("order_2", "aggregate", "Order", 900),
          sticky("expired", "event", "Order Expired", 1100),
        ],
        edges: [arrow("cancel", "order_1"), arrow("order_2", "expired")],
      }),
    );

    expect(labels(group.commands)).toEqual(["Cancel Order"]);
    expect(labels(group.events)).toEqual(["Order Expired"]);
    expect(group.pairs).toEqual([]);
  });

  it("leaves out commands and events that reach no aggregate, also a command's arrow to an event", () => {
    const group = only(
      groupByAggregate({
        elements: [
          sticky("place", "command", "Place Order", 100),
          sticky("order", "aggregate", "Order", 300),
          sticky("placed", "event", "Order Placed", 500),
          sticky("pay", "command", "Pay", 700),
          sticky("paid", "event", "Paid", 900),
          sticky("lonely", "command", "Lonely Command", 1100),
        ],
        edges: [arrow("place", "order"), arrow("order", "placed"), arrow("pay", "paid")],
      }),
    );

    expect(labels(group.commands)).toEqual(["Place Order"]);
    expect(labels(group.events)).toEqual(["Order Placed"]);
  });

  it("follows the arrows' direction: an aggregate's arrow to a command or an event's arrow to it count for nothing", () => {
    const group = only(
      groupByAggregate({
        elements: [
          sticky("order", "aggregate", "Order", 300),
          sticky("place", "command", "Place Order", 100),
          sticky("placed", "event", "Order Placed", 500),
        ],
        edges: [arrow("order", "place"), arrow("placed", "order")],
      }),
    );

    expect(group.commands).toEqual([]);
    expect(group.events).toEqual([]);
  });

  it("counts commands and events only: policies, read models, actors, externals and other aggregates stay out", () => {
    const group = groupByAggregate({
      elements: [
        sticky("actor", "actor", "Customer", 0),
        sticky("policy", "policy", "Whenever paid, ship", 100),
        sticky("order", "aggregate", "Order", 300),
        sticky("view", "readmodel", "Order Status", 500),
        sticky("provider", "external", "Payment Provider", 600),
        sticky("risk", "hotspot", "Double payment?", 700),
        sticky("stock", "aggregate", "Stock", 900),
      ],
      edges: [
        arrow("actor", "order"),
        arrow("policy", "order"),
        arrow("order", "view"),
        arrow("order", "provider"),
        arrow("order", "risk"),
        arrow("order", "stock"),
      ],
    });

    expect(groupByAggregateLabels(group)).toEqual(["Order", "Stock"]);
    for (const { commands, events, pairs } of group) {
      expect([commands, events, pairs]).toEqual([[], [], []]);
    }
  });

  it("puts a command that reaches two aggregates into both groups", () => {
    const groups = groupByAggregate({
      elements: [
        sticky("place", "command", "Place Order", 100),
        sticky("order", "aggregate", "Order", 300, 0),
        sticky("stock", "aggregate", "Stock", 300, 200),
      ],
      edges: [arrow("place", "order"), arrow("place", "stock")],
    });

    expect(groupByAggregateLabels(groups)).toEqual(["Order", "Stock"]);
    expect(groups.map((group) => labels(group.commands))).toEqual([
      ["Place Order"],
      ["Place Order"],
    ]);
  });

  it("keeps each sticky whose label names nothing apart, with an empty key", () => {
    const groups = groupByAggregate({
      elements: [
        sticky("q_1", "aggregate", "?", 100),
        sticky("q_2", "aggregate", "?", 300),
        sticky("cmd_1", "command", "", 0, 0),
        sticky("cmd_2", "command", "", 0, 200),
      ],
      edges: [arrow("cmd_1", "q_1"), arrow("cmd_2", "q_1")],
    });

    expect(groups.map((group) => group.aggregate.elementIds)).toEqual([["q_1"], ["q_2"]]);
    expect(groups.map((group) => group.aggregate.key)).toEqual(["", ""]);
    expect(groups[0]!.commands.map((command) => command.elementIds)).toEqual([
      ["cmd_1"],
      ["cmd_2"],
    ]);
  });

  it("leaves out placeholder-labelled aggregates and the commands and events only they reach", () => {
    const groups = groupByAggregate({
      elements: [
        sticky("draft", "command", "Draft Order", 0, 0),
        sticky("aggregate_1", "aggregate", "Aggregate", 200, 0),
        sticky("drafted", "event", "Order Drafted", 400, 0),
        sticky("place", "command", "Place Order", 0, 300),
        sticky("aggregate_2", "aggregate", "Aggregate 2", 200, 300),
        sticky("order", "aggregate", "Order", 200, 600),
        sticky("placed", "event", "Order Placed", 400, 300),
        sticky("confirmed", "event", "Order Confirmed", 400, 600),
      ],
      edges: [
        arrow("draft", "aggregate_1"),
        arrow("aggregate_1", "drafted"),
        arrow("place", "aggregate_2"),
        arrow("aggregate_2", "placed"),
        arrow("place", "order"),
        arrow("order", "confirmed"),
      ],
    });

    const group = only(groups);
    expect(group.aggregate.elementIds).toEqual(["order"]);
    expect(labels(group.commands)).toEqual(["Place Order"]);
    expect(labels(group.events)).toEqual(["Order Confirmed"]);
    expect(pairsOf(group)).toEqual(["Place Order -> Order Confirmed"]);
  });

  it("has no group while every aggregate carries a placeholder, and one once it is renamed", () => {
    const placeholders = {
      elements: [
        sticky("place", "command", "Place Order", 0),
        sticky("aggregate_1", "aggregate", "Aggregate", 200),
        sticky("aggregate_2", "aggregate", "Aggregate 2", 400),
        sticky("aggregate_12", "aggregate", "Aggregate 12", 600),
      ],
      edges: [arrow("place", "aggregate_1")],
    };
    expect(groupByAggregate(placeholders)).toEqual([]);

    const renamed = {
      ...placeholders,
      elements: placeholders.elements.map((element) =>
        element.id === "aggregate_1" ? { ...element, label: "Order" } : element,
      ),
    };
    const group = only(groupByAggregate(renamed));
    expect(group.aggregate.elementIds).toEqual(["aggregate_1"]);
    expect(labels(group.commands)).toEqual(["Place Order"]);
  });

  it("reads an empty aggregate as the placeholder a .storm file stores for it, a ? as a name", () => {
    const groups = groupByAggregate({
      elements: [
        sticky("place", "command", "Place Order", 0),
        sticky("empty", "aggregate", "", 200),
        sticky("blank", "aggregate", " \n ", 400),
        sticky("padded", "aggregate", " Aggregate 3 ", 600),
        sticky("unknown", "aggregate", "?", 800),
        sticky("placed", "event", "Order Placed", 1000),
      ],
      edges: [
        arrow("place", "empty"),
        arrow("empty", "placed"),
        arrow("place", "blank"),
        arrow("padded", "placed"),
      ],
    });

    const group = only(groups);
    expect(group.aggregate.elementIds).toEqual(["unknown"]);
    expect(group.commands).toEqual([]);
    expect(group.events).toEqual([]);
  });

  it("leaves out an aggregate retyped from another kind while it carries that kind's placeholder", () => {
    const groups = groupByAggregate({
      elements: [
        sticky("place", "command", "Place Order", 0, 0),
        sticky("retyped_event", "aggregate", "Domain Event", 200, 0),
        sticky("placed", "event", "Order Placed", 400, 0),
        sticky("retyped_command", "aggregate", "Command 2", 200, 300),
        sticky("retyped_hotspot", "aggregate", " Hotspot ", 200, 600),
        sticky("retyped_readmodel", "aggregate", "Read Model 3", 200, 900),
        sticky("store", "aggregate", "Domain Event Store", 200, 1200),
      ],
      edges: [
        arrow("place", "retyped_event"),
        arrow("retyped_event", "placed"),
        arrow("place", "retyped_command"),
      ],
    });

    const group = only(groups);
    expect(group.aggregate.elementIds).toEqual(["store"]);
    expect(group.commands).toEqual([]);
    expect(group.events).toEqual([]);
  });

  it("forms no group from the placeholder of any sticky kind, alone or numbered", () => {
    const elements = Object.values(PLACEHOLDER_LABELS).flatMap((placeholder, index) => [
      sticky(`plain_${index}`, "aggregate", placeholder, index * 200),
      sticky(`numbered_${index}`, "aggregate", `${placeholder} ${index + 2}`, index * 200, 300),
    ]);
    expect(groupByAggregate({ elements, edges: [] })).toEqual([]);

    const renamed = elements.map((element) =>
      element.id === "numbered_0" ? { ...element, label: "Order" } : element,
    );
    expect(only(groupByAggregate({ elements: renamed, edges: [] })).aggregate.elementIds).toEqual([
      "numbered_0",
    ]);
  });

  it("counts a name that only starts like the placeholder, and never merges a placeholder into it", () => {
    const groups = groupByAggregate({
      elements: [
        sticky("placeholder", "aggregate", "Aggregate", 0),
        sticky("plural", "aggregate", "Aggregates", 200),
        sticky("root", "aggregate", "Aggregate Root", 400),
        sticky("worded", "aggregate", "Aggregate Two", 600),
        sticky("lettered", "aggregate", "Aggregate 2b", 800),
      ],
      edges: [],
    });

    expect(groups.map((group) => group.aggregate.elementIds)).toEqual([
      ["plural"],
      ["root"],
      ["worded"],
      ["lettered"],
    ]);
    expect(groups[0]!.aggregate.key).toBe(normalizeLabel("Aggregate"));
  });

  it("counts a doubled arrow once and leaves out arrows to stickies the board does not hold", () => {
    const group = only(
      groupByAggregate({
        elements: [
          sticky("place", "command", "Place Order", 100),
          sticky("order", "aggregate", "Order", 300),
          sticky("placed", "event", "Order Placed", 500),
        ],
        edges: [
          arrow("place", "order"),
          arrow("place", "order"),
          arrow("order", "placed"),
          arrow("order", "placed"),
          arrow("ghost", "order"),
          arrow("order", "ghost"),
        ],
      }),
    );

    expect(group.commands[0]!.elementIds).toEqual(["place"]);
    expect(group.events[0]!.elementIds).toEqual(["placed"]);
    expect(pairsOf(group)).toEqual(["Place Order -> Order Placed"]);
  });

  it("orders groups by their first aggregate on the timeline, left to right, then top to bottom", () => {
    const groups = groupByAggregate({
      elements: [
        sticky("payment", "aggregate", "Payment", 900),
        sticky("stock", "aggregate", "Stock", 100, 300),
        sticky("order", "aggregate", "Order", 100, 0),
        sticky("payment_early", "aggregate", "Payments", 50, 600),
      ],
      edges: [],
    });

    expect(groupByAggregateLabels(groups)).toEqual(["Payments", "Order", "Stock"]);
    expect(groups[0]!.aggregate.elementIds).toEqual(["payment_early", "payment"]);
  });

  it("gives the same groups whatever order the board lists its elements and arrows in", () => {
    const shuffled = {
      elements: [...CHECKOUT.elements].reverse(),
      edges: [...CHECKOUT.edges].reverse(),
    };

    expect(groupByAggregate(shuffled)).toEqual(groupByAggregate(CHECKOUT));
  });

  it("reads a whole board, and a board without aggregates has no group", () => {
    const board: EventStormingBoard = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      config: { title: "Checkout" },
      elements: CHECKOUT.elements.map(
        (element) => ({ ...element }) as EventStormingBoard["elements"][number],
      ),
      edges: CHECKOUT.edges.map((edge, index) => ({
        id: `arrow_${index}`,
        edgeType: "arrow",
        ...edge,
      })),
    };

    expect(groupByAggregateLabels(groupByAggregate(board))).toEqual(["Order"]);
    expect(
      groupByAggregate({ elements: [sticky("e", "event", "Order Placed", 0)], edges: [] }),
    ).toEqual([]);
  });
});

function groupByAggregateLabels(groups: readonly AggregateGroup[]): string[] {
  return groups.map((group) => group.aggregate.label);
}
