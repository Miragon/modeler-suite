import { describe, expect, test } from "vitest";
import { parseDSL, serializeDSL } from "@miragon/event-storming-dsl";
import { isMergeConflict } from "@miragon/modeler-api";
import { mergeStormText } from "../src/collaborative/merge.js";
import { STORM_MERGE_FIXTURES } from "./support/merge-fixtures.js";

const lines = (...text: string[]): string => `${text.join("\n")}\n`;

function conflictOf(attempt: () => string): readonly string[] {
  try {
    attempt();
  } catch (error) {
    if (isMergeConflict(error)) return error.conflictingIds;
    throw error;
  }
  throw new Error("the merge did not conflict");
}

// The merge kit itself runs in test:browser (conformance.browser.test.ts), next to the contract.
describe("mergeStormText", () => {
  test("the fixtures are canonical", () => {
    const { base, disjoint, conflicting } = STORM_MERGE_FIXTURES;
    const texts = [base, ...disjoint.flatMap((f) => [f.external, f.draft, f.merged])];
    texts.push(...conflicting.flatMap((fixture) => [fixture.external, fixture.draft]));
    for (const text of texts) expect(serializeDSL(parseDSL(text))).toBe(text);
  });

  test("keeps an arrow the user did not touch when the agent inserts one above it", () => {
    const base = lines(
      "title T",
      "event A [0, 0]",
      "event B [200, 0]",
      "event C [400, 0]",
      "A -> B",
    );
    const external = lines(
      "title T",
      "event A [0, 0]",
      "event B [200, 0]",
      "event C [400, 0]",
      "C -> A",
      "A -> B",
    );
    const draft = lines(
      "title T",
      "event A [0, 0]",
      "event B [200, 0]",
      "event C [400, 0]",
      "A -> B",
      "B -> C",
    );
    expect(mergeStormText(base, external, draft)).toBe(
      lines(
        "title T",
        "event A [0, 0]",
        "event B [200, 0]",
        "event C [400, 0]",
        "C -> A",
        "A -> B",
        "B -> C",
      ),
    );
  });

  test("keeps two equal arrows two, and the lines the parser leaves unread", () => {
    const base = lines("title T", "event A [0, 0]", "event B [200, 0]", "A -> B", "// keep me");
    const external = lines(
      "title T",
      "event A [0, 0]",
      "event B [200, 0]",
      "A -> B",
      "A -> B",
      "// keep me",
    );
    const draft = lines("title T", "event A [0, 0]", "event B [300, 0]", "A -> B", "// keep me");
    expect(mergeStormText(base, external, draft)).toBe(
      lines("title T", "event A [0, 0]", "event B [300, 0]", "A -> B", "A -> B", "// keep me"),
    );
  });

  test("names what conflicts: the element, the arrow left dangling, the config field", () => {
    const { base, conflicting } = STORM_MERGE_FIXTURES;
    const [moved, , dangling, retitled] = conflicting as [
      (typeof conflicting)[number],
      (typeof conflicting)[number],
      (typeof conflicting)[number],
      (typeof conflicting)[number],
    ];
    expect(conflictOf(() => mergeStormText(base, moved.external, moved.draft))).toEqual([
      "cmd_place_order",
    ]);
    expect(conflictOf(() => mergeStormText(base, dangling.external, dangling.draft))).toEqual([
      "event_order_placed->policy_notify",
    ]);
    expect(conflictOf(() => mergeStormText(base, retitled.external, retitled.draft))).toEqual([
      "config.title",
    ]);
  });
});
