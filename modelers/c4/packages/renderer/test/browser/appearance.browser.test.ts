import { afterEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import { TEXT_RELAYOUT_EVENT } from "../../src/draw/FontRelayout.js";
import type FontRelayout from "../../src/draw/FontRelayout.js";
import { ROLE_LIGHT } from "../../src/draw/styles.js";
import { saveSVG } from "../../src/io/saveSvg.js";
import { legendRows } from "../../src/legend/legendContent.js";
import { renderLegend } from "../../src/legend/renderLegend.js";
import type { Scene } from "../../src/scene/types.js";
import {
  LONG_DESCRIPTION,
  boundary,
  c4Colours,
  element,
  group,
  relationship,
  scene,
} from "../support/handBuiltScenes.js";
import {
  destroyDrawings,
  loadGeist,
  mountDrawing,
  registerGeist,
  removeFonts,
  type MountedDrawing,
} from "./support/drawingHarness.js";

afterEach(() => {
  destroyDrawings();
  removeFonts();
  document.documentElement.removeAttribute("data-cd-theme");
  document.documentElement.removeAttribute("data-cd-kontrast");
});

/** Every part of the drawing at least once: roles and self-set colours, open paths, layers. */
function everyPart(): Scene {
  const customer = element("customer", { kind: "person", at: { x: 0, y: 0 } });
  const shop = element("shop", {
    name: "Internet Banking System",
    description: LONG_DESCRIPTION,
    at: { x: 400, y: 0 },
    drill: { target: "Containers-shop", childCount: 5 },
  });
  const database = element("database", {
    kind: "container",
    shape: "Cylinder",
    technology: "PostgreSQL",
    at: { x: 800, y: 0 },
    style: c4Colours("Container"),
    drill: { target: "Components-database", childCount: 0 },
  });
  const browser = element("browser", { shape: "WebBrowser", at: { x: 0, y: 400 } });
  return scene({
    elements: [customer, shop, database, browser],
    boundaries: [
      boundary("bank", { x: -40, y: -40, width: 1160, height: 700 }, { name: "Big Bank" }),
    ],
    groups: [group("Channels", { x: -20, y: 360, width: 320, height: 240 })],
    relationships: [
      relationship(customer, shop, { description: "Views account balances", technology: "HTTPS" }),
      relationship(shop, database, {
        description: "Reads from",
        style: { stroke: "#1F5A96", text: "#1F5A96", line: "solid" },
      }),
    ],
    title: "System Landscape diagram",
    description: "Every part of the drawing once.",
  });
}

function drawnNodes(drawing: MountedDrawing): SVGElement[] {
  return [
    ...drawing.container.querySelectorAll<SVGElement>(
      ".djs-visual *, .layer-c4-frames *, .layer-c4-title *",
    ),
  ];
}

function roleClasses(node: Element): string[] {
  return [...node.classList].filter((name) => name.startsWith("cd-c-"));
}

function computedPaints(drawing: MountedDrawing): string[] {
  return drawnNodes(drawing).map((node) => {
    const style = getComputedStyle(node);
    return `${node.tagName} ${style.fill} ${style.stroke}`;
  });
}

function exportOf(drawing: MountedDrawing, shown: Scene): string {
  return saveSVG(drawing.diagram.get<Canvas>("canvas"), {
    contentBounds: (padding = 0) =>
      shown.contentBounds && {
        x: shown.contentBounds.x - padding,
        y: shown.contentBounds.y - padding,
        width: shown.contentBounds.width + 2 * padding,
        height: shown.contentBounds.height + 2 * padding,
      },
  }).svg;
}

describe("the drawing stays light, roles switch by CSS only (SPEC 6.4, guide §10.2, §10.7)", () => {
  it("gives every role class its light value as a presentation attribute, never an inline style", () => {
    const drawing = mountDrawing(everyPart());
    const classed = drawnNodes(drawing).filter((node) => roleClasses(node).length > 0);
    expect(classed.length).toBeGreaterThan(30);
    for (const node of classed) {
      for (const role of roleClasses(node)) {
        const light = ROLE_LIGHT[role as keyof typeof ROLE_LIGHT];
        expect(light, `${node.tagName}.${role}`).toBeDefined();
        expect(node.getAttribute(light.attribute), `${node.tagName}.${role}`).toBe(light.value);
      }
    }
    for (const node of drawnNodes(drawing)) {
      expect(node.getAttribute("style"), node.tagName).toBeNull();
    }
  });

  it("draws a self-set colour as stored, with no role class for what it paints", () => {
    const drawing = mountDrawing(everyPart());
    const database = drawing.visual("database");
    const body = database.querySelector(".c4-body")!;
    expect([body.getAttribute("fill"), body.getAttribute("stroke")]).toEqual([
      "#2D72B8",
      "#1F5A96",
    ]);
    expect(roleClasses(body)).toEqual([]);
    for (const text of database.querySelectorAll(":scope > text")) {
      expect(text.getAttribute("fill")).toBe("#FFFFFF");
      expect(roleClasses(text)).toEqual([]);
    }
    const line = drawing.visual("rel:shop->database").querySelector(".c4-line")!;
    expect(line.getAttribute("stroke")).toBe("#1F5A96");
    expect(roleClasses(line)).toEqual([]);
  });

  it("gives open paths fill none and never a fill class", () => {
    const drawing = mountDrawing(everyPart());
    const open = drawing.container.querySelectorAll(
      ".c4-line, .c4-arrow, path.c4-detail, .djs-visual .c4-frame, .layer-c4-frames .c4-frame, .c4-drill circle, .c4-drill line",
    );
    expect(open.length).toBeGreaterThan(8);
    for (const node of open) {
      expect(node.getAttribute("fill"), node.getAttribute("class") ?? node.tagName).toBe("none");
      expect(roleClasses(node).filter((role) => role.startsWith("cd-c-fill"))).toEqual([]);
    }
  });

  it("names Geist first on every text, with size, weight and geometric precision as attributes", () => {
    const drawing = mountDrawing(everyPart());
    const texts = drawing.container.querySelectorAll("svg text");
    expect(texts.length).toBeGreaterThan(15);
    for (const text of texts) {
      expect(text.getAttribute("font-family")).toMatch(/^'Geist Variable', 'Geist',/);
      expect(Number(text.getAttribute("font-size"))).toBeGreaterThan(10);
      expect(text.getAttribute("font-weight")).toMatch(/^[46]00$/);
      expect(text.getAttribute("text-rendering")).toBe("geometricPrecision");
    }
  });

  it("stays light in a light container on a dark page; a dark container switches roles, never self-set colours", () => {
    const drawing = mountDrawing(everyPart());
    const light = computedPaints(drawing);
    document.documentElement.setAttribute("data-cd-theme", "dark");
    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    drawing.container.setAttribute("data-cd-theme", "light");
    expect(computedPaints(drawing)).toEqual(light);

    drawing.container.setAttribute("data-cd-theme", "dark");
    const dark = computedPaints(drawing);
    const nodes = drawnNodes(drawing);
    const roleNodes = nodes.flatMap((node, index) => (roleClasses(node).length > 0 ? [index] : []));
    const selfSet = nodes.flatMap((node, index) =>
      roleClasses(node).length === 0 &&
      (node.getAttribute("fill")?.startsWith("#") || node.getAttribute("stroke")?.startsWith("#"))
        ? [index]
        : [],
    );
    expect(selfSet.length).toBeGreaterThan(3);
    expect(roleNodes.some((index) => dark[index] !== light[index])).toBe(true);
    for (const index of selfSet) expect(dark[index]).toBe(light[index]);
  });

  it("exports byte-identically in every mode of page and container", () => {
    const shown = everyPart();
    const drawing = mountDrawing(shown);
    const reference = exportOf(drawing, shown);
    for (const [page, container, contrast] of [
      ["dark", undefined, undefined],
      ["dark", "light", "hoch"],
      [undefined, "dark", "hoch"],
    ] as const) {
      if (page) document.documentElement.setAttribute("data-cd-theme", page);
      else document.documentElement.removeAttribute("data-cd-theme");
      if (container) drawing.container.setAttribute("data-cd-theme", container);
      if (contrast) drawing.container.setAttribute("data-cd-kontrast", contrast);
      expect(exportOf(drawing, shown)).toBe(reference);
    }
    expect(reference).toContain('class="c4-group"');
    expect(reference).toContain("System Landscape diagram");
  });
});

describe("Geist and the relayout (SPEC 6.3)", () => {
  it("with the faces loaded first, schedules no relayout: a later fonts.load leaves the export as it was", async () => {
    await loadGeist();
    const shown = everyPart();
    const drawing = mountDrawing(shown);
    let relayouts = 0;
    drawing.eventBus.on(TEXT_RELAYOUT_EVENT, () => (relayouts += 1));
    expect(await drawing.diagram.get<FontRelayout>("c4FontRelayout").settled).toBe(false);
    const first = exportOf(drawing, shown);
    await document.fonts.load("600 15px 'Geist Variable'");
    await document.fonts.load("400 13px 'Geist Variable'");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(relayouts).toBe(0);
    expect(exportOf(drawing, shown)).toBe(first);
  });

  it("drawn while the face still loads, lays everything out again once it arrived", async () => {
    registerGeist();
    const shown = everyPart();
    const drawing = mountDrawing(shown);
    const changed: string[] = [];
    let relayouts = 0;
    drawing.eventBus.on(TEXT_RELAYOUT_EVENT, () => (relayouts += 1));
    drawing.eventBus.on(
      ["shape.changed", "connection.changed"],
      (event: { element: { id: string } }) => changed.push(event.element.id),
    );
    expect(await drawing.diagram.get<FontRelayout>("c4FontRelayout").settled).toBe(true);
    expect(relayouts).toBe(1);
    expect(new Set(changed)).toEqual(
      new Set([
        "boundary:bank",
        "customer",
        "shop",
        "database",
        "browser",
        "rel:customer->shop",
        "rel:shop->database",
      ]),
    );
    expect(drawing.canvas.getLayer("c4-title").querySelectorAll("text")).toHaveLength(2);
  });

  it("does nothing once the diagram is destroyed while the face loads", async () => {
    registerGeist();
    const drawing = mountDrawing(everyPart());
    const relayout = drawing.diagram.get<FontRelayout>("c4FontRelayout");
    drawing.destroy();
    expect(await relayout.settled).toBe(false);
  });
});

describe("the legend's rows (SPEC 6.6)", () => {
  it("replaces the body's rows, with the shell's classes and a separator between the parts", () => {
    const body = document.createElement("div");
    body.append(document.createElement("p"));
    document.body.append(body);
    renderLegend(body, legendRows(everyPart()));
    const kinds = [...body.children].map((child) =>
      child.classList.contains("cd-shell-legend-separator")
        ? "|"
        : (child as HTMLElement).dataset.legendKind,
    );
    expect(kinds).toEqual([
      "element",
      "element",
      "element",
      "element",
      "|",
      "boundary",
      "group",
      "|",
      "relationship",
      "relationship",
    ]);
    for (const preview of body.querySelectorAll(".cd-shell-legend-preview svg")) {
      expect(preview.getAttribute("width")).toBe("24");
      for (const node of preview.querySelectorAll("[class]")) {
        for (const role of roleClasses(node)) {
          const light = ROLE_LIGHT[role as keyof typeof ROLE_LIGHT];
          expect(node.getAttribute(light.attribute)).toBe(light.value);
        }
      }
    }
    renderLegend(body, []);
    expect(body.textContent).toBe("Nothing in this view yet");
    body.remove();
  });
});
