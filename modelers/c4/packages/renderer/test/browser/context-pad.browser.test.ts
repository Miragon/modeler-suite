/*
 * Where the context pad of a relationship opens (SPEC 5.3): next to its label, or its middle
 * when it has none, never over one of its ends, so the pad hides neither element it connects.
 */
import { afterEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type { Shape } from "diagram-js/lib/model/Types";
import type { C4Connection } from "../../src/scene/types.js";
import {
  destroyMounted,
  mountModeler,
  select,
  service,
  shapeOf,
  wait,
} from "./support/interaction/mount.js";

afterEach(() => destroyMounted());

/** A labelled relationship and an unlabelled one, each between two elements close together. */
const CLOSE_ENDS = `workspace "Pad" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        stock = softwareSystem "Stock"
        customer -> shop "Buys books" "HTTPS"
        shop -> stock
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.shop" "400,0"
                "c4modeler.element.stock" "400,320"
            }
        }
    }
}
`;

/** Two boxes diagonally close: every side of the line's middle reaches one of them. */
const DIAGONAL_ENDS = `workspace "Pad" {
    model {
        api = softwareSystem "API"
        search = softwareSystem "Search"
        api -> search
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.api" "0,0"
                "c4modeler.element.search" "280,190"
            }
        }
    }
}
`;

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** The gap between two rectangles in screen pixels, 0 when they touch or overlap. */
function gap(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.left - a.right, a.left - b.right);
  const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
  return Math.hypot(dx, dy);
}

async function openPad(page: Awaited<ReturnType<typeof mountModeler>>, canvasId: string) {
  select(page.modeler, canvasId);
  // diagram-js positions the pad in a scheduled task.
  await wait(20);
  const pad = page.host.querySelector<HTMLElement>(".djs-context-pad.open");
  if (!pad) throw new Error(`no context pad for ${canvasId}`);
  return pad.getBoundingClientRect();
}

function screenBox(page: Awaited<ReturnType<typeof mountModeler>>, shape: Shape): Rect {
  const canvas = service<Canvas>(page.modeler, "canvas");
  const container = canvas.getContainer().getBoundingClientRect();
  const { x, y, scale } = canvas.viewbox();
  const left = container.left + (shape.x - x) * scale;
  const top = container.top + (shape.y - y) * scale;
  return { left, top, right: left + shape.width * scale, bottom: top + shape.height * scale };
}

function screenPoint(
  page: Awaited<ReturnType<typeof mountModeler>>,
  point: { x: number; y: number },
) {
  const canvas = service<Canvas>(page.modeler, "canvas");
  const container = canvas.getContainer().getBoundingClientRect();
  const { x, y, scale } = canvas.viewbox();
  const left = container.left + (point.x - x) * scale;
  const top = container.top + (point.y - y) * scale;
  return { left, top, right: left, bottom: top };
}

function middleOf(waypoints: readonly { x: number; y: number }[]): { x: number; y: number } {
  const lengths = waypoints.slice(1).map((point, index) => {
    const previous = waypoints[index]!;
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  let rest = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of lengths.entries()) {
    const from = waypoints[index]!;
    const to = waypoints[index + 1]!;
    if (rest <= length && length > 0) {
      return {
        x: from.x + ((to.x - from.x) * rest) / length,
        y: from.y + ((to.y - from.y) * rest) / length,
      };
    }
    rest -= length;
  }
  return waypoints[0]!;
}

describe("the context pad of a relationship (SPEC 5.3)", () => {
  for (const zoom of [1, 0.6]) {
    it(`opens next to the label, over neither end, at ${zoom * 100}%`, async () => {
      const page = await mountModeler(CLOSE_ENDS);
      service<Canvas>(page.modeler, "canvas").zoom(zoom, { x: 400, y: 240 });
      const connection = shapeOf(page.modeler, "rel:customer->shop") as C4Connection;
      const pad = await openPad(page, connection.id);
      for (const end of [connection.source, connection.target] as Shape[]) {
        expect(overlaps(pad, screenBox(page, end)), `the pad covers ${end.id}`).toBe(false);
      }
      const label = service<Canvas>(page.modeler, "canvas")
        .getGraphics(connection)
        .querySelector(".c4-label-ground")!
        .getBoundingClientRect();
      expect(gap(pad, label)).toBeLessThanOrEqual(12);
    });

    it(`opens at the middle of a relationship without a label, over neither end, at ${zoom * 100}%`, async () => {
      const page = await mountModeler(CLOSE_ENDS);
      service<Canvas>(page.modeler, "canvas").zoom(zoom, { x: 400, y: 240 });
      const connection = shapeOf(page.modeler, "rel:shop->stock") as C4Connection;
      expect(
        service<Canvas>(page.modeler, "canvas")
          .getGraphics(connection)
          .querySelector(".c4-label-ground"),
      ).toBeNull();
      const pad = await openPad(page, connection.id);
      for (const end of [connection.source, connection.target] as Shape[]) {
        expect(overlaps(pad, screenBox(page, end)), `the pad covers ${end.id}`).toBe(false);
      }
      expect(gap(pad, screenPoint(page, middleOf(connection.waypoints)))).toBeLessThanOrEqual(12);
    });
  }

  for (const zoom of [0.6, 1, 2]) {
    it(`opens at a corner of the middle between two diagonally close ends at ${zoom * 100}%`, async () => {
      const page = await mountModeler(DIAGONAL_ENDS);
      service<Canvas>(page.modeler, "canvas").zoom(zoom, { x: 260, y: 175 });
      const connection = shapeOf(page.modeler, "rel:api->search") as C4Connection;
      const pad = await openPad(page, connection.id);
      for (const end of [connection.source, connection.target] as Shape[]) {
        expect(overlaps(pad, screenBox(page, end)), `the pad covers ${end.id}`).toBe(false);
      }
      // diagram-js's margin grows with the zoom, on both axes at a corner.
      expect(gap(pad, screenPoint(page, middleOf(connection.waypoints)))).toBeLessThanOrEqual(
        12 * Math.max(zoom, 1),
      );
    });
  }

  it("still opens an element's pad at the top right of its box", async () => {
    const page = await mountModeler(CLOSE_ENDS);
    const shop = shapeOf(page.modeler, "shop") as Shape;
    const pad = await openPad(page, "shop");
    const box = screenBox(page, shop);
    expect(pad.left).toBeGreaterThan(box.right);
    expect(Math.abs(pad.top - box.top)).toBeLessThanOrEqual(8);
  });
});
