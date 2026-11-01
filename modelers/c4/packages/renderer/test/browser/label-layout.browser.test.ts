import { afterEach, describe, expect, it } from "vitest";
import type ElementFactory from "diagram-js/lib/core/ElementFactory";
import type GraphicsFactory from "diagram-js/lib/core/GraphicsFactory";
import type { Shape } from "diagram-js/lib/model/Types";
import { drawnShape } from "../../src/draw/shapes.js";
import { drawSignature } from "../../src/draw/signature.js";
import {
  bandAt,
  boundaryTextLayout,
  elementTextLayout,
  relationshipLabelLayout,
  titleTextLayout,
} from "../../src/text/elementTextLayout.js";
import { TITLE_BLOCK } from "../../src/text/typography.js";
import type { TextBand } from "../../src/text/types.js";
import type { SceneElement } from "../../src/scene/types.js";
import {
  EVERY_SHAPE,
  LONG_DESCRIPTION,
  boundary,
  element,
  group,
  relationship,
  scene,
} from "../support/handBuiltScenes.js";
import { destroyDrawings, drawnBox, inside, mountDrawing } from "./support/drawingHarness.js";

afterEach(destroyDrawings);

function lines(visual: SVGGElement, band: string): SVGTextElement[] {
  return [...visual.querySelectorAll<SVGTextElement>(`text.c4-band-${band}`)];
}

function lineHeight(band: TextBand): number {
  return band.font.size * band.font.lineHeight;
}

function bandsOf(item: SceneElement) {
  return Object.fromEntries(elementTextLayout(item).bands.map((band) => [band.band, band]));
}

const banking = element("banking", {
  name: "Internet Banking System",
  description: "Lets customers view their accounts and make payments.",
  at: { x: 0, y: 0 },
});

