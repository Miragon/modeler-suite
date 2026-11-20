import { describe, expect, test } from "vitest";

import {
  type MergeFixtures,
  mergeConformanceCases,
  registerMergeConformance,
} from "../src/conformance.js";
import { MergeConflictError, mergeItemsById, type ModelTextMerge } from "../src/index.js";

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
      "M1: an unchanged draft takes the outside",
      "M2: changes to different elements are both kept",
      "M3: two changes of one element conflict",
      "M4: a text that does not parse conflicts",
    ]);
  });

  test("a merge that takes the outside", () => {
    expect(failingMergeCases((_base, external) => external)).toEqual([
      "M1: an unchanged outside keeps the draft",
      "M2: changes to different elements are both kept",
      "M3: two changes of one element conflict",
      "M4: a text that does not parse conflicts",
    ]);
  });

  test("a merge that doubles a change both sides made", () => {
    const doubled: ModelTextMerge = (base, external, draft) =>
      external === draft && external !== base
        ? `${external}${draft}`
        : referenceMerge(base, external, draft);
    expect(failingMergeCases(doubled)).toEqual(["M1: the same change on both sides is kept once"]);
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
      "M3: two changes of one element conflict",
      "M4: a text that does not parse conflicts",
    ]);
  });

  test("a merge that lets the parser's error through", () => {
    const parserErrors: ModelTextMerge = (base, external, draft) => {
      parseLines(external);
      parseLines(draft);
      return referenceMerge(base, external, draft);
    };
    expect(failingMergeCases(parserErrors)).toEqual(["M4: a text that does not parse conflicts"]);
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
    ).toEqual(["M2: changes to different elements are both kept"]);
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
    expect(failingMergeCases(flaky)).toContain("M5: the result is deterministic");
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
