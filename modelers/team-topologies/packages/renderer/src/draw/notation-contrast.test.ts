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
import { interactionIconSvg, teamIconSvg } from "./palette-icons.js";
import { STROKE_MUTED } from "./styles.js";
import {
  HIGH_CONTRAST_UNDERLAY_CLASS,
  contourOnUnderlay,
  templateContoursOnUnderlay,
} from "./underlay.js";

const TEXT_CONTRAST = 4.5;
const NON_TEXT_CONTRAST = 3;

const CANVAS_GROUND = vendoredTokens.hell["--cd-ui-grund"];
/** What `cd-c-unterleger-hoch` draws under `data-cd-kontrast="hoch"` in light mode. */
const HIGH_CONTRAST_UNDERLAY = vendoredTokens.hochkontrast.hell["--cd-ui-kontur"];
/** The glass of palette and legend, opaque under high contrast (guide §5.3, §10.6). */
const PREVIEW_SURFACE = vendoredTokens.hell["--cd-ui-flaeche-hoch"];

/**
 * The official Team-Shape-Templates strokes below 3:1 on the canvas ground. They stay as they are
 * for fidelity to the templates, an accepted exception (decided 2026-10-24 in #94) that the design
 * guide records for foreign notation in §10.6 since release 1.22.0. Their colours are
 * pinned too, so recolouring one of them fails like any new stroke below 3:1. Under high contrast
 * each lies on an underlay (#213, guide 1.27.0).
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
  // sit on that fill whatever lies below: the ground or a team.
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

// Decided in #213, guide §10.6 since release 1.27.0: under data-cd-kontrast="hoch" each exempt
// stroke lies on an underlay in --cd-ui-kontur, so in high contrast no stroke stays below 3:1.
describe("the exempt strokes under high contrast", () => {
  const exempt = Object.values(OFFICIAL_STROKES_BELOW_NON_TEXT_CONTRAST);

  it("are exactly the template strokes the renderer draws on the high-contrast underlay", () => {
    expect(templateContoursOnUnderlay().sort()).toEqual([...exempt].sort());
  });

  it("lie on the underlay only as the template draws them, never in a colour the user set", () => {
    for (const stroke of exempt) {
      expect(contourOnUnderlay(stroke, undefined)).toBe(true);
      expect(contourOnUnderlay(stroke, stroke)).toBe(false);
    }
    expect(contourOnUnderlay(FLOW_SPEC.stroke, undefined)).toBe(false);
    expect(contourOnUnderlay(STROKE_MUTED, undefined)).toBe(false);
  });

  it.each(Object.entries(OFFICIAL_STROKES_BELOW_NON_TEXT_CONTRAST))(
    "reach 3:1 on their underlay: %s",
    (_name, stroke) => {
      expect(contrast(stroke, HIGH_CONTRAST_UNDERLAY)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
    },
  );

  it("on an underlay that itself reaches 3:1 on the canvas ground", () => {
    expect(contrast(HIGH_CONTRAST_UNDERLAY, CANVAS_GROUND)).toBeGreaterThanOrEqual(
      NON_TEXT_CONTRAST,
    );
  });
});

/** The shapes of a preview's markup with their attributes, in drawing order. */
function previewShapes(markup: string): Record<string, string>[] {
  return [...markup.matchAll(/<(?:polygon|rect|circle)\b([^>]*?)\/>/g)].map((shape) =>
    Object.fromEntries(
      [...shape[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name!, value!]),
    ),
  );
}

function geometry(shape: Record<string, string>): Record<string, string> {
  const painted = ["class", "fill", "stroke", "stroke-width", "stroke-dasharray"];
  return Object.fromEntries(Object.entries(shape).filter(([name]) => !painted.includes(name)));
}

// Guide §10.6 puts the notation previews of palette and legend (§5.5, §5.10) under the same
// exception as the canvas, the high-contrast underlay included.
describe("the notation previews of palette and legend under high contrast", () => {
  const previews = [
    ...ALL_TEAM_SPECS.map((spec) => [spec.type, spec.stroke, teamIconSvg(spec.type)] as const),
    ...ALL_INTERACTION_SPECS.map(
      (spec) => [spec.mode, spec.stroke, interactionIconSvg(spec.mode)] as const,
    ),
  ];
  const exempt = previews.filter(([name]) => name in OFFICIAL_STROKES_BELOW_NON_TEXT_CONTRAST);
  const others = previews.filter(([name]) => !(name in OFFICIAL_STROKES_BELOW_NON_TEXT_CONTRAST));

  it("lay exactly the exempt strokes on the underlay", () => {
    const onUnderlay = Object.fromEntries(
      previews
        .filter(([, , markup]) => markup.includes(HIGH_CONTRAST_UNDERLAY_CLASS))
        .map(([name, stroke]) => [name, stroke.toUpperCase()]),
    );
    expect(onUnderlay).toEqual(OFFICIAL_STROKES_BELOW_NON_TEXT_CONTRAST);
  });

  it.each(exempt)(
    "draw the %s contour above its fill, whose stroke is the underlay, 2px wider",
    (_name, stroke, markup) => {
      const [underlay, contour, ...rest] = previewShapes(markup);
      expect(rest).toEqual([]);
      expect(underlay).toMatchObject({ class: HIGH_CONTRAST_UNDERLAY_CLASS, stroke: "none" });
      expect(Number(underlay!["stroke-width"])).toBe(Number(contour!["stroke-width"]) + 2);
      expect(underlay!["stroke-dasharray"]).toBe(contour!["stroke-dasharray"]);
      expect(underlay!.fill).not.toBe("none");
      expect(contour).toMatchObject({ fill: "none", stroke });
      expect(contour!.class).toBeUndefined();
      expect(geometry(underlay!)).toEqual(geometry(contour!));
    },
  );

  it.each(others)(
    "draw the %s preview as one shape, without an underlay",
    (_name, stroke, markup) => {
      const shapes = previewShapes(markup);
      expect(shapes).toHaveLength(1);
      expect(shapes[0]).toMatchObject({ stroke });
      expect(shapes[0]!.class).toBeUndefined();
    },
  );

  it("on an underlay that reaches 3:1 on the previews' surface", () => {
    expect(contrast(HIGH_CONTRAST_UNDERLAY, PREVIEW_SURFACE)).toBeGreaterThanOrEqual(
      NON_TEXT_CONTRAST,
    );
  });
});
