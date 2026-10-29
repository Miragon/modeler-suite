import { describe, expect, it } from "vitest";
import {
  groupByAggregate,
  type ArrowEnds,
  type ElementType,
  type PlacedSticky,
} from "@miragon/event-storming-schema-model";
import { aggregateTableRows, type AggregateTableRow } from "../src/aggregates/index.js";

function sticky(
  id: string,
  elementType: ElementType,
  label: string,
  x: number,
  y = 0,
): PlacedSticky {
  return { id, elementType, label, position: { x, y } };
}

function rowsOf(elements: PlacedSticky[], edges: ArrowEnds[] = []): AggregateTableRow[] {
  return aggregateTableRows(groupByAggregate({ elements, edges }));
}

/** A row as the table reads: per line the command, then the events after it. */
function lines(row: AggregateTableRow): Array<[string | undefined, string[]]> {
  return row.lines.map((line) => [line.command?.label, line.events.map((event) => event.label)]);
}

describe("aggregateTableRows", () => {
  it("gives each command a line with the events it leads to through the aggregate", () => {
    const [row, ...rest] = rowsOf(
      [
        sticky("place", "command", "Place Order", 100),
        sticky("order_1", "aggregate", "Order", 300),
        sticky("placed", "event", "Order Placed", 500),
        sticky("billed", "event", "Invoice Requested", 500, 200),
        sticky("ship", "command", "Ship Order", 700),
        sticky("order_2", "aggregate", "Order", 900),
        sticky("shipped", "event", "Order Shipped", 1100),
      ],
      [
        { from: "place", to: "order_1" },
        { from: "order_1", to: "placed" },
        { from: "order_1", to: "billed" },
        { from: "ship", to: "order_2" },
        { from: "order_2", to: "shipped" },
      ],
    );

    expect(rest).toEqual([]);
    expect(row!.aggregate).toEqual({
      kind: "aggregate",
      label: "Order",
      elementIds: ["order_1", "order_2"],
    });
    expect(lines(row!)).toEqual([
      ["Place Order", ["Order Placed", "Invoice Requested"]],
      ["Ship Order", ["Order Shipped"]],
    ]);
    expect(row!.lines[0]!.command).toEqual({
      kind: "command",
      label: "Place Order",
      elementIds: ["place"],
    });
    expect(row!.lines[0]!.events[0]).toEqual({
      kind: "event",
      label: "Order Placed",
      elementIds: ["placed"],
    });
  });

  it("puts the events no command leads to on a last line without a command", () => {
    const [row] = rowsOf(
      [
        sticky("cancel", "command", "Cancel Order", 100),
        sticky("order_1", "aggregate", "Order", 300),
        sticky("order_2", "aggregate", "Order", 900),
        sticky("expired", "event", "Order Expired", 1100),
        sticky("archived", "event", "Order Archived", 1100, 200),
      ],
      [
        { from: "cancel", to: "order_1" },
        { from: "order_2", to: "expired" },
        { from: "order_2", to: "archived" },
      ],
    );

    expect(lines(row!)).toEqual([
      ["Cancel Order", []],
      [undefined, ["Order Expired", "Order Archived"]],
    ]);
  });

  it("gives an aggregate without arrows one empty line", () => {
    const [row] = rowsOf([sticky("order", "aggregate", "Order", 0)]);

    expect(row!.lines).toEqual([{ command: undefined, events: [] }]);
  });

  it("shows a name on one line, and a sticky without a name as unnamed", () => {
    const rows = rowsOf(
      [
        sticky("order", "aggregate", "Order\n  Line", 100),
        sticky("blank", "aggregate", "  ", 300),
        sticky("cmd", "command", "", 0),
        sticky("evt", "event", " ", 200),
      ],
      [
        { from: "cmd", to: "order" },
        { from: "order", to: "evt" },
      ],
    );

    expect(rows.map((row) => row.aggregate.label)).toEqual(["Order Line"]);
    expect(lines(rows[0]!)).toEqual([["Unnamed command", ["Unnamed event"]]]);

    const [unnamed] = aggregateTableRows([
      {
        aggregate: { key: "", label: " ", spellings: [], elementIds: ["blank"] },
        commands: [],
        events: [],
        pairs: [],
      },
    ]);
    expect(unnamed!.aggregate.label).toBe("Unnamed aggregate");
  });

  it("keeps the order of the groups: the board's reading order", () => {
    const rows = rowsOf([
      sticky("stock", "aggregate", "Stock", 900),
      sticky("order", "aggregate", "Order", 100),
    ]);

    expect(rows.map((row) => row.aggregate.label)).toEqual(["Order", "Stock"]);
  });
});
