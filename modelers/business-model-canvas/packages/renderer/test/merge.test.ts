import { describe, expect, test } from "vitest";
import { isMergeConflict } from "@miragon/modeler-api";
import { serializeText, parseText } from "@miragon/business-model-canvas-dsl";
import { mergeCanvasText } from "../src/collaborative/merge.js";
import { CANVAS_MERGE_FIXTURES, block, canvas, item } from "./support/merge-fixtures.js";

const conflictOf = (attempt: () => string): readonly string[] | undefined => {
  try {
    attempt();
  } catch (error) {
    if (isMergeConflict(error)) return error.conflictingIds;
    throw error;
  }
  return undefined;
};

// The merge kit itself runs in test:browser (conformance.browser.test.ts), next to the contract.
describe("mergeCanvasText", () => {
  const { base, conflicting } = CANVAS_MERGE_FIXTURES;

  test("every fixture text is canonical", () => {
    const texts = [
      base,
      ...CANVAS_MERGE_FIXTURES.disjoint.flatMap((fixture) => [
        fixture.external,
        fixture.draft,
        fixture.merged,
      ]),
      ...conflicting.flatMap((fixture) => [fixture.external, fixture.draft]),
    ];
    for (const text of texts) expect(serializeText(parseText(text).document)).toBe(text);
  });

  test("names the sticky both sides changed", () => {
    const [changed] = conflicting;
    expect(conflictOf(() => mergeCanvasText(base, changed!.external, changed!.draft))).toEqual([
      "online",
    ]);
  });

  test("names the sticky both sides moved to different blocks", () => {
    const [, , moved] = conflicting;
    expect(conflictOf(() => mergeCanvasText(base, moved!.external, moved!.draft))).toEqual([
      "fair",
    ]);
  });

  const SHOP = item("shop", "Web shop", { color: "sky" });
  const ONLINE = block([item("online", "Online")]);

  test("conflicts when one side removes a block the other changed", () => {
    const withChannels = canvas({ "customer-segments": ONLINE, channels: block([SHOP]) });
    const withoutChannels = canvas({ "customer-segments": ONLINE });
    const changedChannels = canvas({
      "customer-segments": ONLINE,
      channels: block([{ ...SHOP, color: "sun" }]),
    });
    expect(
      conflictOf(() => mergeCanvasText(withChannels, withoutChannels, changedChannels)),
    ).toEqual(["channels"]);
  });

  test("conflicts when one side moves a sticky the other removed", () => {
    const [a, b, k] = [item("a", "A"), item("b", "B"), item("k", "K")];
    const twoBlocks = canvas({ channels: block([a, b]), "key-partners": block([k]) });
    const moved = canvas({ channels: block([b]), "key-partners": block([k, a]) });
    const removed = canvas({ channels: block([b]), "key-partners": block([k]) });
    expect(conflictOf(() => mergeCanvasText(twoBlocks, moved, removed))).toEqual(["a"]);
    expect(conflictOf(() => mergeCanvasText(twoBlocks, removed, moved))).toEqual(["a"]);
  });

  test("removes a block one side dropped and the other only emptied", () => {
    const k = block([item("k", "K")]);
    const twoBlocks = canvas({ channels: block([item("a", "A")]), "key-partners": k });
    const dropped = canvas({ "key-partners": k });
    const emptied = canvas({ channels: block(), "key-partners": k });
    expect(mergeCanvasText(twoBlocks, dropped, emptied)).toBe(dropped);
  });

  test("merges a change to one item with a foreign field added to another", () => {
    const [a, b] = [item("a", "A"), item("b", "B")];
    const plain = canvas({ channels: block([a, b]) });
    const tagged = canvas({ channels: block([a, { ...b, "x-owner": "sales" }]) });
    const coloured = canvas({ channels: block([{ ...a, color: "sun" }, b]) });
    expect(mergeCanvasText(plain, tagged, coloured)).toBe(
      canvas({
        channels: block([
          { ...a, color: "sun" },
          { ...b, "x-owner": "sales" },
        ]),
      }),
    );
  });

  test("keeps two stickies of the same text apart by their ids", () => {
    const one = canvas({ "key-partners": block(), channels: block([item("shop", "Shop")]) });
    const twin = canvas({
      "key-partners": block([item("shop-partner", "Shop")]),
      channels: block([item("shop", "Shop")]),
    });
    const coloured = canvas({
      "key-partners": block(),
      channels: block([item("shop", "Shop", { color: "sun" })]),
    });
    expect(mergeCanvasText(one, twin, coloured)).toBe(
      canvas({
        "key-partners": block([item("shop-partner", "Shop")]),
        channels: block([item("shop", "Shop", { color: "sun" })]),
      }),
    );
  });

  test("merges the canvas fields key by key and conflicts on two changes of one", () => {
    const base = canvas({}, { title: "Shop" });
    const titled = canvas({}, { title: "Bakery" });
    const dated = canvas({}, { title: "Shop", date: "2026-11-08" });
    expect(mergeCanvasText(base, titled, dated)).toBe(
      canvas({}, { title: "Bakery", date: "2026-11-08" }),
    );
    expect(conflictOf(() => mergeCanvasText(base, titled, canvas({}, { title: "Cafe" })))).toEqual([
      "canvas.title",
    ]);
  });

  test("tells notes apart by their own fields too", () => {
    const note = (x: number) => ({ text: "a", x });
    const twoNotes = canvas({ channels: block([], [note(1), note(2)]) });
    const firstRemoved = canvas({ channels: block([], [note(2)]) });
    const secondRemoved = canvas({ channels: block([], [note(1)]) });
    expect(mergeCanvasText(twoNotes, firstRemoved, secondRemoved)).toBe(canvas({ channels: {} }));
  });

  test("merges the notes on the whole canvas as they are", () => {
    const withNotes = (...texts: string[]) =>
      serializeText(
        parseText(JSON.stringify({ canvas: { notes: texts.map((text) => ({ text })) } })).document,
      );
    expect(mergeCanvasText(withNotes("Open"), withNotes("Open", "Agent"), withNotes())).toBe(
      withNotes("Agent"),
    );
    expect(mergeCanvasText(withNotes(), withNotes("Agent"), withNotes("User"))).toMatch(
      /Agent[\s\S]*User|User[\s\S]*Agent/,
    );
  });

  test("merges three empty texts as an empty canvas", () => {
    expect(mergeCanvasText("", "", "")).toBe("");
  });
});
