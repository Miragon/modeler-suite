/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, test } from "vitest";
import { cdp } from "vitest/browser";
import { Modeler } from "@miragon/context-maps-renderer";
import { emptyDocument, type CmDocument } from "@miragon/context-maps-schema-model";
import vendoredTokens from "../../src/theme/cd-tokens.generated.json";

/**
 * The dark canvas behind `themes: ["light"]` (#217): no host asks for it yet, so the tests set a
 * dark carrier on the diagram's container themselves. Under it the colours the renderer chooses
 * itself follow the roles of guide §10.1, the notation and the author's colours keep their values,
 * the lines that would fall below 3:1 show their underlay (§10.6), and every export stays the
 * light one (§10.7, §13.4).
 */

type Theme = "light" | "dark" | "system";

const UNDERLAY = "cd-c-unterleger";
const MODE_CLASS = /\b(cd-c-|cm-c-)/;

function rgb(hex: string): string {
  const value = hex.replace("#", "");
  const channel = (offset: number) => parseInt(value.slice(offset, offset + 2), 16);
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
}

const LIGHT = vendoredTokens.hell;
const DARK = vendoredTokens.dunkel;

const teardowns: Array<() => void> = [];

afterEach(async () => {
  for (const teardown of teardowns.splice(0)) teardown();
  delete document.documentElement.dataset.cdTheme;
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

function mount(theme?: Theme): { modeler: Modeler; container: HTMLDivElement } {
  const container = document.createElement("div");
  if (theme) container.dataset.cdTheme = theme;
  container.style.width = "1200px";
  container.style.height = "900px";
  document.body.appendChild(container);
  const modeler = new Modeler({ container, width: 1200, height: 900 });
  teardowns.push(() => {
    modeler.destroy();
    container.remove();
  });
  modeler.importDocument(everyNotation());
  return { modeler, container };
}

function context(
  id: string,
  x: number,
  y: number,
  fields: Partial<CmDocument["contexts"][number]> = {},
): CmDocument["contexts"][number] {
  return {
    id,
    label: id,
    team: `Team ${id}`,
    position: { x, y },
    size: { width: 200, height: 110 },
    ...fields,
  };
}

/** Each kind of colour the canvas draws: the renderer's own, the notation's and the author's. */
function everyNotation(): CmDocument {
  const doc = emptyDocument("Dark");
  doc.contexts = [
    context("core", 40, 40, { subdomainType: "core" }),
    context("supporting", 440, 40, { subdomainType: "supporting" }),
    context("plain", 40, 400),
    context("filled", 440, 400, { subdomainType: "generic", fill: "#333333" }),
    context("outlined", 840, 400, { stroke: "#333333" }),
  ];
  doc.relationships = [
    { id: "partnership", from: "core", to: "supporting", pattern: "partnership" },
    { id: "shared-kernel", from: "plain", to: "filled", pattern: "shared-kernel" },
    {
      id: "upstream-downstream",
      from: "core",
      to: "plain",
      pattern: "upstream-downstream",
      upstreamRoles: ["OHS", "PL"],
      downstreamRoles: ["ACL"],
    },
    { id: "customer-supplier", from: "filled", to: "outlined", pattern: "customer-supplier" },
  ];
  return doc;
}

function visualOf(container: HTMLElement, id: string): SVGGElement {
  const visual = container.querySelector<SVGGElement>(`[data-element-id="${id}"] .djs-visual`);
  expect(visual, `visual of "${id}"`).not.toBeNull();
  return visual!;
}

function part(container: HTMLElement, id: string, selector: string): SVGElement {
  const element = visualOf(container, id).querySelector<SVGElement>(selector);
  expect(element, `${selector} of "${id}"`).not.toBeNull();
  return element!;
}

function paint(element: Element): { fill: string; stroke: string } {
  const style = getComputedStyle(element);
  return { fill: style.fill, stroke: style.stroke };
}

interface Drawn {
  readonly fill: string;
  readonly stroke: string;
  /** It or the group it inherits its paint from carries a role or underlay class. */
  readonly followsMode: boolean;
}

/** Every shape and text of every element's visual, keyed by element and position, as computed. */
function computedCanvas(container: HTMLElement): Record<string, Drawn> {
  const drawn: Record<string, Drawn> = {};
  for (const visual of container.querySelectorAll(".djs-visual")) {
    const id = visual.closest("[data-element-id]")!.getAttribute("data-element-id");
    [...visual.querySelectorAll("*")].forEach((element, index) => {
      let followsMode = false;
      for (let node: Element | null = element; node && node !== visual; node = node.parentElement) {
        followsMode ||= MODE_CLASS.test(node.getAttribute("class") ?? "");
      }
      const key = `${id} ${index} ${element.localName}.${element.getAttribute("class") ?? ""}`;
      drawn[key] = { ...paint(element), followsMode };
    });
  }
  return drawn;
}

function canvasSvg(container: HTMLElement): string {
  return container.querySelector(".djs-container > svg")!.outerHTML;
}

describe("a dark carrier draws the dark canvas through the roles", () => {
  test("the renderer's own colours take the dark roles", () => {
    const { container } = mount("dark");

    expect(getComputedStyle(container).backgroundColor).toBe(rgb(DARK["--cd-ui-grund"]));
    expect(paint(part(container, "plain", "rect.cm-context-box"))).toEqual({
      fill: rgb(DARK["--cd-ui-plot"]),
      stroke: rgb(DARK["--cd-ui-kontur"]),
    });
    expect(paint(part(container, "plain", "text.cm-name")).fill).toBe(rgb(DARK["--cd-ui-text"]));
    expect(paint(part(container, "plain", "text.cm-team")).fill).toBe(
      rgb(DARK["--cd-ui-text-leise"]),
    );
    for (const shape of part(container, "plain", "g.cm-team").children) {
      expect(paint(shape), "team glyph").toEqual({
        fill: "none",
        stroke: rgb(DARK["--cd-ui-text-leise"]),
      });
    }
    expect(paint(part(container, "shared-kernel", "rect.cm-pattern-chip")).fill).toBe(
      rgb(DARK["--cd-ui-flaeche-hoch"]),
    );
    expect(paint(part(container, "shared-kernel", "rect.cm-pattern-chip + text")).fill).toBe(
      rgb(DARK["--cd-ui-text"]),
    );
    expect(paint(part(container, "upstream-downstream", "rect.cm-role-frame"))).toEqual({
      fill: rgb(DARK["--cd-ui-flaeche-hoch"]),
      stroke: rgb(DARK["--cd-ui-linie"]),
    });
  });

  test("the notation and the author's colours keep their values, the letters their paper halo", () => {
    const light = computedCanvas(mount("light").container);
    const dark = computedCanvas(mount("dark").container);

    const keys = Object.keys(light);
    expect(Object.keys(dark)).toEqual(keys);
    const fixed = keys.filter((key) => !light[key]!.followsMode);
    expect(fixed.length).toBeGreaterThan(30);
    for (const key of fixed) expect(dark[key], key).toEqual(light[key]);
    const followed = keys.filter((key) => light[key]!.followsMode);
    expect(followed.filter((key) => dark[key]!.fill !== light[key]!.fill).length).toBeGreaterThan(
      5,
    );
    const letters = keys.filter((key) => / text\.$/.test(key) && light[key]!.stroke !== "none");
    expect(letters).toHaveLength(4);
    for (const key of letters) expect(dark[key]!.stroke, key).toBe(rgb(LIGHT["--cd-ui-plot"]));
  });

  test("the weak lines and the weak outline the author set show their underlay", () => {
    const { container } = mount("dark");
    const kontur = rgb(DARK["--cd-ui-kontur"]);

    const underlays = [...container.querySelectorAll<SVGElement>(`.djs-visual > .${UNDERLAY}`)];
    expect(
      underlays
        .map((underlay) =>
          [
            underlay.closest("[data-element-id]")!.getAttribute("data-element-id"),
            underlay.localName,
            paint(underlay).stroke,
          ].join(" "),
        )
        .sort(),
    ).toEqual([
      `outlined rect ${kontur}`,
      `partnership path ${kontur}`,
      `partnership rect ${kontur}`,
      `upstream-downstream path ${kontur}`,
    ]);
    const line = part(container, "partnership", "polyline.cm-relationship-line");
    const underlay = part(container, "partnership", `path.${UNDERLAY}`);
    expect(underlay.nextElementSibling, "the underlay lies under the line").toBe(line);
    expect(Number(underlay.style.strokeWidth)).toBe(Number(line.style.strokeWidth) + 2);
    expect(paint(line).stroke, "the line keeps its notation colour").toBe(rgb("#5a54a8"));
  });

  test("the switch is CSS alone: the canvas is not drawn again and the view stays", () => {
    const { modeler, container } = mount("light");
    const canvas = modeler.get<{ viewbox(): { x: number; y: number; scale: number } }>("canvas");
    const before = { svg: canvasSvg(container), viewbox: canvas.viewbox() };

    container.dataset.cdTheme = "dark";

    expect(paint(part(container, "plain", "rect.cm-context-box")).fill).toBe(
      rgb(DARK["--cd-ui-plot"]),
    );
    expect({ svg: canvasSvg(container), viewbox: canvas.viewbox() }).toEqual(before);
  });

  test("system follows the colour scheme of the device", async () => {
    const { container } = mount("system");
    const box = part(container, "plain", "rect.cm-context-box");
    const underlay = part(container, "partnership", `path.${UNDERLAY}`);
    expect([paint(box).fill, paint(underlay).stroke]).toEqual([rgb(LIGHT["--cd-ui-plot"]), "none"]);

    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "dark" }],
    });

    expect([paint(box).fill, paint(underlay).stroke]).toEqual([
      rgb(DARK["--cd-ui-plot"]),
      rgb(DARK["--cd-ui-kontur"]),
    ]);
  });
});

