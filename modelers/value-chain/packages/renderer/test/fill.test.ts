import { describe, expect, it } from "vitest";
import { fest } from "../src/theme/cd-tokens.generated.json";
import { shapeColors } from "../src/draw/fill.js";
import { COLORS } from "../src/draw/styles.js";

/**
 * Without a 2D canvas (jsdom, a server-side render) the browser cannot read a colour, but hex and
 * rgb() still fill the shape, as the picker writes hex.
 */
describe("shape colours without a 2D canvas", () => {
  it("still fill the shape with hex and rgb() colours, with no role class", () => {
    expect(shapeColors(fest["--cd-blau"])).toEqual({
      fill: fest["--cd-blau"],
      label: fest["--cd-weiss"],
      halo: fest["--cd-blau"],
    });
    expect(shapeColors("rgb(255, 176, 0)")).toEqual({
      fill: fest["--cd-warning"],
      label: fest["--cd-schwarz"],
      halo: fest["--cd-warning"],
    });
  });

  it("draw every other value and no value as Default, in the roles", () => {
    const fallback = {
      fill: COLORS.fill,
      label: COLORS.ink,
      halo: COLORS.fill,
      roles: { fill: "cd-c-fill-plot", label: "cd-c-fill-text", halo: "cd-c-stroke-plot" },
    };
    expect(shapeColors(undefined)).toEqual(fallback);
    expect(shapeColors("hsl(205, 100%, 45%)")).toEqual(fallback);
    expect(shapeColors("not a colour")).toEqual(fallback);
  });
});
