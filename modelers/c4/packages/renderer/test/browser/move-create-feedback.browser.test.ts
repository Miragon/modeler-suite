/*
 * The feedback of a move and a create (UX audit P2): the frames follow the drag, snapping and
 * auto-scroll as the sibling modelers have them, palette entries that show what they create, a
 * create preview in the look of what it drops, and a keyboard create that lands clear of
 * everything. On the interaction fixture: its pinned `Containers` view frames `web`, `api` and
 * `database` in the `bookshop` boundary, with `customer` outside it.
 */
import { afterEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Resize from "diagram-js/lib/features/resize/Resize";
import type { Shape } from "diagram-js/lib/model/Types";
import type { Box } from "@miragon/c4-schema-model";
import type { C4SceneService } from "../../src/services.js";
import { BLANK, BOOKSHOP } from "./support/interaction/fixtures.js";
import {
  destroyMounted,
  mountModeler,
  press,
  service,
  shapeOf,
  wait,
  type Mounted,
} from "./support/interaction/mount.js";
import { pointerOn, pressEscape, type Point } from "./support/pointer.js";

afterEach(() => destroyMounted());

/** A pinned landscape with a group of two systems beside a third one. */
const GROUPED = `workspace "Grouped" {
    model {
        a = softwareSystem "A"
        group "Partners" {
            b = softwareSystem "B"
            c = softwareSystem "C"
        }
        a -> b "Uses"
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.a" "0,0"
                "c4modeler.element.b" "400,0"
                "c4modeler.element.c" "400,320"
            }
        }
    }
}
`;

async function containersView(text = BOOKSHOP): Promise<Mounted> {
  const page = await mountModeler(text);
  page.modeler.views.open("Containers", { cause: "user" });
  return page;
}

function container(page: Mounted): HTMLElement {
  return service<Canvas>(page.modeler, "canvas").getContainer();
}

function scene(page: Mounted) {
  return service<C4SceneService>(page.modeler, "c4Scene").current();
}

function boundaryBox(page: Mounted, id: string): Box | undefined {
  return scene(page).boundaries.find((boundary) => boundary.id === id)?.box;
}

function framePreview(page: Mounted, boundary: string): SVGPathElement | null {
  return container(page).querySelector<SVGPathElement>(
    `.c4-frame-preview[data-boundary="${boundary}"]`,
  );
}

/** The frame a preview path stands for: the path is inset by half its 2-unit stroke. */
function previewedFrame(path: SVGPathElement): Box {
  const box = path.getBBox();
  return { x: box.x - 1, y: box.y - 1, width: box.width + 2, height: box.height + 2 };
}

function centreOf(page: Mounted, id: string): Point {
  const shape = shapeOf(page.modeler, id) as unknown as Box;
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

/** Presses on an element and drags its centre to `to`, held there. */
function drag(page: Mounted, id: string, to: Point) {
  const pointer = pointerOn(page.modeler.diagram);
  const start = centreOf(page, id);
  pointer.press(container(page).querySelector(`[data-element-id="${id}"]`)!, start);
  pointer.moveTo({ x: (start.x + to.x) / 2, y: (start.y + to.y) / 2 });
  pointer.hover(to);
  return {
    drop() {
      pointer.hover(to);
      pointer.release(to);
    },
  };
}

function overlap(first: Box, second: Box, gap = 0): boolean {
  return (
    first.x - gap < second.x + second.width &&
    second.x < first.x + first.width + gap &&
    first.y - gap < second.y + second.height &&
    second.y < first.y + first.height + gap
  );
}

describe("the frames follow a drag (P2.1)", () => {
  it("a member dragged out of its boundary shows the frame the drop draws, and the frame before fades", async () => {
    const page = await containersView();
    const before = boundaryBox(page, "bookshop");
    const database = centreOf(page, "database");
    const held = drag(page, "database", { x: database.x + 400, y: database.y });

    const preview = framePreview(page, "bookshop");
    expect(preview).not.toBeNull();
    expect(preview?.classList.contains("c4-frame-preview-warning")).toBe(false);
    const previewed = previewedFrame(preview!);
    expect(previewed.width).toBeGreaterThan(before!.width + 300);
    expect(
      container(page)
        .querySelector('[data-element-id="boundary:bookshop"]')
        ?.classList.contains("c4-frame-stale"),
    ).toBe(true);

    held.drop();
    expect(boundaryBox(page, "bookshop")).toEqual(previewed);
    expect(container(page).querySelector(".c4-frame-preview")).toBeNull();
    expect(container(page).querySelector(".c4-frame-stale")).toBeNull();
  });

  it("a frame that would run over an element it does not hold warns in the danger colour, and the drop still goes through", async () => {
    const page = await containersView();
    const held = drag(page, "database", { x: 180, y: 420 });

    const preview = framePreview(page, "bookshop");
    expect(preview?.classList.contains("c4-frame-preview-warning")).toBe(true);
    const danger = getComputedStyle(container(page)).getPropertyValue("--cd-ui-danger").trim();
    const stroke = getComputedStyle(preview!).stroke;
    const probe = document.createElement("span");
    probe.style.color = danger;
    container(page).append(probe);
    expect(stroke).toBe(getComputedStyle(probe).color);
    probe.remove();

    held.drop();
    const dropped = scene(page).boxes.get("database")!;
    expect(Math.abs(dropped.x - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(dropped.y - 340)).toBeLessThanOrEqual(1);
    expect(container(page).querySelector(".c4-frame-preview")).toBeNull();
  });

  it("an element dragged into a frame it does not belong to warns there, though that frame stays as it is", async () => {
    const page = await containersView();
    const before = boundaryBox(page, "bookshop")!;
    const web = centreOf(page, "web");
    const api = centreOf(page, "api");
    const held = drag(page, "customer", { x: web.x, y: (web.y + api.y) / 2 });

    const preview = framePreview(page, "bookshop");
    expect(preview?.classList.contains("c4-frame-preview-warning")).toBe(true);
    expect(previewedFrame(preview!)).toEqual(before);
    expect(
      container(page)
        .querySelector('[data-element-id="boundary:bookshop"]')
        ?.classList.contains("c4-frame-stale"),
    ).toBe(true);

    held.drop();
    expect(boundaryBox(page, "bookshop")).toEqual(before);
    expect(container(page).querySelector(".c4-frame-preview")).toBeNull();
  });

  it("a palette create of a person inside a boundary it will not belong to warns there", async () => {
    const page = await containersView();
    const web = centreOf(page, "web");
    const api = centreOf(page, "api");
    const pointer = pointerOn(page.modeler.diagram);
    pointer.clickPalette("create.person");
    pointer.hover({ x: web.x, y: (web.y + api.y) / 2 });
    expect(framePreview(page, "bookshop")?.classList.contains("c4-frame-preview-warning")).toBe(
      true,
    );
    pressEscape();
    expect(container(page).querySelector(".c4-frame-preview")).toBeNull();
  });

  it("a move inside the boundary that leaves its frame as it is draws no preview", async () => {
    const page = await containersView();
    const api = centreOf(page, "api");
    drag(page, "api", { x: api.x, y: api.y + 10 });
    expect(container(page).querySelector(".c4-frame-preview")).toBeNull();
    pressEscape();
  });

  it("a palette create of a container shows the view's boundary growing around it", async () => {
    const page = await containersView();
    const before = boundaryBox(page, "bookshop")!;
    const pointer = pointerOn(page.modeler.diagram);
    pointer.clickPalette("create.container");
    const spot = { x: before.x + before.width + 300, y: before.y + 200 };
    pointer.hover(spot);

    const preview = framePreview(page, "bookshop");
    expect(preview).not.toBeNull();
    const previewed = previewedFrame(preview!);
    expect(previewed.x + previewed.width).toBeGreaterThan(spot.x + 100);

    pointer.hover(spot);
    pointer.release(spot);
    await wait();
    expect(boundaryBox(page, "bookshop")).toEqual(previewed);
  });

  it("a group's dotted frame follows its member too, and fades where it was", async () => {
    const page = await mountModeler(GROUPED);
    const group = () => scene(page).groups.find(({ name }) => name === "Partners");
    const before = group()!;
    const member = centreOf(page, "b");
    const held = drag(page, "b", { x: member.x + 500, y: member.y });

    const preview = container(page).querySelector<SVGPathElement>(
      `.c4-frame-preview[data-group="${CSS.escape(before.key)}"]`,
    );
    expect(preview).not.toBeNull();
    const previewed = previewedFrame(preview!);
    expect(previewed.width).toBeGreaterThan(before.box.width + 400);
    expect(
      container(page)
        .querySelector(`.c4-group[data-group="${CSS.escape(before.key)}"]`)
        ?.classList.contains("c4-frame-stale"),
    ).toBe(true);

    held.drop();
    expect(group()?.box).toEqual(previewed);
    expect(container(page).querySelector(".c4-frame-stale")).toBeNull();
  });

  it("a resize shows the frame it leaves", async () => {
    const page = await containersView();
    const shape = shapeOf(page.modeler, "database") as Shape;
    const pointer = pointerOn(page.modeler.diagram);
    const corner = { x: shape.x + shape.width, y: shape.y + shape.height };
    const to = { x: corner.x + 200, y: corner.y + 60 };
    service<Resize>(page.modeler, "resize").activate(
      pointer.event("mousedown", corner),
      shape,
      "se",
    );
    pointer.moveTo({ x: corner.x + 100, y: corner.y + 30 });
    pointer.moveTo(to);

    const preview = framePreview(page, "bookshop");
    expect(preview).not.toBeNull();
    const previewed = previewedFrame(preview!);
    pointer.release(to);
    expect(boundaryBox(page, "bookshop")).toEqual(previewed);
    expect(container(page).querySelector(".c4-frame-preview")).toBeNull();
  });

  it("a palette create of a person, which no boundary frames, changes no frame", async () => {
    const page = await containersView();
    const before = boundaryBox(page, "bookshop")!;
    const pointer = pointerOn(page.modeler.diagram);
    pointer.clickPalette("create.person");
    pointer.hover({ x: before.x + before.width + 300, y: before.y + 200 });
    expect(container(page).querySelector(".c4-frame-preview")).toBeNull();
    pressEscape();
  });
});

describe("snapping and auto-scroll (P2.2, P2.3)", () => {
  it("a move snaps to the centre line of another element and shows the snap line", async () => {
    const page = await containersView();
    const api = centreOf(page, "api");
    const customer = centreOf(page, "customer");
    const held = drag(page, "customer", { x: customer.x, y: api.y + 4 });
    const line = container(page).querySelector(".djs-snap-line");
    expect(line).not.toBeNull();
    expect(getComputedStyle(line!).display).not.toBe("none");
    held.drop();
    expect(centreOf(page, "customer").y).toBe(api.y);
  });

  it("never snaps to a boundary, whose frame follows its members", async () => {
    const page = await containersView();
    const frame = boundaryBox(page, "bookshop")!;
    const customer = centreOf(page, "customer");
    const frameMiddle = frame.y + frame.height / 2;
    const held = drag(page, "customer", { x: customer.x, y: frameMiddle + 3 });
    held.drop();
    expect(centreOf(page, "customer").y).toBe(frameMiddle + 3);
  });

  it("a dragged element held at the canvas edge scrolls the canvas and stays under the pointer", async () => {
    const page = await containersView();
    const canvas = service<Canvas>(page.modeler, "canvas");
    const rect = container(page).getBoundingClientRect();
    const start = canvas.viewbox();
    const edge = { clientX: rect.right - 6, clientY: rect.top + rect.height / 2 };
    const local = () => {
      const viewbox = canvas.viewbox();
      return {
        x: viewbox.x + (edge.clientX - rect.left) / viewbox.scale,
        y: viewbox.y + (edge.clientY - rect.top) / viewbox.scale,
      };
    };
    drag(page, "customer", local());
    await wait(120);

    expect(canvas.viewbox().x).toBeGreaterThan(start.x + 20);
    const payload = (
      service<Dragging>(page.modeler, "dragging").context() as {
        payload: { x: number };
      }
    ).payload;
    expect(Math.abs(payload.x - local().x)).toBeLessThanOrEqual(1);
    pressEscape();
  });

  it("an armed tool at the canvas edge scrolls nothing", async () => {
    const page = await containersView();
    const canvas = service<Canvas>(page.modeler, "canvas");
    const pointer = pointerOn(page.modeler.diagram);
    pointer.clickPalette("hand-tool");
    const rect = container(page).getBoundingClientRect();
    const start = canvas.viewbox();
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: rect.right - 6,
        clientY: rect.top + rect.height / 2,
      }),
    );
    await wait(120);
    expect(canvas.viewbox().x).toBe(start.x);
    pressEscape();
  });
});

