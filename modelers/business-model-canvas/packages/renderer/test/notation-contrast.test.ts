import { describe, expect, test } from "vitest";
import { TAPE_COLORS, contrastRatio } from "@miragon/business-model-canvas-schema-model";
import tokens from "../src/theme/cd-tokens.generated.json" with { type: "json" };

const light = tokens.hell;
const ground = light["--cd-ui-grund"];
/** Every sticky is white paper (guide §10.1); its colour is the tape. */
const paper = light["--cd-ui-plot"];

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

type Matrix = readonly (readonly [number, number, number])[];

/** Machado, Oliveira and Fernandes (2009), each deficiency at full severity, on linear RGB. */
const COLOUR_VISION: Record<string, Matrix> = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** CIELAB of a colour as a person with the deficiency sees it. */
function simulatedLab(hex: string, matrix: Matrix): [number, number, number] {
  const lin = rgb(hex).map(linear);
  const [r, g, b] = matrix.map((row) =>
    Math.min(1, Math.max(0, row[0] * lin[0]! + row[1] * lin[1]! + row[2] * lin[2]!)),
  ) as [number, number, number];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** ΔE76 that keeps two colours apart for a person with a colour-vision deficiency. */
const DISTINCT_FOR_COLOUR_VISION = 10;

describe("the tape colours", () => {
  test.each(TAPE_COLORS)("$name holds 3:1 on the paper and the ground", ({ tape }) => {
    expect(contrastRatio(tape, paper)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(tape, ground)).toBeGreaterThanOrEqual(3);
  });

  test.each(Object.keys(COLOUR_VISION))("stay apart for a person with %s", (deficiency) => {
    const matrix = COLOUR_VISION[deficiency]!;
    const tapes = TAPE_COLORS.map((color) => color.tape);
    for (const [index, tape] of tapes.entries()) {
      for (const other of tapes.slice(index + 1)) {
        const [first, second] = [simulatedLab(tape, matrix), simulatedLab(other, matrix)];
        const distance = Math.hypot(...first.map((value, axis) => value - second[axis]!));
        expect(distance, `${tape} and ${other}`).toBeGreaterThan(DISTINCT_FOR_COLOUR_VISION);
      }
    }
  });

  test("light and dark tapes alternate, so neighbours differ in lightness", () => {
    const ratios = TAPE_COLORS.map(({ tape }) => contrastRatio(tape, paper));
    for (const [index, ratio] of ratios.slice(1).entries()) {
      expect(Math.abs(ratio - ratios[index]!), TAPE_COLORS[index + 1]!.name).toBeGreaterThan(1);
    }
  });
});
