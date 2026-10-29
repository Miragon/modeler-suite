import { describe, expect, it } from "vitest";
import { VALUE_CHAIN_THEMES } from "../src/appearance/themes.js";

/**
 * Guide §13.5: every host asks for the modes the canvas can draw, read from this one list, and the
 * Miragon modelers move from light only to `["light", "dark"]` together, never one of them alone.
 */
describe("VALUE_CHAIN_THEMES", () => {
  it("is light only, until the joint dark-mode release", () => {
    expect(VALUE_CHAIN_THEMES).toEqual(["light"]);
  });

  it("cannot be changed by a host that reads it", () => {
    expect(Object.isFrozen(VALUE_CHAIN_THEMES)).toBe(true);
  });
});