describe("the palette shows what it creates (P2.4)", () => {
  function entryPaths(page: Mounted, action: string): SVGPathElement[] {
    return [
      ...container(page).querySelectorAll<SVGPathElement>(
        `.djs-palette [data-action="${action}"] svg path`,
      ),
    ];
  }

  function bodyFillOf(page: Mounted, id: string): string | null {
    return (
      container(page)
        .querySelector(`[data-element-id="${id}"] .djs-visual .c4-body`)
        ?.getAttribute("fill") ?? null
    );
  }

  it("each creating entry shows the look its element lands in, and the five are told apart", async () => {
    const page = await mountModeler(BOOKSHOP);
    page.modeler.c4.applyC4Colours();
    page.modeler.views.open("Components-api", { cause: "user" });
    const actions = [
      "create.person",
      "create.softwareSystem",
      "create.container",
      "create.database",
      "create.component",
    ];
    const previews = actions.map(
      (action) =>
        container(page).querySelector(`.djs-palette [data-action="${action}"] svg`)?.outerHTML,
    );
    expect(new Set(previews).size).toBe(5);
    page.modeler.views.open("Containers", { cause: "user" });
    expect(entryPaths(page, "create.container")[0]?.getAttribute("fill")).toBe(
      bodyFillOf(page, "web"),
    );
    expect(entryPaths(page, "create.person")[0]?.getAttribute("fill")).toBe(
      bodyFillOf(page, "customer"),
    );
  });

  it("follows the styles: Apply C4 colours rebuilds the entries without a view switch", async () => {
    const page = await mountModeler(BOOKSHOP);
    const before = entryPaths(page, "create.softwareSystem")[0]?.getAttribute("fill");
    page.modeler.c4.applyC4Colours();
    const after = entryPaths(page, "create.softwareSystem")[0]?.getAttribute("fill");
    expect(after).not.toBe(before);
    expect(after).toBe(bodyFillOf(page, "bookshop"));
  });

  it("the Database entry is a cylinder in the containers' look", async () => {
    const page = await containersView();
    page.modeler.c4.applyC4Colours();
    const [body, lid] = entryPaths(page, "create.database");
    expect(body?.getAttribute("fill")).toBe(bodyFillOf(page, "database"));
    expect(lid?.getAttribute("fill")).toBe("none");
    expect(body?.getAttribute("d")).toMatch(/A/);
  });

  it("a blank file's entries show the C4 colours its first element gets", async () => {
    const page = await mountModeler("");
    const keyboard = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 });
    const preview = entryPaths(page, "create.softwareSystem")[0]?.getAttribute("fill");
    container(page)
      .querySelector('.djs-palette [data-action="create.softwareSystem"]')
      ?.dispatchEvent(keyboard);
    press(container(page).querySelector(".diagram-label-editor")!, "Escape");
    const [created] = page.modeler.elements.list();
    expect(preview).toBe(bodyFillOf(page, created!.id));
  });
});