describe("in light the canvas is what it was", () => {
  test("every role class draws the value of its attribute, every underlay is invisible", () => {
    const { container } = mount("light");
    const classed = [...container.querySelectorAll<SVGElement>(".djs-visual [class]")].filter(
      (element) => MODE_CLASS.test(element.getAttribute("class")!),
    );
    expect(classed.length).toBeGreaterThan(15);
    for (const element of classed) {
      const name = `${element.localName}.${element.getAttribute("class")}`;
      if (element.classList.contains(UNDERLAY)) {
        expect(paint(element).stroke, name).toBe("none");
        continue;
      }
      for (const property of ["fill", "stroke"] as const) {
        const drawn = element.style[property];
        if (drawn) expect(paint(element)[property], `${name} ${property}`).toBe(drawn);
      }
    }
  });

  test("a light carrier in a dark page stays light, its underlays too", () => {
    const alone = computedCanvas(mount("light").container);
    document.documentElement.dataset.cdTheme = "dark";
    const { container } = mount("light");

    expect(computedCanvas(container)).toEqual(alone);
    expect(getComputedStyle(container).backgroundColor).toBe(rgb(LIGHT["--cd-ui-grund"]));
  });

  test("high contrast takes the contour and the quiet text to the text colour, no underlay", () => {
    const { container } = mount("light");
    container.dataset.cdKontrast = "hoch";
    const contrast = vendoredTokens.hochkontrast.hell;

    expect(paint(part(container, "plain", "rect.cm-context-box")).stroke).toBe(
      rgb(contrast["--cd-ui-kontur"]),
    );
    expect(paint(part(container, "plain", "text.cm-team")).fill).toBe(
      rgb(contrast["--cd-ui-text-leise"]),
    );
    expect(paint(part(container, "partnership", `path.${UNDERLAY}`)).stroke).toBe("none");
  });
});

