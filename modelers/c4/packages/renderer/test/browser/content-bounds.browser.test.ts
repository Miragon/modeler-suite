import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { Box } from "@miragon/c4-schema-model";
import type GraphicsFactory from "diagram-js/lib/core/GraphicsFactory";
import CroppingConnectionDocking from "diagram-js/lib/layout/CroppingConnectionDocking";
import type { Connection, Shape } from "diagram-js/lib/model/Types";
import { drillBadgeLayout } from "../../src/draw/drillBadge.js";
import type FontRelayout from "../../src/draw/FontRelayout.js";
import { relationshipLabelLayout } from "../../src/text/elementTextLayout.js";
import type { Scene } from "../../src/scene/types.js";
import {
  EVERY_SHAPE,
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
  drawnBox,
  inside,
  mountDrawing,
  registerGeist,
  removeFonts,
  type MountedDrawing,
} from "./support/drawingHarness.js";

afterEach(() => {
  destroyDrawings();
  removeFonts();
});

const LONG_NAME = "Customer Relationship Management and Order Fulfilment Coordination Platform";

/** Long texts everywhere: whatever would run past a box has to end in an ellipsis inside it. */
function crowded(): Scene {
  const items = EVERY_SHAPE.map((shape, index) =>
    element(`shape-${index}`, {
      shape,
      kind: index % 2 ? "container" : "softwareSystem",
      technology: "Spring Boot and a technology name far too long for one line",
      name: LONG_NAME,
      description: LONG_DESCRIPTION,
      at: { x: (index % 5) * 320, y: Math.floor(index / 5) * 320 },
      drill: { target: "Containers", childCount: 1000 + index },
      style: index % 3 ? {} : c4Colours("Software System"),
    }),
  );
  return scene({
    elements: items,
    boundaries: [
      boundary(
        "outer",
        { x: -60, y: -60, width: 1700, height: 1400 },
        { name: LONG_NAME.repeat(3) },
      ),
    ],
    groups: [group(LONG_NAME, { x: -40, y: -40, width: 300, height: 260 })],
    relationships: [
      relationship(items[0]!, items[1]!, { description: LONG_DESCRIPTION, technology: LONG_NAME }),
      relationship(items[6]!, items[12]!, { description: LONG_DESCRIPTION }),
    ],
    title: `Container diagram for ${LONG_NAME} and ${LONG_NAME}`,
    description: LONG_DESCRIPTION.repeat(4),
  });
}

