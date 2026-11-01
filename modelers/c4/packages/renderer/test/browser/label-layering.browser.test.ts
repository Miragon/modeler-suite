/*
 * Relationship labels stay readable (W3.1): every label sits in the labels layer above every
 * line, so a crossing line runs under it and a click on it reaches its own relationship; a drag's
 * preview still carries the labels it moves and lies above every label; a fan's bend shows no
 * handle on the label; and the export cuts the grounds in the canvas's ground colour out of what
 * lies beneath, so the SVG lies on any page as the PNG lies on the ground.
 */
import { afterEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Connection, Shape } from "diagram-js/lib/model/Types";
import type { CollaborativeDiagram } from "../../src/collaborative/index.js";
import { DRAG_LAYER, LABEL_CLASS, LABELS_LAYER } from "../../src/draw/RelationshipLabels.js";
import { selectionKeeper } from "../../src/inspector/keepSelectionVisible.js";
import { saveSVG } from "../../src/io/saveSvg.js";
import type LabelEditing from "../../src/label-editing/LabelEditing.js";
import { hell } from "../../src/theme/cd-tokens.generated.json";
import { boundary, element, relationship, scene } from "../support/handBuiltScenes.js";
import { BOOKSHOP } from "./fixtures/texts.js";
import { destroyDrawings, mountDrawing } from "./support/drawingHarness.js";
import { mountModeler, removeHarnessHosts } from "./support/harness.js";
import { pointerOn, pressEscape, type Point } from "./support/pointer.js";

/** Stock → Shipping runs straight down through the middle of Orders → Billing's label. */
const CROSSING = `workspace {
    model {
        orders = softwareSystem "Orders"
        billing = softwareSystem "Billing"
        stock = softwareSystem "Stock"
        shipping = softwareSystem "Shipping"
        orders -> billing "Sends invoices to" "HTTPS"
        stock -> shipping "Hands parcels to" "AMQP"
    }
    views {
        systemLandscape "Crossing" {
            include *
            properties {
                "c4modeler.element.billing" "800,200"
                "c4modeler.element.orders" "0,200"
                "c4modeler.element.shipping" "400,1400"
                "c4modeler.element.stock" "400,-200"
            }
        }
    }
}
`;

const PAIR = (vertex?: Point) => `workspace {
    model {
        orders = softwareSystem "Orders"
        billing = softwareSystem "Billing"
        orders -> billing "Requests invoices from" "REST"
        billing -> orders "Sends invoice events to" "Kafka"
    }
    views {
        systemLandscape "Pair" {
            include *
            properties {
                "c4modeler.element.billing" "800,0"
                "c4modeler.element.orders" "0,0"${
                  vertex
                    ? `
                "c4modeler.relationship.orders->billing" "${vertex.x},${vertex.y}"`
                    : ""
                }
            }
        }
    }
}
`;

const INTERACTION = rgb(hell["--cd-ui-interaktion"]);

let page: CollaborativeDiagram | undefined;

afterEach(() => {
  page?.destroy();
  page = undefined;
  removeHarnessHosts();
  destroyDrawings();
});

function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

async function show(text: string): Promise<CollaborativeDiagram> {
  page = await mountModeler();
  await page.importText(text);
  return page;
}

function service<T>(name: string): T {
  if (!page) throw new Error("no modeler is mounted");
  return page.diagram.get<T>(name);
}

function connection(id: string): Connection {
  return service<ElementRegistry>("elementRegistry").get(id) as Connection;
}

function lineOf(id: string): SVGPathElement {
  return service<ElementRegistry>("elementRegistry")
    .getGraphics(id)
    .querySelector<SVGPathElement>(".c4-line")!;
}

function labelOf(id: string): SVGGElement {
  return service<ElementRegistry>("elementRegistry").getGraphics(id, true) as SVGGElement;
}

function boxOf(rect: Element): DOMRect {
  const value = (name: string) => Number(rect.getAttribute(name));
  return new DOMRect(value("x"), value("y"), value("width"), value("height"));
}

function groundOf(id: string): DOMRect {
  return boxOf(labelOf(id).querySelector(".c4-label-ground")!);
}

