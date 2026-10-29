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

  it("pairs shapes by distance, not by the order their positions sort in", () => {
    const columns: CanvasFacts = { shapes: 2, connections: 0, positions: ["100,50", "101,10"] };
    expect(similarCanvas(columns, { ...columns, positions: ["101,50", "100,10"] })).toBe(true);

    const apart: CanvasFacts = { shapes: 2, connections: 0, positions: ["100,0", "101,500"] };
    expect(similarCanvas(apart, { ...apart, positions: ["101,0", "100,500"] })).toBe(true);
  });

  it("gives every shape one partner, also where two shapes both fit one", () => {
    const close: CanvasFacts = { shapes: 2, connections: 0, positions: ["0,0", "2,0"] };

    expect(similarCanvas(close, { ...close, positions: ["2,0", "-2,0"] })).toBe(true);
    expect(similarCanvas(close, { ...close, positions: ["2,0", "10,0"] })).toBe(false);
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
