/*
 * Lines and labels of relationships that share a pair or cross (P3): the lines fan out through a
 * bend of the layout's, which the canvas draws and no edit ever writes; a bendpoint gesture keeps
 * only what the user placed; and a connect that runs over a line or a boundary keeps the canvas's
 * cursor.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Connection, Shape } from "diagram-js/lib/model/Types";
import type { CollaborativeDiagram } from "../../src/collaborative/index.js";
import type C4Modeling from "../../src/modeling/C4Modeling.js";
import type SceneService from "../../src/scene/SceneService.js";
import { titleTextLayout } from "../../src/text/elementTextLayout.js";
import { BOOKSHOP, LIBRARY } from "./fixtures/texts.js";
import { mountModeler, removeHarnessHosts, shapeIn } from "./support/harness.js";
import { pointerOn, pressEscape, type Point, type Pointer } from "./support/pointer.js";

const PAIR = `workspace {
    model {
        orders = softwareSystem "Orders"
        billing = softwareSystem "Billing"
        orders -> billing "Requests invoices from" "REST"
        billing -> orders "Sends invoice events to" "Kafka"
    }
    views {
        systemLandscape "Pair" {
            include *
            autoLayout lr
        }
    }
}
`;

const LONG_TITLE = `workspace {
    model {
        api = softwareSystem "API"
    }
    views {
        systemLandscape "Long" {
            include *
            title "Component diagram for Internet Banking System - API Application"
        }
    }
}
`;

/** Two lines whose labels grow past the 160 × 48 slot, in height and in width. */
const LONG_PAIR = (direction: "lr" | "tb") => `workspace {
    model {
        customer = person "Customer"
        billing = softwareSystem "Billing"
        customer -> billing "Requests invoices, credit notes, dunning letters and the payment status of every open and every settled order from" "REST over HTTPS, JSON"
        billing -> customer "Sends invoice events and payment confirmations for each settled order to" "Kafka, Avro"
    }
    views {
        systemLandscape "Pair" {
            include *
            autoLayout ${direction}
        }
    }
}
`;

let modeler: CollaborativeDiagram;

beforeEach(async () => {
  modeler = await mountModeler();
});

afterEach(() => {
  modeler.destroy();
  removeHarnessHosts();
});

function service<T>(name: string): T {
  return modeler.diagram.get<T>(name);
}

function connection(id: string): Connection {
  return service<ElementRegistry>("elementRegistry").get(id) as Connection;
}

function graphics(id: string): SVGElement {
  return service<ElementRegistry>("elementRegistry").getGraphics(id);
}

function centreOf(id: string): Point {
  const { x, y, width, height } = shapeIn(modeler, id);
  return { x: x + width / 2, y: y + height / 2 };
}

function points(waypoints: readonly Point[]): Point[] {
  return waypoints.map(({ x, y }) => ({ x, y }));
}

function previewPoints(): Point[] {
  const line = service<Canvas>("canvas")
    .getContainer()
    .querySelector<SVGPathElement>(".djs-dragger .c4-line");
  return [...(line?.getAttribute("d") ?? "").matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map(
    ([, x, y]) => ({ x: Number(x), y: Number(y) }),
  );
}

function writtenVertices(key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`"c4modeler\\.relationship\\.${escaped}" "([^"]*)"`).exec(
    modeler.exportText(),
  )?.[1];
}

describe("two lines of one pair (P3.1)", () => {
  beforeEach(async () => {
    await modeler.importText(PAIR);
  });

  it("are drawn through a bend each, on either side, while the scene stores no vertex", () => {
    const there = connection("rel:orders->billing").waypoints;
    const back = connection("rel:billing->orders").waypoints;
    expect(there).toHaveLength(3);
    expect(back).toHaveLength(3);
    expect(Math.abs(there[1]!.y - back[1]!.y)).toBeGreaterThanOrEqual(48);
    const scene = service<SceneService>("c4Scene").current();
    expect(scene.vertices.get("orders->billing")).toEqual([]);
    expect(scene.vertices.get("billing->orders")).toEqual([]);
    const [first, second] = scene.relationships.map(({ labelBox }) => labelBox);
    expect(first!.y + first!.height <= second!.y || second!.y + second!.height <= first!.y).toBe(
      true,
    );
  });

  it("write no relationship key when a move pins the view", () => {
    service<C4Modeling>("modeling").moveElements([shapeIn(modeler, "billing")], { x: 0, y: 40 });
    const text = modeler.exportText();
    expect(text).toContain('"c4modeler.element.billing"');
    expect(text).not.toContain('"c4modeler.relationship.');
    expect(connection("rel:orders->billing").waypoints).toHaveLength(3);
  });

  it("keep only the vertex a press on the line adds, in its preview and in the file", () => {
    const line = connection("rel:orders->billing");
    const [start, bend] = line.waypoints;
    const press = {
      x: Math.round((start!.x + bend!.x) / 2),
      y: Math.round((start!.y + bend!.y) / 2),
    };
    const drop = { x: press.x, y: press.y - 120 };
    const pointer = pointerOn(modeler.diagram);
    pointer.press(graphics("rel:orders->billing"), press);
    pointer.moveTo({ x: press.x, y: press.y - 40 });
    pointer.moveTo(drop);
    expect(pointer.dragPrefix()).toBe("bendpoint.move");
    expect(previewPoints(), "the preview leaves the fan's bend out").toHaveLength(3);
    pointer.hover(drop);
    pointer.release(drop);

    expect(writtenVertices("orders->billing")).toBe(`${drop.x},${drop.y}`);
    expect(writtenVertices("billing->orders")).toBeUndefined();
  });

  it("keep the bend the user drags to a new place, as a vertex of its own", () => {
    const line = connection("rel:orders->billing");
    const bend = line.waypoints[1]!;
    const drop = { x: bend.x + 10, y: bend.y - 60 };
    const pointer = pointerOn(modeler.diagram);
    service<{ start(event: MouseEvent, connection: Connection, index: number): void }>(
      "bendpointMove",
    ).start(pointer.event("mousedown", bend), line, 1);
    pointer.moveTo({ x: bend.x, y: bend.y - 20 });
    pointer.moveTo(drop);
    pointer.hover(drop);
    pointer.release(drop);

    expect(writtenVertices("orders->billing")).toBe(`${drop.x},${drop.y}`);
  });

  it("drop the fan's bend from a waypoint update that keeps it, so nothing changes", () => {
    const line = connection("rel:orders->billing");
    const before = modeler.exportText();
    service<C4Modeling>("modeling").updateWaypoints(line, points(line.waypoints));
    expect(modeler.exportText()).toBe(before);
  });
});

