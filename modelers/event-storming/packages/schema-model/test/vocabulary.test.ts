import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SUGGESTION_LIMIT,
  PLACEHOLDER_LABELS,
  VOCABULARY_STICKY_KINDS,
  collectVocabulary,
  isPlaceholderLabel,
  isVocabularyStickyKind,
  normalizeLabel,
  serializeBoard,
  spellingVariants,
  suggestLabels,
  type BoardElement,
  type ElementType,
  type EventStormingBoard,
  type LabelledSticky,
} from "../src/index.js";

let nextId = 0;
function sticky(elementType: ElementType, label: string, id?: string): LabelledSticky {
  nextId += 1;
  return { id: id ?? `${elementType}_${nextId}`, elementType, label };
}

describe("normalizeLabel", () => {
  it.each([
    ["Order", "order"],
    ["Order", "ORDER"],
    ["Order Placed", "  order   placed "],
    ["Order Placed", "Order\nPlaced"],
    ["Order Placed", "Order-Placed"],
    ["Order Placed", "order_placed!"],
    ["Order Placed", "OrderPlaced"],
    ["Order Placed", "Orders Placed"],
    ["Customer's Order", "Customers Order"],
    ["Policy", "Policies"],
    ["Address", "Addresses"],
    ["Status", "Statuses"],
    ["Box", "Boxes"],
    ["Invoice", "Invoices"],
    ["Purchase", "Purchases"],
    ["Day", "Days"],
    ["Order Cancelled", "Order Canceled"],
    ["Modelling", "Modeling"],
    ["Payment Signalled", "Payment Signaled"],
    ["Travellers", "Traveler"],
    ["Bus Stop", "Busstop"],
    ["Book Keeping", "Bookkeeping"],
    ["Church", "Churches"],
    ["Authorise Payment", "Authorize Payment"],
    ["Organisation", "Organizations"],
    ["Bestellung", "Bestellungen"],
    ["Ereignis", "Ereignisse"],
    ["Position", "Positionen"],
    ["Kundin", "Kundinnen"],
    ["Straße", "Strasse"],
    ["Bestätigung", "Bestaetigung"],
    ["Café", "Café"],
  ])("reads %j and %j as the same name", (first, second) => {
    expect(normalizeLabel(first)).toBe(normalizeLabel(second));
  });

  it.each([
    ["Order Placed", "Order Shipped"],
    ["Order Placed", "Place Order"],
    ["Room 1", "Room 11"],
    ["Domain Event 2", "Domain Event 3"],
    ["Zähler", "Zahler"],
    ["Order", "Ordered"],
    ["Plan", "Plane"],
    ["Car", "Care"],
    ["Rat", "Rate"],
    ["Note Added", "Not Added"],
    ["List", "Liste"],
    ["Akt", "Akte"],
    ["Verwaltungsakt", "Verwaltungsakte"],
    ["Dinner", "Diner"],
    ["Claim Filled", "Claim Filed"],
    ["Call", "Cal"],
  ])("keeps %j and %j apart", (first, second) => {
    expect(normalizeLabel(first)).not.toBe(normalizeLabel(second));
  });

  it("marks no spelling variant for two words that differ by more than spelling", () => {
    const vocabulary = collectVocabulary([
      sticky("aggregate", "Plan"),
      sticky("aggregate", "Plane"),
      sticky("aggregate", "Verwaltungsakt"),
      sticky("aggregate", "Verwaltungsakte"),
    ]);
    expect(spellingVariants(vocabulary)).toEqual([]);
  });

  it("gives an empty key to a label without a word", () => {
    expect(normalizeLabel("")).toBe("");
    expect(normalizeLabel("  -> ; !? ")).toBe("");
  });
});

