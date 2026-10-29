import { afterEach, describe, expect, test } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeTeamTopologiesModeler,
  type Modeler,
  type TtElement,
  type TtLabelEditing,
} from "@miragon/team-topologies-renderer";
import { associationId } from "@miragon/team-topologies-schema-model";
import onlineShop from "../../../../example/sample.tt?raw";
import tokens from "../../src/theme/cd-tokens.generated.json";
import { Pointer, middle, shape } from "./support/pointer.js";

// The dark canvas of guide §10.2 and §10.6 behind `themes: ["light"]` (#216). `appearance.set`
// keeps drawing light until the joint switch (#219), so these cases put the dark carrier on the
// renderer's container themselves, where the switch will put it.

const BLACK = "rgb(29, 29, 29)";
const WHITE = "rgb(255, 255, 255)";
/** `--cd-ui-kontur`, the same in both modes without high contrast. */
const KONTUR = "rgb(143, 138, 138)";
const LIGHT_TEXT_LEISE = "rgb(107, 102, 102)";
const DARK_TEXT_LEISE = "rgb(187, 187, 187)";
const LIGHT_GROUND = "rgb(249, 247, 247)";
/** The flow of change of the templates, `#6B6459`. */
const FLOW_STROKE = "rgb(107, 100, 89)";

const ANNOTATION = "ann_fraud_handover";
const ASSOCIATION = associationId(ANNOTATION);
const FLOW = "flow_main";
/** The sample's elements whose template contour lies on the high-contrast underlay (guide §10.6). */
const ON_HIGH_CONTRAST_UNDERLAY = [
  "int_platform_fulfilment",
  "int_testing_checkout",
  "int_testing_discovery",
  "team_checkout",
  "team_discovery",
  "team_fraud",
  "team_fulfilment",
  "team_platform",
  "team_test_automation",
];

interface Mounted {
  modeler: CollaborativeTeamTopologiesModeler;
  host: HTMLElement;
  diagram: Modeler;
  root: HTMLElement;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { modeler, host } of mounted.splice(0)) {
    modeler.destroy();
    host.remove();
  }
  delete document.documentElement.dataset.cdTheme;
  delete document.documentElement.dataset.cdKontrast;
});

async function mountSample(
  modeler: CollaborativeTeamTopologiesModeler = createCollaborativeModeler(),
): Promise<Mounted> {
  const host = document.createElement("div");
  host.style.cssText = "position: fixed; left: 0; top: 0; width: 1280px; height: 800px;";
  document.body.append(host);
  modeler.attachTo(host);
  const diagram = modeler.diagram as Modeler;
  const entry = { modeler, host, diagram, root: diagram.container };
  mounted.push(entry);
  await modeler.importText(onlineShop);
  return entry;
}

function visual(host: HTMLElement, id: string): SVGElement[] {
  return [...host.querySelectorAll<SVGElement>(`[data-element-id="${id}"] > .djs-visual > *`)];
}

/**
 * Every painted part of every element, as `<element id> <tag>.<classes>: <property> <value>`, so
 * two modes compare part by part and a difference names the part.
 */
function paintedParts(host: HTMLElement): Map<string, string> {
  const parts = new Map<string, string>();
  for (const element of host.querySelectorAll<SVGGElement>("g.djs-element[data-element-id]")) {
    const id = element.getAttribute("data-element-id");
    element.querySelectorAll<SVGElement>(":scope > .djs-visual > *").forEach((part, index) => {
      const style = getComputedStyle(part);
      const name = `${id} ${index} ${part.tagName}.${[...part.classList].join(".")}`;
      parts.set(`${name}: fill`, style.fill);
      parts.set(`${name}: stroke`, style.stroke);
    });
  }
  return parts;
}

/** What changed from `before` to `after`, without the part's index, so the lines of a label fold into one. */
function changes(before: Map<string, string>, after: Map<string, string>): string[] {
  const changed = new Set<string>();
  for (const [part, value] of before) {
    if (after.get(part) === value) continue;
    changed.add(`${part.replace(/ \d+ /, " ")} ${value} → ${after.get(part)}`);
  }
  return [...changed].sort();
}

