import { describe, expect, it } from "vitest";
import { C4_COLOUR_STYLES } from "../src/notation.js";
import { resolveElementStyle } from "../src/styles.js";
import type { ElementStyle, Styles } from "../src/types.js";
import { system } from "./support/model.js";
import { NON_TEXT_CONTRAST, TEXT_CONTRAST, contrast } from "./support/contrast.js";

/** The light values of `--cd-ui-grund`, `--cd-ui-plot`, `--cd-ui-text` (design system 1.27). */
const GROUND = "#F9F7F7";
const PLOT = "#FFFFFF";
const INK = "#1D1D1D";
const INTERACTION = ["#335DE5", "#2B50D4"];
const HOVER = "#EEF1FD";

function styled(style: Omit<ElementStyle, "tag">) {
  const styles: Styles = {
    elements: [{ tag: "Painted", ...style }],
    relationships: [],
    themes: [],
  };
  return resolveElementStyle(system("s", { tags: ["Painted"] }), styles);
}

describe('the C4 colours of "Apply C4 colours" (SPEC 6.4): text 4.5:1, lines 3:1, no exception', () => {
  it("pins the tuned palette", () => {
    expect(C4_COLOUR_STYLES).toEqual([
      { tag: "Person", background: "#08427B", color: "#FFFFFF", stroke: "#052E57" },
      { tag: "Software System", background: "#1168BD", color: "#FFFFFF", stroke: "#0B4F91" },
      { tag: "Container", background: "#2D72B8", color: "#FFFFFF", stroke: "#1F5A96" },
      { tag: "Component", background: "#85BBF0", color: "#1D1D1D", stroke: "#4F86C0" },
      { tag: "Existing System", background: "#6B6B6B", color: "#FFFFFF", stroke: "#4D4D4D" },
    ]);
  });

  it.each([
    ["Person", 10.12, 12.82, 13.68],
    ["Software System", 5.62, 7.74, 8.26],
    ["Container", 4.99, 6.64, 7.09],
    ["Component", 8.32, 3.57, 3.82],
    ["Existing System", 5.33, 7.92, 8.45],
  ])("%s measures as the table says", (tag, text, strokeOnGround, strokeOnPlot) => {
    const style = C4_COLOUR_STYLES.find((entry) => entry.tag === tag)!;
    expect(contrast(style.color, style.background)).toBeCloseTo(text, 2);
    expect(contrast(style.stroke, GROUND)).toBeCloseTo(strokeOnGround, 2);
    expect(contrast(style.stroke, PLOT)).toBeCloseTo(strokeOnPlot, 2);
    expect(contrast(style.color, style.background)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(contrast(style.stroke, GROUND)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
  });

  it("keeps clear of selection, link and hover colours", () => {
    for (const style of C4_COLOUR_STYLES) {
      for (const colour of [style.background, style.stroke]) {
        expect(INTERACTION.map((value) => value.toLowerCase())).not.toContain(colour.toLowerCase());
        expect(
          contrast(colour, HOVER),
          `${style.tag} ${colour} near the hover tint`,
        ).toBeGreaterThan(1.5);
      }
    }
  });

  it("draws exactly the written colours: the cascade adjusts none of them", () => {
    for (const style of C4_COLOUR_STYLES) {
      const resolved = styled({
        background: style.background.toLowerCase(),
        color: style.color.toLowerCase(),
        stroke: style.stroke.toLowerCase(),
      });
      expect([resolved.fill, resolved.text, resolved.stroke]).toEqual(
        [style.background, style.color, style.stroke].map((value) => value.toLowerCase()),
      );
    }
  });
});

describe("the derived-stroke rule for a self-set fill without a stroke (SPEC 6.4)", () => {
  it.each([
    ["#08427b", "#0c3b68"],
    ["#1168bd", "#13599d"],
    ["#438dd5", "#3b77b0"],
    ["#85bbf0", "#668cb1"],
    ["#999999", "#808080"],
    ["#ffffff", "#8e8e8e"],
  ])("%s gets %s, mixed toward the ink until it holds 3:1 on the ground", (background, stroke) => {
    expect(styled({ background }).stroke).toBe(stroke);
    expect(contrast(stroke, GROUND)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
  });

  it("holds 3:1 on the ground for every fill, and takes the better of ink and white for its text", () => {
    const steps = ["00", "33", "66", "99", "cc", "ff"];
    for (const red of steps) {
      for (const green of steps) {
        for (const blue of steps) {
          const background = `#${red}${green}${blue}`;
          const resolved = styled({ background });
          expect(contrast(resolved.stroke!, GROUND), background).toBeGreaterThanOrEqual(
            NON_TEXT_CONTRAST,
          );
          const best = contrast(INK, background) >= contrast(PLOT, background) ? INK : PLOT;
          expect(resolved.text, background).toBe(best.toLowerCase());
        }
      }
    }
  });

  it("keeps a written text colour that reaches 4.5:1 and replaces one that does not", () => {
    expect(styled({ background: "#1168bd", color: "#ffffff" }).text).toBe("#ffffff");
    expect(styled({ background: "#438dd5", color: "#ffffff" }).text).toBe("#1d1d1d");
    expect(styled({ color: "#999999" }).text).toBe("#1d1d1d");
    expect(styled({ color: "#6b6666" }).text).toBe("#6b6666");
  });

  it("keeps a written stroke as it is stored (G §10.6)", () => {
    expect(styled({ background: "#ffffff", stroke: "#eeeeee" }).stroke).toBe("#eeeeee");
  });
});
