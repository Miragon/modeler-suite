import { afterEach, describe, expect, it } from "vitest";
import { C4_COLOUR_STYLES } from "@miragon/c4-schema-model";
import vendoredTokens from "../../src/theme/cd-tokens.generated.json";
import {
  EVERY_SHAPE,
  LONG_DESCRIPTION,
  boundary,
  c4Colours,
  element,
  group,
  relationship,
  scene,
  type ElementSpec,
} from "../support/handBuiltScenes.js";
import type { Scene } from "../../src/scene/types.js";
import { destroyDrawings, mountDrawing, type MountedDrawing } from "./support/drawingHarness.js";
import { NON_TEXT_CONTRAST, TEXT_CONTRAST, pairBelow } from "./support/drawingContrast.js";

afterEach(destroyDrawings);

/** Guide §10.6: a line is measured against the resting surface, on the canvas the ground. */
const GROUND = vendoredTokens.hell["--cd-ui-grund"];
const DECORATIVE_LINE = vendoredTokens.hell["--cd-ui-linie"];

function paint(node: Element, property: "fill" | "stroke"): string {
  return getComputedStyle(node)[property];
}

function failures(pairs: readonly (string | undefined)[]): string[] {
  return pairs.filter((pair): pair is string => pair !== undefined);
}

/**
 * An element: the outline 3:1 on the ground; every text 4.5:1 and every inner line or mark 3:1 on
 * the body's fill; the badge's icon 3:1 and its count 4.5:1 on the chip, whose border is the
 * decorative `linie` (guide §3.2, no contrast claim).
 */
function elementFailures(drawing: MountedDrawing, id: string, backdrop = GROUND): string[] {
  const visual = drawing.visual(id);
  const bodies = [...visual.querySelectorAll(".c4-body")];
  expect(bodies.length, `${id} has a body`).toBeGreaterThan(0);
  const fill = paint(bodies[0]!, "fill");
  const pairs = bodies.map((body) =>
    pairBelow(`${id} outline`, paint(body, "stroke"), backdrop, NON_TEXT_CONTRAST),
  );
  for (const detail of visual.querySelectorAll(".c4-detail")) {
    const property = detail.tagName === "circle" ? "fill" : "stroke";
    pairs.push(
      pairBelow(`${id} ${detail.tagName}`, paint(detail, property), fill, NON_TEXT_CONTRAST),
    );
  }
  for (const text of visual.querySelectorAll(":scope > text")) {
    pairs.push(pairBelow(`${id} "${text.textContent}"`, paint(text, "fill"), fill, TEXT_CONTRAST));
  }
  const badge = visual.querySelector(".c4-drill");
  if (badge) {
    const chip = badge.querySelector("rect")!;
    const chipFill = paint(chip, "fill");
    expect(paint(chip, "stroke"), `${id} badge border`).toBe(rgb(DECORATIVE_LINE));
    for (const stroke of badge.querySelectorAll("circle, line")) {
      pairs.push(
        pairBelow(`${id} badge icon`, paint(stroke, "stroke"), chipFill, NON_TEXT_CONTRAST),
      );
    }
    for (const count of badge.querySelectorAll("text")) {
      pairs.push(pairBelow(`${id} badge count`, paint(count, "fill"), chipFill, TEXT_CONTRAST));
    }
  }
  return failures(pairs);
}

/** A boundary: its outline 3:1 on the ground, its caption 4.5:1 on its fill or the ground. */
function boundaryFailures(drawing: MountedDrawing, id: string): string[] {
  const visual = drawing.visual(`boundary:${id}`);
  const frame = visual.querySelector(".c4-frame")!;
  const fill = frame.getAttribute("fill") === "none" ? GROUND : paint(frame, "fill");
  return failures([
    pairBelow(`${id} boundary outline`, paint(frame, "stroke"), GROUND, NON_TEXT_CONTRAST),
    ...[...visual.querySelectorAll("text")].map((text) =>
      pairBelow(`${id} caption "${text.textContent}"`, paint(text, "fill"), fill, TEXT_CONTRAST),
    ),
  ]);
}

/** A relationship: line and chevron 3:1 on the ground, the label 4.5:1 on its ground. */
function relationshipFailures(drawing: MountedDrawing, key: string): string[] {
  const visual = drawing.visual(`rel:${key}`);
  const label = drawing.label(`rel:${key}`);
  const ground = label.querySelector(".c4-label-ground");
  const labelGround = ground ? paint(ground, "fill") : GROUND;
  return failures([
    ...[...visual.querySelectorAll(".c4-line, .c4-arrow")].map((line) =>
      pairBelow(
        `${key} ${line.getAttribute("class")}`,
        paint(line, "stroke"),
        GROUND,
        NON_TEXT_CONTRAST,
      ),
    ),
    ...[...label.querySelectorAll("text")].map((text) =>
      pairBelow(`${key} "${text.textContent}"`, paint(text, "fill"), labelGround, TEXT_CONTRAST),
    ),
  ]);
}

/** The layers: group frames 3:1, group names and the title 4.5:1, all on the ground. */
function layerFailures(drawing: MountedDrawing): string[] {
  const frames = drawing.canvas.getLayer("c4-frames");
  const title = drawing.canvas.getLayer("c4-title");
  return failures([
    ...[...frames.querySelectorAll(".c4-frame")].map((frame) =>
      pairBelow("group frame", paint(frame, "stroke"), GROUND, NON_TEXT_CONTRAST),
    ),
    ...[...frames.querySelectorAll("text"), ...title.querySelectorAll("text")].map((text) =>
      pairBelow(`"${text.textContent}"`, paint(text, "fill"), GROUND, TEXT_CONTRAST),
    ),
  ]);
}

