/*
 * The feedback of a connect and a bendpoint drag (guide §10.1, §10.4): the line they would write
 * while they run, the marks on source and target, which never repaint a C4 colour, the reason of a
 * refused drop, the bendpoint handles C4 offers, and the hover and selection of the canvas.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type GraphicsFactory from "diagram-js/lib/core/GraphicsFactory";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Connection, Element, Shape } from "diagram-js/lib/model/Types";
import type { CollaborativeDiagram } from "../../src/collaborative/index.js";
import { contrastRatio } from "../../src/draw/colour.js";
import { hell } from "../../src/theme/cd-tokens.generated.json";
import type C4Modeling from "../../src/modeling/C4Modeling.js";
import type C4Rules from "../../src/rules/C4Rules.js";
import { endOfShape } from "../../src/modeling/C4Layouter.js";
import { dockOn } from "../../src/modeling/geometry.js";
import { EDIT_REFUSED_EVENT, type EditRefusedEvent } from "../../src/services.js";
import { boundary, element, relationship, scene } from "../support/handBuiltScenes.js";
import { mountDrawing, destroyDrawings } from "./support/drawingHarness.js";
import { BOOKSHOP, LIBRARY } from "./fixtures/texts.js";
import { mountModeler, removeHarnessHosts, shapeIn } from "./support/harness.js";
import { pointerOn, pressEscape, type Point, type Pointer } from "./support/pointer.js";

let modeler: CollaborativeDiagram;
let refused: EditRefusedEvent[];

beforeEach(async () => {
  modeler = await mountModeler();
  await modeler.importText(BOOKSHOP);
  refused = [];
  service<EventBus>("eventBus").on(EDIT_REFUSED_EVENT, (event: EditRefusedEvent) => {
    refused.push({ reason: event.reason, message: event.message });
  });
});

afterEach(() => {
  modeler.destroy();
  removeHarnessHosts();
  destroyDrawings();
});

function service<T>(name: string): T {
  return modeler.diagram.get<T>(name);
}

function node(id: string): Shape {
  return shapeIn(modeler, id);
}

function graphics(id: string): SVGElement {
  return service<ElementRegistry>("elementRegistry").getGraphics(id);
}

function connection(id: string): Connection {
  return service<ElementRegistry>("elementRegistry").get(id) as Connection;
}

function centreOf(id: string): Point {
  const { x, y, width, height } = node(id);
  return { x: x + width / 2, y: y + height / 2 };
}

function container(): HTMLElement {
  return service<Canvas>("canvas").getContainer();
}

/** A connect from the element's centre, as the context pad's Connect starts it, the pointer gone off it. */
function startConnect(from: string): Pointer {
  const pointer = pointerOn(modeler.diagram);
  service<{ start(event: MouseEvent, start: Shape, autoActivate: boolean): void }>("connect").start(
    pointer.event("mousedown", centreOf(from)),
    node(from),
    true,
  );
  graphics(from).dispatchEvent(pointer.event("mouseout", centreOf(from)));
  return pointer;
}

function previewLine(): SVGPathElement | null {
  return container().querySelector<SVGPathElement>(".djs-dragger .c4-line");
}

