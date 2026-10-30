import { afterEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import {
  COLORS,
  createCollaborativeModeler,
  type CollaborativeValueChainModeler,
  type VcColorPickerProvider,
  type VcRenderer,
  type VcShape,
} from "../../src/index.js";
import { fest } from "../../src/theme/cd-tokens.generated.json";
import "../../src/assets/value-chain.css";

/**
 * Guide §10.6: a shape's own colour is its fill, the contour stays ink, and the label is black or
 * white, whichever contrasts more with the fill, whatever colour the shape has. Every label line
 * carries the halo of the surface behind it (guide §10.1): on the shape its fill, past the shape
 * the surround, where the line is ink. Colours stored by older versions (the picker's former
 * hsl() accents) or written by hand keep rendering, and the stored value never changes.
 */

const BLACK = fest["--cd-schwarz"];
const WHITE = fest["--cd-weiss"];

interface Case {
  id: string;
  color?: string;
  elementType?: "step" | "orgUnit";
  fill: string;
  label: string;
  /** The label's halo, the fill as it shows over the plot. */
  halo: string;
}

const CASES: Case[] = [
  { id: "step-default", fill: COLORS.fill, label: COLORS.ink, halo: COLORS.fill },
  // the former picker's Blue: black reaches 4.46:1 on it, white only 3.78:1
  {
    id: "step-legacy-blue",
    color: "hsl(205, 100%, 45%)",
    fill: "#0086E6",
    label: BLACK,
    halo: "#0086E6",
  },
  // the former picker's Red: white reaches 4.81:1 on it, black only 3.50:1
  {
    id: "step-legacy-red",
    color: "hsl(360, 100%, 45%)",
    fill: "#E60000",
    label: WHITE,
    halo: "#E60000",
  },
  {
    id: "step-legacy-purple",
    color: "hsl(287, 65%, 44%)",
    fill: "#9A27B9",
    label: WHITE,
    halo: "#9A27B9",
  },
  {
    id: "step-blue",
    color: fest["--cd-blau"],
    fill: fest["--cd-blau"],
    label: WHITE,
    halo: fest["--cd-blau"],
  },
  {
    id: "step-green",
    color: fest["--cd-gruen"],
    fill: fest["--cd-gruen"],
    label: BLACK,
    halo: fest["--cd-gruen"],
  },
  {
    id: "step-amber",
    color: fest["--cd-warning"],
    fill: fest["--cd-warning"],
    label: BLACK,
    halo: fest["--cd-warning"],
  },
  { id: "step-named", color: "navy", fill: "#000080", label: WHITE, halo: "#000080" },
  // syntaxes newer than rgb(), which the canvas hands back as written
  { id: "step-oklch", color: "oklch(0% 0 0)", fill: "#000000", label: WHITE, halo: "#000000" },
  {
    id: "step-color-function",
    color: "color(srgb 0.2 0.4 0.8)",
    fill: "#3366CC",
    label: WHITE,
    halo: "#3366CC",
  },
  // half the blue over the white plot: black reaches 7.78:1 on it, white only 2.17:1
  {
    id: "step-translucent",
    color: "rgba(51, 93, 229, 0.5)",
    fill: "rgba(51, 93, 229, 0.5)",
    label: BLACK,
    halo: "#99AEF2",
  },
  {
    id: "step-not-a-colour",
    color: "not a colour",
    fill: COLORS.fill,
    label: COLORS.ink,
    halo: COLORS.fill,
  },
  {
    id: "org-black",
    color: fest["--cd-schwarz"],
    elementType: "orgUnit",
    fill: fest["--cd-schwarz"],
    label: WHITE,
    halo: fest["--cd-schwarz"],
  },
];

const COLOURED_CHAIN = JSON.stringify({
  connections: [],
  elements: CASES.map((entry, index) => ({
    bounds: { x: (index % 5) * 200, y: Math.floor(index / 5) * 120, width: 160, height: 60 },
    elementType: entry.elementType ?? "step",
    id: entry.id,
    name: entry.id,
    ...(entry.color === undefined ? {} : { color: entry.color }),
  })),
  meta: { name: "Coloured chain" },
  schemaVersion: 1,
});

const mounted: CollaborativeValueChainModeler[] = [];

async function mount(document = COLOURED_CHAIN): Promise<CollaborativeValueChainModeler> {
  const modeler = createCollaborativeModeler();
  modeler.attachTo(attachedHost());
  mounted.push(modeler);
  await modeler.importText(document);
  return modeler;
}

afterEach(() => {
  for (const modeler of mounted.splice(0)) modeler.destroy();
});

/** A colour as the browser computes it, so hex case and notation do not count. */
function computed(color: string): string {
  const probe = document.createElement("span");
  probe.style.color = color;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

function drawn(modeler: CollaborativeValueChainModeler, id: string) {
  const graphics = modeler.diagram.get<ElementRegistry>("elementRegistry").getGraphics(id);
  const outline = graphics.querySelector(".djs-visual > path")!;
  const label = graphics.querySelector(".djs-visual > text")!;
  return {
    fill: getComputedStyle(outline).fill,
    stroke: getComputedStyle(outline).stroke,
    label: getComputedStyle(label).fill,
    halo: getComputedStyle(label).stroke,
  };
}

function storedColors(text: string): Record<string, unknown> {
  const elements = (JSON.parse(text) as { elements: Record<string, unknown>[] }).elements;
  return Object.fromEntries(elements.map((element) => [element["id"], element["color"]]));
}

function shape(modeler: CollaborativeValueChainModeler, id: string): VcShape {
  return modeler.diagram.get<ElementRegistry>("elementRegistry").get(id) as VcShape;
}

describe("a shape's own colour fills it (guide §10.6)", () => {
  it.each(CASES)("$id: fill, ink contour and a black or white label", async (entry) => {
    const modeler = await mount();
    expect(drawn(modeler, entry.id)).toEqual({
      fill: computed(entry.fill),
      stroke: computed(COLORS.ink),
      label: computed(entry.label),
      halo: computed(entry.halo),
    });
  });

  it("keeps every stored value as it was, older hsl() accents included", async () => {
    const modeler = await mount();
    expect(storedColors(modeler.exportText())).toEqual(storedColors(COLOURED_CHAIN));
  });
});

describe("the colour picker (guide §10.6)", () => {
  function entries(modeler: CollaborativeValueChainModeler, id: string) {
    return modeler.diagram
      .get<VcColorPickerProvider>("vcColorPickerProvider")
      .getPopupMenuEntries(shape(modeler, id));
  }

  it('offers "Default", then the palette and status colours, each with its fill as swatch', async () => {
    const modeler = await mount();
    const offered = Object.values(entries(modeler, "step-default"));
    expect(offered.map((entry) => entry.label)).toEqual([
      "Default",
      "Blue",
      "Green",
      "Gray",
      "Black",
      "White",
      "Amber",
      "Red",
    ]);
    const swatchFills = offered.map((entry) => /fill="([^"]+)"/.exec(entry.imageHtml ?? "")?.[1]);
    expect(swatchFills).toEqual([
      COLORS.fill,
      fest["--cd-blau"],
      fest["--cd-gruen"],
      fest["--cd-grau"],
      fest["--cd-schwarz"],
      fest["--cd-weiss"],
      fest["--cd-warning"],
      fest["--cd-danger"],
    ]);
  });

  it("stores the token value, fills the shape with it and clears it again with Default", async () => {
    const modeler = await mount();
    const picker = entries(modeler, "step-legacy-blue");
    picker["color-red"]!.action();
    expect(shape(modeler, "step-legacy-blue").color).toBe(fest["--cd-danger"]);
    expect(drawn(modeler, "step-legacy-blue")).toEqual({
      fill: computed(fest["--cd-danger"]),
      stroke: computed(COLORS.ink),
      label: computed(WHITE),
      halo: computed(fest["--cd-danger"]),
    });

    picker["color-default"]!.action();
    expect(shape(modeler, "step-legacy-blue").color).toBeUndefined();
    expect(drawn(modeler, "step-legacy-blue")).toEqual({
      fill: computed(COLORS.fill),
      stroke: computed(COLORS.ink),
      label: computed(COLORS.ink),
      halo: computed(COLORS.fill),
    });
    expect(storedColors(modeler.exportText())["step-legacy-blue"]).toBeUndefined();
  });
});

describe("a label that runs past its shape (guide §10.1, §3.7)", () => {
  /** 56 characters: far more lines than a 100×40 shape holds. */
  const LONG_LABEL = "Plan, source and schedule every inbound delivery on time";

  /**
   * Five words, each too wide to share a line with the next, so the label has five lines in any
   * font, and the line height alone sets where they lie.
   */
  const FIVE_LINE_LABEL = "Procurement, warehousing, distribution, installation, maintenance";

  interface Overflow {
    id: string;
    color?: string;
    elementType: "step" | "orgUnit";
    width: number;
    height: number;
    name: string;
  }

  /**
   * Whole lines run past these shapes, onto a wide unlabelled Black step right below, which comes
   * first in the document and so is painted under the label.
   */
  const SMALL_SHAPES: Overflow[] = [
    { id: "small-default-step", elementType: "step", width: 100, height: 40, name: LONG_LABEL },
    {
      id: "small-black-step",
      color: fest["--cd-schwarz"],
      elementType: "step",
      width: 100,
      height: 40,
      name: LONG_LABEL,
    },
    {
      id: "small-blue-step",
      color: fest["--cd-blau"],
      elementType: "step",
      width: 100,
      height: 40,
      name: LONG_LABEL,
    },
    {
      id: "small-red-org-unit",
      color: fest["--cd-danger"],
      elementType: "orgUnit",
      width: 100,
      height: 40,
      name: LONG_LABEL,
    },
  ];

  /** The first and the last of five lines cross this step's flat edges, each mostly on it. */
  const STRADDLING: Overflow = {
    id: "default-size-blue-step",
    color: fest["--cd-blau"],
    elementType: "step",
    width: 160,
    height: 60,
    name: FIVE_LINE_LABEL,
  };

  const OVERFLOWS = [...SMALL_SHAPES, STRADDLING];

  const NEIGHBOUR_GAP = 6;

  function neighbourId(entry: Overflow): string {
    return `${entry.id}-neighbour`;
  }

  function placed(entry: Overflow, index: number) {
    return {
      bounds: { x: index * 240, y: 100, width: entry.width, height: entry.height },
      elementType: entry.elementType,
      id: entry.id,
      name: entry.name,
      ...(entry.color === undefined ? {} : { color: entry.color }),
    };
  }

  const OVERFLOWING_CHAIN = JSON.stringify({
    connections: [],
    elements: [
      ...SMALL_SHAPES.flatMap((entry, index) => [
        {
          bounds: {
            x: index * 240 - 40,
            y: 100 + entry.height + NEIGHBOUR_GAP,
            width: entry.width + 80,
            height: 60,
          },
          color: fest["--cd-schwarz"],
          elementType: "step",
          id: neighbourId(entry),
          name: "",
        },
        placed(entry, index),
      ]),
      placed(STRADDLING, SMALL_SHAPES.length),
    ],
    meta: { name: "Overflowing labels" },
    schemaVersion: 1,
  });

  /** The PNG export's scale. */
  const SCALE = 2;

  /** The contour's half stroke and its anti-aliasing: pixels this close to a contour are not text. */
  const CONTOUR_CLEARANCE = 2;

  type Rgb = [number, number, number];

  interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  function rgb(color: string): Rgb {
    const [red, green, blue] = computed(color).match(/\d+/g)!.map(Number);
    return [red!, green!, blue!];
  }

  function luminance([red, green, blue]: Rgb): number {
    const linear = (channel: number) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  }

  function contrast(first: Rgb, second: Rgb): number {
    const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (lighter! + 0.05) / (darker! + 0.05);
  }

  function labelBox(modeler: CollaborativeValueChainModeler, id: string): Box {
    return modeler.diagram.get<VcRenderer>("vcRenderer").labelBounds(shape(modeler, id))!;
  }

  /** The parts of a box above and below the shape. */
  function pastTheShape(box: Box, element: VcShape): Box[] {
    const above = element.y - CONTOUR_CLEARANCE - box.y;
    const belowTop = element.y + element.height + CONTOUR_CLEARANCE;
    return [
      { x: box.x, y: box.y, width: box.width, height: above },
      { x: box.x, y: belowTop, width: box.width, height: box.y + box.height - belowTop },
    ].filter((part) => part.height > 1);
  }

  /** The part of the label's box that lies on the neighbour below. */
  function onTheNeighbour(box: Box, neighbour: VcShape): Box {
    const top = neighbour.y + CONTOUR_CLEARANCE;
    return { x: box.x, y: top, width: box.width, height: box.y + box.height - top };
  }

  /** Every label line as drawn: its box in diagram coordinates, its extent relative to the shape. */
  function drawnLines(modeler: CollaborativeValueChainModeler, id: string) {
    const element = shape(modeler, id);
    const graphics = modeler.diagram.get<ElementRegistry>("elementRegistry").getGraphics(id);
    return [...graphics.querySelectorAll<SVGTSpanElement>(".djs-visual > text > tspan")]
      .filter((line) => line.textContent?.trim())
      .map((line) => {
        const box = line.getBBox();
        const style = getComputedStyle(line);
        return {
          box: { x: element.x + box.x, y: element.y + box.y, width: box.width, height: box.height },
          top: box.y,
          centre: box.y + box.height / 2,
          bottom: box.y + box.height,
          fill: style.fill,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
          strokeLinejoin: style.strokeLinejoin,
          paintOrder: style.paintOrder,
        };
      });
  }

  /** The SVG export drawn at `SCALE` on the surround, as both apps' PNG export draws it (§10.7). */
  async function rasterized(svg: string): Promise<ImageData> {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * SCALE);
    canvas.height = Math.round(image.naturalHeight * SCALE);
    const context = canvas.getContext("2d")!;
    context.fillStyle = COLORS.surround;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }

  async function exportedPng(modeler: CollaborativeValueChainModeler) {
    const { svg } = modeler.diagram.saveSVG();
    const [originX, originY] = /viewBox="(\S+) (\S+)/.exec(svg)!.slice(1).map(Number) as [
      number,
      number,
    ];
    const pixels = await rasterized(svg);
    /** The highest contrast any pixel of the region reaches against the given colour. */
    return function strongestContrast(region: Box, against: Rgb): number {
      let strongest = 1;
      const left = Math.max(0, Math.floor((region.x - originX) * SCALE));
      const right = Math.min(pixels.width, Math.ceil((region.x + region.width - originX) * SCALE));
      const top = Math.max(0, Math.floor((region.y - originY) * SCALE));
      const bottom = Math.min(
        pixels.height,
        Math.ceil((region.y + region.height - originY) * SCALE),
      );
      for (let row = top; row < bottom; row += 1) {
        for (let column = left; column < right; column += 1) {
          const offset = (row * pixels.width + column) * 4;
          const pixel: Rgb = [
            pixels.data[offset]!,
            pixels.data[offset + 1]!,
            pixels.data[offset + 2]!,
          ];
          strongest = Math.max(strongest, contrast(pixel, against));
        }
      }
      return strongest;
    };
  }

  function expectHaloOnEveryLine(lines: ReturnType<typeof drawnLines>): void {
    for (const line of lines) {
      expect([line.strokeWidth, line.strokeLinejoin, line.paintOrder]).toEqual([
        "3px",
        "round",
        "stroke",
      ]);
      expect(contrast(rgb(line.fill), rgb(line.stroke))).toBeGreaterThanOrEqual(4.5);
    }
  }

  it.each(OVERFLOWS)("$id: the label runs past the shape above and below", async (entry) => {
    const modeler = await mount(OVERFLOWING_CHAIN);
    const box = labelBox(modeler, entry.id);
    const element = shape(modeler, entry.id);
    expect(element.y - box.y).toBeGreaterThan(CONTOUR_CLEARANCE + 2);
    expect(box.y + box.height - (element.y + element.height)).toBeGreaterThan(
      CONTOUR_CLEARANCE + 2,
    );
  });

  it.each(SMALL_SHAPES)(
    "$id: the label runs onto the neighbour, painted over it",
    async (entry) => {
      const modeler = await mount(OVERFLOWING_CHAIN);
      const neighbour = shape(modeler, neighbourId(entry));
      expect(onTheNeighbour(labelBox(modeler, entry.id), neighbour).height).toBeGreaterThan(2);
      const registry = modeler.diagram.get<ElementRegistry>("elementRegistry");
      const order = registry
        .getGraphics(neighbourId(entry))
        .compareDocumentPosition(registry.getGraphics(entry.id));
      expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    },
  );

  it.each(SMALL_SHAPES)(
    "$id: lines on the shape take the fill's colours, lines past it ink with the surround's halo",
    async (entry) => {
      const modeler = await mount(OVERFLOWING_CHAIN);
      const own = drawn(modeler, entry.id);
      const lines = drawnLines(modeler, entry.id);
      const onTheShape = lines.filter((line) => line.top >= 0 && line.bottom <= entry.height);
      const past = lines.filter((line) => line.centre < 0 || line.centre > entry.height);
      expect(onTheShape.length).toBeGreaterThan(0);
      expect(past.length).toBeGreaterThan(1);
      for (const line of onTheShape) {
        expect([line.fill, line.stroke]).toEqual([own.label, own.halo]);
      }
      for (const line of past) {
        expect([line.fill, line.stroke]).toEqual([computed(COLORS.ink), computed(COLORS.surround)]);
      }
      expectHaloOnEveryLine(lines);
    },
  );

  it("a line mostly on the shape keeps the fill's colours where it crosses the edge", async () => {
    const modeler = await mount(OVERFLOWING_CHAIN);
    const own = drawn(modeler, STRADDLING.id);
    const lines = drawnLines(modeler, STRADDLING.id);
    const element = shape(modeler, STRADDLING.id);
    expect(lines).toHaveLength(5);
    const crossing = lines.filter((line) => pastTheShape(line.box, element).length > 0);
    expect(crossing.length).toBeGreaterThan(1);
    for (const line of crossing) {
      expect(line.centre).toBeGreaterThan(0);
      expect(line.centre).toBeLessThan(STRADDLING.height);
    }
    for (const line of lines) {
      expect([line.fill, line.stroke]).toEqual([own.label, own.halo]);
    }
    expectHaloOnEveryLine(lines);
  });

  it.each(OVERFLOWS)(
    "$id: the PNG export shows every line past the shape at 4.5:1 against its colour",
    async (entry) => {
      const modeler = await mount(OVERFLOWING_CHAIN);
      const strongestContrast = await exportedPng(modeler);
      const element = shape(modeler, entry.id);
      for (const line of drawnLines(modeler, entry.id)) {
        for (const region of pastTheShape(line.box, element)) {
          expect(strongestContrast(region, rgb(line.fill))).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it.each(SMALL_SHAPES)(
    "$id: the PNG export shows the lines on the Black neighbour at 4.5:1",
    async (entry) => {
      const modeler = await mount(OVERFLOWING_CHAIN);
      const strongestContrast = await exportedPng(modeler);
      const neighbour = shape(modeler, neighbourId(entry));
      const region = onTheNeighbour(labelBox(modeler, entry.id), neighbour);
      expect(strongestContrast(region, rgb(COLORS.ink))).toBeGreaterThanOrEqual(4.5);
    },
  );
});