function rgb(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

function everyShape(style: (index: number) => ElementSpec["style"]): Scene {
  const items = EVERY_SHAPE.map((shape, index) =>
    element(`shape-${index}`, {
      shape,
      kind: index % 3 === 0 ? "container" : "softwareSystem",
      technology: "Java",
      description: LONG_DESCRIPTION,
      at: { x: (index % 5) * 300, y: Math.floor(index / 5) * 300 },
      drill: { target: "Containers", childCount: index },
      style: style(index) ?? {},
    }),
  );
  return scene({
    elements: items,
    relationships: [
      relationship(items[0]!, items[1]!, { description: "Uses", technology: "HTTPS" }),
      relationship(items[5]!, items[6]!, {
        description: "Reads from",
        style: {
          stroke: C4_COLOUR_STYLES[2]!.stroke,
          text: C4_COLOUR_STYLES[2]!.stroke,
          line: "solid",
        },
      }),
      relationship(items[10]!, items[11]!, { technology: "SMTP", style: { line: "dotted" } }),
    ],
    boundaries: [
      boundary("system", { x: -40, y: -40, width: 1540, height: 700 }),
      boundary(
        "coloured",
        { x: -60, y: -60, width: 1600, height: 1400 },
        {
          typeLine: "[Container: Java]",
          style: { fill: "#F5F9FF", stroke: "#1F5A96", text: "#1D1D1D", border: "solid" },
        },
      ),
    ],
    groups: [group("Team", { x: -20, y: 640, width: 900, height: 600 })],
    title: "Container diagram for Internet Banking System",
    description: "Every shape of the notation, in the default look and in the C4 colours.",
  });
}

function everyFailure(drawing: MountedDrawing, shown: Scene): string[] {
  return [
    ...shown.elements.flatMap(({ id }) => elementFailures(drawing, id)),
    ...shown.boundaries.flatMap(({ id }) => boundaryFailures(drawing, id)),
    ...shown.relationships.flatMap(({ canvasKey }) => relationshipFailures(drawing, canvasKey)),
    ...layerFailures(drawing),
  ];
}

describe("notation contrast on the canvas, measured (SPEC 6.4, guide §3.7, §10.6)", () => {
  it("in the default look, every text reaches 4.5:1 and every line 3:1", () => {
    const shown = everyShape(() => ({}));
    const drawing = mountDrawing(shown);
    expect(drawing.canvas.getLayer("c4-title").querySelectorAll("text").length).toBe(2);
    expect(drawing.container.querySelectorAll(".djs-visual text").length).toBeGreaterThan(80);
    expect(drawing.container.querySelectorAll(".djs-visual .c4-drill").length).toBe(
      shown.elements.length,
    );
    expect(everyFailure(drawing, shown)).toEqual([]);
  });

  it("in the C4 colours of every tag, every text reaches 4.5:1 and every line 3:1", () => {
    const tags = C4_COLOUR_STYLES.map((style) => style.tag);
    const shown = everyShape((index) => c4Colours(tags[index % tags.length]!));
    const drawing = mountDrawing(shown);
    expect(everyFailure(drawing, shown)).toEqual([]);
  });

  it("on a fill the author set without a text colour, writes black or white, whichever reads", () => {
    const fills = ["#FFE08A", "#1B3A5C", "#E03131", "#FFFFFF", "#000000"];
    const shown = scene({
      elements: fills.map((fill, index) =>
        element(`fill-${index}`, {
          shape: index % 2 ? "Cylinder" : "WebBrowser",
          description: "Some description",
          at: { x: index * 300, y: 0 },
          style: { fill, stroke: "#4D4D4D" },
        }),
      ),
    });
    const drawing = mountDrawing(shown);
    const texts = shown.elements.map(({ id }) =>
      paint(drawing.visual(id).querySelector("text")!, "fill"),
    );
    expect(texts).toEqual([
      "rgb(29, 29, 29)",
      "rgb(255, 255, 255)",
      "rgb(255, 255, 255)",
      "rgb(29, 29, 29)",
      "rgb(255, 255, 255)",
    ]);
    expect(shown.elements.flatMap(({ id }) => elementFailures(drawing, id))).toEqual([]);
  });

  it("keeps the selection colour out of the notation: no drawn colour is the interaction blue", () => {
    const tags = C4_COLOUR_STYLES.map((style) => style.tag);
    const shown = everyShape((index) => c4Colours(tags[index % tags.length]!));
    const drawing = mountDrawing(shown);
    const interaction = rgb(vendoredTokens.hell["--cd-ui-interaktion"]);
    const hover = rgb(vendoredTokens.hell["--cd-ui-hover"]);
    const drawn = [
      ...drawing.container.querySelectorAll(".djs-visual *, .layer-c4-frames *, .layer-c4-title *"),
    ];
    for (const node of drawn) {
      for (const property of ["fill", "stroke"] as const) {
        expect([interaction, hover], `${node.tagName} ${property}`).not.toContain(
          paint(node, property),
        );
      }
    }
  });
});
