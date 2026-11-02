import { describe, expect, it } from "vitest";
import type { Box, Point } from "@miragon/c4-schema-model";
import { layoutView, type ViewGeometry } from "../src/index.js";
import { layoutInput, overlap, seededRandom, type ViewSpec } from "./support/views.js";

function label(geometry: ViewGeometry, key: string): Box {
  const box = geometry.labelBoxes.get(key);
  if (!box) throw new Error(`no label box for ${key}`);
  return box;
}

function centreOf(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function pairwiseClear(boxes: readonly Box[]): boolean {
  return boxes.every((box, index) => boxes.slice(index + 1).every((other) => !overlap(box, other)));
}

/** The most the renderer draws of a label: its ground grows from the slot up to 240 × 72, centred. */
function reachOf(slot: Box): Box {
  return {
    x: slot.x - (240 - slot.width) / 2,
    y: slot.y - (72 - slot.height) / 2,
    width: 240,
    height: 72,
  };
}

describe("relationships between the same pair fan out (P3.1)", () => {
  it("bends two lines of a pair that runs across apart by a label's reach in height and a gap, so both labels show", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b"],
        relationships: [
          ["a", "b"],
          ["b", "a"],
        ],
        stored: { a: { x: 0, y: 0 }, b: { x: 480, y: 0 } },
      }),
    );
    expect(geometry.routes.get("a->b")).toEqual([{ x: 360, y: 40 }]);
    expect(geometry.routes.get("b->a")).toEqual([{ x: 360, y: 120 }]);
    expect(geometry.vertices.get("a->b")).toEqual([]);
    expect(geometry.vertices.get("b->a")).toEqual([]);
    const labels = [label(geometry, "a->b"), label(geometry, "b->a")];
    expect(pairwiseClear(labels)).toBe(true);
    for (const box of labels) expect(centreOf(box).x).toBe(360);
  });

  it("fans an explicit relationship beside the implied one of its pair, and a second of one direction", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["customer", "shop"],
        relationships: [
          { key: "implied:customer->shop", sourceId: "customer", destinationId: "shop" },
          { key: "customer->shop", sourceId: "customer", destinationId: "shop" },
          { key: "tracks", sourceId: "customer", destinationId: "shop" },
        ],
        stored: { customer: { x: 0, y: 0 }, shop: { x: 0, y: 480 } },
      }),
    );
    // Up and down: the labels sit side by side at the bends, a label's reach in width and a gap
    // apart; the middle line of three stays straight.
    expect(geometry.routes.get("implied:customer->shop")).toEqual([{ x: 368, y: 320 }]);
    expect(geometry.routes.get("customer->shop")).toEqual([]);
    expect(geometry.routes.get("tracks")).toEqual([{ x: -128, y: 320 }]);
    const labels = [...geometry.labelBoxes.values()];
    expect(pairwiseClear(labels)).toBe(true);
    expect(labels.map((box) => centreOf(box))).toEqual([
      { x: 368, y: 320 },
      { x: 120, y: 320 },
      { x: -128, y: 320 },
    ]);
  });

  it("keeps a two-way pair that runs up and down side by side however short the gap", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["customer", "shop"],
        relationships: [
          ["customer", "shop"],
          ["shop", "customer"],
        ],
        stored: { customer: { x: 0, y: 0 }, shop: { x: 0, y: 290 } },
      }),
    );
    expect(geometry.routes.get("customer->shop")).toEqual([{ x: 244, y: 225 }]);
    expect(geometry.routes.get("shop->customer")).toEqual([{ x: -4, y: 225 }]);
    expect(pairwiseClear([...geometry.labelBoxes.values()])).toBe(true);
  });

  it("keeps the labels at the bends apart by as far as a label's text may grow, which the layout never reads", () => {
    for (const shop of [
      { x: 480, y: 0 },
      { x: 0, y: 480 },
      { x: 480, y: 400 },
    ]) {
      const geometry = layoutView(
        layoutInput({
          elements: ["customer", "shop"],
          relationships: [
            { key: "places", sourceId: "customer", destinationId: "shop" },
            { key: "receipts", sourceId: "shop", destinationId: "customer" },
            { key: "tracks", sourceId: "customer", destinationId: "shop" },
          ],
          stored: { customer: { x: 0, y: 0 }, shop },
        }),
      );
      const reaches = [...geometry.labelBoxes.values()].map(reachOf);
      expect(pairwiseClear(reaches), `shop at ${shop.x},${shop.y}`).toBe(true);
    }
  });

  it("bends no line that has vertices of its own, and leaves a single line straight", () => {
    const vertices = { "a->b": [{ x: 600, y: 80 }] };
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b"],
        relationships: [
          ["a", "b"],
          ["b", "a"],
        ],
        stored: { a: { x: 0, y: 0 }, b: { x: 480, y: 0 } },
        vertices,
      }),
    );
    expect(geometry.routes.get("a->b")).toEqual([{ x: 600, y: 80 }]);
    expect(geometry.routes.get("b->a")).toEqual([]);
    expect(geometry.vertices.get("a->b")).toEqual([{ x: 600, y: 80 }]);
    expect(geometry.vertices.get("b->a")).toEqual([]);
  });

  it("puts no bend inside an end, where the line would run into the box and back", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b"],
        relationships: [
          ["a", "b"],
          ["b", "a"],
        ],
        stored: { a: { x: 0, y: 0 }, b: { x: 240, y: 0 } },
      }),
    );
    expect(geometry.routes.get("a->b")).toEqual([]);
    expect(geometry.routes.get("b->a")).toEqual([]);
  });

  it("never lets a route's bend into the stored vertices, in any mode", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const spec = pairedView(seed);
      for (const geometry of [
        layoutView(layoutInput(spec)),
        layoutView(layoutInput({ ...spec, stored: pinnedBoxes(spec) })),
      ]) {
        for (const [key, own] of geometry.vertices) {
          expect(own, `seed ${seed} ${key}`).toEqual(spec.vertices?.[key] ?? []);
        }
      }
    }
  });
});

