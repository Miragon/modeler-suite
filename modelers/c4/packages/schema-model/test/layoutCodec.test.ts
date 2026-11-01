import { describe, expect, it } from "vitest";
import {
  decodeElementLayout,
  decodeVertices,
  elementLayoutKey,
  encodeElementLayout,
  encodeVertices,
  relationshipLayoutKey,
} from "../src/layoutCodec.js";

describe("element layout values (SPEC 3.6)", () => {
  it("writes the corner, and the size only when both sides are given", () => {
    expect(encodeElementLayout({ x: 280, y: 220 })).toBe("280,220");
    expect(encodeElementLayout({ x: -40, y: 0, width: 320, height: 200 })).toBe("-40,0,320,200");
    expect(encodeElementLayout({ x: 1, y: 2, width: 300 })).toBe("1,2");
  });

  it("rounds half away from zero and never writes -0", () => {
    expect(encodeElementLayout({ x: 2.5, y: -2.5 })).toBe("3,-3");
    expect(encodeElementLayout({ x: 1.4999, y: -1.4999 })).toBe("1,-1");
    expect(encodeElementLayout({ x: -0.4, y: -0 })).toBe("0,0");
  });

  it("reads what it writes", () => {
    for (const box of [
      { x: 0, y: 0 },
      { x: -120, y: 48 },
      { x: 8, y: 16, width: 240, height: 160 },
    ]) {
      expect(decodeElementLayout(encodeElementLayout(box))).toEqual(box);
    }
  });

  it("tolerates spaces and decimals written by hand", () => {
    expect(decodeElementLayout(" 10 , 20 ")).toEqual({ x: 10, y: 20 });
    expect(decodeElementLayout("10.6,-20.5,240,160")).toEqual({
      x: 11,
      y: -21,
      width: 240,
      height: 160,
    });
  });

  it.each([
    "",
    "12",
    "12,x",
    "1,2,3",
    "1,2,3,4,5",
    "1,2,0,10",
    "1,2,10,-5",
    "1;2",
    "NaN,1",
    "1e3,2",
  ])("treats %j as malformed", (value) => {
    expect(decodeElementLayout(value)).toBeUndefined();
  });
});

describe("relationship vertices (SPEC 3.6)", () => {
  it("writes points separated by one space", () => {
    expect(
      encodeVertices([
        { x: 10, y: 20 },
        { x: -30.5, y: 40.5 },
      ]),
    ).toBe("10,20 -31,41");
    expect(encodeVertices([])).toBe("");
  });

  it("reads what it writes, and an empty value as a straight line", () => {
    const points = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    expect(decodeVertices(encodeVertices(points))).toEqual(points);
    expect(decodeVertices("")).toEqual([]);
    expect(decodeVertices("  1,2   3,4 ")).toEqual(points);
  });

  it.each(["1", "1,2 3", "1,2,3", "a,b", "1,2;3,4"])("treats %j as malformed", (value) => {
    expect(decodeVertices(value)).toBeUndefined();
  });
});

describe("layout keys", () => {
  it("prefixes element ids and relationship keys", () => {
    expect(elementLayoutKey("shop.api")).toBe("c4modeler.element.shop.api");
    expect(relationshipLayoutKey("customer->shop")).toBe("c4modeler.relationship.customer->shop");
    expect(relationshipLayoutKey("implied:a->b")).toBe("c4modeler.relationship.implied:a->b");
  });
});
