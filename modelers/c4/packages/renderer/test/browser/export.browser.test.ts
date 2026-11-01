/*
 * The SVG export stays light on its own (SPEC 6.4, 6.7, 9.4): every drawn rect, path and text of
 * an element, a relationship, a boundary and the title carries its paint as a presentation
 * attribute with the light value of its role, so the picture needs neither the page's stylesheet
 * nor its mode. The export drops what belongs to the live canvas only: the drill badges and every
 * `cd-c-*` role class.
 */
import { afterEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { C4_COLOUR_STYLES } from "@miragon/c4-schema-model";
import { createCollaborativeModeler } from "../../src/collaborative/index.js";
import { DRILL_CLASS } from "../../src/draw/drillBadge.js";
import { FEEDBACK_CLASS } from "../../src/draw/drawItems.js";
import { ROLE_LIGHT } from "../../src/draw/styles.js";
import { BOOKSHOP, LIBRARY } from "./fixtures/texts.js";
import { fontsReady, harnessHost, removeHarnessHosts } from "./support/harness.js";

const PAINTED = "rect, path, text, circle, ellipse, line, polyline, polygon";
const CANVAS_GROUND = ".c4-label-ground.cd-c-fill-grund";

const LIGHT_VALUES = {
  fill: new Set(
    Object.values(ROLE_LIGHT)
      .filter(({ attribute }) => attribute === "fill")
      .map(({ value }) => value),
  ),
  stroke: new Set(
    Object.values(ROLE_LIGHT)
      .filter(({ attribute }) => attribute === "stroke")
      .map(({ value }) => value),
  ),
};

afterEach(() => {
  removeHarnessHosts();
  document.documentElement.removeAttribute("data-cd-theme");
});

interface Paints {
  readonly fill: string;
  readonly stroke: string;
}

interface Exported {
  readonly svg: Document;
  /** What the live canvas showed in the light mode, per drawn node, in `drawnNodes` order. */
  readonly live: readonly (DrawnNode & Paints)[];
  /** How many drill badges the live canvas drew. */
  readonly liveDrills: number;
}

async function exported(text: string): Promise<Exported> {
  await fontsReady();
  const modeler = createCollaborativeModeler();
  modeler.attachTo(harnessHost());
  await modeler.importText(text);
  document.documentElement.setAttribute("data-cd-theme", "light");
  const canvasSvg = modeler.diagram
    .get<Canvas>("canvas")
    .getContainer()
    .querySelector<SVGSVGElement>(":scope > svg")!;
  const live = drawnNodes(canvasSvg).map((drawn) => {
    const style = getComputedStyle(drawn.node);
    return { ...drawn, fill: style.fill, stroke: style.stroke };
  });
  const liveDrills = canvasSvg.querySelectorAll(`.${DRILL_CLASS}`).length;
  // The page's mode must not reach the picture.
  document.documentElement.setAttribute("data-cd-theme", "dark");
  const { svg } = modeler.diagram.saveSVG();
  modeler.destroy();
  return { svg: new DOMParser().parseFromString(svg, "image/svg+xml"), live, liveDrills };
}

interface DrawnNode {
  readonly part: string;
  readonly node: Element;
}

/**
 * Every painted node of the drawing, by the part it belongs to, in document order. The drill
 * badge is no part of the picture: the live canvas draws it, the export drops it.
 */
function drawnNodes(svg: ParentNode): DrawnNode[] {
  const pictured = (node: Element) => node.closest(`.${DRILL_CLASS}, .${FEEDBACK_CLASS}`) === null;
  const visuals = [...svg.querySelectorAll("[data-element-id]")].flatMap((gfx) => {
    const part = gfx.getAttribute("data-element-id") ?? "";
    return [...gfx.querySelectorAll(`:scope > .djs-visual :is(${PAINTED})`)]
      .filter(pictured)
      .map((node) => ({ part, node }));
  });
  const layers = [".layer-c4-title", ".layer-c4-frames"].flatMap((layer) =>
    [...svg.querySelectorAll(`${layer} :is(${PAINTED})`)].map((node) => ({ part: layer, node })),
  );
  return [...visuals, ...layers];
}

/** A paint as the page computes it from a presentation attribute alone, with no class. */
function computedFromAttribute(attribute: "fill" | "stroke", value: string | null): string {
  const probe = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  if (value !== null) rect.setAttribute(attribute, value);
  probe.append(rect);
  document.body.append(probe);
  const computed = getComputedStyle(rect)[attribute];
  probe.remove();
  return computed;
}

function roleClasses(svg: Document): string[] {
  return [...svg.querySelectorAll("[class]")].flatMap((node) =>
    [...node.classList].filter((name) => name.startsWith("cd-c-")),
  );
}

/** Every painted node of an exported SVG, wherever it sits, as written. */
function paintedMarkup(svg: string): string[] {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  return [...parsed.querySelectorAll(PAINTED)].map((node) => node.outerHTML);
}

function describeNode({ part, node }: DrawnNode): string {
  return `${part} ${node.tagName}.${node.getAttribute("class") ?? ""}`;
}

/** The node as the export writes it: the same, without its role classes. */
function withoutRoles(node: Element): Element {
  const copy = node.cloneNode(false) as Element;
  for (const name of [...copy.classList].filter((role) => role.startsWith("cd-c-"))) {
    copy.classList.remove(name);
  }
  if (copy.getAttribute("class") === "") copy.removeAttribute("class");
  return copy;
}

describe("the SVG export of the shipped modeler", () => {
  for (const [fixture, text, parts] of [
    ["BOOKSHOP", BOOKSHOP, ["customer", "bookshop", "payments", "rel:customer->bookshop"]],
    ["LIBRARY", LIBRARY, ["reader", "catalogue", "loans", "boundary:library"]],
  ] as const) {
    it(`of ${fixture} drops the drill badges, the feedback rings and every role class`, async () => {
      const { svg, liveDrills } = await exported(text);
      expect(liveDrills, "the live canvas draws drill badges").toBeGreaterThan(0);
      expect(svg.querySelectorAll(`.${DRILL_CLASS}`)).toHaveLength(0);
      expect(svg.querySelectorAll(`.${FEEDBACK_CLASS}`)).toHaveLength(0);
      expect(roleClasses(svg)).toEqual([]);
      expect(svg.querySelectorAll('[class=""]')).toHaveLength(0);
    });

    it(`of ${fixture} looks as the live canvas does in the light mode`, async () => {
      const { svg, live } = await exported(text);
      const nodes = drawnNodes(svg);
      // A label ground in the canvas's ground is no node of the picture: the export cuts it out
      // of what lies beneath (label-layering.browser.test.ts).
      const pictured = live.filter(({ node }) => !node.matches(CANVAS_GROUND));
      expect(pictured.length).toBeLessThan(live.length);
      expect(nodes.map(describeNode)).toEqual(
        pictured.map(({ part, node }) => describeNode({ part, node: withoutRoles(node) })),
      );
      nodes.forEach((drawn, index) => {
        const shown = pictured[index]!;
        for (const attribute of ["fill", "stroke"] as const) {
          expect(
            computedFromAttribute(attribute, drawn.node.getAttribute(attribute)),
            `${describeNode(drawn)} ${attribute}`,
          ).toBe(shown[attribute]);
        }
      });
    });

    it(`of ${fixture} paints every drawn node with the light value of its role`, async () => {
      const { svg } = await exported(text);
      const nodes = drawnNodes(svg);
      for (const part of [...parts, ".layer-c4-title"]) {
        expect(
          nodes.some((node) => node.part === part),
          `the export draws ${part}`,
        ).toBe(true);
      }
      for (const drawn of nodes) {
        const { node } = drawn;
        const fill = node.getAttribute("fill");
        const stroke = node.getAttribute("stroke");
        const painted = [fill, stroke].filter((paint) => paint !== null && paint !== "none");
        expect(painted.length, `${describeNode(drawn)} has a paint`).toBeGreaterThan(0);
        if (fill !== null && fill !== "none") {
          expect(LIGHT_VALUES.fill.has(fill), `${describeNode(drawn)} fill ${fill}`).toBe(true);
        }
        if (stroke !== null && stroke !== "none") {
          expect(LIGHT_VALUES.stroke.has(stroke), `${describeNode(drawn)} stroke ${stroke}`).toBe(
            true,
          );
        }
        expect(node.getAttribute("style"), describeNode(drawn)).toBeNull();
      }
    });
  }

  it("draws the same picture while elements are selected as with nothing selected", async () => {
    await fontsReady();
    const modeler = createCollaborativeModeler();
    modeler.attachTo(harnessHost());
    await modeler.importText(BOOKSHOP);
    const untouched = paintedMarkup(modeler.diagram.saveSVG().svg);
    const selection = modeler.diagram.get<Selection>("selection");
    const registry = modeler.diagram.get<ElementRegistry>("elementRegistry");
    // A relationship gets its bendpoint handles, an element its resize handles, a
    // multi-selection its outline; the handles of a relationship stay once added.
    for (const ids of [["rel:customer->bookshop"], ["bookshop"], ["customer", "payments"]]) {
      selection.select(ids.map((id) => registry.get(id)!));
      expect(paintedMarkup(modeler.diagram.saveSVG().svg), ids.join(", ")).toEqual(untouched);
    }
    expect(
      modeler.diagram.get<Canvas>("canvas").getContainer().querySelector(".djs-bendpoints"),
    ).not.toBeNull();
    modeler.destroy();
  });

  it("writes the same text wherever the pointer rests and whatever is selected", async () => {
    await fontsReady();
    const modeler = createCollaborativeModeler();
    modeler.attachTo(harnessHost());
    await modeler.importText(BOOKSHOP);
    const untouched = modeler.diagram.saveSVG().svg;
    const canvas = modeler.diagram.get<Canvas>("canvas");
    const eventBus = modeler.diagram.get<EventBus>("eventBus");
    const registry = modeler.diagram.get<ElementRegistry>("elementRegistry");
    for (const element of [
      canvas.getRootElement(),
      registry.get("customer")!,
      registry.get("rel:customer->bookshop")!,
    ]) {
      const gfx = canvas.getGraphics(element.id);
      eventBus.fire("element.hover", { element, gfx });
      expect(gfx.classList.contains("hover"), element.id).toBe(true);
      expect(modeler.diagram.saveSVG().svg, `hovering ${element.id}`).toBe(untouched);
      eventBus.fire("element.out", { element, gfx });
    }
    modeler.diagram
      .get<Selection>("selection")
      .select([registry.get("bookshop")!, registry.get("rel:customer->bookshop")!]);
    expect(modeler.diagram.saveSVG().svg, "with a selection").toBe(untouched);
    modeler.destroy();
  });

  it("draws a self-set colour as stored, in every mode of the page", async () => {
    await fontsReady();
    const modeler = createCollaborativeModeler();
    modeler.attachTo(harnessHost());
    await modeler.importText(BOOKSHOP);
    modeler.c4.applyC4Colours();
    const light = modeler.diagram.saveSVG().svg;
    document.documentElement.setAttribute("data-cd-theme", "dark");
    expect(modeler.diagram.saveSVG().svg).toBe(light);
    modeler.destroy();
    const svg = new DOMParser().parseFromString(light, "image/svg+xml");
    const person = C4_COLOUR_STYLES.find(({ tag }) => tag === "Person")!;
    const body = svg.querySelector('[data-element-id="customer"] .djs-visual .c4-body');
    expect(body?.getAttribute("fill")?.toLowerCase()).toBe(person.background.toLowerCase());
    expect(body?.getAttribute("stroke")?.toLowerCase()).toBe(person.stroke.toLowerCase());
    expect([...(body?.classList ?? [])].filter((name) => name.startsWith("cd-c-"))).toEqual([]);
  });
});