describe("the create preview (P2.5)", () => {
  it("looks like the element it drops and lets what lies under it show through", async () => {
    const page = await containersView();
    page.modeler.c4.applyC4Colours();
    const pointer = pointerOn(page.modeler.diagram);
    pointer.clickPalette("create.container");
    pointer.hover(centreOf(page, "api"));

    const preview = container(page).querySelector<SVGGElement>(".c4-create-preview");
    expect(preview).not.toBeNull();
    expect(container(page).querySelector(".djs-drag-group .djs-dragger")).toBeNull();
    const body = preview!.querySelector(".c4-body")!;
    expect(body.getAttribute("fill")).toBe(
      container(page)
        .querySelector('[data-element-id="api"] .djs-visual .c4-body')
        ?.getAttribute("fill"),
    );
    expect(getComputedStyle(body).fill).not.toBe("none");
    expect(Number(getComputedStyle(preview!).opacity)).toBeLessThan(1);
    expect(Number(getComputedStyle(preview!).opacity)).toBeGreaterThan(0.4);
    pressEscape();
  });
});

describe("a keyboard create lands clear of everything (P2.6)", () => {
  function keyboardCreate(page: Mounted, action: string): string {
    const before = new Set(page.modeler.elements.list().map(({ id }) => id));
    container(page)
      .querySelector(`.djs-palette [data-action="${action}"]`)
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    const editor = container(page).querySelector(".diagram-label-editor");
    if (editor) press(editor, "Escape");
    const created = page.modeler.elements.list().find(({ id }) => !before.has(id));
    if (!created) throw new Error(`${action} created nothing`);
    return created.id;
  }

  it("never on an element, a label or a frame it does not join, three times in a row", async () => {
    const page = await containersView();
    for (const action of ["create.container", "create.container", "create.person"]) {
      const id = keyboardCreate(page, action);
      const current = scene(page);
      const box = current.boxes.get(id)!;
      for (const element of current.elements) {
        if (element.id !== id) expect(overlap(box, element.box, 47), element.id).toBe(false);
      }
      for (const relationship of current.relationships) {
        expect(overlap(box, relationship.labelBox), relationship.canvasKey).toBe(false);
      }
      const frame = boundaryBox(page, "bookshop")!;
      if (action === "create.person") expect(overlap(box, frame)).toBe(false);
      expect(overlap(frame, current.boxes.get("customer")!)).toBe(false);
    }
  });

  it("lands in the visible canvas, the centre when it is free", async () => {
    const page = await mountModeler(BLANK);
    const canvas = service<Canvas>(page.modeler, "canvas");
    const viewbox = canvas.viewbox();
    const id = keyboardCreate(page, "create.softwareSystem");
    const box = scene(page).boxes.get(id)!;
    expect(box.x + box.width / 2).toBeCloseTo(viewbox.x + viewbox.width / 2, 0);
    expect(box.y + box.height / 2).toBeCloseTo(viewbox.y + viewbox.height / 2, 0);
    const secondId = keyboardCreate(page, "create.softwareSystem");
    const second = scene(page).boxes.get(secondId)!;
    expect(overlap(second, box, 47)).toBe(false);
    expect(second.x - box.x).toBe(second.y - box.y);
    expect(second.x + second.width).toBeLessThanOrEqual(viewbox.x + viewbox.width);
  });
});