describe("two lines of one pair with long labels (P3.1 with P3.3)", () => {
  function ground(id: string): DOMRect {
    const rect = graphics(id).querySelector<SVGRectElement>("rect.c4-label-ground");
    if (!rect) throw new Error(`no label ground on ${id}`);
    const attribute = (name: string) => Number(rect.getAttribute(name));
    return new DOMRect(attribute("x"), attribute("y"), attribute("width"), attribute("height"));
  }

  for (const direction of ["lr", "tb"] as const) {
    it(`keep their grown labels apart where the pair runs ${direction === "lr" ? "across" : "up and down"}`, async () => {
      await modeler.importText(LONG_PAIR(direction));
      const there = ground("rel:customer->billing");
      const back = ground("rel:billing->customer");
      expect(Math.max(there.height, back.height), "the labels grew past the slot").toBeGreaterThan(
        48,
      );
      const apart =
        there.right <= back.left ||
        back.right <= there.left ||
        there.bottom <= back.top ||
        back.bottom <= there.top;
      expect(apart, `${JSON.stringify(there)} against ${JSON.stringify(back)}`).toBe(true);
    });
  }
});

describe("the cursor while a connect runs (P3, wave 1)", () => {
  function startConnect(from: string): Pointer {
    const pointer = pointerOn(modeler.diagram);
    service<{ start(event: MouseEvent, start: Shape, autoActivate: boolean): void }>(
      "connect",
    ).start(pointer.event("mousedown", centreOf(from)), shapeIn(modeler, from), true);
    graphics(from).dispatchEvent(pointer.event("mouseout", centreOf(from)));
    return pointer;
  }

  it("shows no move cursor over a relationship, which is no target", async () => {
    await modeler.importText(BOOKSHOP);
    const hit = graphics("rel:bookshop->payments").querySelector(".djs-hit")!;
    expect(getComputedStyle(hit).cursor).toBe("move");
    const pointer = startConnect("customer");
    const [start, end] = connection("rel:bookshop->payments").waypoints;
    const onLine = { x: (start!.x + end!.x) / 2, y: (start!.y + end!.y) / 2 };
    pointer.hover(onLine, hit);
    expect(getComputedStyle(hit).cursor).toBe("default");
    pressEscape();
    expect(getComputedStyle(hit).cursor).toBe("move");
  });

  it("shows no move cursor over a boundary's caption, which is no target either", async () => {
    await modeler.importText(LIBRARY);
    const frame = graphics("boundary:library");
    const hits = [...frame.querySelectorAll(".djs-hit")];
    expect(hits.length).toBeGreaterThan(0);
    const pointer = startConnect("reader");
    pointer.hover(centreOf("reader"), frame);
    for (const hit of hits) expect(getComputedStyle(hit).cursor).toBe("default");
    pressEscape();
  });
});

describe("the view title (P3.4)", () => {
  it("is as wide as the whole title, so its line is not cut at the content's width", async () => {
    await modeler.importText(LONG_TITLE);
    const scene = service<SceneService>("c4Scene").current();
    const [title] = titleTextLayout(scene.title).bands;
    expect(title!.truncated).toBe(false);
    expect(title!.lines).toEqual([
      "Component diagram for Internet Banking System - API Application",
    ]);
    expect(scene.title.box.width).toBeGreaterThan(scene.boxes.get("api")!.width);
    expect(modeler.contentBounds()!.width).toBeGreaterThanOrEqual(scene.title.box.width);
  });
});
