import { describe, expect, it } from "vitest";
import { applyTextEdits, diffTexts, invert } from "../../src/edit/textEdits.js";
import { BIG_BANK } from "./golden/cases.js";

function mutations(seed: number, text: string): string {
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 4294967296;
  };
  const lines = text.split("\n");
  const count = 1 + Math.floor(random() * 6);
  for (let step = 0; step < count; step += 1) {
    const at = Math.floor(random() * lines.length);
    const roll = random();
    if (roll < 0.3) lines.splice(at, 1);
    else if (roll < 0.6) lines.splice(at, 0, `inserted ${step} "${seed}"`);
    else lines[at] = `${lines[at] ?? ""}x`.replace(/^(\s*)\S/, "$1y");
  }
  return lines.join(random() < 0.2 ? "\r\n" : "\n");
}

describe("text edits", () => {
  it("applies non-overlapping edits back to front", () => {
    expect(
      applyTextEdits("abcdef", [
        { start: 4, end: 6, insert: "XY" },
        { start: 0, end: 1, insert: "" },
        { start: 2, end: 2, insert: "-" },
      ]),
    ).toBe("b-cdXY");
  });

  it("refuses overlapping edits", () => {
    expect(() =>
      applyTextEdits("abcdef", [
        { start: 0, end: 3, insert: "" },
        { start: 2, end: 4, insert: "" },
      ]),
    ).toThrow(RangeError);
  });

  it("diffs a one-token change as one small edit", () => {
    const before = 'a = person "Alice"\nb = person "Bob"\n';
    const after = 'a = person "Alicia"\nb = person "Bob"\n';
    expect(diffTexts(before, after).edits).toEqual([{ start: 16, end: 17, insert: "ia" }]);
  });

  it("keeps the hunks of edits far apart separate", () => {
    const before = BIG_BANK;
    const after = before
      .replace("customer = person", "client = person")
      .replace(
        "autoLayout\n        }\n\n        systemcontext",
        "autoLayout lr\n        }\n\n        systemcontext",
      );
    expect(diffTexts(before, after).edits).toHaveLength(2);
  });

  it("round-trips seeded mutations exactly, inverse included", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const after = mutations(seed, BIG_BANK);
      const { edits, inverse } = diffTexts(BIG_BANK, after);
      expect(applyTextEdits(BIG_BANK, edits)).toBe(after);
      expect(applyTextEdits(after, inverse)).toBe(BIG_BANK);
      expect(invert(BIG_BANK, edits)).toEqual(inverse);
    }
  });

  it("has nothing to do for equal texts", () => {
    expect(diffTexts(BIG_BANK, BIG_BANK)).toEqual({ edits: [], inverse: [] });
  });
});
