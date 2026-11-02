import { describe, expect, it } from "vitest";
import type { Box } from "@miragon/c4-schema-model";
import { chipPlace, type ChipSurroundings } from "../src/frame-preview/chipPlace.js";

const CHIP = { width: 120, height: 24 };
const OFFSET = 6;
const FRAME: Box = { x: 100, y: 100, width: 600, height: 400 };
const VISIBLE: Box = { x: 0, y: 0, width: 1000, height: 800 };
/** A breadcrumb over the row above the frame's top left. */
const CRUMB: Box = { x: 0, y: 60, width: 400, height: 40 };

const around = (...chrome: Box[]): ChipSurroundings => ({ chrome, visible: VISIBLE });
const boundary = { box: FRAME, roomInside: true };

describe("chipPlace (a frame's warning chip clear of the host's chrome)", () => {
  it("stays above the frame's top left where nothing covers it", () => {
    expect(chipPlace(boundary, CHIP, OFFSET, around())).toEqual({ x: 100, y: 70 });
    expect(chipPlace(boundary, CHIP, OFFSET, undefined)).toEqual({ x: 100, y: 70 });
  });

  it("slides right along the frame's top past the chrome over it", () => {
    expect(chipPlace(boundary, CHIP, OFFSET, around(CRUMB))).toEqual({ x: 400, y: 70 });
    const island = { x: 400, y: 0, width: 100, height: 90 };
    expect(chipPlace(boundary, CHIP, OFFSET, around(CRUMB, island))).toEqual({ x: 500, y: 70 });
  });

  it("goes below the frame where the chrome runs along all of its top", () => {
    const wide = { ...CRUMB, width: 680 };
    expect(chipPlace(boundary, CHIP, OFFSET, around(wide))).toEqual({ x: 100, y: 506 });
  });

  it("goes below a frame narrower than the chip where the chrome covers the place above", () => {
    const narrow = { box: { x: 100, y: 100, width: 200, height: 300 }, roomInside: true };
    const wide = { width: 300, height: 24 };
    expect(chipPlace(narrow, wide, OFFSET, around(CRUMB))).toEqual({ x: 100, y: 406 });
    expect(chipPlace(narrow, wide, OFFSET, around())).toEqual({ x: 100, y: 70 });
  });

  it("goes just inside a boundary's top edge where above and below are out of sight", () => {
    const tall = { box: { x: 100, y: 20, width: 600, height: 760 }, roomInside: true };
    expect(chipPlace(tall, CHIP, OFFSET, around())).toEqual({ x: 106, y: 26 });
    expect(chipPlace({ ...tall, roomInside: false }, CHIP, OFFSET, around())).toEqual({
      x: 100,
      y: -10,
    });
  });

  it("comes into sight where the frame's left edge is scrolled out", () => {
    const scrolled = { box: { ...FRAME, x: -200 }, roomInside: true };
    expect(chipPlace(scrolled, CHIP, OFFSET, around())).toEqual({ x: 0, y: 70 });
  });

  it("keeps the place above the top left where no spot is clear", () => {
    const everywhere = { x: -100, y: -100, width: 1200, height: 1000 };
    expect(chipPlace(boundary, CHIP, OFFSET, around(everywhere))).toEqual({ x: 100, y: 70 });
  });
});
