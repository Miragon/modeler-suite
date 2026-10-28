import { describe, expect, it } from "vitest";
import {
  ALL_INTERACTION_SPECS,
  ALL_TEAM_SPECS,
  FLOW_SPEC,
} from "@miragon/team-topologies-schema-model";
import type { TtElement } from "../model/di-types.js";
import vendoredTokens from "../theme/cd-tokens.generated.json";
import { contrastRatio, interactionPaint, parseHexColour, type Rgb } from "./colour.js";
import { labelLayout } from "./label-layout.js";
import { STROKE_MUTED } from "./styles.js";

const TEXT_CONTRAST = 4.5;
const NON_TEXT_CONTRAST = 3;

const CANVAS_GROUND = vendoredTokens.hell["--cd-ui-grund"];

/**
 * The official Team-Shape-Templates strokes below 3:1 on the canvas ground. They stay as they are
 * for fidelity to the templates, an accepted exception (decided 2026-10-24 in #94) that the design
 * guide records for foreign notation in §10.6 since release 1.22.0. Their colours are
 * pinned too, so recolouring one of them fails like any new stroke below 3:1.
 */
const OFFICIAL_STROKES_BELOW_NON_TEXT_CONTRAST: Record<string, string> = {
  "stream-aligned": "#FFD966",
  enabling: "#D09CB7",
  "complicated-subsystem": "#E88814",
  platform: "#6D9EEB",
  "x-as-a-service": "#999696",
  facilitating: "#78996B",
};

function rgb(colour: string): Rgb {
  const parsed = parseHexColour(colour);
  if (!parsed) throw new Error(`expected a hex colour, got ${colour}`);
  return parsed;
}

function contrast(first: string, second: string): number {
  return contrastRatio(rgb(first), rgb(second));
}

function element(fields: Record<string, unknown>): TtElement {
  return { id: "element", x: 0, y: 0, width: 240, height: 96, ...fields } as unknown as TtElement;
}

describe("label text on the notation", () => {
  it.each(ALL_TEAM_SPECS.map((spec) => [spec.type, spec] as const))(
    "reaches 4.5:1 on the %s team fill",
    (_type, spec) => {
      const label = labelLayout(element({ ttKind: "team", teamType: spec.type }));
      expect(contrast(label.fill, spec.fill)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    },
  );

  // Interactions are drawn opaque, their fill premixed over white (guide §10.6), so their labels
  // sit on that fill whatever lies below: the ground, an exported SVG's white page or a team.
  it.each(ALL_INTERACTION_SPECS.map((spec) => [spec.mode, spec] as const))(
    "reaches 4.5:1 on the %s interaction's premixed fill",
    (_mode, spec) => {
      const label = labelLayout(element({ ttKind: "interaction", mode: spec.mode }));
      expect(contrast(label.fill, interactionPaint(spec).fill)).toBeGreaterThanOrEqual(
        TEXT_CONTRAST,
      );
    },
  );

  it.each(["flow", "annotation"])("reaches 4.5:1 for a %s on the canvas ground", (ttKind) => {
    const label = labelLayout(element({ ttKind }));
    expect(contrast(label.fill, CANVAS_GROUND)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });
});

describe("structural strokes on the canvas ground", () => {
  const strokes: ReadonlyArray<readonly [string, string]> = [
    ...ALL_TEAM_SPECS.map((spec) => [spec.type, spec.stroke] as const),
    ...ALL_INTERACTION_SPECS.map((spec) => [spec.mode, spec.stroke] as const),
    ["flow of change", FLOW_SPEC.stroke],
    ["annotation bracket and association", STROKE_MUTED],
  ];

  it("reach 3:1, except exactly the official Team-Shape-Templates strokes below it", () => {
    const below = Object.fromEntries(
      strokes
        .filter(([, stroke]) => contrast(stroke, CANVAS_GROUND) < NON_TEXT_CONTRAST)
        .map(([name, stroke]) => [name, stroke.toUpperCase()]),
    );
    expect(below).toEqual(OFFICIAL_STROKES_BELOW_NON_TEXT_CONTRAST);
  });
});
