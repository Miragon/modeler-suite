import { afterEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import {
  COLORS,
  COLOR_OPTIONS,
  createCollaborativeModeler,
  createCollaborativeViewer,
  isVcConnection,
  isVcShape,
  type CollaborativeValueChainModeler,
  type VcColorPickerProvider,
  type VcShape,
} from "../../src/index.js";
import { dunkel, fest, hell } from "../../src/theme/cd-tokens.generated.json";
import "../../src/assets/value-chain.css";
import ORDER_TO_CASH from "./fixtures/order-to-cash.vc.json?raw";
import { exportImage } from "./support/pointer.js";

/**
 * Guide §10.1, §10.2, §10.7 and §13.4 (#218): the canvas draws dark through the role classes of
 * `cd-canvas.css` once its nearest mode carrier says dark, while `themes` stays `["light"]`, so
 * these tests set `data-cd-theme="dark"` on the container themselves (the switch is #219). The
 * steps and organizational units without a colour of their own, every contour, relation,
 * arrowhead and label follow the roles; a colour of the shape's own and the label it decides look
 * the same in every mode (§10.6). Switching is CSS only, and the exports stay light: from a dark
 * canvas byte for byte the same SVG and PNG as from a light one.
 */

const LONG_LABEL = "Plan, source and schedule every inbound delivery on time";

interface Coloured {
  id: string;
  color?: string;
  elementType: "step" | "orgUnit";
  name: string;
  width: number;
  height: number;
}

const PICKER_SHAPES: Coloured[] = COLOR_OPTIONS.map((option, index) => ({
  id: `${index % 2 === 0 ? "step" : "org"}-${option.label.toLowerCase()}`,
  ...(option.color === undefined ? {} : { color: option.color }),
  elementType: index % 2 === 0 ? "step" : "orgUnit",
  name: option.label,
  width: 160,
  height: 60,
}));

/** A hand-written translucent colour: its label's opaque halo carries the text on any ground. */
const TRANSLUCENT: Coloured = {
  id: "step-translucent",
  color: "rgba(51, 93, 229, 0.5)",
  elementType: "step",
  name: "Translucent",
  width: 160,
  height: 60,
};

/** Labels far longer than their shapes hold, so whole lines lie on the ground. */
const OVERFLOWING: Coloured[] = [
  { id: "small-default", elementType: "step", name: LONG_LABEL, width: 100, height: 40 },
  {
    id: "small-black",
    color: fest["--cd-schwarz"],
    elementType: "orgUnit",
    name: LONG_LABEL,
    width: 100,
    height: 40,
  },
];

const COLOURED_SHAPES = [...PICKER_SHAPES, TRANSLUCENT, ...OVERFLOWING];

const COLOURED_CHAIN = JSON.stringify({
  connections: [],
  elements: COLOURED_SHAPES.map((shape, index) => ({
    bounds: {
      x: (index % 4) * 220,
      y: Math.floor(index / 4) * 160,
      width: shape.width,
      height: shape.height,
    },
    elementType: shape.elementType,
    id: shape.id,
    name: shape.name,
    ...(shape.color === undefined ? {} : { color: shape.color }),
  })),
  meta: { name: "Coloured chain" },
  schemaVersion: 1,
});

type Rgb = [number, number, number];

const mounted: Array<{ destroy(): void }> = [];

async function mount(text: string): Promise<CollaborativeValueChainModeler> {
  const modeler = createCollaborativeModeler();
  modeler.attachTo(attachedHost(1000, 700));
  mounted.push(modeler);
  await modeler.importText(text);
  return modeler;
}

function containerMode(
  modeler: { diagram: { container: HTMLElement } },
  theme: "light" | "dark",
): void {
  modeler.diagram.container.setAttribute("data-cd-theme", theme);
}

function pageMode(theme: string | null): void {
  if (theme) document.documentElement.setAttribute("data-cd-theme", theme);
  else document.documentElement.removeAttribute("data-cd-theme");
}

afterEach(() => {
  for (const modeler of mounted.splice(0)) modeler.destroy();
  pageMode(null);
  document.documentElement.removeAttribute("data-cd-kontrast");
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

function rgb(color: string): Rgb {
  const [red, green, blue] = computed(color)
    .match(/[\d.]+/g)!
    .map(Number);
  return [red!, green!, blue!];
}

function luminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(rgb(first)), luminance(rgb(second))].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function registry(modeler: CollaborativeValueChainModeler): ElementRegistry {
  return modeler.diagram.get<ElementRegistry>("elementRegistry");
}

function shape(modeler: CollaborativeValueChainModeler, id: string): VcShape {
  return registry(modeler).get(id) as VcShape;
}

function visual(modeler: CollaborativeValueChainModeler, id: string): SVGGElement {
  return registry(modeler).getGraphics(id).querySelector<SVGGElement>(".djs-visual")!;
}

/** How a shape is painted: its outline's fill and stroke, its label's fill and halo. */
function painted(modeler: CollaborativeValueChainModeler, id: string) {
  const outline = getComputedStyle(visual(modeler, id).querySelector("path")!);
  const label = visual(modeler, id).querySelector("text");
  const text = label ? getComputedStyle(label) : undefined;
  return { fill: outline.fill, stroke: outline.stroke, label: text?.fill, halo: text?.stroke };
}

/** Every label line of a shape with its colours and where it lies, relative to the shape. */
function lines(modeler: CollaborativeValueChainModeler, id: string) {
  return [...visual(modeler, id).querySelectorAll<SVGTSpanElement>("text > tspan")]
    .filter((line) => line.textContent?.trim())
    .map((line) => {
      const box = line.getBBox();
      const style = getComputedStyle(line);
      return { centre: box.y + box.height / 2, fill: style.fill, halo: style.stroke };
    });
}

/** The arrowhead a relation ends in, as painted, or undefined for one without. */
function arrowhead(line: SVGElement) {
  const reference = /url\(["']?#([^"')]+)/.exec(getComputedStyle(line).markerEnd)?.[1];
  if (!reference) return undefined;
  const path = line.ownerSVGElement!.querySelector(`marker[id="${reference}"] path`)!;
  const style = getComputedStyle(path);
  return { fill: style.fill, stroke: style.stroke };
}

const LIGHT = {
  fill: computed(hell["--cd-ui-plot"]),
  ink: computed(hell["--cd-ui-text"]),
};

const DARK = {
  ground: computed(dunkel["--cd-ui-grund"]),
  fill: computed(dunkel["--cd-ui-plot"]),
  ink: computed(dunkel["--cd-ui-text"]),
};

/** A PNG of the SVG as the apps export it (guide §10.7): 2×, on the surround. */
async function pngBytes(svg: string): Promise<number[]> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth * 2;
  canvas.height = image.naturalHeight * 2;
  const context = canvas.getContext("2d")!;
  context.fillStyle = COLORS.surround;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return [...new Uint8Array(await blob!.arrayBuffer())];
}

describe("a dark carrier recolours the canvas through the roles (guide §10.1)", () => {
  it("draws the dark ground's own values: the roles resolve dark on the container", async () => {
    const modeler = await mount(ORDER_TO_CASH);
    containerMode(modeler, "dark");
    const style = getComputedStyle(modeler.diagram.container);
    expect([style.backgroundColor, style.color]).toEqual([DARK.ground, DARK.ink]);
    expect([DARK.ground, DARK.fill, DARK.ink]).toEqual([
      "rgb(29, 29, 29)",
      "rgb(29, 29, 29)",
      "rgb(255, 255, 255)",
    ]);
  });

  it("steps and organizational units without a colour of their own: plot fill, ink contour and label, plot halo", async () => {
    const modeler = await mount(ORDER_TO_CASH);
    const plain = registry(modeler)
      .getAll()
      .filter((element): element is VcShape => isVcShape(element) && !element.color);
    expect(plain.map((element) => element.vcType)).toEqual(
      expect.arrayContaining(["step", "orgUnit"]),
    );

    for (const element of plain) {
      containerMode(modeler, "light");
      expect(painted(modeler, element.id), element.id).toEqual({
        fill: LIGHT.fill,
        stroke: LIGHT.ink,
        label: LIGHT.ink,
        halo: LIGHT.fill,
      });
      containerMode(modeler, "dark");
      expect(painted(modeler, element.id), element.id).toEqual({
        fill: DARK.fill,
        stroke: DARK.ink,
        label: DARK.ink,
        halo: DARK.fill,
      });
    }
  });

  it("the relations and their arrowheads draw in the ink role, the assignment without one", async () => {
    const modeler = await mount(ORDER_TO_CASH);
    containerMode(modeler, "dark");
    const connections = registry(modeler).getAll().filter(isVcConnection);
    expect(new Set(connections.map((connection) => connection.vcType))).toEqual(
      new Set(["sequence", "hierarchy", "assignment"]),
    );

    for (const connection of connections) {
      const line = visual(modeler, connection.id).querySelector<SVGElement>("path")!;
      expect(getComputedStyle(line).stroke, connection.id).toBe(DARK.ink);
      expect(getComputedStyle(line).fill, connection.id).toBe("none");
      expect(arrowhead(line), connection.id).toEqual(
        connection.vcType === "assignment" ? undefined : { fill: DARK.ink, stroke: DARK.ink },
      );
    }
  });

  it.each([...PICKER_SHAPES.filter((entry) => entry.color), TRANSLUCENT])(
    "$id: a colour of its own stays as stored, with its label and halo; the contour follows the mode",
    async (entry) => {
      const modeler = await mount(COLOURED_CHAIN);
      containerMode(modeler, "light");
      const light = painted(modeler, entry.id);
      expect(light.fill).toBe(computed(entry.color!));

      containerMode(modeler, "dark");
      expect(painted(modeler, entry.id)).toEqual({ ...light, stroke: DARK.ink });
    },
  );

  it.each(OVERFLOWING)(
    "$id: a label line past its shape is ink on the dark ground's halo, a line on the shape keeps the shape's colours",
    async (entry) => {
      const modeler = await mount(COLOURED_CHAIN);
      containerMode(modeler, "dark");
      const own = painted(modeler, entry.id);
      const all = lines(modeler, entry.id);
      const past = all.filter((line) => line.centre < 0 || line.centre > entry.height);
      const on = all.filter((line) => line.centre >= 0 && line.centre <= entry.height);
      expect(past.length).toBeGreaterThan(1);
      expect(on.length).toBeGreaterThan(0);
      for (const line of past) expect([line.fill, line.halo]).toEqual([DARK.ink, DARK.ground]);
      for (const line of on) expect([line.fill, line.halo]).toEqual([own.label, own.halo]);
    },
  );

  it("the palette previews and the colour swatches show the shapes as the canvas draws them", async () => {
    const modeler = await mount(COLOURED_CHAIN);
    containerMode(modeler, "dark");
    const container = modeler.diagram.container;
    for (const action of ["create.step", "create.org-unit"]) {
      const preview = container.querySelector(`.djs-palette [data-action="${action}"] svg`);
      expect(preview, action).not.toBeNull();
      const style = getComputedStyle(preview!);
      expect([style.fill, style.stroke], action).toEqual([DARK.fill, DARK.ink]);
    }

    const entries = modeler.diagram
      .get<VcColorPickerProvider>("vcColorPickerProvider")
      .getPopupMenuEntries(shape(modeler, "step-default"));
    const swatches = document.createElement("div");
    container.appendChild(swatches);
    swatches.innerHTML = Object.values(entries)
      .map((entry) => entry.imageHtml)
      .join("");
    const shown = [...swatches.querySelectorAll("rect")].map((rect) => {
      const style = getComputedStyle(rect);
      return [style.fill, style.stroke];
    });
    expect(shown).toEqual(
      COLOR_OPTIONS.map((option) => [
        option.color === undefined ? DARK.fill : computed(option.color),
        DARK.ink,
      ]),
    );
  });

  it("a light carrier inside a dark page stays light, through the appearance a host sets", async () => {
    const modeler = await mount(ORDER_TO_CASH);
    pageMode("dark");
    modeler.appearance.set({ theme: "dark" });
    expect(modeler.diagram.container.getAttribute("data-cd-theme")).toBe("light");
    expect(painted(modeler, "step-order")).toEqual({
      fill: LIGHT.fill,
      stroke: LIGHT.ink,
      label: LIGHT.ink,
      halo: LIGHT.fill,
    });
  });
});

describe("contrast on the dark ground (guide §3.7)", () => {
  it.each([
    ["Order to Cash", ORDER_TO_CASH],
    ["the coloured chain", COLOURED_CHAIN],
  ])(
    "%s: every contour, relation and arrowhead holds 3:1 on the ground, every label line 4.5:1 on its halo",
    async (_, text) => {
      const modeler = await mount(text);
      containerMode(modeler, "dark");
      const svg = modeler.diagram.get<Canvas>("canvas").getContainer().querySelector("svg")!;
      const strokes = [...svg.querySelectorAll(".djs-visual > path, marker path")];
      expect(strokes.length).toBeGreaterThan(5);
      for (const stroke of strokes) {
        expect(contrast(getComputedStyle(stroke).stroke, DARK.ground)).toBeGreaterThanOrEqual(3);
      }
      const labelLines = [...svg.querySelectorAll<SVGTSpanElement>(".djs-visual > text > tspan")];
      expect(labelLines.length).toBeGreaterThan(5);
      for (const line of labelLines) {
        const style = getComputedStyle(line);
        expect(contrast(style.fill, style.stroke), line.textContent ?? "").toBeGreaterThanOrEqual(
          4.5,
        );
      }
    },
  );
});

describe("the mode switch is CSS only (guide §10.2)", () => {
  it("redraws nothing and keeps the view and the selection", async () => {
    const modeler = await mount(ORDER_TO_CASH);
    modeler.elements.reveal("step-credit");
    let redrawn = 0;
    modeler.diagram
      .get<EventBus>("eventBus")
      .on(["render.shape", "render.connection"], () => (redrawn += 1));
    const graphics = registry(modeler).getGraphics("step-credit");
    const view = modeler.getViewState();
    const selection = modeler.elements.selection();

    containerMode(modeler, "dark");
    containerMode(modeler, "light");
    containerMode(modeler, "dark");

    expect(redrawn).toBe(0);
    expect(registry(modeler).getGraphics("step-credit")).toBe(graphics);
    expect(modeler.getViewState()).toEqual(view);
    expect(modeler.elements.selection()).toEqual(selection);
  });
});

describe("the exports stay light (guide §10.7, §13.4)", () => {
  it.each([
    ["Order to Cash", ORDER_TO_CASH],
    ["the coloured chain", COLOURED_CHAIN],
  ])(
    "%s: the SVG from a dark canvas is byte-identical to the light one, also on a dark page and in high contrast, and carries no role class",
    async (_, text) => {
      const modeler = await mount(text);
      containerMode(modeler, "light");
      const light = exportImage(modeler);
      expect(light).not.toContain("cd-c-");
      expect(light).not.toMatch(/class=""/);

      containerMode(modeler, "dark");
      expect(exportImage(modeler)).toBe(light);
      pageMode("dark");
      document.documentElement.setAttribute("data-cd-kontrast", "hoch");
      modeler.diagram.container.setAttribute("data-cd-kontrast", "hoch");
      expect(exportImage(modeler)).toBe(light);
    },
  );

  it("the PNG of a dark canvas is byte-identical to the light one", async () => {
    const modeler = await mount(COLOURED_CHAIN);
    containerMode(modeler, "light");
    const light = await pngBytes(exportImage(modeler));
    containerMode(modeler, "dark");
    const dark = await pngBytes(exportImage(modeler));

    expect(light.length).toBeGreaterThan(1000);
    expect(dark).toEqual(light);
  });

  it("the viewer's SVG from a dark canvas is byte-identical to the light one", async () => {
    const viewer = createCollaborativeViewer();
    viewer.attachTo(attachedHost(1000, 700));
    mounted.push(viewer);
    await viewer.importText(COLOURED_CHAIN);
    containerMode(viewer, "light");
    const light = viewer.diagram.saveSVG().svg;
    containerMode(viewer, "dark");
    expect(viewer.diagram.saveSVG().svg).toBe(light);
  });

  it("an exported SVG placed in a dark page keeps its light colours, where the live canvas turns dark", async () => {
    const modeler = await mount(ORDER_TO_CASH);
    const exported = exportImage(modeler);
    containerMode(modeler, "dark");
    const page = document.createElement("div");
    page.setAttribute("data-cd-theme", "dark");
    page.innerHTML = exported.replace(/^<\?xml[^>]*>\s*/, "");
    document.body.appendChild(page);
    try {
      const graphics = page.querySelector('[data-element-id="step-order"] .djs-visual')!;
      const outline = getComputedStyle(graphics.querySelector("path")!);
      const label = getComputedStyle(graphics.querySelector("text")!);
      expect([outline.fill, outline.stroke, label.fill, label.stroke]).toEqual([
        LIGHT.fill,
        LIGHT.ink,
        LIGHT.ink,
        LIGHT.fill,
      ]);
      expect(painted(modeler, "step-order").fill).toBe(DARK.fill);
    } finally {
      page.remove();
    }
  });
});