describe("the text stack of an element (SPEC 6.3)", () => {
  it("draws name, type line and description in that order, 4 and 8 apart, centred in the text area", () => {
    const { name, type, description } = bandsOf(banking);
    expect([name, type, description].map((band) => band?.band)).toEqual([
      "name",
      "type",
      "description",
    ]);
    expect(type!.box.y - (name!.box.y + name!.box.height)).toBeCloseTo(4, 5);
    expect(description!.box.y - (type!.box.y + type!.box.height)).toBeCloseTo(8, 5);
    const { area } = elementTextLayout(banking);
    const above = name!.box.y - area.y;
    const below = area.y + area.height - (description!.box.y + description!.box.height);
    expect(above).toBeCloseTo(below, 5);
    expect(area).toEqual({ x: 16, y: 16, width: 208, height: 128 });
  });

  it("writes each band in its font, as attributes on every line", () => {
    const drawing = mountDrawing(scene({ elements: [banking] }));
    const visual = drawing.visual("banking");
    const fonts = (band: string) =>
      lines(visual, band).map((line) => [
        line.getAttribute("font-size"),
        line.getAttribute("font-weight"),
        line.getAttribute("font-family")?.startsWith("'Geist Variable'"),
      ]);
    const distinct = (band: string) => new Set(fonts(band).map((font) => font.join()));
    expect(distinct("name")).toEqual(new Set(["15,600,true"]));
    expect(distinct("type")).toEqual(new Set(["12,400,true"]));
    expect(distinct("description")).toEqual(new Set(["13,400,true"]));
    expect(lines(visual, "type")[0]!.textContent).toBe("[Software System]");
  });

  it("wraps by measured glyph widths, so no drawn line is wider than its band", () => {
    const wide = element("wide", {
      name: "WWWWWWWW MMMMMMMM Enterprise Integration Backbone",
      description: "Supercalifragilisticexpialidociouslyunbreakablewordthatneedsbreaking and more",
    });
    const drawing = mountDrawing(scene({ elements: [wide] }));
    const visual = drawing.visual("wide");
    const bands = bandsOf(wide);
    for (const band of ["name", "description"] as const) {
      const drawn = lines(visual, band);
      expect(drawn.length, band).toBeGreaterThan(1);
      for (const line of drawn) {
        expect(line.getComputedTextLength(), line.textContent!).toBeLessThanOrEqual(
          bands[band]!.box.width + 1,
        );
      }
    }
  });

  it("keeps a name to two lines, the second ending in an ellipsis", () => {
    const long = element("long", {
      name: "Customer Relationship Management and Order Fulfilment Coordination Platform",
    });
    const { name } = bandsOf(long);
    expect(name!.lines).toHaveLength(2);
    expect(name!.lines[1]).toMatch(/\S…$/);
    expect(name!.truncated).toBe(true);
  });

  it("fills what the box leaves with the description and ellipsises the last kept line", () => {
    const verbose = element("verbose", { name: "Mainframe", description: LONG_DESCRIPTION });
    const layout = elementTextLayout(verbose);
    const description = layout.bands.find((band) => band.band === "description")!;
    expect(description.truncated).toBe(true);
    expect(description.lines.at(-1)).toMatch(/…$/);
    const bottom = description.box.y + description.box.height;
    expect(bottom).toBeLessThanOrEqual(layout.area.y + layout.area.height + 0.01);
    const room = layout.area.y + layout.area.height - bottom;
    expect(room).toBeLessThan(lineHeight(description));
  });

  it("gives a trailing line break no line, so it neither shifts the stack nor ellipsises", () => {
    const tight = { width: 140, height: 100 };
    const trailing = element("trailing", { name: "A", description: "Line one\n", size: tight });
    const plain = element("plain", { name: "A", description: "Line one", size: tight });
    expect(bandsOf(trailing).description).toMatchObject({ lines: ["Line one"], truncated: false });
    expect(elementTextLayout(trailing).bands).toEqual(elementTextLayout(plain).bands);
    const source = element("source");
    const label = relationshipLabelLayout(relationship(source, plain, { description: "Reads\n" }));
    expect(label.bands.map((band) => band.lines)).toEqual([["Reads"]]);
  });

  it("keeps the description's explicit line breaks, a line feed or the DSL's \\n", () => {
    const broken = element("broken", { name: "A", description: "First\nSecond\\nThird" });
    expect(bandsOf(broken).description!.lines).toEqual(["First", "Second", "Third"]);
  });

  it("drops the type line with `metadata false` and the description with `description false`", () => {
    const plain = element("plain", {
      description: "Something",
      style: { metadata: false, description: false },
    });
    expect(elementTextLayout(plain).bands.map((band) => band.band)).toEqual(["name"]);
  });

  it("keeps an empty name's band for the label editor, and draws no line for it", () => {
    const unnamed = element("unnamed", { name: "" });
    const drawing = mountDrawing(scene({ elements: [unnamed] }));
    const { name } = bandsOf(unnamed);
    expect(name!.lines).toEqual([]);
    expect(name!.box.height).toBeCloseTo(lineHeight(name!), 5);
    expect(lines(drawing.visual("unnamed"), "name")).toEqual([]);
  });

  it("names the field each band edits: technology for a container's type line, none for a system's", () => {
    const api = element("api", { kind: "container", technology: "Java" });
    expect(elementTextLayout(api).bands.map((band) => [band.band, band.field])).toEqual([
      ["name", "name"],
      ["type", "technology"],
    ]);
    expect(elementTextLayout(banking).bands.map((band) => band.field)).toEqual([
      "name",
      undefined,
      "description",
    ]);
  });

  it("draws every line of every shape inside the shape's box and inside its band", () => {
    const items = EVERY_SHAPE.map((shape, index) =>
      element(`shape-${shape}`, {
        shape,
        name: `${shape} with a name that wraps`,
        description: LONG_DESCRIPTION,
        at: { x: (index % 5) * 300, y: Math.floor(index / 5) * 300 },
        drill: { target: "Containers", childCount: 12 },
      }),
    );
    const drawing = mountDrawing(scene({ elements: items }));
    for (const item of items) {
      const visual = drawing.visual(item.id);
      const local = { x: 0, y: 0, width: item.box.width, height: item.box.height };
      for (const node of visual.querySelectorAll<SVGGraphicsElement>("path, circle, rect, text")) {
        expect(inside(local, drawnBox(node)), `${item.shape} ${node.tagName}`).toBe(true);
      }
      for (const band of elementTextLayout(item).bands) {
        const bandBox = { ...band.box, x: band.box.x - item.box.x, y: band.box.y - item.box.y };
        for (const line of lines(visual, band.band)) {
          expect(inside(bandBox, drawnBox(line), 1), `${item.shape} ${band.band}`).toBe(true);
        }
      }
    }
  });

  it("ends the stack above the drill badge", () => {
    const system = element("system", {
      description: LONG_DESCRIPTION,
      drill: { target: "Containers-system", childCount: 3 },
    });
    const drawing = mountDrawing(scene({ elements: [system] }));
    const badge = drawnBox(drawing.visual("system").querySelector<SVGGElement>(".c4-drill")!);
    const last = elementTextLayout(system).bands.at(-1)!;
    expect(last.box.y + last.box.height - system.box.y).toBeLessThanOrEqual(badge.y - 4 + 0.01);
  });

  it("lays the bands out where the lines are drawn, so the label editor covers what it edits", () => {
    const api = element("api", {
      kind: "container",
      technology: "Spring Boot",
      description: "Provides the banking functionality as a JSON API.",
      at: { x: 120, y: 80 },
    });
    const drawing = mountDrawing(scene({ elements: [api] }));
    const visual = drawing.visual("api");
    for (const band of elementTextLayout(api).bands) {
      const drawn = lines(visual, band.band);
      expect(drawn.map((line) => line.textContent)).toEqual(band.lines);
      drawn.forEach((line, index) => {
        const box = drawnBox(line, api.box);
        expect(box.y + box.height / 2).toBeCloseTo(
          band.box.y + (index + 0.5) * lineHeight(band),
          0,
        );
        expect(box.x + box.width / 2).toBeCloseTo(band.box.x + band.box.width / 2, 0);
      });
    }
  });

  it("finds the band under a point across the text area's width, none between or outside", () => {
    const layout = elementTextLayout(banking);
    const [name, type, description] = layout.bands;
    const at = (band: TextBand, x: number) => bandAt(layout, { x, y: band.box.y + 1 })?.band;
    expect([at(name!, 20), at(type!, 200), at(description!, 120)]).toEqual([
      "name",
      "type",
      "description",
    ]);
    const gap = type!.box.y + type!.box.height + 4;
    expect(bandAt(layout, { x: 120, y: gap })).toBeUndefined();
    expect(bandAt(layout, { x: 4, y: name!.box.y + 1 })).toBeUndefined();
  });

  it("draws a shape in its own box when it differs from the scene's, as during a resize", () => {
    const verbose = element("verbose", { name: "Mainframe", description: LONG_DESCRIPTION });
    const drawing = mountDrawing(scene({ elements: [verbose] }));
    const before = lines(drawing.visual("verbose"), "description").map((line) => line.textContent);
    expect(before.at(-1)).toMatch(/…$/);
    const shape = drawing.registry.get("verbose") as Shape;
    shape.width = 400;
    shape.height = 320;
    drawing.diagram
      .get<GraphicsFactory>("graphicsFactory")
      .update("shape", shape, drawing.registry.getGraphics(shape));
    const visual = drawing.visual("verbose");
    const after = lines(visual, "description").map((line) => line.textContent ?? "");
    expect(after[0]!.length).toBeGreaterThan(before[0]!.length);
    expect(after.at(-1)).not.toMatch(/…$/);
    for (const node of visual.querySelectorAll<SVGGraphicsElement>("path, text")) {
      expect(inside({ x: 0, y: 0, width: 400, height: 320 }, drawnBox(node))).toBe(true);
    }
  });

  it("draws a substituted shape as its stand-in (SPEC 6.2)", () => {
    expect(
      ["Robot", "Bucket", "Terminal", "Shell"].map((shape) => drawnShape(shape as "Robot")),
    ).toEqual(["Person", "Cylinder", "Window", "Window"]);
    const robot = element("robot", {
      shape: "Robot",
      kind: "person",
      size: { width: 216, height: 216 },
    });
    const person = element("person", { kind: "person", at: { x: 300, y: 0 } });
    const drawing = mountDrawing(scene({ elements: [robot, person] }));
    const outline = (id: string) =>
      [...drawing.visual(id).querySelectorAll(".c4-body")].map((path) => path.getAttribute("d"));
    expect(outline("robot")).toHaveLength(2);
    expect(outline("robot")).toEqual(outline("person"));
  });
});

