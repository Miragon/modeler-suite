import { describe, expect, test } from "vitest";

import {
  type MergeFixtures,
  mergeConformanceCases,
  registerMergeConformance,
} from "../src/conformance.js";
import {
  isMergeConflict,
  MergeConflictError,
  mergeItemsById,
  mergeRecord,
  mergeTextLines,
  mergeValue,
  type ModelTextMerge,
  sameJsonValue,
} from "../src/index.js";

interface Line {
  id: string;
  label: string;
}

function parseLines(text: string): Line[] {
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const match = /^(\w+)=(.*)$/.exec(line);
      if (!match) throw new Error(`not a line: ${line}`);
      return { id: match[1] as string, label: match[2] as string };
    });
}

function serializeLines(lines: readonly Line[]): string {
  return lines.map((line) => `${line.id}=${line.label}\n`).join("");
}

function parsedOrConflict(text: string): Line[] {
  try {
    return parseLines(text);
  } catch (error) {
    throw new MergeConflictError([], String(error));
  }
}

const referenceMerge: ModelTextMerge = (lastSyncedText, externalText, draftText) => {
  const result = mergeItemsById(
    parsedOrConflict(lastSyncedText),
    parsedOrConflict(externalText),
    parsedOrConflict(draftText),
  );
  if (result.conflictingIds) throw new MergeConflictError(result.conflictingIds);
  return serializeLines(result.merged);
};

const fixtures: MergeFixtures = {
  base: "a=Alpha\nb=Beta\nc=Gamma\n",
  disjoint: [
    {
      name: "a rename outside, a new line in the draft",
      external: "a=Alpha\nb=Bravo\nc=Gamma\n",
      draft: "a=Alpha\nb=Beta\nc=Gamma\nd=Delta\n",
      merged: "a=Alpha\nb=Bravo\nc=Gamma\nd=Delta\n",
    },
    {
      name: "a removal outside, an insert in the middle of the draft",
      external: "a=Alpha\nc=Gamma\n",
      draft: "a=Alpha\nx=Inserted\nb=Beta\nc=Gamma\n",
      merged: "a=Alpha\nx=Inserted\nc=Gamma\n",
    },
  ],
  conflicting: [
    {
      name: "one line renamed on both sides",
      external: "a=Alpha\nb=Bravo\nc=Gamma\n",
      draft: "a=Alpha\nb=Bee\nc=Gamma\n",
    },
    {
      name: "a rename against a removal",
      external: "a=Alpha\nc=Gamma\n",
      draft: "a=Alpha\nb=Bee\nc=Gamma\n",
    },
  ],
  invalidTexts: ["a=Alpha\n!broken\n"],
  parse: parseLines,
};

describe("the reference merge", () => {
  registerMergeConformance(referenceMerge, fixtures, test);
});

function failingMergeCases(
  merge: ModelTextMerge,
  overrides: Partial<MergeFixtures> = {},
): string[] {
  return mergeConformanceCases()
    .filter((mergeCase) => {
      try {
        mergeCase.run(merge, { ...fixtures, ...overrides });
        return false;
      } catch {
        return true;
      }
    })
    .map((mergeCase) => mergeCase.name);
}

describe("each broken merge fails the case of the law it breaks", () => {
  test("a merge that keeps the draft", () => {
    expect(failingMergeCases((_base, _external, draft) => draft)).toEqual([
      "merge: an unchanged draft takes the outside",
      "merge: changes to different elements are both kept",
      "merge: two changes of one element conflict",
      "merge: a text that does not parse conflicts",
    ]);
  });

  test("a merge that takes the outside", () => {
    expect(failingMergeCases((_base, external) => external)).toEqual([
      "merge: an unchanged outside keeps the draft",
      "merge: changes to different elements are both kept",
      "merge: two changes of one element conflict",
      "merge: a text that does not parse conflicts",
    ]);
  });

  test("a merge that throws a plain Error on a conflict", () => {
    const plainErrors: ModelTextMerge = (base, external, draft) => {
      try {
        return referenceMerge(base, external, draft);
      } catch {
        throw new Error("cannot merge");
      }
    };
    expect(failingMergeCases(plainErrors)).toEqual([
      "merge: two changes of one element conflict",
      "merge: a text that does not parse conflicts",
    ]);
  });

  test("a merge that lets the parser's error through", () => {
    const parserErrors: ModelTextMerge = (base, external, draft) => {
      parseLines(external);
      parseLines(draft);
      return referenceMerge(base, external, draft);
    };
    expect(failingMergeCases(parserErrors)).toEqual([
      "merge: a text that does not parse conflicts",
    ]);
  });

  test("a merge whose result does not parse", () => {
    const broken: ModelTextMerge = (base, external, draft) => {
      const merged = referenceMerge(base, external, draft);
      return merged === external || merged === draft ? merged : `${merged}!trailer\n`;
    };
    const merged = (fixture: { external: string; draft: string }) =>
      broken(fixtures.base, fixture.external, fixture.draft);
    expect(
      failingMergeCases(broken, {
        disjoint: fixtures.disjoint.map((fixture) => ({ ...fixture, merged: merged(fixture) })),
      }),
    ).toEqual(["merge: changes to different elements are both kept"]);
  });

  test("a merge that is not deterministic", () => {
    let calls = 0;
    const flaky: ModelTextMerge = (base, external, draft) => {
      const merged = referenceMerge(base, external, draft);
      calls += 1;
      return merged === external || merged === draft || calls % 2 === 1
        ? merged
        : `z=${calls}\n${merged}`;
    };
    expect(failingMergeCases(flaky)).toContain("merge: the result is deterministic");
  });

  test("fixtures without an invalid text leave the parse case nothing to check", () => {
    expect(failingMergeCases(referenceMerge, { invalidTexts: [] })).toEqual([]);
  });

  test("fixtures without a conflicting change fail every case", () => {
    expect(failingMergeCases(referenceMerge, { conflicting: [] })).toHaveLength(
      mergeConformanceCases().length,
    );
  });
});

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
});