/** What the pointer meets at a point of the diagram, as a click there would. */
function topmostAt(point: Point): Element {
  const pointer = pointerOn(page!.diagram);
  const { clientX, clientY } = pointer.client(point);
  const found = document.elementFromPoint(clientX, clientY);
  if (!found) throw new Error(`nothing at ${JSON.stringify(point)}`);
  return found;
}

/** The crossing line's point inside the label, clear of the label's own line. */
function crossingPoint(): Point {
  const ground = groundOf("rel:orders->billing");
  const [top, bottom] = connection("rel:stock->shipping").waypoints;
  expect(top!.x, "the crossing line runs straight down").toBe(bottom!.x);
  expect(top!.x).toBeGreaterThan(ground.left + 8);
  expect(top!.x).toBeLessThan(ground.right - 8);
  expect(top!.y).toBeLessThan(ground.top);
  expect(bottom!.y).toBeGreaterThan(ground.bottom);
  return { x: top!.x, y: ground.top + 3 };
}

describe("a label another relationship's line crosses", () => {
  it("is drawn after every line, in the labels layer above the plane", async () => {
    await show(CROSSING);
    crossingPoint();
    const grounds = [
      ...service<Canvas>("canvas").getContainer().querySelectorAll(".c4-label-ground"),
    ];
    const lines = [...service<Canvas>("canvas").getContainer().querySelectorAll(".c4-line")];
    expect(grounds).toHaveLength(2);
    expect(lines).toHaveLength(2);
    for (const ground of grounds) {
      expect(ground.closest(`.layer-${LABELS_LAYER}`)).not.toBeNull();
      for (const line of lines) {
        expect(
          line.compareDocumentPosition(ground) & Node.DOCUMENT_POSITION_FOLLOWING,
          `${ground.closest("[data-element-id]")?.getAttribute("data-element-id")} after ${line.closest("[data-element-id]")?.getAttribute("data-element-id")}`,
        ).toBeTruthy();
      }
    }
  });

  it("takes a click and a double-click for its own relationship, not the crossing line's", async () => {
    await show(CROSSING);
    const at = crossingPoint();
    const target = topmostAt(at);
    expect(target.closest("[data-element-id]")?.getAttribute("data-element-id")).toBe(
      "rel:orders->billing",
    );
    const pointer = pointerOn(page!.diagram);
    target.dispatchEvent(pointer.event("click", at, { detail: 1 }));
    expect(
      service<{ get(): { id: string }[] }>("selection")
        .get()
        .map(({ id }) => id),
    ).toEqual(["rel:orders->billing"]);
    target.dispatchEvent(pointer.event("dblclick", at, { detail: 2 }));
    expect(service<LabelEditing>("labelEditing").openEdit()).toMatchObject({
      elementId: "orders->billing",
      field: "description",
    });
  });

  it("shows its relationship's hover, selection and drag like its line", async () => {
    await show(CROSSING);
    const at = crossingPoint();
    const label = labelOf("rel:orders->billing");
    const line = lineOf("rel:orders->billing");
    const pointer = pointerOn(page!.diagram);
    topmostAt(at).dispatchEvent(pointer.event("mouseover", at));
    expect(label.classList.contains("hover")).toBe(true);
    expect(getComputedStyle(line).stroke).toBe(INTERACTION);

    service<{ select(element: unknown): void }>("selection").select(
      connection("rel:orders->billing"),
    );
    const ground = label.querySelector(".c4-label-ground")!;
    expect(getComputedStyle(ground).stroke).toBe(INTERACTION);

    service<Canvas>("canvas").addMarker(connection("rel:orders->billing"), "djs-dragging");
    expect(getComputedStyle(label).opacity).toBe("0.3");
    service<Canvas>("canvas").removeMarker(connection("rel:orders->billing"), "djs-dragging");
    expect(getComputedStyle(label).opacity).toBe("1");
  });

  it("keeps the order of the lines when an import reorders them, as a fresh render draws it", async () => {
    await show(CROSSING);
    const swapped = CROSSING.replace(
      /(\n\s*orders -> billing[^\n]*)(\n\s*stock -> shipping[^\n]*)/,
      "$2$1",
    );
    expect(swapped).not.toBe(CROSSING);
    await page!.importText(swapped);
    const layer = service<Canvas>("canvas").getLayer(LABELS_LAYER);
    expect(
      [...layer.querySelectorAll(`:scope > .${LABEL_CLASS}`)].map((group) =>
        group.getAttribute("data-element-id"),
      ),
    ).toEqual(["rel:stock->shipping", "rel:orders->billing"]);
    const reordered = page!.diagram.saveSVG().svg;
    page!.destroy();
    await show(swapped);
    expect(page!.diagram.saveSVG().svg).toBe(reordered);
  });

  it("goes with its relationship", async () => {
    await show(CROSSING);
    expect(labelOf("rel:stock->shipping").isConnected).toBe(true);
    const removed = labelOf("rel:stock->shipping");
    await page!.importText(CROSSING.replace(/\n\s*stock -> shipping[^\n]*/, ""));
    expect(removed.isConnected).toBe(false);
    const layer = service<Canvas>("canvas").getLayer(LABELS_LAYER);
    expect(
      [...layer.querySelectorAll(`:scope > .${LABEL_CLASS}`)].map((group) =>
        group.getAttribute("data-element-id"),
      ),
    ).toEqual(["rel:orders->billing"]);
  });

  it("is exported above the line that crosses it, without its hit", async () => {
    await show(CROSSING);
    const svg = new DOMParser().parseFromString(page!.diagram.saveSVG().svg, "image/svg+xml");
    const label = svg.querySelector('[data-element-id="rel:orders->billing"] text');
    const crossing = svg.querySelector('[data-element-id="rel:stock->shipping"] .c4-line');
    expect(label?.closest(`.layer-${LABELS_LAYER}`)).not.toBeNull();
    expect(
      crossing!.compareDocumentPosition(label!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(svg.querySelectorAll(".djs-hit")).toHaveLength(0);
  });
});

describe("the bend that fans a line out of its pair", () => {
  function hoverLine(id: string): Element[] {
    const line = connection(id);
    const [start, bend] = line.waypoints;
    const at = { x: (start!.x + bend!.x) / 2, y: (start!.y + bend!.y) / 2 };
    const pointer = pointerOn(page!.diagram);
    topmostAt(at).dispatchEvent(pointer.event("mouseover", at));
    const group = service<Canvas>("canvas")
      .getLayer("overlays")
      .querySelector(`.djs-bendpoints[data-element-id="${CSS.escape(id)}"]`)!;
    return [...group.querySelectorAll(":scope > .djs-bendpoint:not(.floating)")];
  }

  it("shows no handle on the label that sits on it", async () => {
    await show(PAIR());
    const line = connection("rel:orders->billing");
    expect(line.waypoints).toHaveLength(3);
    const bend = line.waypoints[1]!;
    const ground = groundOf("rel:orders->billing");
    expect(ground.left < bend.x && bend.x < ground.right, "the label sits on the bend").toBe(true);
    const handles = hoverLine("rel:orders->billing");
    expect(handles).toHaveLength(3);
    expect(handles.map((handle) => getComputedStyle(handle).display)).toEqual([
      "none",
      "none",
      "none",
    ]);
  });

  it("still moves where the pointer presses it, into a vertex of the user's", async () => {
    await show(PAIR());
    const bend = connection("rel:orders->billing").waypoints[1]!;
    const pointer = pointerOn(page!.diagram);
    const drop = { x: bend.x, y: bend.y - 80 };
    pointer.press(topmostAt(bend), bend);
    pointer.moveTo({ x: bend.x, y: bend.y - 30 });
    pointer.moveTo(drop);
    expect(pointer.dragPrefix()).toBe("bendpoint.move");
    pointer.hover(drop);
    pointer.release(drop);
    // The pointer's client position comes back through the zoom, give or take a unit.
    const written = /"c4modeler\.relationship\.orders->billing" "(-?\d+),(-?\d+)"/.exec(
      page!.exportText(),
    );
    expect(written, "the moved bend is a vertex of the user's").not.toBeNull();
    expect(Math.abs(Number(written![1]) - drop.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(written![2]) - drop.y)).toBeLessThanOrEqual(1);
  });

  it("shows no floating handle where the pointer rests on the bend, and one along the line", async () => {
    await show(PAIR());
    const id = "rel:orders->billing";
    const [start, bend] = connection(id).waypoints;
    const along = { x: (start!.x + bend!.x) / 2, y: (start!.y + bend!.y) / 2 };
    const pointer = pointerOn(page!.diagram);
    const rest = (at: Point) => {
      topmostAt(at).dispatchEvent(pointer.event("mouseover", at));
      topmostAt(at).dispatchEvent(pointer.event("mousemove", at));
    };
    const floating = () =>
      service<Canvas>("canvas")
        .getLayer("overlays")
        .querySelector(`.djs-bendpoints[data-element-id="${CSS.escape(id)}"] > .floating`)!;

    rest(along);
    expect(getComputedStyle(floating()).display, "along the line").toBe("block");
    rest(bend!);
    expect(floating().getAttribute("transform"), "snapped to the bend").toBe(
      `matrix(1 0 0 1 ${bend!.x} ${bend!.y})`,
    );
    expect(getComputedStyle(floating()).display, "on the bend, under the label").toBe("none");
    rest(along);
    expect(getComputedStyle(floating()).display, "along the line again").toBe("block");
  });

  it("is no fan once the user placed a vertex: that vertex keeps its handle", async () => {
    await show(PAIR({ x: 520, y: -120 }));
    const line = connection("rel:orders->billing");
    expect(line.waypoints[1]).toEqual({ x: 520, y: -120 });
    const handles = hoverLine("rel:orders->billing");
    expect(handles.map((handle) => getComputedStyle(handle).display)).toEqual([
      "none",
      "block",
      "none",
    ]);
  });
});

describe("the preview of a drag", () => {
  function container(): HTMLElement {
    return service<Canvas>("canvas").getContainer();
  }

  /** In the drag layer, after every label, so no label covers what is dragged. */
  function expectAboveEveryLabel(preview: Element | null): void {
    expect(preview, "the preview is drawn").not.toBeNull();
    expect(preview!.parentElement?.getAttribute("class")).toBe(`layer-${DRAG_LAYER}`);
    const grounds = [
      ...service<Canvas>("canvas").getLayer(LABELS_LAYER).querySelectorAll(".c4-label-ground"),
    ];
    expect(grounds.length).toBeGreaterThan(0);
    for (const ground of grounds) {
      expect(
        ground.compareDocumentPosition(preview!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  }

  it("carries the label of a relationship it moves with both ends, above every label", async () => {
    await show(CROSSING);
    const registry = service<ElementRegistry>("elementRegistry");
    service<Selection>("selection").select([
      registry.get("orders") as Shape,
      registry.get("billing") as Shape,
    ]);
    const pointer = pointerOn(page!.diagram);
    pointer.grab("orders", { x: 0, y: 160 });
    expect(pointer.dragPrefix()).toBe("shape.move");
    const group = container().querySelector(".djs-drag-group");
    expectAboveEveryLabel(group);
    const moved = [
      ...group!.querySelectorAll('[data-preview-support-element-id="rel:orders->billing"]'),
    ];
    expect(
      moved.map((dragger) => dragger.querySelector(".c4-label-ground") !== null),
      "the line's preview, then its label's",
    ).toEqual([false, true]);
    expect(moved[1]!.textContent).toContain("Sends invoices to");
    expect(
      group!.querySelector('[data-preview-support-element-id="rel:stock->shipping"]'),
      "a line the move does not carry",
    ).toBeNull();
    pressEscape();
    expect(container().querySelector(".djs-drag-group")).toBeNull();
  });

  it("shows a palette create and a resize above every label", async () => {
    await show(CROSSING);
    const pointer = pointerOn(page!.diagram);
    const ground = groundOf("rel:orders->billing");
    pointer.clickPalette("create.softwareSystem");
    pointer.hover({ x: ground.x + ground.width / 2, y: ground.y + ground.height / 2 });
    expect(pointer.dragPrefix()).toBe("create");
    expectAboveEveryLabel(container().querySelector(".djs-drag-group"));
    pressEscape();

    const orders = connection("rel:orders->billing").source as Shape;
    service<Selection>("selection").select(orders);
    const handle = container().querySelector(".djs-resizer-orders.djs-resizer-se");
    const corner = { x: orders.x + orders.width, y: orders.y + orders.height };
    pointer.press(handle!, corner);
    pointer.moveTo({ x: corner.x + 30, y: corner.y + 20 });
    pointer.moveTo({ x: corner.x + 60, y: corner.y + 40 });
    expect(pointer.dragPrefix()).toBe("resize");
    expectAboveEveryLabel(container().querySelector(".djs-resize-overlay"));
    pressEscape();
  });
});

describe("a selected relationship kept clear of the inspector", () => {
  it("counts its label, not only its line", async () => {
    await show(CROSSING);
    const id = "rel:orders->billing";
    const canvas = service<Canvas>("canvas");
    const registry = service<ElementRegistry>("elementRegistry");
    const area = canvas.getContainer().getBoundingClientRect();
    const [start] = connection(id).waypoints;
    canvas.viewbox({ x: 0, y: start!.y - 360, width: area.width, height: area.height });
    const line = registry.getGraphics(id).getBoundingClientRect();
    const label = () => (registry.getGraphics(id, true) as SVGElement).getBoundingClientRect();
    expect(label().bottom, "the label reaches below its line").toBeGreaterThan(line.bottom + 8);
    // A bottom sheet whose gap of 12 the line keeps and the label does not.
    const sheetTop = Math.ceil(line.bottom) + 16;
    expect(label().bottom).toBeGreaterThan(sheetTop - 12);
    const sheet = document.createElement("div");
    sheet.style.cssText = `position:fixed;left:${area.left}px;top:${sheetTop}px;width:${area.width}px;height:200px`;
    document.body.append(sheet);
    const keeper = selectionKeeper(canvas, sheet, () => false);
    try {
      keeper.keepVisible([connection(id)]);
      await expect.poll(() => label().bottom, { timeout: 2000 }).toBeLessThanOrEqual(sheetTop - 12);
    } finally {
      keeper.destroy();
      sheet.remove();
    }
  });
});

describe("the SVG export of a label on the canvas's ground", () => {
  const GROUND = hell["--cd-ui-grund"].toUpperCase();

  interface Pixels {
    at(point: Point): string;
  }

  /** The export drawn on a page of `colour`, at twice its size, as the PNG export draws it. */
  async function rasterised(svg: string, colour: string): Promise<Pixels> {
    const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
    const [x, y, width, height] = root.getAttribute("viewBox")!.split(" ").map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const image = new Image();
    image.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext("2d")!;
    context.fillStyle = colour;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      at(point) {
        const [red, green, blue] = context.getImageData(
          Math.round((point.x - x) * 2),
          Math.round((point.y - y) * 2),
          1,
          1,
        ).data;
        return `#${[red, green, blue].map((value) => value!.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
      },
    };
  }

  /** Points 1.5 inside the ground's left edge, top to bottom: padding, no glyph. */
  function edgePoints(ground: DOMRect): Point[] {
    const points: Point[] = [];
    for (let y = ground.top + 3; y <= ground.bottom - 3; y += 2) {
      points.push({ x: ground.left + 1.5, y });
    }
    return points;
  }

  it("draws no ground box: a white page shows white under the label, the line cut", async () => {
    await show(BOOKSHOP);
    const id = "rel:bookshop->payments";
    const ground = groundOf(id);
    const [start, end] = connection(id).waypoints;
    expect(start!.y, "the line runs across, through the label").toBe(end!.y);
    expect(labelOf(id).querySelector(".c4-label-ground.cd-c-fill-grund")).not.toBeNull();
    const { svg } = page!.diagram.saveSVG();

    const onWhite = await rasterised(svg, "#FFFFFF");
    const crossing = { x: ground.left + 1.5, y: start!.y };
    expect(
      edgePoints(ground)
        .concat(crossing)
        .map((point) => onWhite.at(point)),
    ).toEqual(
      edgePoints(ground)
        .concat(crossing)
        .map(() => "#FFFFFF"),
    );
    const onGround = await rasterised(svg, GROUND);
    expect(
      edgePoints(ground)
        .concat(crossing)
        .map((point) => onGround.at(point)),
    ).toEqual(
      edgePoints(ground)
        .concat(crossing)
        .map(() => GROUND),
    );
  });

  it("cuts every such ground out of the layers below the labels instead", async () => {
    await show(BOOKSHOP);
    const live = [
      ...service<Canvas>("canvas")
        .getLayer(LABELS_LAYER)
        .querySelectorAll(".c4-label-ground.cd-c-fill-grund"),
    ].map(boxOf);
    expect(live.length).toBeGreaterThan(1);
    const svg = new DOMParser().parseFromString(page!.diagram.saveSVG().svg, "image/svg+xml");
    expect(svg.querySelectorAll(".c4-label-ground")).toHaveLength(0);
    const labels = svg.querySelector(`.layer-${LABELS_LAYER}`)!;
    const below: Element[] = [];
    for (let layer = labels.previousElementSibling; layer; layer = layer.previousElementSibling) {
      below.push(layer);
    }
    expect(below.map((layer) => layer.getAttribute("class"))).toEqual([
      "layer-root-0",
      "layer-c4-frames",
    ]);
    const masks = new Set(below.map((layer) => layer.getAttribute("mask")));
    expect(masks.size).toBe(1);
    const id = /^url\(#(.+)\)$/.exec([...masks][0]!)![1]!;
    const mask = svg.getElementById(id)!;
    expect(mask.tagName).toBe("mask");
    expect(mask.getAttribute("maskUnits")).toBe("userSpaceOnUse");
    const cuts = [...mask.querySelectorAll('rect[fill="black"]')].map(boxOf);
    expect(cuts.map((cut) => cut.toJSON())).toEqual(live.map((box) => box.toJSON()));
    expect(labels.getAttribute("mask")).toBeNull();
  });

  it("keeps a ground in a boundary's fill, which is part of the picture", () => {
    const customer = element("customer", { kind: "person", at: { x: 0, y: 0 } });
    const shop = element("shop", { at: { x: 600, y: 0 } });
    const shown = scene({
      elements: [customer, shop],
      boundaries: [
        boundary(
          "outer",
          { x: -80, y: -80, width: 1080, height: 520 },
          {
            style: { fill: "#DDEEFF" },
          },
        ),
      ],
      relationships: [relationship(customer, shop, { description: "Uses" })],
    });
    const drawing = mountDrawing(shown);
    const { svg } = saveSVG(drawing.canvas, { contentBounds: () => shown.contentBounds });
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(parsed.querySelector(".c4-label-ground")?.getAttribute("fill")).toBe("#DDEEFF");
    expect(parsed.querySelector("mask")).toBeNull();
  });

  it("cuts a later label's ground out of an earlier label it lies on, as the canvas covers it", () => {
    const west = element("west", { at: { x: 0, y: 0 } });
    const east = element("east", { at: { x: 600, y: 0 } });
    const north = element("north", { at: { x: 300, y: -400 } });
    const south = element("south", { at: { x: 300, y: 400 } });
    const across = relationship(west, east, { description: "Sends orders to" });
    const down = relationship(north, south, { description: "Ships parcels to" });
    const shown = scene({ elements: [west, east, north, south], relationships: [across, down] });
    const drawing = mountDrawing(shown);
    const { svg } = saveSVG(drawing.canvas, { contentBounds: () => shown.contentBounds });
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    const labelGroup = (key: string) =>
      parsed.querySelector(`.layer-${LABELS_LAYER} > [data-element-id="rel:${key}"]`)!;
    const earlier = labelGroup(across.canvasKey);
    const later = labelGroup(down.canvasKey);
    expect(later.getAttribute("mask")).toBeNull();
    const id = /^url\(#(.+)\)$/.exec(earlier.getAttribute("mask") ?? "")?.[1];
    expect(id, "the earlier label is masked").toBeDefined();
    const cuts = [...parsed.getElementById(id!)!.querySelectorAll('rect[fill="black"]')];
    expect(cuts.map((cut) => boxOf(cut).toJSON())).toEqual([
      groundBox(drawing.label(`rel:${down.canvasKey}`)).toJSON(),
    ]);
  });

  function groundBox(visual: SVGGElement): DOMRect {
    return boxOf(visual.querySelector(".c4-label-ground")!);
  }
});