describe("a relationship's label (SPEC 6.3)", () => {
  const source = element("source", { at: { x: 0, y: 0 } });
  const destination = element("destination", { at: { x: 600, y: 0 } });

  it("fits two description lines and the technology into its 160 × 48 box, on a ground inside it", () => {
    const item = relationship(source, destination, {
      description: "Makes API calls to read and write the account data of every customer",
      technology: "JSON/HTTPS with a very long technology name",
    });
    const layout = relationshipLabelLayout(item);
    expect(layout.bands.map((band) => [band.band, band.lines.length])).toEqual([
      ["description", 2],
      ["technology", 1],
    ]);
    expect(layout.bands[0]!.lines[1]).toMatch(/…$/);
    expect(layout.bands[1]!.lines[0]).toMatch(/^\[JSON\/HTTPS.*…$/);
    expect(inside(item.labelBox, layout.backing!, 0.01)).toBe(true);
    const drawing = mountDrawing(scene({ elements: [source, destination], relationships: [item] }));
    const visual = drawing.visual(`rel:${item.canvasKey}`);
    const ground = drawnBox(visual.querySelector<SVGRectElement>("rect.c4-label-ground")!);
    for (const line of visual.querySelectorAll<SVGTextElement>("text")) {
      expect(inside(item.labelBox, drawnBox(line), 0.5), line.textContent!).toBe(true);
      expect(line.getComputedTextLength()).toBeLessThanOrEqual(ground.width);
    }
  });

  it("is one line for a technology alone, and nothing at all without either", () => {
    const technologyOnly = relationship(source, destination, { technology: "SMTP" });
    expect(relationshipLabelLayout(technologyOnly).bands.map((band) => band.lines)).toEqual([
      ["[SMTP]"],
    ]);
    const bare = relationship(source, destination);
    expect(relationshipLabelLayout(bare)).toMatchObject({ bands: [], backing: undefined });
    const drawing = mountDrawing(scene({ elements: [source, destination], relationships: [bare] }));
    expect(drawing.visual(`rel:${bare.canvasKey}`).querySelector("rect, text")).toBeNull();
  });
});

describe("captions of boundaries and groups, and the title block (SPEC 6.5)", () => {
  it("puts a boundary's name above its type line, at the bottom left, 12 inside", () => {
    const item = boundary(
      "shop",
      { x: 0, y: 0, width: 400, height: 300 },
      {
        name: "Internet Banking System with a name far too long for its boundary to show",
        typeLine: "[Software System]",
      },
    );
    const layout = boundaryTextLayout(item);
    const [name, type] = layout.bands;
    expect(name!.box.x).toBe(12);
    expect(type!.box.y + type!.box.height).toBeCloseTo(300 - 12, 5);
    expect(name!.box.y + name!.box.height).toBeCloseTo(type!.box.y - 2, 5);
    expect(name!.lines[0]).toMatch(/…$/);
    expect(inside(layout.area, name!.box)).toBe(true);
    const drawing = mountDrawing(scene({ boundaries: [item] }));
    for (const line of drawing.visual("boundary:shop").querySelectorAll<SVGTextElement>("text")) {
      expect(line.getAttribute("text-anchor")).toBe("start");
      expect(line.getComputedTextLength()).toBeLessThanOrEqual(400 - 24 + 1);
    }
  });

  it("writes a group's name at its top left in the layer below the elements", () => {
    const frame = group("Payments/Internal", { x: 40, y: 40, width: 300, height: 200 }, 1);
    const drawing = mountDrawing(
      scene({ groups: [frame], elements: [element("a", { at: { x: 72, y: 72 } })] }),
    );
    const layer = drawing.canvas.getLayer("c4-frames");
    const name = layer.querySelector<SVGTextElement>("text")!;
    expect(name.textContent).toBe("Internal");
    expect(drawnBox(name).x).toBeCloseTo(52, 0);
    expect(drawnBox(name).y).toBeGreaterThanOrEqual(40);
    expect(drawnBox(name).y).toBeLessThan(40 + 32);
  });

  it("draws one title line and at most two description lines, 62 high whatever the text", () => {
    const busy = scene({
      elements: [element("a")],
      title: "Container diagram for Internet Banking System and everything else it connects to",
      description: LONG_DESCRIPTION.repeat(3),
    });
    const layout = titleTextLayout(busy.title);
    expect(layout.bands.map((band) => band.lines.length)).toEqual([1, 2]);
    const bottom = layout.bands.at(-1)!.box.y + layout.bands.at(-1)!.box.height;
    expect(bottom - busy.title.box.y).toBeLessThanOrEqual(TITLE_BLOCK.height);
    const drawing = mountDrawing(busy);
    const title = drawing.canvas.getLayer("c4-title");
    expect(title.querySelectorAll("text")).toHaveLength(3);
    for (const line of title.querySelectorAll<SVGTextElement>("text")) {
      expect(inside(busy.title.box, drawnBox(line), 1), line.textContent!).toBe(true);
    }
  });

  it("draws no title in a view without elements and boundaries", () => {
    const drawing = mountDrawing(scene({}));
    expect(drawing.canvas.getLayer("c4-title").querySelector("text")).toBeNull();
  });
});

describe("drawSignature: what makes the reconciler redraw a kept shape (SPEC 1.5 step 4)", () => {
  const api = element("api", { kind: "container", technology: "Java", at: { x: 0, y: 0 } });
  const web = element("web", { at: { x: 400, y: 0 } });

  it("changes with what is drawn, not with where", () => {
    const moved = { ...api, box: { ...api.box, x: 80, y: 40 } };
    expect(drawSignature(moved)).toBe(drawSignature(api));
    for (const changed of [
      { ...api, name: "API" },
      { ...api, typeLine: "[Container: Kotlin]" },
      { ...api, description: "Serves JSON." },
      { ...api, box: { ...api.box, width: 300 } },
      { ...api, style: { ...api.style, fill: "#2D72B8" } },
      { ...api, drill: { target: "Components-api", childCount: 2 } },
    ]) {
      expect(drawSignature(changed)).not.toBe(drawSignature(api));
    }
  });

  it("tells elements, boundaries and relationships apart, and follows a label box that moved", () => {
    const frame = boundary("api", { x: 0, y: 0, width: 240, height: 160 }, { name: "api" });
    expect(drawSignature(frame)).not.toBe(drawSignature(api));
    const link = relationship(api, web, { description: "Calls" });
    const shifted = { ...link, labelBox: { ...link.labelBox, x: link.labelBox.x + 10 } };
    expect(drawSignature(shifted)).not.toBe(drawSignature(link));
    expect(drawSignature({ ...link, vertices: [{ x: 1, y: 2 }] })).toBe(drawSignature(link));
  });
});

describe("previews and shapes the scene does not know", () => {
  function added(attributes: Record<string, unknown>): SVGGElement {
    const drawing = mountDrawing(scene({}));
    const factory = drawing.diagram.get<ElementFactory>("elementFactory");
    const shape = factory.createShape({ x: 0, y: 0, width: 240, height: 160, ...attributes });
    drawing.canvas.addShape(shape, drawing.canvas.getRootElement());
    return drawing.visual(shape.id);
  }

  it("draws a palette preview as its kind's default shape, with its name and type line", () => {
    const database = added({
      id: "preview:1",
      c4: { role: "preview", kind: "container", name: "Database", tags: ["Database"] },
    });
    expect(database.querySelectorAll(".c4-body")).toHaveLength(1);
    expect(database.querySelectorAll("path.c4-detail")).toHaveLength(1);
    expect([...database.querySelectorAll("text")].map((text) => text.textContent)).toEqual([
      "Database",
      "[Container]",
    ]);
    const person = added({
      id: "preview:2",
      width: 216,
      height: 216,
      c4: { role: "preview", kind: "person" },
    });
    expect(person.querySelectorAll(".c4-body")).toHaveLength(2);
    expect([...person.querySelectorAll("text")].map((text) => text.textContent)).toEqual([
      "Person",
      "[Person]",
    ]);
  });

  it("draws an element the scene lacks as a plain box in the default look, without failing", () => {
    const unknown = added({ id: "ghost", c4: { role: "element", id: "ghost" } });
    const body = unknown.querySelector(".c4-body")!;
    expect(body.classList.contains("cd-c-fill-plot")).toBe(true);
    expect(unknown.querySelector("text")).toBeNull();
  });
});