function pointsOf(path: SVGPathElement): Point[] {
  return [...(path.getAttribute("d") ?? "").matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map(
    ([, x, y]) => ({ x: Number(x), y: Number(y) }),
  );
}

function rgb(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

function hexOf(computed: string): string {
  const [r = 0, g = 0, b = 0] = (computed.match(/\d+/g) ?? []).map(Number);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** diagram-js rounds a drag's position, and the harness host may sit at a fractional offset. */
function expectNear(actual: Point, expected: Point): void {
  expect(Math.abs(actual.x - expected.x), `x ${actual.x} near ${expected.x}`).toBeLessThanOrEqual(
    1,
  );
  expect(Math.abs(actual.y - expected.y), `y ${actual.y} near ${expected.y}`).toBeLessThanOrEqual(
    1,
  );
}

const INTERACTION = rgb(hell["--cd-ui-interaktion"]);
const exportedText = () => modeler.exportText();

describe("the line a connect would write (guide §10.1)", () => {
  it("runs from the source to the target's outline, dashed in the interaction blue, with the chevron and no label", () => {
    const pointer = startConnect("customer");
    pointer.hover(centreOf("payments"), graphics("payments"));

    const line = previewLine();
    expect(line, "a preview line while the connect runs").not.toBeNull();
    expect(line!.classList.contains("cd-c-stroke-interaktion")).toBe(true);
    expect(line!.getAttribute("stroke-dasharray")).not.toBeNull();
    expect(getComputedStyle(line!).stroke).toBe(INTERACTION);
    expect(container().querySelector(".djs-dragger .c4-arrow")).not.toBeNull();
    expect(container().querySelector(".djs-dragger text")).toBeNull();
    const points = pointsOf(line!);
    const end = points.at(-1)!;
    const docked = dockOn(
      endOfShape(service<GraphicsFactory>("graphicsFactory"), node("payments")),
      points.at(-2)!,
    );
    expect(end).toEqual(docked);
    pressEscape();
    expect(previewLine()).toBeNull();
  });

  it("is the line its drop draws, also on a slant", async () => {
    await service<{ open(key: string, options: { cause: string }): Promise<void> | void }>(
      "c4Views",
    ).open("BookshopContext", { cause: "user" });
    const pointer = startConnect("customer");
    pointer.hover(centreOf("mail"), graphics("mail"));
    const points = pointsOf(previewLine()!);
    pointer.release(centreOf("mail"));

    const drawn = connection("rel:customer->mail").waypoints.map(({ x, y }) => ({ x, y }));
    expect(points).toEqual(drawn);
  });

  it("marks the source while it runs, and the target it would reach", () => {
    const pointer = startConnect("customer");
    pointer.hover(centreOf("payments"), graphics("payments"));
    expect(graphics("customer").classList.contains("c4-connect-source")).toBe(true);
    expect(graphics("payments").classList.contains("connect-ok")).toBe(true);
    const outline = graphics("customer").querySelector(".djs-outline")!;
    expect(getComputedStyle(outline).visibility).toBe("visible");

    pressEscape();
    expect(graphics("customer").classList.contains("c4-connect-source")).toBe(false);
  });

  it("calls nothing forbidden over the canvas, a boundary or a relationship: the dotted line follows the pointer", async () => {
    const pointer = startConnect("customer");
    pointer.hover({ x: 300, y: 470 });
    expect(pointer.svg.classList.contains("connect-not-ok")).toBe(false);
    expect(getComputedStyle(pointer.svg).cursor).not.toBe("not-allowed");
    expect(container().querySelector(".djs-dragger path")).not.toBeNull();
    pressEscape();

    const rules = service<{ allowed(action: string, context: object): unknown }>("rules");
    const allowed = (target: Element) =>
      rules.allowed("connection.create", { source: node("customer"), target });
    expect(allowed(service<Canvas>("canvas").getRootElement() as Element)).toBeNull();
    expect(allowed(connection("rel:bookshop->payments"))).toBeNull();
    await modeler.importText(LIBRARY);
    expect(
      rules.allowed("connection.create", {
        source: node("reader"),
        target: service<ElementRegistry>("elementRegistry").get("boundary:library"),
      }),
    ).toBeNull();
  });

  it("the armed connect tool marks no canvas, boundary or relationship as forbidden, and an element as a start", async () => {
    const rules = service<{ allowed(action: string, context: object): unknown }>("rules");
    const start = (source: unknown) => rules.allowed("connection.start", { source });
    expect(start(service<Canvas>("canvas").getRootElement())).toBeNull();
    expect(start(connection("rel:bookshop->payments"))).toBeNull();
    expect(start(node("customer"))).toBe(true);

    const pointer = pointerOn(modeler.diagram);
    pointer.pressPalette("global-connect-tool");
    pointer.hover({ x: 300, y: 470 });
    expect(pointer.svg.classList.contains("connect-not-ok")).toBe(false);
    pointer.hover(centreOf("payments"), graphics("payments"));
    expect(graphics("payments").classList.contains("connect-ok")).toBe(true);
    pressEscape();

    await modeler.importText(LIBRARY);
    const frame = service<ElementRegistry>("elementRegistry").get("boundary:library");
    expect(start(frame)).toBeNull();
  });

  it("shows the crosshair over a target it would reach", () => {
    const pointer = startConnect("customer");
    pointer.hover(centreOf("payments"), graphics("payments"));
    const hit = graphics("payments").querySelector(".djs-hit")!;
    expect(getComputedStyle(hit).cursor).toBe("crosshair");
    pressEscape();
  });
});

describe("a refused connect", () => {
  it("marks the source itself as no target, and its drop says why and writes nothing", () => {
    const before = exportedText();
    const pointer = startConnect("customer");
    pointer.hover(centreOf("customer"), graphics("customer"));
    expect(graphics("customer").classList.contains("connect-not-ok")).toBe(true);
    pointer.release(centreOf("customer"));

    expect(refused).toEqual([
      { reason: "not-allowed", message: "An element can't have a relationship to itself." },
    ]);
    expect(exportedText()).toBe(before);
  });

  it("says why in the edit layer's own words", async () => {
    await modeler.importText(
      [
        "workspace {",
        "    model {",
        '        user = person "User"',
        '        shop = softwareSystem "Shop" {',
        '            web = container "Web"',
        "        }",
        '        partner = softwareSystem "Partner"',
        "        user -> web",
        "        shop -> partner",
        "    }",
        "    views {",
        "        systemContext shop {",
        "            include *",
        "        }",
        "    }",
        "}",
        "",
      ].join("\n"),
    );
    const rules = service<C4Rules>("c4Rules");
    const modeling = service<C4Modeling>("modeling");
    const shape = (id: string) => ({ id, c4: { role: "element", id } }) as unknown as Shape;
    const pairs = [
      ["user", "user"],
      ["shop", "web"],
      ["web", "shop"],
      ["shop", "partner"],
      ["user", "shop"],
    ] as const;
    for (const [from, to] of pairs) {
      const said = rules.connectRefusal(shape(from), shape(to));
      expect(said, `${from} -> ${to} is refused`).toBeDefined();
      expect(said?.level, `${from} -> ${to} explains a rule`).toBe("info");
      refused = [];
      modeling.connect(shape(from), shape(to));
      expect(refused, `${from} -> ${to}`).toEqual([
        { reason: said?.reason, message: said?.message },
      ]);
    }
    expect(rules.connectRefusal(shape("partner"), shape("user"))).toBeUndefined();
  });

  it("over a relationship without a description already drawn, never writes the reverse", () => {
    const first = startConnect("customer");
    first.hover(centreOf("payments"), graphics("payments"));
    first.release(centreOf("payments"));
    expect(exportedText()).toContain("customer -> payments\n");
    const once = exportedText();

    const again = startConnect("customer");
    again.hover(centreOf("payments"), graphics("payments"));
    expect(graphics("payments").classList.contains("connect-not-ok")).toBe(true);
    expect(previewLine(), "no relationship line toward a refused target").toBeNull();
    again.release(centreOf("payments"));

    expect(exportedText()).toBe(once);
    expect(exportedText()).not.toContain("payments -> customer");
    expect(refused).toEqual([
      {
        reason: "relationship-exists",
        message: "These are already connected by a relationship without a description.",
      },
    ]);
  });
});

describe("the connect and drop marks paint a ring around the target, never its body (guide §10.6)", () => {
  async function coloured(): Promise<void> {
    modeler.c4.applyC4Colours();
    await Promise.resolve();
  }

  function body(id: string): SVGPathElement {
    return graphics(id).querySelector<SVGPathElement>(".djs-visual > .c4-body")!;
  }

  function ring(id: string): SVGPathElement {
    return graphics(id).querySelector<SVGPathElement>(".djs-visual > :first-child")!;
  }

  it("is the visual's first child, hidden at rest, so the drawing's bounds stay the box", async () => {
    await coloured();
    expect(ring("bookshop").classList.contains("c4-feedback")).toBe(true);
    expect(getComputedStyle(ring("bookshop")).display).toBe("none");
    const visual = graphics("bookshop").querySelector<SVGGElement>(".djs-visual")!;
    const { x, y, width, height } = visual.getBBox();
    const shape = node("bookshop");
    expect(x).toBeGreaterThanOrEqual(-0.01);
    expect(y).toBeGreaterThanOrEqual(-0.01);
    expect(x + width).toBeLessThanOrEqual(shape.width + 0.01);
    expect(y + height).toBeLessThanOrEqual(shape.height + 0.01);
  });

  for (const marker of ["connect-ok", "connect-not-ok"] as const) {
    it(`${marker}: the body keeps its C4 fill, and every text 4.5:1 on it`, async () => {
      await coloured();
      const fill = body("bookshop").getAttribute("fill")!;
      service<Canvas>("canvas").addMarker(node("bookshop"), marker);

      expect(getComputedStyle(body("bookshop")).fill).toBe(rgb(fill));
      expect(getComputedStyle(ring("bookshop")).display).not.toBe("none");
      const texts = [...graphics("bookshop").querySelectorAll(".djs-visual > text")];
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) {
        const colour = hexOf(getComputedStyle(text).fill);
        expect(contrastRatio(colour, fill), text.textContent ?? "").toBeGreaterThanOrEqual(4.5);
      }
      if (marker === "connect-ok") {
        expect(getComputedStyle(ring("bookshop")).stroke).toBe(INTERACTION);
      }
    });
  }

  it("a move preview shows no ring", () => {
    service<Selection>("selection").select(node("bookshop"));
    const held = pointerOn(modeler.diagram).grab("bookshop", { x: 60, y: 40 });
    const rings = [...container().querySelectorAll(".djs-dragger .c4-feedback")];
    expect(rings.length).toBeGreaterThan(0);
    for (const dragged of rings) expect(getComputedStyle(dragged).display).toBe("none");
    held.cancel();
  });
});

describe("bendpoints (guide §10.4)", () => {
  function bendpointMove(): {
    start(event: MouseEvent, connection: Connection, index: number, insert: boolean): void;
  } {
    return service("bendpointMove");
  }

  it("a bendpoint drag draws the line through the pointer while it moves, docked at both ends", () => {
    const relationship = connection("rel:customer->bookshop");
    const [first, last] = relationship.waypoints;
    const middle = {
      x: Math.floor((first!.x + last!.x) / 2),
      y: Math.floor((first!.y + last!.y) / 2),
    };
    const pointer = pointerOn(modeler.diagram);
    bendpointMove().start(pointer.event("mousedown", middle), relationship, 1, true);
    pointer.moveTo({ x: middle.x, y: middle.y + 30 });
    pointer.moveTo({ x: middle.x, y: middle.y + 80 });

    const line = previewLine();
    expect(line, "a preview line while the bendpoint moves").not.toBeNull();
    const points = pointsOf(line!);
    expect(points).toHaveLength(3);
    expectNear(points[1]!, { x: middle.x, y: middle.y + 80 });
    expect(container().querySelector(".djs-dragger .c4-arrow")).not.toBeNull();
    pressEscape();
    expect(previewLine()).toBeNull();
  });

  it("a bendpoint dragged into an end's box leaves the preview straight, as its drop will", () => {
    const relationship = connection("rel:customer->bookshop");
    const [first, last] = relationship.waypoints;
    const middle = {
      x: Math.floor((first!.x + last!.x) / 2),
      y: Math.floor((first!.y + last!.y) / 2),
    };
    const insideBookshop = { x: node("bookshop").x + 30, y: node("bookshop").y + 30 };
    const pointer = pointerOn(modeler.diagram);
    bendpointMove().start(pointer.event("mousedown", middle), relationship, 1, true);
    pointer.moveTo({ x: middle.x, y: middle.y + 30 });
    pointer.moveTo(insideBookshop);

    const line = previewLine();
    expect(line, "a preview line while the bendpoint moves").not.toBeNull();
    const points = pointsOf(line!);
    expect(points, "the vertex inside the end is left out").toHaveLength(2);
    pressEscape();
    expect(points).toEqual(relationship.waypoints.map(({ x, y }) => ({ x, y })));
  });

  it("a bendpoint dragged into an end's box after a bend leaves the preview as straight as its drop", () => {
    const relationship = connection("rel:customer->bookshop");
    const [first, last] = relationship.waypoints;
    service<C4Modeling>("modeling").updateWaypoints(relationship, [
      first!,
      { x: 330, y: 420 },
      last!,
    ]);
    const bent = connection("rel:customer->bookshop");
    const insideBookshop = { x: node("bookshop").x + 30, y: node("bookshop").y + 30 };
    const pointer = pointerOn(modeler.diagram);
    bendpointMove().start(pointer.event("mousedown", { x: 330, y: 420 }), bent, 1, false);
    pointer.moveTo({ x: 340, y: 420 });
    pointer.moveTo(insideBookshop);
    const points = pointsOf(previewLine()!);
    pointer.hover(insideBookshop);
    pointer.release(insideBookshop);

    expect(exportedText()).not.toContain('"c4modeler.relationship.customer->bookshop"');
    const drawn = connection("rel:customer->bookshop").waypoints.map(({ x, y }) => ({ x, y }));
    expect(drawn).toHaveLength(2);
    expect(points).toEqual(drawn);
  });

  it("a press on the middle of a straight line and a drag add exactly one vertex", () => {
    const relationship = connection("rel:customer->bookshop");
    const [first, last] = relationship.waypoints;
    expect(first!.y).toBe(last!.y);
    const middle = { x: Math.floor((first!.x + last!.x) / 2), y: first!.y };
    const pointer = pointerOn(modeler.diagram);
    pointer.press(graphics("rel:customer->bookshop"), middle);
    pointer.moveTo({ x: middle.x, y: middle.y + 40 });
    pointer.moveTo({ x: middle.x, y: middle.y + 120 });
    expect(pointer.dragPrefix()).toBe("bendpoint.move");
    pointer.hover({ x: middle.x, y: middle.y + 120 });
    pointer.release({ x: middle.x, y: middle.y + 120 });

    const written = /"c4modeler\.relationship\.customer->bookshop" "([^"]*)"/.exec(exportedText());
    const vertices = (written?.[1] ?? "").split(" ").filter(Boolean);
    expect(vertices).toHaveLength(1);
    const [x = NaN, y = NaN] = vertices[0]!.split(",").map(Number);
    expectNear({ x, y }, { x: middle.x, y: middle.y + 120 });
    expect(relationship.waypoints).toHaveLength(3);
  });

  it("hides the handles at the ends, which would start a reconnect, and keeps the inner ones", () => {
    const relationship = connection("rel:customer->bookshop");
    const [first, last] = relationship.waypoints;
    service<C4Modeling>("modeling").updateWaypoints(relationship, [
      first!,
      { x: 330, y: 400 },
      last!,
    ]);
    service<Selection>("selection").select(relationship);
    const handles = [
      ...container().querySelectorAll(
        '.djs-bendpoints[data-element-id="rel:customer->bookshop"] > .djs-bendpoint:not(.floating)',
      ),
    ];
    expect(handles).toHaveLength(3);
    expect(handles.map((handle) => handle.classList.contains("c4-bendpoint-end"))).toEqual([
      true,
      false,
      true,
    ]);
    expect(handles.map((handle) => getComputedStyle(handle).display !== "none")).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("shows no segment handle on a hovered or selected straight line, whose hover then holds", () => {
    const relationship = connection("rel:customer->bookshop");
    const [first, last] = relationship.waypoints;
    expect(first!.y).toBe(last!.y);
    const eventBus = service<EventBus>("eventBus");
    const hovered: string[] = [];
    eventBus.on("element.hover", ({ element }: { element: Element }) => hovered.push(element.id));
    const pointer = pointerOn(modeler.diagram);
    const middle = { x: Math.floor((first!.x + last!.x) / 2) - 30, y: first!.y };
    pointer.hover(middle, graphics(relationship.id));
    const segments = [
      ...container().querySelectorAll(
        '.djs-bendpoints[data-element-id="rel:customer->bookshop"] .djs-segment-dragger',
      ),
    ];
    expect(segments.length, "diagram-js draws a segment handle on a straight line").toBe(1);
    expect(getComputedStyle(segments[0]!).display).toBe("none");
    const { clientX, clientY } = pointer.client(middle);
    const under = document.elementFromPoint(clientX, clientY);
    expect(under?.closest(".djs-segment-dragger")).toBeNull();
    service<Selection>("selection").select(relationship);
    expect(getComputedStyle(segments[0]!).display).toBe("none");
    expect(hovered).toEqual([relationship.id]);
  });

  it("drops a vertex that lies inside an end's box, and writes nothing when none is left to change", () => {
    const relationship = connection("rel:customer->bookshop");
    const [first, last] = relationship.waypoints;
    const insideBookshop = centreOf("bookshop");
    service<C4Modeling>("modeling").updateWaypoints(relationship, [
      first!,
      { x: 330, y: 400 },
      insideBookshop,
      last!,
    ]);
    expect(exportedText()).toContain('"c4modeler.relationship.customer->bookshop" "330,400"\n');

    const before = exportedText();
    service<C4Modeling>("modeling").updateWaypoints(relationship, [
      first!,
      { x: 330, y: 400 },
      centreOf("customer"),
      last!,
    ]);
    expect(exportedText()).toBe(before);
    expect(refused).toEqual([]);
  });
});

describe("hover and selection (guide §10.4)", () => {
  function hover(element: Element): void {
    service<EventBus>("eventBus").fire("element.hover", {
      element,
      gfx: service<ElementRegistry>("elementRegistry").getGraphics(element),
    });
  }

  it("outlines a hovered element in the dashed interaction blue, never a boundary", async () => {
    hover(node("bookshop"));
    const outline = graphics("bookshop").querySelector(".djs-outline")!;
    expect(getComputedStyle(outline).visibility).toBe("visible");
    expect(getComputedStyle(outline).stroke).toBe(INTERACTION);

    await modeler.importText(LIBRARY);
    const frame = service<ElementRegistry>("elementRegistry").get("boundary:library") as Element;
    hover(frame);
    const frameOutline = graphics("boundary:library").querySelector(".djs-outline")!;
    expect(getComputedStyle(frameOutline).visibility).toBe("hidden");
  });

  it("strokes a hovered and a selected relationship in the interaction blue, the label ground outlined", () => {
    const relationship = connection("rel:bookshop->payments");
    const line = graphics(relationship.id).querySelector(".c4-line")!;
    const arrow = graphics(relationship.id).querySelector(".c4-arrow")!;
    expect(getComputedStyle(line).stroke).not.toBe(INTERACTION);

    hover(relationship);
    expect(getComputedStyle(line).stroke).toBe(INTERACTION);
    service<EventBus>("eventBus").fire("element.out", {
      element: relationship,
      gfx: graphics(relationship.id),
    });
    expect(getComputedStyle(line).stroke).not.toBe(INTERACTION);

    service<Selection>("selection").select(relationship);
    expect(getComputedStyle(line).stroke).toBe(INTERACTION);
    expect(getComputedStyle(arrow).stroke).toBe(INTERACTION);
    const ground = service<ElementRegistry>("elementRegistry")
      .getGraphics(relationship.id, true)
      .querySelector(".c4-label-ground")!;
    expect(getComputedStyle(ground).stroke).toBe(INTERACTION);
  });

  it("a create tints no canvas: the preview is the feedback", () => {
    const svg = pointerOn(modeler.diagram).svg;
    svg.classList.add("new-parent");
    expect(getComputedStyle(svg).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    svg.classList.remove("new-parent");
  });

  it("the drill badge answers the pointer like a button", async () => {
    const hit = graphics("bookshop").querySelector(".djs-hit.c4-drill");
    if (!hit) throw new Error("bookshop draws no drill badge");
    const chip = graphics("bookshop").querySelector<SVGRectElement>(
      ".djs-visual .c4-drill > rect",
    )!;
    expect(getComputedStyle(chip).fill).toBe(rgb(hell["--cd-ui-flaeche-hoch"]));
    await userEvent.hover(hit);
    expect(getComputedStyle(chip).fill).toBe(rgb(hell["--cd-ui-hover"]));
    expect(getComputedStyle(chip).stroke).toBe(INTERACTION);
  });
});

describe("the label's ground is what lies behind it (guide §10.1, Label-Halo)", () => {
  const customer = element("customer", { kind: "person", at: { x: 0, y: 0 } });
  const shop = element("shop", { at: { x: 600, y: 0 } });

  function groundOf(shown: ReturnType<typeof scene>): SVGRectElement {
    const drawing = mountDrawing(shown);
    return drawing.label("rel:customer->shop").querySelector<SVGRectElement>(".c4-label-ground")!;
  }

  it("the canvas's ground role by default", () => {
    const ground = groundOf(
      scene({
        elements: [customer, shop],
        relationships: [relationship(customer, shop, { description: "Uses" })],
      }),
    );
    expect(ground.classList.contains("cd-c-fill-grund")).toBe(true);
    expect(ground.getAttribute("fill")).toBe(hell["--cd-ui-grund"]);
  });

  it("the fill of the innermost filled boundary under it", () => {
    const ground = groundOf(
      scene({
        elements: [customer, shop],
        boundaries: [
          boundary(
            "outer",
            { x: -80, y: -80, width: 1080, height: 520 },
            {
              style: { fill: "#DDEEFF" },
            },
          ),
          boundary(
            "inner",
            { x: -40, y: -40, width: 1000, height: 400 },
            {
              style: { fill: "#EEF5FF" },
              depth: 1,
            },
          ),
        ],
        relationships: [relationship(customer, shop, { description: "Uses" })],
      }),
    );
    expect(ground.getAttribute("fill")).toBe("#EEF5FF");
    expect(ground.classList.contains("cd-c-fill-grund")).toBe(false);
  });

  it("the plot white where the label's text would lose 4.5:1 on what lies behind", () => {
    const onDark = groundOf(
      scene({
        elements: [customer, shop],
        boundaries: [
          boundary(
            "dark",
            { x: -80, y: -80, width: 1080, height: 520 },
            {
              style: { fill: "#1D3557" },
            },
          ),
        ],
        relationships: [relationship(customer, shop, { description: "Uses" })],
      }),
    );
    expect(onDark.getAttribute("fill")).toBe(hell["--cd-ui-plot"]);
    destroyDrawings();

    const tunedOnWhite = groundOf(
      scene({
        elements: [customer, shop],
        relationships: [
          relationship(customer, shop, { description: "Uses", style: { text: "#757575" } }),
        ],
      }),
    );
    expect(contrastRatio("#757575", hell["--cd-ui-plot"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#757575", hell["--cd-ui-grund"])).toBeLessThan(4.5);
    expect(tunedOnWhite.getAttribute("fill")).toBe(hell["--cd-ui-plot"]);
  });
});