function union(boxes: readonly Box[]): Box {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Where each drawn node lies in diagram coordinates, checked against the box it belongs to. */
function drawingOutside(drawing: MountedDrawing, shown: Scene): string[] {
  const outside: string[] = [];
  const check = (
    name: string,
    owner: Box,
    nodes: Iterable<SVGGraphicsElement>,
    origin = { x: 0, y: 0 },
  ) => {
    for (const node of nodes) {
      const box = drawnBox(node, origin);
      if (!inside(owner, box)) outside.push(`${name} ${node.tagName} "${node.textContent ?? ""}"`);
    }
  };
  const graphics = "path, rect, circle, line, text";
  for (const item of shown.elements) {
    check(item.id, item.box, drawing.visual(item.id).querySelectorAll(graphics), item.box);
  }
  for (const item of shown.boundaries) {
    check(
      item.id,
      item.box,
      drawing.visual(`boundary:${item.id}`).querySelectorAll(graphics),
      item.box,
    );
  }
  for (const item of shown.relationships) {
    check(
      item.canvasKey,
      item.labelBox,
      drawing.visual(`rel:${item.canvasKey}`).querySelectorAll("rect, text"),
    );
  }
  shown.groups.forEach((item) => {
    const node = drawing.canvas
      .getLayer("c4-frames")
      .querySelector(`[data-group="${CSS.escape(item.key)}"]`)!;
    check(item.path, item.box, node.querySelectorAll(graphics));
  });
  check("title", shown.title.box, drawing.canvas.getLayer("c4-title").querySelectorAll("text"));
  return outside;
}

function everythingDrawn(drawing: MountedDrawing): Box {
  const nodes = drawing.container.querySelectorAll<SVGGraphicsElement>(
    ".djs-visual, .layer-c4-frames > g, .layer-c4-title > g",
  );
  return union(
    [...nodes].map((node) => {
      const gfx = node.closest(".djs-element");
      const shape = gfx && drawing.registry.get(gfx.getAttribute("data-element-id")!);
      // A shape draws in its own coordinates, a connection in the diagram's.
      const origin =
        shape && "x" in shape && "y" in shape && !("waypoints" in shape)
          ? { x: Number(shape.x), y: Number(shape.y) }
          : { x: 0, y: 0 };
      return drawnBox(node, origin);
    }),
  );
}

describe("content bounds: nothing is drawn outside the scene's boxes (SPEC 1.10, 6.3, 6.5)", () => {
  it("keeps every element, boundary, group, label and the title inside its own box", () => {
    const shown = crowded();
    const drawing = mountDrawing(shown, { width: 1900, height: 1700 });
    expect(drawingOutside(drawing, shown)).toEqual([]);
  });

  it("so the scene's content bounds cover the whole drawing", () => {
    const shown = crowded();
    const drawing = mountDrawing(shown, { width: 1900, height: 1700 });
    expect(inside(shown.contentBounds!, everythingDrawn(drawing))).toBe(true);
  });

  it("holds before and after the web font arrived, and the bounds stay where they were", async () => {
    registerGeist();
    const shown = crowded();
    const before = shown.contentBounds;
    const drawing = mountDrawing(shown, { width: 1900, height: 1700 });
    expect(drawingOutside(drawing, shown)).toEqual([]);
    expect(await drawing.diagram.get<FontRelayout>("c4FontRelayout").settled).toBe(true);
    expect(drawingOutside(drawing, shown)).toEqual([]);
    expect(inside(shown.contentBounds!, everythingDrawn(drawing))).toBe(true);
    expect(shown.contentBounds).toEqual(before);
  });
});

describe("hit areas follow the drawing (SPEC 6.5)", () => {
  // `elementFromPoint` finds only what lies inside the test page's viewport.
  beforeAll(() => page.viewport(1600, 1100));

  const customer = element("customer", { kind: "person", at: { x: 0, y: 0 } });
  const shop = element("shop", {
    at: { x: 600, y: 0 },
    drill: { target: "Containers-shop", childCount: 5 },
  });
  const shown = scene({
    elements: [customer, shop],
    boundaries: [
      boundary("bank", { x: -80, y: -80, width: 1080, height: 520 }, { name: "Big Bank" }),
    ],
    relationships: [relationship(customer, shop, { description: "Uses", technology: "HTTPS" })],
  });

  function hitAt(drawing: MountedDrawing, point: { x: number; y: number }): Element | null {
    const viewbox = drawing.canvas.viewbox();
    const frame = drawing.container.getBoundingClientRect();
    return document.elementFromPoint(
      frame.left + (point.x - viewbox.x) * viewbox.scale,
      frame.top + (point.y - viewbox.y) * viewbox.scale,
    );
  }

  function ownerAt(drawing: MountedDrawing, point: { x: number; y: number }): string | undefined {
    return (
      hitAt(drawing, point)?.closest(".djs-element")?.getAttribute("data-element-id") ?? undefined
    );
  }

  it("lets a click inside a boundary reach the canvas; its outline and caption band take it", () => {
    const drawing = mountDrawing(shown);
    const frame = shown.boundaries[0]!.box;
    expect(ownerAt(drawing, { x: frame.x + 40, y: frame.y + 300 })).not.toBe("boundary:bank");
    expect(ownerAt(drawing, { x: frame.x + 2, y: frame.y + 300 })).toBe("boundary:bank");
    expect(ownerAt(drawing, { x: frame.x + 60, y: frame.y + frame.height - 20 })).toBe(
      "boundary:bank",
    );
    expect(ownerAt(drawing, { x: frame.x + 60, y: frame.y + frame.height - 40 })).toBe(
      "boundary:bank",
    );
  });

  it("gives the drill badge a hit of its own, marked c4-drill, which names the view it opens", () => {
    const drawing = mountDrawing(shown);
    const badge = drillBadgeLayout(shop)!;
    const hit = hitAt(drawing, {
      x: badge.box.x + badge.box.width / 2,
      y: badge.box.y + badge.box.height / 2,
    })!;
    expect(hit.closest(".c4-drill")).not.toBeNull();
    expect(hit.closest(".djs-element")?.getAttribute("data-element-id")).toBe("shop");
    expect(hit.querySelector("title")?.textContent).toBe("Open container view (5 containers)");
    const elsewhere = hitAt(drawing, { x: shop.box.x + 40, y: shop.box.y + 40 })!;
    expect(elsewhere.closest(".c4-drill")).toBeNull();
    expect(elsewhere.closest(".djs-element")?.getAttribute("data-element-id")).toBe("shop");
  });

  it("lets a relationship's label take clicks as its line does", () => {
    const drawing = mountDrawing(shown);
    const item = shown.relationships[0]!;
    const backing = relationshipLabelLayout(item).backing!;
    expect(
      ownerAt(drawing, { x: backing.x + backing.width / 2, y: backing.y + backing.height / 2 }),
    ).toBe(`rel:${item.canvasKey}`);
  });

  it("takes no clicks on the group frames and the title", () => {
    const framed = scene({
      elements: [customer],
      groups: [group("Team", { x: -40, y: -40, width: 300, height: 300 })],
    });
    const drawing = mountDrawing(framed);
    expect(hitAt(drawing, { x: -38, y: 100 })?.closest(".layer-c4-frames")).toBeNull();
    const title = framed.title.box;
    expect(
      hitAt(drawing, { x: title.x + 20, y: title.y + 10 })?.closest(".layer-c4-title"),
    ).toBeNull();
  });
});

describe("the drill badge sits inside the drawn outline (SPEC 6.5)", () => {
  const SIZES = [
    undefined,
    { width: 140, height: 100 },
    { width: 200, height: 400 },
    { width: 400, height: 140 },
  ] as const;

  it("of every shape, at its default size, the minimum and stretched, whatever the child count", () => {
    const items = SIZES.flatMap((size, row) =>
      [0, 12, 1234].flatMap((childCount, column) =>
        EVERY_SHAPE.map((shape, index) =>
          element(`badge-${row}-${column}-${index}`, {
            shape,
            kind: "container",
            ...(size ? { size } : {}),
            at: { x: (column * EVERY_SHAPE.length + index) * 420, y: row * 420 },
            drill: { target: "Components", childCount },
          }),
        ),
      ),
    );
    const drawing = mountDrawing(scene({ elements: items }));
    const outside: string[] = [];
    for (const item of items) {
      const visual = drawing.visual(item.id);
      const bodies = [...visual.querySelectorAll<SVGPathElement>(".c4-body")];
      const chip = drawnBox(visual.querySelector<SVGRectElement>(".c4-drill rect")!);
      const corners = [
        [chip.x, chip.y],
        [chip.x + chip.width, chip.y],
        [chip.x, chip.y + chip.height],
        [chip.x + chip.width, chip.y + chip.height],
      ] as const;
      for (const [x, y] of corners) {
        if (!bodies.some((body) => body.isPointInFill(new DOMPoint(x, y)))) {
          outside.push(
            `${item.shape} ${item.box.width}×${item.box.height} ${item.drill!.childCount}`,
          );
          break;
        }
      }
    }
    expect(outside).toEqual([]);
  });
});

describe("the drawn outline is where connections dock (SPEC 5.7)", () => {
  function dockedEnd(shape: "Circle" | "Person" | "Cylinder" | "Hexagon" | "Diamond") {
    const left = element("left", { shape, size: { width: 216, height: 216 }, at: { x: 0, y: 0 } });
    const right = element("right", { at: { x: 600, y: 28 } });
    const drawing = mountDrawing(
      scene({ elements: [left, right], relationships: [relationship(left, right)] }),
    );
    const docking = new CroppingConnectionDocking(
      drawing.registry,
      drawing.diagram.get<GraphicsFactory>("graphicsFactory"),
    );
    const connection = drawing.registry.get("rel:left->right") as Connection;
    connection.waypoints = [
      { x: 108, y: 108 },
      { x: 720, y: 108 },
    ];
    const [start] = docking.getCroppedWaypoints(
      connection,
      drawing.registry.get("left") as Shape,
      drawing.registry.get("right") as Shape,
    );
    return start!;
  }

  it("crops a line from the centre at the outline of a round, a pointed and a person shape", () => {
    expect(dockedEnd("Circle").x).toBeCloseTo(216, 0);
    expect(dockedEnd("Diamond").x).toBeCloseTo(216, 0);
    // At mid height the line meets the person's body in its rounded top corner (rx 35 from y 86.4).
    expect(dockedEnd("Person").x).toBeCloseTo(
      216 - 35 + Math.sqrt(35 ** 2 - (121.4 - 108) ** 2),
      0,
    );
    // A hexagon of this box narrows to its right point at mid height.
    expect(dockedEnd("Hexagon").x).toBeCloseTo(216, 0);
  });

  it("follows a cylinder's side, not its lid", () => {
    expect(dockedEnd("Cylinder")).toMatchObject({ x: expect.closeTo(216, 0), y: 108 });
  });
});
