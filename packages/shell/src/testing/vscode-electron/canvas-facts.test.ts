import { describe, expect, it } from "vitest";

import { describeCanvas, sameCanvas, similarCanvas } from "./canvas-facts.js";
import type { CanvasFacts } from "./webview.js";

const canvas: CanvasFacts = {
  shapes: 3,
  connections: 1,
  positions: ["-40,12", "100,0", "100,20"],
};

describe("sameCanvas", () => {
  it("needs the same shapes, connections and positions", () => {
    expect(sameCanvas(canvas, { ...canvas })).toBe(true);
    expect(sameCanvas(canvas, { ...canvas, connections: 2 })).toBe(false);
    expect(sameCanvas(canvas, { ...canvas, positions: ["-40,12", "100,0", "101,20"] })).toBe(false);
  });
});

describe("similarCanvas", () => {
  it("takes every shape up to two pixels off, whichever order the positions sort in", () => {
    expect(similarCanvas(canvas, { ...canvas, positions: ["-42,14", "98,2", "102,18"] })).toBe(
      true,
    );
    expect(similarCanvas(canvas, { ...canvas, positions: ["102,18", "-42,14", "98,2"] })).toBe(
      true,
    );
  });

  it("fails a shape three pixels off, another count and another number of positions", () => {
    expect(similarCanvas(canvas, { ...canvas, positions: ["-40,12", "100,0", "100,23"] })).toBe(
      false,
    );
    expect(similarCanvas(canvas, { ...canvas, shapes: 4 })).toBe(false);
    expect(similarCanvas(canvas, { ...canvas, connections: 0 })).toBe(false);
    expect(similarCanvas(canvas, { ...canvas, positions: ["-40,12", "100,0"] })).toBe(false);
  });
});

describe("describeCanvas", () => {
  it("counts shapes and connections", () => {
    expect(describeCanvas(canvas)).toBe("3 shapes and 1 connections");
  });
});