describe("collectVocabulary", () => {
  it("takes the labels of the vocabulary kinds only, never hotspots, notes or drawings", () => {
    expect(VOCABULARY_STICKY_KINDS).toEqual([
      "event",
      "command",
      "actor",
      "aggregate",
      "policy",
      "readmodel",
      "external",
    ]);
    for (const kind of ["hotspot", "note", "drawing"]) {
      expect(isVocabularyStickyKind(kind)).toBe(false);
    }
    const vocabulary = collectVocabulary([
      sticky("hotspot", "Why?"),
      sticky("note", "Ask legal"),
      sticky("drawing", ""),
      sticky("aggregate", "Order"),
    ]);
    expect(vocabulary.map((term) => [term.kind, term.label])).toEqual([["aggregate", "Order"]]);
  });

  it("keeps the kinds apart: the same name of two kinds is two terms", () => {
    const vocabulary = collectVocabulary([
      sticky("aggregate", "Order"),
      sticky("readmodel", "Order"),
      sticky("aggregate", "order"),
    ]);
    expect(vocabulary.map((term) => [term.kind, term.count])).toEqual([
      ["aggregate", 2],
      ["readmodel", 1],
    ]);
  });

  it("groups the spellings of a term, the most used first, and names the stickies of each", () => {
    const [term] = collectVocabulary([
      sticky("aggregate", "order", "agg_1"),
      sticky("aggregate", "Order", "agg_2"),
      sticky("aggregate", "Orders", "agg_3"),
      sticky("aggregate", "Order", "agg_4"),
    ]);
    expect(term).toEqual({
      kind: "aggregate",
      key: normalizeLabel("Order"),
      label: "Order",
      count: 4,
      spellings: [
        { label: "Order", elementIds: ["agg_2", "agg_4"] },
        { label: "order", elementIds: ["agg_1"] },
        { label: "Orders", elementIds: ["agg_3"] },
      ],
    });
  });

  it("prefers the spelling met first when two are used equally often", () => {
    const [term] = collectVocabulary([
      sticky("event", "Order placed"),
      sticky("event", "Order Placed"),
    ]);
    expect(term!.label).toBe("Order placed");
  });

  it("orders the terms by kind, then as met, and leaves labels without a word out", () => {
    const vocabulary = collectVocabulary([
      sticky("event", "Order Shipped"),
      sticky("command", "Place Order"),
      sticky("event", "Order Placed"),
      sticky("event", "  "),
    ]);
    expect(vocabulary.map((term) => term.label)).toEqual([
      "Order Shipped",
      "Order Placed",
      "Place Order",
    ]);
  });

  it("reads a board's elements directly and leaves the board as it is", () => {
    const board: EventStormingBoard = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      config: { title: "Vocabulary" },
      elements: [
        { id: "agg_a", elementType: "aggregate", label: "Order", position: { x: 0, y: 0 } },
        { id: "agg_b", elementType: "aggregate", label: "Orders", position: { x: 200, y: 0 } },
      ] satisfies BoardElement[],
      edges: [],
    };
    const before = serializeBoard(board);
    const [term] = collectVocabulary(board.elements);
    expect(term!.spellings.map((spelling) => spelling.label)).toEqual(["Order", "Orders"]);
    expect(serializeBoard(board)).toBe(before);
  });
});

describe("isPlaceholderLabel", () => {
  it("knows the name a new sticky of each kind gets, notes and drawings having none", () => {
    expect(PLACEHOLDER_LABELS).toEqual({
      event: "Domain Event",
      command: "Command",
      actor: "Actor",
      aggregate: "Aggregate",
      policy: "Policy",
      readmodel: "Read Model",
      external: "External System",
      hotspot: "Hotspot",
    });
  });

  const stickyKinds = Object.keys(PLACEHOLDER_LABELS) as Array<keyof typeof PLACEHOLDER_LABELS>;
  const placeholders = Object.values(PLACEHOLDER_LABELS);
  const everyPlaceholderOnEveryKind = stickyKinds.flatMap((kind) =>
    placeholders.map((placeholder) => [kind, placeholder] as const),
  );

  it.each(everyPlaceholderOnEveryKind)(
    "reads %s %j as a placeholder, alone, numbered and padded",
    (kind, placeholder) => {
      for (const label of [
        placeholder,
        `${placeholder} 2`,
        `${placeholder} 12`,
        ` ${placeholder} 3 `,
        `${placeholder}\n`,
      ]) {
        expect(isPlaceholderLabel(kind, label), JSON.stringify(label)).toBe(true);
      }
    },
  );

  it.each(stickyKinds)("reads an empty or blank %s as the placeholder the file stores", (kind) => {
    expect(isPlaceholderLabel(kind, "")).toBe(true);
    expect(isPlaceholderLabel(kind, " \n ")).toBe(true);
  });

  it.each(everyPlaceholderOnEveryKind)(
    "reads a near-miss on %s of %j as a name",
    (kind, placeholder) => {
      for (const label of [
        `${placeholder}s`,
        `${placeholder} Two`,
        `${placeholder} Root`,
        `${placeholder} 2b`,
        `${placeholder} 2.5`,
        `${placeholder} -2`,
        `${placeholder}  2`,
        `${placeholder}2`,
        `New ${placeholder}`,
        placeholder.toLowerCase(),
        placeholder.toUpperCase(),
      ]) {
        expect(isPlaceholderLabel(kind, label), JSON.stringify(label)).toBe(false);
      }
    },
  );

  it.each([
    ["event", "Order Placed"],
    ["event", "Domain"],
    ["event", "DomainEvent"],
    ["event", "Domain Event 2 3"],
    ["aggregate", "?"],
    ["aggregate", "Domain Event Command"],
    ["command", "Command Aggregate 2"],
    ["readmodel", "Read"],
    ["readmodel", "ReadModel"],
    ["external", "External"],
    ["hotspot", "Why?"],
  ] as const)("reads %s %j as a name", (kind, label) => {
    expect(isPlaceholderLabel(kind, label)).toBe(false);
  });

  it.each(["note", "drawing"] as const)("gives a %s no placeholder, whatever its label", (kind) => {
    for (const label of [
      "",
      " ",
      "Note",
      ...placeholders,
      ...placeholders.map((name) => `${name} 2`),
    ]) {
      expect(isPlaceholderLabel(kind, label), JSON.stringify(label)).toBe(false);
    }
  });
});