describe("labels slide along their line (P3.2)", () => {
  it("moves the label of a crossing line off the label already at the crossing", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b", "c", "d"],
        relationships: [
          ["a", "d"],
          ["b", "c"],
        ],
        stored: {
          a: { x: 0, y: 0 },
          b: { x: 800, y: 0 },
          c: { x: 0, y: 800 },
          d: { x: 800, y: 800 },
        },
      }),
    );
    expect(centreOf(label(geometry, "a->d"))).toEqual({ x: 520, y: 480 });
    expect(overlap(label(geometry, "a->d"), label(geometry, "b->c"))).toBe(false);
  });

  it("moves a label off an element its line runs across, and stays between a quarter and three quarters", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b", "c"],
        relationships: [["a", "c"]],
        stored: { a: { x: 0, y: 0 }, b: { x: 0, y: 400 }, c: { x: 0, y: 800 } },
      }),
    );
    const box = label(geometry, "a->c");
    expect(overlap(box, geometry.boxes.get("b")!)).toBe(false);
    const along = (centreOf(box).y - 160) / (800 - 160);
    expect(along).toBeGreaterThanOrEqual(0.25);
    expect(along).toBeLessThanOrEqual(0.75);
  });

  it("slides the same way every time for the same input", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const spec = pairedView(seed);
      const first = layoutView(layoutInput(spec));
      const again = layoutView(layoutInput(spec));
      expect([...again.labelBoxes], `seed ${seed}`).toEqual([...first.labelBoxes]);
      expect([...again.routes], `seed ${seed}`).toEqual([...first.routes]);
    }
  });
});

/** A view whose pairs often hold two or three lines, sometimes with vertices of their own. */
function pairedView(seed: number): ViewSpec {
  const random = seededRandom(seed * 7);
  const size = 3 + Math.floor(random() * 6);
  const elements = Array.from({ length: size }, (_, index) => `e${index}`);
  const relationships: { key: string; sourceId: string; destinationId: string }[] = [];
  const vertices: Record<string, Point[]> = {};
  for (let index = 0; index < size * 2; index++) {
    const sourceId = elements[Math.floor(random() * size)]!;
    const destinationId = elements[Math.floor(random() * size)]!;
    if (sourceId === destinationId) continue;
    const key = `r${index}`;
    relationships.push({ key, sourceId, destinationId });
    if (random() < 0.15) vertices[key] = [{ x: Math.round(random() * 800), y: -200 }];
  }
  return { elements, relationships, vertices };
}

function pinnedBoxes(spec: ViewSpec): Record<string, { x: number; y: number }> {
  return Object.fromEntries(
    [...layoutView(layoutInput(spec)).boxes].map(([id, { x, y }]) => [id, { x, y }]),
  );
}
