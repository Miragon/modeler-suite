import { describe, expect, test } from "vitest";

import { registerMergeConformance } from "../src/conformance.js";
import {
  isMergeConflict,
  MergeConflictError,
  mergeItemsById,
  mergeItemsByOccurrence,
  mergeRecord,
  mergeTextLines,
  mergeValue,
  sameJsonValue,
} from "../src/index.js";

describe("mergeItemsById", () => {
  const base = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ];

  test("takes the draft's order when the outside kept the order", () => {
    const external = [
      { id: "a", label: "A2" },
      { id: "b", label: "B" },
    ];
    const draft = [
      { id: "b", label: "B" },
      { id: "a", label: "A" },
    ];
    expect(mergeItemsById(base, external, draft).merged).toEqual([
      { id: "b", label: "B" },
      { id: "a", label: "A2" },
    ]);
  });

  test("places items the draft added after the item that precedes them in the draft", () => {
    const external = [
      { id: "c", label: "C" },
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    const draft = [
      { id: "a", label: "A" },
      { id: "x", label: "X" },
      { id: "b", label: "B" },
    ];
    expect(mergeItemsById(base, external, draft).merged?.map((item) => item.id)).toEqual([
      "c",
      "a",
      "x",
      "b",
    ]);
  });

  test("puts a new first item of the draft first", () => {
    const external = [{ id: "a", label: "A" }];
    const draft = [{ id: "x", label: "X" }, ...base];
    expect(mergeItemsById(base, external, draft).merged?.map((item) => item.id)).toEqual([
      "x",
      "a",
    ]);
  });

  test("conflicts on a key that occurs twice in one list", () => {
    const draft = [...base, { id: "a", label: "again" }];
    expect(mergeItemsById(base, base, draft).conflictingIds).toEqual(["a"]);
  });

  test("conflicts when both sides add different items under one key", () => {
    expect(
      mergeItemsById(base, [...base, { id: "n", label: "1" }], [...base, { id: "n", label: "2" }])
        .conflictingIds,
    ).toEqual(["n"]);
  });

  test("keys and compares items by the options", () => {
    const arrows = [{ from: "a", to: "b", style: "solid" }];
    const merged = mergeItemsById(
      arrows,
      [{ from: "a", to: "b", style: "dashed" }],
      [...arrows, { from: "b", to: "a", style: "solid" }],
      { idOf: (arrow) => `${arrow.from}->${arrow.to}` },
    );
    expect(merged.merged).toEqual([
      { from: "a", to: "b", style: "dashed" },
      { from: "b", to: "a", style: "solid" },
    ]);
  });
});

describe("mergeItemsByOccurrence", () => {
  interface Arrow {
    from: string;
    to: string;
    label?: string;
  }
  const ends = (arrow: Arrow): string => `${arrow.from}->${arrow.to}`;
  const ab: Arrow = { from: "a", to: "b" };
  const bc: Arrow = { from: "b", to: "c" };
  const cd: Arrow = { from: "c", to: "d" };

  test("keeps two equal items two: a second one added outside stays next to the draft's new item", () => {
    expect(mergeItemsByOccurrence([ab], [ab, ab], [ab, bc], ends).merged).toEqual([ab, bc, ab]);
  });

  test("numbers the items of one key from 1 in list order and names a conflict by that number", () => {
    expect(
      mergeItemsByOccurrence(
        [ab, bc, ab],
        [ab, bc, { ...ab, label: "outside" }],
        [ab, bc, { ...ab, label: "draft" }],
        ends,
      ).conflictingIds,
    ).toEqual(["a->b#2"]);
    expect(
      mergeItemsByOccurrence(
        [ab],
        [ab, { ...cd, label: "1" }],
        [ab, { ...cd, label: "2" }, { ...cd, label: "2" }],
        ends,
      ).conflictingIds,
    ).toEqual(["c->d#1"]);
  });

  test("a duplicate one side removes is gone once, and its twin stays", () => {
    expect(mergeItemsByOccurrence([ab, bc, ab], [ab, bc], [ab, bc, ab, cd], ends).merged).toEqual([
      ab,
      bc,
      cd,
    ]);
  });

  test("keeps an item's key across a reorder, so a change on the other side lands on it", () => {
    expect(
      mergeItemsByOccurrence([ab, bc], [ab, { ...bc, label: "outside" }], [bc, ab], ends).merged,
    ).toEqual([{ ...bc, label: "outside" }, ab]);
  });

  test("compares two items under one key by isSameItem", () => {
    const sameLabelIgnoringCase = (arrow: Arrow, other: Arrow): boolean =>
      arrow.label?.toLowerCase() === other.label?.toLowerCase();
    const lastSynced = [{ ...ab, label: "Paid" }];
    const external = [{ ...ab, label: "paid" }];
    const draft = [{ ...ab, label: "Shipped" }];
    expect(mergeItemsByOccurrence(lastSynced, external, draft, ends).conflictingIds).toEqual([
      "a->b#1",
    ]);
    expect(
      mergeItemsByOccurrence(lastSynced, external, draft, ends, {
        isSameItem: sameLabelIgnoringCase,
      }).merged,
    ).toEqual(draft);
  });
});

