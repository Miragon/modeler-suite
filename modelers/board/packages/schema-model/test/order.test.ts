import { describe, expect, test } from "vitest";
import { fractionalIndexBetween } from "../src/index.js";

describe("fractionalIndexBetween", () => {
  test("a first key, a key before it, after it and between two", () => {
    const first = fractionalIndexBetween();
    const before = fractionalIndexBetween(undefined, first);
    const after = fractionalIndexBetween(first);
    expect(before < first && first < after).toBe(true);
    const between = fractionalIndexBetween(before, first);
    expect(before < between && between < first).toBe(true);
  });

  test("fifty keys in a row, each between the last and a fixed upper one, stay in order", () => {
    const upper = fractionalIndexBetween(fractionalIndexBetween());
    let low = "";
    for (let step = 0; step < 50; step++) {
      const next = fractionalIndexBetween(low, upper);
      expect(low === "" || low < next, `step ${step}: '${low}' < '${next}'`).toBe(true);
      expect(next < upper, `step ${step}: '${next}' < '${upper}'`).toBe(true);
      // a key that ended in the lowest digit would leave no room before it
      expect(next.endsWith("0")).toBe(false);
      low = next;
    }
  });

  test("neighbouring digits and a carry over the highest digit stay inside the bounds", () => {
    const neighbours = fractionalIndexBetween("a", "b");
    expect(neighbours > "a" && neighbours < "b").toBe(true);
    const carried = fractionalIndexBetween("azz", "b");
    expect(carried > "azz" && carried < "b").toBe(true);
  });

  test("bounds out of order and bounds with nothing between them throw", () => {
    expect(() => fractionalIndexBetween("b", "a")).toThrow(/out of order/);
    expect(() => fractionalIndexBetween("a", "a")).toThrow(/out of order/);
    expect(() => fractionalIndexBetween("a", "a0")).toThrow(/no key exists/);
  });
});
