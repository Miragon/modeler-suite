import { describe, expect, it } from "vitest";
import type { Box } from "@miragon/c4-schema-model";
import { boxAround, findFreeSpot, panToShow, type FreeSpotQuery } from "../src/palette/freeSpot.js";

const SIZE = { width: 240, height: 160 };
const AREA: Box = { x: 0, y: 0, width: 1200, height: 800 };
const CENTRE = { x: 600, y: 400 };

function query(obstacles: readonly Box[], more: Partial<FreeSpotQuery> = {}): FreeSpotQuery {
  return { centre: CENTRE, size: SIZE, area: AREA, obstacles, gap: 48, step: 24, ...more };
}

function clearOf(box: Box, obstacle: Box, gap: number): boolean {
  return (
    box.x + box.width + gap <= obstacle.x ||
    obstacle.x + obstacle.width + gap <= box.x ||
    box.y + box.height + gap <= obstacle.y ||
    obstacle.y + obstacle.height + gap <= box.y
  );
}

describe("findFreeSpot: where a keyboard create lands (guide §5.5)", () => {
  it("takes the centre of the free area when nothing is near it", () => {
    expect(findFreeSpot(query([{ x: 0, y: 0, width: 100, height: 100 }]))).toEqual(CENTRE);
  });

  it("steps 24 units down and right past an element on the centre, until its box is clear", () => {
    const element = boxAround(CENTRE, SIZE);
    const spot = findFreeSpot(query([element]));
    expect(spot.x - CENTRE.x).toBe(spot.y - CENTRE.y);
    expect((spot.x - CENTRE.x) % 24).toBe(0);
    expect(clearOf(boxAround(spot, SIZE), element, 48)).toBe(true);
    const oneStepLess = { x: spot.x - 24, y: spot.y - 24 };
    expect(clearOf(boxAround(oneStepLess, SIZE), element, 48)).toBe(false);
  });

  it("an element merely beside the centre, not on it, still moves the new one clear of it", () => {
    const beside = { x: CENTRE.x + 100, y: CENTRE.y - 40, width: 240, height: 160 };
    const spot = findFreeSpot(query([beside]));
    expect(clearOf(boxAround(spot, SIZE), beside, 48)).toBe(true);
  });

  it("when the diagonal runs out of view, takes the visible spot nearest the centre", () => {
    const wall = { x: CENTRE.x - 130, y: CENTRE.y - 90, width: 2000, height: 2000 };
    const spot = findFreeSpot(query([wall]));
    const box = boxAround(spot, SIZE);
    expect(clearOf(box, wall, 48)).toBe(true);
    expect(box.x).toBeGreaterThanOrEqual(AREA.x);
    expect(box.y).toBeGreaterThanOrEqual(AREA.y);
    expect(Math.hypot(spot.x - CENTRE.x, spot.y - CENTRE.y)).toBeLessThan(300);
  });

  it("skips a spot the further check refuses, a frame grown over a stranger", () => {
    const spot = findFreeSpot(query([], { accepts: (box) => box.x > CENTRE.x }));
    expect(boxAround(spot, SIZE).x).toBeGreaterThan(CENTRE.x);
  });

  it("takes a spot clear by a narrower gap before one that touches or covers something", () => {
    const left = { x: -1000, y: -1000, width: 1470, height: 3000 };
    const right = { x: 730, y: -1000, width: 1470, height: 3000 };
    const spot = findFreeSpot(query([left, right]));
    const box = boxAround(spot, SIZE);
    expect(clearOf(box, left, 0) && clearOf(box, right, 0)).toBe(true);
  });

  it("stays in view where it covers the least when no spot in view is clear", () => {
    const everything = { x: -5000, y: -5000, width: 10_000, height: 10_000 };
    const holes = [{ x: 0, y: 0, width: 1200, height: 380 }];
    const spot = findFreeSpot(query([everything]));
    expect(spot).toEqual(CENTRE);
    const partly = findFreeSpot(query(holes));
    const box = boxAround(partly, SIZE);
    expect(box.y).toBeGreaterThanOrEqual(380 + 48);
    expect(box.y + box.height).toBeLessThanOrEqual(AREA.y + AREA.height);
  });

  it("zoomed into a crowded view, takes the clear spot nearest out of sight, never an overlap", () => {
    const crowd: Box[] = [];
    for (let x = -120; x < 1300; x += 260) {
      for (let y = -80; y < 900; y += 180) crowd.push({ x, y, width: 240, height: 160 });
    }
    const beyond = { area: { x: -1200, y: -1200, width: 3600, height: 3200 }, step: 48 };
    const spot = findFreeSpot(query(crowd, { beyond }));
    const box = boxAround(spot, SIZE);
    expect(crowd.every((element) => clearOf(box, element, 48))).toBe(true);
    const inView = box.x >= AREA.x && box.x + box.width <= AREA.x + AREA.width;
    expect(inView && box.y >= AREA.y && box.y + box.height <= AREA.y + AREA.height).toBe(false);
  });

  it("keeps to the view while it has a spot clear by a gap, the search beyond notwithstanding", () => {
    const element = boxAround(CENTRE, SIZE);
    const beyond = { area: { x: -1200, y: -1200, width: 3600, height: 3200 }, step: 48 };
    expect(findFreeSpot(query([element], { beyond }))).toEqual(findFreeSpot(query([element])));
  });
});

describe("panToShow: bringing a spot out of sight into the free area", () => {
  it("pans nothing for a box the area shows", () => {
    expect(panToShow(AREA, { x: 100, y: 100, width: 240, height: 160 })).toEqual({ x: 0, y: 0 });
  });

  it("brings a box out of sight to the middle of the area", () => {
    expect(panToShow(AREA, { x: 1100, y: 100, width: 240, height: 160 })).toEqual({
      x: 1100 + 120 - 600,
      y: 100 + 80 - 400,
    });
  });
});