function underlayStrokes(host: HTMLElement, className: string): Record<string, string> {
  return Object.fromEntries(
    [...host.querySelectorAll<SVGElement>(`[data-element-id] .${className}`)].map((underlay) => [
      underlay.closest("[data-element-id]")!.getAttribute("data-element-id")!,
      getComputedStyle(underlay).stroke,
    ]),
  );
}

function strokesOf(ids: string[], stroke: string): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, stroke]));
}

function computedColour(value: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

describe("a dark carrier on the renderer's container", () => {
  test("draws the ground and every role dark, and changes nothing else the canvas shows", async () => {
    const { host, root } = await mountSample();
    const light = paintedParts(host);
    const lightGround = getComputedStyle(root);
    expect([lightGround.backgroundColor, lightGround.backgroundImage]).toEqual([
      LIGHT_GROUND,
      "radial-gradient(rgb(230, 226, 226) 1px, rgba(0, 0, 0, 0) 1px)",
    ]);

    root.dataset.cdTheme = "dark";

    const darkGround = getComputedStyle(root);
    expect([darkGround.backgroundColor, darkGround.backgroundImage]).toEqual([
      BLACK,
      "radial-gradient(rgb(70, 70, 70) 1px, rgba(0, 0, 0, 0) 1px)",
    ]);
    expect(changes(light, paintedParts(host))).toEqual([
      `${ANNOTATION} text.cd-c-fill-text: fill ${BLACK} → ${WHITE}`,
      `${FLOW} polygon.cd-c-unterleger: stroke none → ${KONTUR}`,
      `${FLOW} text.cd-c-fill-text-leise: fill ${LIGHT_TEXT_LEISE} → ${DARK_TEXT_LEISE}`,
    ]);
  });

  test("keeps the templates' colours and the labels on their fills, with no underlay of its own", async () => {
    const { host, root } = await mountSample();
    root.dataset.cdTheme = "dark";

    const [underlay, contour, label] = visual(host, "team_checkout").map((part) =>
      getComputedStyle(part),
    );
    expect([underlay!.fill, underlay!.stroke]).toEqual(["rgb(255, 237, 184)", "none"]);
    expect([contour!.fill, contour!.stroke]).toEqual(["none", "rgb(255, 217, 102)"]);
    expect(label!.fill).toBe(BLACK);
    expect(underlayStrokes(host, "cd-c-unterleger-hoch")).toEqual(
      strokesOf(ON_HIGH_CONTRAST_UNDERLAY, "none"),
    );
  });

  test("lays the flow of change on the dark underlay, 2px wider under its dashes", async () => {
    const { host, root } = await mountSample();
    root.dataset.cdTheme = "dark";

    expect(underlayStrokes(host, "cd-c-unterleger")).toEqual({ [FLOW]: KONTUR });
    const [underlay, contour, label] = visual(host, FLOW);
    const [below, above] = [getComputedStyle(underlay!), getComputedStyle(contour!)];
    expect(underlay!.getAttribute("class")).toBe("cd-c-unterleger");
    expect([below.fill, below.strokeWidth, below.strokeDasharray]).toEqual([
      "none",
      "4px",
      above.strokeDasharray,
    ]);
    expect(underlay!.getAttribute("points")).toBe(contour!.getAttribute("points"));
    expect([above.stroke, above.strokeWidth, contour!.getAttribute("class")]).toEqual([
      FLOW_STROKE,
      "2px",
      null,
    ]);
    expect(label!.tagName).toBe("text");
  });

  test("draws the annotation's bracket and its association in the contour role", async () => {
    const { host, root } = await mountSample();
    const recede = () =>
      [visual(host, ANNOTATION)[0]!, visual(host, ASSOCIATION)[0]!].map((part) => [
        part.getAttribute("class"),
        getComputedStyle(part).stroke,
      ]);
    root.dataset.cdTheme = "dark";
    expect(recede()).toEqual([
      ["cd-c-stroke-kontur", KONTUR],
      ["cd-c-stroke-kontur", KONTUR],
    ]);

    root.dataset.cdKontrast = "hoch";
    expect(recede()).toEqual([
      ["cd-c-stroke-kontur", WHITE],
      ["cd-c-stroke-kontur", WHITE],
    ]);
  });

  test("under high contrast lays the light exception's contours and the flow on white underlays", async () => {
    const { host, root } = await mountSample();
    root.dataset.cdTheme = "dark";
    root.dataset.cdKontrast = "hoch";

    expect(underlayStrokes(host, "cd-c-unterleger-hoch")).toEqual(
      strokesOf(ON_HIGH_CONTRAST_UNDERLAY, WHITE),
    );
    expect(underlayStrokes(host, "cd-c-unterleger")).toEqual({ [FLOW]: WHITE });
    expect(getComputedStyle(visual(host, FLOW)[2]!).fill).toBe(WHITE);
  });

  test("follows the nearest carrier, never one with another mode beyond it", async () => {
    const { host, root } = await mountSample();
    const flowUnderlay = () => underlayStrokes(host, "cd-c-unterleger")[FLOW];
    const annotationText = () => getComputedStyle(visual(host, ANNOTATION)[1]!).fill;

    document.documentElement.dataset.cdTheme = "dark";
    expect([flowUnderlay(), annotationText()]).toEqual([KONTUR, WHITE]);

    root.dataset.cdTheme = "light";
    expect([flowUnderlay(), annotationText()]).toEqual(["none", BLACK]);

    document.documentElement.dataset.cdTheme = "light";
    root.dataset.cdTheme = "dark";
    expect([flowUnderlay(), annotationText()]).toEqual([KONTUR, WHITE]);
  });

  test("opens the label editor of an annotation and a flow in their roles' dark values", async () => {
    const { diagram, root } = await mountSample();
    root.dataset.cdTheme = "dark";
    const labelEditing = diagram.get<TtLabelEditing>("ttLabelEditing");
    const registry = diagram.get<ElementRegistry>("elementRegistry");
    const editorColour = (id: string, theme: "light" | "dark"): string => {
      root.dataset.cdTheme = theme;
      labelEditing.activate(registry.get(id) as unknown as TtElement);
      const field = diagram
        .get<Canvas>("canvas")
        .getContainer()
        .querySelector<HTMLTextAreaElement>("textarea.tt-label-editor")!;
      const colour = getComputedStyle(field).color;
      labelEditing.cancel();
      return colour;
    };

    expect(editorColour(ANNOTATION, "dark")).toBe(WHITE);
    expect(editorColour(FLOW, "dark")).toBe(DARK_TEXT_LEISE);
    expect(editorColour(ANNOTATION, "light")).toBe(BLACK);
    expect(editorColour(FLOW, "light")).toBe(LIGHT_TEXT_LEISE);
    expect(editorColour("team_checkout", "dark")).toBe(BLACK);
  });

  test.each(["light", "dark"])(
    "leaves a move preview in diagram-js's dragger colour, on a %s canvas",
    async (theme) => {
      const { diagram, root } = await mountSample();
      root.dataset.cdTheme = theme;
      const pointer = new Pointer(diagram);
      const start = middle(shape(diagram, ANNOTATION));
      pointer.press(pointer.graphics(ANNOTATION), start);
      pointer.enter();
      pointer.moveTo({ x: start.x + 20, y: start.y + 10 });
      pointer.moveTo({ x: start.x + 60, y: start.y + 30 });
      const dragger = root.querySelector(
        `.djs-dragger[data-preview-support-element-id="${ANNOTATION}"] .djs-visual`,
      )!;
      const draggerColour = getComputedStyle(dragger).getPropertyValue("--element-dragger-color");
      const [bracket, text] = [...dragger.children].map((part) => getComputedStyle(part));

      expect([bracket!.fill, bracket!.stroke]).toEqual(["none", computedColour(draggerColour)]);
      expect(text!.fill).toBe(computedColour(draggerColour));
      pointer.escape();
    },
  );

  test("lays the palette's flow preview on the dark underlay too", async () => {
    const { diagram, root } = await mountSample();
    const palette = diagram.get<Canvas>("canvas").getContainer().querySelector(".djs-palette")!;
    const previewUnderlay = () =>
      getComputedStyle(palette.querySelector('[data-action="flow"] .cd-c-unterleger')!).stroke;

    expect(previewUnderlay()).toBe("none");
    root.dataset.cdTheme = "dark";
    expect(previewUnderlay()).toBe(KONTUR);
    expect(palette.querySelectorAll(".cd-c-unterleger")).toHaveLength(1);
  });
});

// Guide §10.7 and the acceptance test of §13.4: the export is light in every mode, so an SVG
// exported from a dark canvas is the one exported from the light canvas, byte for byte, and so is
// the PNG drawn from it.
describe("the export of a dark canvas", () => {
  const modes: ReadonlyArray<[string, (root: HTMLElement) => void]> = [
    ["dark", (root) => (root.dataset.cdTheme = "dark")],
    [
      "dark with high contrast",
      (root) => {
        root.dataset.cdTheme = "dark";
        root.dataset.cdKontrast = "hoch";
      },
    ],
    [
      "dark on a dark high-contrast page",
      (root) => {
        delete root.dataset.cdTheme;
        delete root.dataset.cdKontrast;
        document.documentElement.dataset.cdTheme = "dark";
        document.documentElement.dataset.cdKontrast = "hoch";
      },
    ],
  ];

  test.each(modes)("is the light SVG, byte for byte, from a canvas %s", async (_mode, apply) => {
    const { diagram, root, host } = await mountSample();
    const light = diagram.saveSVG().svg;
    const lightParts = paintedParts(host);

    apply(root);
    expect(paintedParts(host)).not.toEqual(lightParts);

    const exported = diagram.saveSVG().svg;
    expect(exported).toBe(light);
    expect(exported).not.toContain("cd-c-");
    const parsed = new DOMParser().parseFromString(exported, "image/svg+xml");
    // tiny-svg writes fill and stroke as inline styles, the light values the export keeps.
    const [underlay, contour] = [
      ...parsed.querySelectorAll<SVGElement>(`[data-element-id="${FLOW}"] .djs-visual > polygon`),
    ];
    expect([underlay!.style.stroke, underlay!.getAttribute("class")]).toEqual(["none", null]);
    expect(contour!.style.stroke).toBe(FLOW_STROKE);
  });

  test("is the light SVG of the viewer too", async () => {
    const { diagram, root } = await mountSample(createCollaborativeViewer());
    const light = diagram.saveSVG().svg;
    root.dataset.cdTheme = "dark";
    root.dataset.cdKontrast = "hoch";
    expect(diagram.saveSVG().svg).toBe(light);
  });

  test("draws the light PNG, byte for byte", async () => {
    const { diagram, root } = await mountSample();
    const light = await pngOf(diagram.saveSVG().svg);
    root.dataset.cdTheme = "dark";
    const dark = await pngOf(diagram.saveSVG().svg);

    expect(dark).toBe(light);
    expect(await groundPixel(light)).toEqual([249, 247, 247, 255]);
  });
});

/** The SVG drawn on the light ground at 2×, as "Export as PNG" draws it (guide §10.7), as a data URL. */
async function pngOf(svg: string): Promise<string> {
  const image = await loadedImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth * 2;
  canvas.height = image.naturalHeight * 2;
  const context = canvas.getContext("2d")!;
  context.fillStyle = tokens.hell["--cd-ui-grund"];
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

async function groundPixel(png: string): Promise<number[]> {
  const image = await loadedImage(png);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  return [...context.getImageData(0, 0, 1, 1).data];
}

function loadedImage(source: string): Promise<HTMLImageElement> {
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("the browser could not draw the image"));
    image.src = source;
  });
}
