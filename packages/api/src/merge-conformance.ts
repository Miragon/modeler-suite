import { isMergeConflict, type ModelTextMerge } from "./merge.js";

export interface DisjointMergeFixture {
  /** names the fixture in the kit's error messages */
  name: string;
  external: string;
  draft: string;
  /** the exact text the merge returns, with both sides' changes */
  merged: string;
}

export interface ConflictingMergeFixture {
  /** names the fixture in the kit's error messages */
  name: string;
  external: string;
  draft: string;
}

export interface MergeFixtures {
  /** the text both sides start from, canonical (`exportText` output) */
  base: string;
  /** an outside change and a draft that touch different elements; at least one */
  disjoint: DisjointMergeFixture[];
  /** two different changes of one element, or a change against its removal; at least one */
  conflicting: ConflictingMergeFixture[];
  /** texts the modeler rejects on import; `[]` when it rejects none (a lenient line DSL) */
  invalidTexts: string[];
  /** throws when the modeler rejects the text: `importText` of a fresh instance, or its parser */
  parse(text: string): unknown;
}

export interface MergeConformanceCase {
  name: string;
  run(merge: ModelTextMerge, fixtures: MergeFixtures): void;
}

function fail(caseName: string, detail: string): never {
  throw new Error(`modeler-api merge conformance "${caseName}": ${detail}`);
}

function expectText(caseName: string, actual: string, expected: string, what: string): void {
  if (actual !== expected) {
    fail(caseName, `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function expectConflict(caseName: string, attempt: () => string, what: string): void {
  let merged: string;
  try {
    merged = attempt();
  } catch (error) {
    if (isMergeConflict(error)) return;
    fail(caseName, `${what} threw ${String(error)}, not a MergeConflictError`);
  }
  fail(caseName, `${what} returned ${JSON.stringify(merged)} instead of a MergeConflictError`);
}

function requireFixtures(caseName: string, fixtures: MergeFixtures): void {
  if (fixtures.disjoint.length === 0) fail(caseName, "the fixtures need a disjoint change");
  if (fixtures.conflicting.length === 0) fail(caseName, "the fixtures need a conflicting change");
}

function everyChangedText(fixtures: MergeFixtures): Array<{ name: string; text: string }> {
  return [...fixtures.disjoint, ...fixtures.conflicting].flatMap((fixture) => [
    { name: `${fixture.name} (external)`, text: fixture.external },
    { name: `${fixture.name} (draft)`, text: fixture.draft },
  ]);
}

export function mergeConformanceCases(): MergeConformanceCase[] {
  return [
    {
      name: "merge: an unchanged outside keeps the draft",
      run(merge, fixtures) {
        requireFixtures(this.name, fixtures);
        for (const { name, text } of everyChangedText(fixtures)) {
          expectText(this.name, merge(fixtures.base, fixtures.base, text), text, name);
        }
      },
    },
    {
      name: "merge: an unchanged draft takes the outside",
      run(merge, fixtures) {
        requireFixtures(this.name, fixtures);
        for (const { name, text } of everyChangedText(fixtures)) {
          expectText(this.name, merge(fixtures.base, text, fixtures.base), text, name);
        }
      },
    },
    {
      name: "merge: the same change on both sides is kept once",
      run(merge, fixtures) {
        requireFixtures(this.name, fixtures);
        for (const { name, text } of everyChangedText(fixtures)) {
          expectText(this.name, merge(fixtures.base, text, text), text, name);
        }
      },
    },
    {
      name: "merge: changes to different elements are both kept",
      run(merge, fixtures) {
        requireFixtures(this.name, fixtures);
        for (const fixture of fixtures.disjoint) {
          const merged = merge(fixtures.base, fixture.external, fixture.draft);
          expectText(this.name, merged, fixture.merged, fixture.name);
          try {
            fixtures.parse(merged);
          } catch (error) {
            fail(this.name, `${fixture.name}: the merged text does not parse: ${String(error)}`);
          }
        }
      },
    },
    {
      name: "merge: two changes of one element conflict",
      run(merge, fixtures) {
        requireFixtures(this.name, fixtures);
        for (const fixture of fixtures.conflicting) {
          expectConflict(
            this.name,
            () => merge(fixtures.base, fixture.external, fixture.draft),
            fixture.name,
          );
          expectConflict(
            this.name,
            () => merge(fixtures.base, fixture.draft, fixture.external),
            `${fixture.name} with the sides swapped`,
          );
        }
      },
    },
    {
      name: "merge: a text that does not parse conflicts",
      run(merge, fixtures) {
        requireFixtures(this.name, fixtures);
        const [disjoint] = fixtures.disjoint as [DisjointMergeFixture];
        for (const invalid of fixtures.invalidTexts) {
          expectConflict(
            this.name,
            () => merge(fixtures.base, invalid, disjoint.draft),
            "an invalid outside text",
          );
          expectConflict(
            this.name,
            () => merge(fixtures.base, disjoint.external, invalid),
            "an invalid draft",
          );
        }
      },
    },
    {
      name: "merge: the result is deterministic",
      run(merge, fixtures) {
        requireFixtures(this.name, fixtures);
        for (const fixture of fixtures.disjoint) {
          const first = merge(fixtures.base, fixture.external, fixture.draft);
          const second = merge(fixtures.base, fixture.external, fixture.draft);
          expectText(this.name, second, first, `${fixture.name}, merged twice`);
        }
      },
    },
  ];
}

/**
 * Binds every merge case to a (name, fn) test runner. Unlike the modeler cases, none of them is
 * optional and none needs a DOM: a modeler that hands a host a merge runs all of them.
 */
export function registerMergeConformance(
  merge: ModelTextMerge,
  fixtures: MergeFixtures,
  test: (name: string, fn: () => void) => unknown,
): void {
  for (const mergeCase of mergeConformanceCases()) {
    test(`conformance: ${mergeCase.name}`, () => mergeCase.run(merge, fixtures));
  }
}