describe("the export stays light (guide §10.7, §13.4)", () => {
  test("an SVG exported from a dark canvas is byte-identical to the light one", () => {
    const light = mount("light").modeler.saveSVG().svg;
    const dark = mount("dark").modeler.saveSVG().svg;
    document.documentElement.dataset.cdTheme = "dark";
    const inDarkPage = mount().modeler.saveSVG().svg;

    expect(dark).toBe(light);
    expect(inDarkPage).toBe(light);
  });

  test("carries no mode class, its underlays stay none and a dark page cannot recolour it", () => {
    const svg = mount("dark").modeler.saveSVG().svg;
    expect(svg).not.toMatch(MODE_CLASS);
    expect(svg).toContain('class="cm-context-box"');

    const page = document.createElement("div");
    page.dataset.cdTheme = "dark";
    page.innerHTML = svg.replace(/^<\?xml[^>]*>\s*/, "");
    document.body.appendChild(page);
    teardowns.push(() => page.remove());
    const exported = page.querySelector("svg")!;
    const underlays = exported.querySelectorAll<SVGElement>("path[style*='stroke: none']");
    expect(underlays.length).toBeGreaterThan(0);
    for (const underlay of underlays) expect(paint(underlay).stroke).toBe("none");
    const plain = exported.querySelector('[data-element-id="plain"] rect.cm-context-box')!;
    expect(paint(plain)).toEqual({
      fill: rgb(LIGHT["--cd-ui-plot"]),
      stroke: rgb(LIGHT["--cd-ui-kontur"]),
    });
  });
});