describe("spellingVariants", () => {
  it("lists the terms written in more than one way, and only those", () => {
    const vocabulary = collectVocabulary([
      sticky("aggregate", "Order"),
      sticky("aggregate", "Order"),
      sticky("aggregate", "Customer"),
      sticky("aggregate", "customer"),
      sticky("event", "Order Placed"),
    ]);
    expect(spellingVariants(vocabulary).map((term) => term.label)).toEqual(["Customer"]);
  });

  it("finds none where the names differ in more than spelling", () => {
    const vocabulary = collectVocabulary([
      sticky("event", "Order Placed"),
      sticky("event", "Order Shipped"),
      sticky("event", "Order Cancelled"),
    ]);
    expect(spellingVariants(vocabulary)).toEqual([]);
  });
});

describe("suggestLabels", () => {
  const vocabulary = collectVocabulary([
    sticky("event", "Order Placed"),
    sticky("event", "Order Shipped"),
    sticky("event", "Order Shipped"),
    sticky("event", "Payment Received"),
    sticky("event", "Invoice Sent"),
    sticky("command", "Place Order"),
    sticky("aggregate", "Delivery"),
  ]);
  const labels = (kind: Parameters<typeof suggestLabels>[1], typed: string, limit?: number) =>
    suggestLabels(vocabulary, kind, typed, limit).map((term) => term.label);

  it("suggests the names of the same kind only", () => {
    expect(labels("event", "Ord")).toEqual(["Order Shipped", "Order Placed"]);
    expect(labels("command", "Ord")).toEqual(["Place Order"]);
    expect(labels("aggregate", "Ord")).toEqual([]);
  });

  it("ranks a match at the start before one at a later word, then by use", () => {
    expect(labels("event", "Pla")).toEqual(["Order Placed"]);
    expect(labels("event", "S")).toEqual(["Order Shipped", "Invoice Sent"]);
  });

  it("reads the last word as written so far and the earlier ones as whole words", () => {
    expect(labels("event", "Pay")).toEqual(["Payment Received"]);
    expect(labels("event", "orders pl")).toEqual(["Order Placed"]);
    expect(labels("aggregate", "Deliveries")).toEqual(["Delivery"]);
    expect(labels("event", "Invoice")).toEqual(["Invoice Sent"]);
  });

  it("offers the established spelling for a variant, but not the text typed exactly", () => {
    expect(labels("event", "order placed")).toEqual(["Order Placed"]);
    expect(labels("event", "Order Placed")).toEqual([]);
  });

  it("finds a British spelling while it is half typed", () => {
    const british = collectVocabulary([sticky("event", "Order Cancelled")]);
    for (const typed of ["Order Cancel", "Order Cancell", "Cancelle", "order canceled"]) {
      expect(
        suggestLabels(british, "event", typed).map((term) => term.label),
        typed,
      ).toEqual(["Order Cancelled"]);
    }
  });

  it("matches inside a word nowhere, so a single letter finds only word starts", () => {
    expect(labels("event", "r")).toEqual(["Payment Received"]);
    expect(labels("event", "t")).toEqual([]);
  });

  it("suggests nothing for text without a word, and keeps to the limit", () => {
    expect(labels("event", "")).toEqual([]);
    expect(labels("event", " - ")).toEqual([]);
    expect(labels("event", "O", 1)).toEqual(["Order Shipped"]);
    expect(DEFAULT_SUGGESTION_LIMIT).toBe(8);
    const many = collectVocabulary(
      Array.from({ length: 20 }, (_, index) => sticky("event", `Step ${index + 1} Done`)),
    );
    expect(suggestLabels(many, "event", "Step")).toHaveLength(DEFAULT_SUGGESTION_LIMIT);
  });
});
