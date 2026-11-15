import { describe, expect, it } from "vitest";

import { EDITOR_INSETS, fitBox, type FitBox, type Insets } from "../src/index.js";

const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** where a point of the diagram lands in the element, under a viewbox of that element */
function onScreen(box: FitBox, size: { width: number }, point: { x: number; y: number }) {
  const scale = size.width / box.width;
  return { x: (point.x - box.x) * scale, y: (point.y - box.y) * scale };
}

describe("fitBox", () => {
  it("leaves the default room for a renderer's own palette", () => {
    expect(EDITOR_INSETS).toEqual({ top: 64, right: 24, bottom: 24, left: 24 });
  });

  it("centres content that is smaller than the free area at 100 %", () => {
    const size = { width: 800, height: 500 };
    const box = fitBox({ x: 100, y: 50, width: 200, height: 100 }, size, EDITOR_INSETS);

    // the viewbox has the element's own size: one diagram unit is one px
    expect(box).toMatchObject({ width: 800, height: 500 });
    // the content's middle is the middle of what the insets leave free
    const middle = onScreen(box as FitBox, size, { x: 200, y: 100 });
    expect(middle).toEqual({ x: 24 + (800 - 48) / 2, y: 64 + (500 - 88) / 2 });
  });

  it("scales content that is larger down until it lies inside the insets", () => {
    const size = { width: 400, height: 300 };
    const bounds = { x: -500, y: 200, width: 2000, height: 600 };
    const box = fitBox(bounds, size, EDITOR_INSETS) as FitBox;

    const scale = size.width / box.width;
    expect(scale).toBeCloseTo((400 - 48) / 2000, 10);
    expect(box.height).toBeCloseTo(300 / scale, 8);
    const topLeft = onScreen(box, size, { x: bounds.x, y: bounds.y });
    const bottomRight = onScreen(box, size, { x: bounds.x + 2000, y: bounds.y + 600 });
    expect(topLeft.x).toBeCloseTo(24, 8);
    expect(bottomRight.x).toBeCloseTo(400 - 24, 8);
    // the wider side decides; the other one is centred in its free extent
    expect(topLeft.y).toBeGreaterThan(64);
    expect(topLeft.y - 64).toBeCloseTo(300 - 24 - bottomRight.y, 8);
  });

  it("takes an entry's own insets: a palette column at the left moves the content right", () => {
    const size = { width: 600, height: 400 };
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const column: Insets = { top: 24, right: 24, bottom: 24, left: 120 };
    const withRow = onScreen(fitBox(bounds, size, EDITOR_INSETS) as FitBox, size, { x: 0, y: 0 });
    const withColumn = onScreen(fitBox(bounds, size, column) as FitBox, size, { x: 0, y: 0 });

    expect(withColumn.x - withRow.x).toBe((120 - 24) / 2);
    expect(withRow.y - withColumn.y).toBe((64 - 24) / 2);
  });

  it("fits into the whole element along a side the insets leave nothing of", () => {
    const size = { width: 40, height: 300 };
    const box = fitBox({ x: 0, y: 0, width: 80, height: 10 }, size, EDITOR_INSETS) as FitBox;

    // 48 px of insets in a width of 40: the width counts whole
    expect(size.width / box.width).toBeCloseTo(0.5, 10);
    expect(onScreen(box, size, { x: 0, y: 0 }).x).toBeCloseTo(0, 8);
  });

  it("fits a line by the one extent it has", () => {
    const size = { width: 300, height: 300 };
    const box = fitBox({ x: 0, y: 40, width: 600, height: 0 }, size, NONE) as FitBox;

    expect(size.width / box.width).toBe(0.5);
    expect(onScreen(box, size, { x: 0, y: 40 })).toEqual({ x: 0, y: 150 });
  });

  it("answers nothing for an element without a size, as a hidden one reports it", () => {
    const bounds = { x: 0, y: 0, width: 10, height: 10 };
    expect(fitBox(bounds, { width: 0, height: 300 }, NONE)).toBeUndefined();
    expect(fitBox(bounds, { width: 300, height: 0 }, NONE)).toBeUndefined();
    expect(fitBox(bounds, { width: Number.NaN, height: 300 }, NONE)).toBeUndefined();
  });

  it("answers nothing for content without an extent or with a box that is no number", () => {
    const size = { width: 300, height: 300 };
    expect(fitBox({ x: 5, y: 5, width: 0, height: 0 }, size, NONE)).toBeUndefined();
    expect(fitBox({ x: Number.NaN, y: 0, width: 10, height: 10 }, size, NONE)).toBeUndefined();
    expect(
      fitBox({ x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10 }, size, NONE),
    ).toBeUndefined();
  });
});