describe("mergeValue and sameJsonValue", () => {
  test("a value changed on one side takes that side", () => {
    expect(mergeValue("t", "outside", "t")).toEqual({ merged: "outside" });
    expect(mergeValue("t", "t", "draft")).toEqual({ merged: "draft" });
    expect(mergeValue("t", undefined, "t")).toEqual({ merged: undefined });
  });

  test("two different changes conflict", () => {
    expect(mergeValue("t", "outside", "draft")).toEqual({ conflict: true });
  });

  test("compares parsed documents by structure, an undefined field as an absent one", () => {
    expect(sameJsonValue({ a: [1, { b: 2 }], c: undefined }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameJsonValue({ a: [1] }, { a: [1, 2] })).toBe(false);
    expect(sameJsonValue([1], { 0: 1 })).toBe(false);
  });

  test("isMergeConflict also knows a conflict of another copy of the package", () => {
    const foreign = Object.assign(new Error("x"), { name: "MergeConflictError" });
    expect(isMergeConflict(foreign)).toBe(true);
    expect(isMergeConflict(new MergeConflictError(["a"]))).toBe(true);
    expect(isMergeConflict(new Error("x"))).toBe(false);
    expect(new MergeConflictError(["a", "b"]).message).toBe("both sides changed a, b");
  });
});

describe("mergeRecord", () => {
  const base = { title: "T", version: 1, nodes: [{ id: "a", x: 1 }], foreign: { keep: true } };

  test("merges the keyed lists by id and every other field as one value", () => {
    expect(
      mergeRecord(
        base,
        { ...base, title: "Outside", nodes: [...base.nodes, { id: "b", x: 2 }] },
        { ...base, nodes: [{ id: "a", x: 5 }], foreign: { keep: false } },
        { keyedLists: ["nodes"] },
      ),
    ).toEqual({
      merged: {
        title: "Outside",
        version: 1,
        nodes: [
          { id: "a", x: 5 },
          { id: "b", x: 2 },
        ],
        foreign: { keep: false },
      },
    });
  });

  test("names conflicting elements by id and conflicting fields by name", () => {
    expect(
      mergeRecord(
        base,
        { ...base, title: "Outside", nodes: [{ id: "a", x: 2 }] },
        { ...base, title: "Draft", nodes: [{ id: "a", x: 3 }] },
        { keyedLists: ["nodes"] },
      ),
    ).toEqual({ conflictingIds: ["title", "a"] });
  });
});

describe("mergeTextLines", () => {
  const base = "a\nb\nc\nd\ne\n";

  registerMergeConformance(
    (lastSynced, external, draft) => {
      const result = mergeTextLines(lastSynced, external, draft);
      if (result.conflictingIds) throw new MergeConflictError(result.conflictingIds);
      return result.merged;
    },
    {
      base,
      disjoint: [
        {
          name: "a change at the top outside, one at the bottom in the draft",
          external: "A\nb\nc\nd\ne\n",
          draft: "a\nb\nc\nd\nE\nf\n",
          merged: "A\nb\nc\nd\nE\nf\n",
        },
        {
          name: "a removal outside, an insertion elsewhere in the draft",
          external: "a\nc\nd\ne\n",
          draft: "a\nb\nc\nd\nx\ne\n",
          merged: "a\nc\nd\nx\ne\n",
        },
      ],
      conflicting: [
        {
          name: "one line changed on both sides",
          external: "a\nB\nc\nd\ne\n",
          draft: "a\nb2\nc\nd\ne\n",
        },
        {
          name: "two insertions at one place",
          external: "a\nx\nb\nc\nd\ne\n",
          draft: "a\ny\nb\nc\nd\ne\n",
        },
      ],
      invalidTexts: [],
      parse: (text) => text,
    },
    test,
  );

  test("keeps a text without a final line break as it is written", () => {
    expect(mergeTextLines("a\nb", "a\nb", "a\nb\nc")).toEqual({ merged: "a\nb\nc" });
    expect(mergeTextLines("a\nb", "A\nb", "a\nb")).toEqual({ merged: "A\nb" });
  });

  test("names a conflict by the lines of the text both sides started from", () => {
    expect(mergeTextLines(base, "a\nB\nc\nd\ne\n", "a\nb2\nc\nd\ne\n")).toEqual({
      conflictingIds: ["lines 2-2"],
    });
  });

  describe("a large text", () => {
    const numberedLines = (prefix: string, count: number): string =>
      Array.from({ length: count }, (_, index) => `${prefix} ${index}\n`).join("");
    const largeBase = numberedLines("line", 2100);
    const largeRewrite = numberedLines("rewritten", 2100);
    const withLines = (text: string, replacementsByLineNumber: Record<number, string>): string =>
      text
        .split(/(?<=\n)/)
        .map((line, index) => replacementsByLineNumber[index + 1] ?? line)
        .join("");

    test("keeps the one side that rewrote it, or the rewrite both sides made", () => {
      expect(mergeTextLines(largeBase, largeBase, largeRewrite)).toEqual({ merged: largeRewrite });
      expect(mergeTextLines(largeBase, largeRewrite, largeBase)).toEqual({ merged: largeRewrite });
      expect(mergeTextLines(largeBase, largeRewrite, largeRewrite)).toEqual({
        merged: largeRewrite,
      });
    });

    describe.each([2100, 20_000])("of %i lines, changed near both ends outside", (count) => {
      const base = numberedLines("line", count);
      const nearBothEnds = { 6: "outside 6\n", [count - 4]: `outside ${count - 4}\n` };

      test("keeps the draft's change in the middle too (M2)", () => {
        expect(
          mergeTextLines(base, withLines(base, nearBothEnds), withLines(base, { 1001: "draft\n" })),
        ).toEqual({ merged: withLines(base, { ...nearBothEnds, 1001: "draft\n" }) });
      });

      test("conflicts on the one line both sides changed differently (M3)", () => {
        expect(
          mergeTextLines(
            base,
            withLines(base, { ...nearBothEnds, 1001: "outside 1001\n" }),
            withLines(base, { 1001: "draft\n" }),
          ),
        ).toEqual({ conflictingIds: ["lines 1001-1001"] });
      });
    });

    test("keeps the changes of both sides spread over the whole text", () => {
      const outside: Record<number, string> = {};
      const draft: Record<number, string> = {};
      for (let line = 5; line <= 2100; line += 10) {
        draft[line] = `draft ${line}\n`;
        outside[line + 5] = `outside ${line + 5}\n${line % 100 === 95 ? "inserted\n" : ""}`;
      }
      expect(
        mergeTextLines(largeBase, withLines(largeBase, outside), withLines(largeBase, draft)),
      ).toEqual({ merged: withLines(largeBase, { ...outside, ...draft }) });
    });

    test("merges 20,000 lines with a few changes on both sides in well under a second", () => {
      const base = numberedLines("line", 20_000);
      const external = withLines(base, { 6: "outside\n", 19_996: "outside\n" });
      const draft = withLines(base, { 10_001: "draft\n" });
      const started = performance.now();
      const result = mergeTextLines(base, external, draft);
      expect(performance.now() - started).toBeLessThan(1000);
      expect(result.merged).toBeDefined();
    });

    test("conflicts on the whole text when both sides rewrote it, too far apart to match", () => {
      const withMiddle = (middle: string) => `head\n${middle}tail\n`;
      expect(
        mergeTextLines(
          withMiddle(largeBase),
          withMiddle(largeRewrite),
          withMiddle(numberedLines("drafted", 2100)),
        ),
      ).toEqual({ conflictingIds: ["the whole text"] });
    });
  });
});
