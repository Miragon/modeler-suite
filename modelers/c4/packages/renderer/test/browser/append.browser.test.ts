/*
 * The context pad's append (UX audit P7): an entry per kind the view creates, which adds that
 * element with a relationship from the selected one as one edit and one undo step; a click places
 * it beside the source in free space and in its parent's frame, a drag where it is dropped with the
 * relationship's line drawn from the source. Its name editor opens, and Enter goes on to the
 * relationship's description. On the interaction fixture: a pinned landscape of `customer`,
 * `bookshop` and `payments`, and a pinned `Containers` view that frames `web`, `api` and `database`
 * in the `bookshop` boundary, with `customer` outside it.
 */
import { afterEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Box, ElementId } from "@miragon/c4-schema-model";
import type LabelEditing from "../../src/label-editing/LabelEditing.js";
import type { C4SceneService } from "../../src/services.js";
import {
  destroyMounted,
  mountModeler,
  press,
  select,
  service,
  shapeOf,
  wait,
  workspaceOf,
  type Mounted,
} from "./support/interaction/mount.js";
import { pointerOn, type Point } from "./support/pointer.js";

afterEach(() => destroyMounted());

const LANDSCAPE_ENTRIES = [
  "append.person",
  "append.softwareSystem",
  "connect",
  "edit-name",
  "edit-description",
  "remove-from-view",
  "delete-from-model",
];

const CONTAINER_APPENDS = [
  "append.person",
  "append.softwareSystem",
  "append.container",
  "append.database",
];

/**
 * A container view where the append from `customer` lands right of it on the grid, 3 units above
 * its axis (a person's centre is 108 below its top); with `mail` the frame then ends 1 unit above
 * it, so the frame of a container lined up with `customer` would reach `mail`.
 */
function frameNearStranger(withMail: boolean): string {
  return `workspace "Row" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        customer -> web "Uses"${
          withMail
            ? `
        mail = softwareSystem "Mail"
        web -> mail "Sends"`
            : ""
        }
    }
    views {
        container shop "Containers" {
            include *
            properties {
                "c4modeler.element.customer" "0,39"${withMail ? `\n                "c4modeler.element.mail" "408,297"` : ""}
                "c4modeler.element.web" "408,-300"
            }
        }
    }
}
`;
}

/**
 * The bookshop's container view, where the boundary may grow downwards only (the customer above
 * it, an external system either side): the first free slot for a container appended from `api`
 * is below `database`, and its line would run through `database` and its label.
 */
const CROWDED = `workspace "Crowded" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API"
            database = container "Database"
        }
        payments = softwareSystem "Payments"
        mail = softwareSystem "Mail"
        customer -> web "Uses"
        web -> api "Calls"
        api -> database "Reads from"
        api -> payments "Charges"
        api -> mail "Sends"
        mail -> customer "Notifies"
    }
    views {
        container shop "Containers" {
            include *
            properties {
                "c4modeler.element.api" "560,640"
                "c4modeler.element.customer" "572,0"
                "c4modeler.element.database" "560,920"
                "c4modeler.element.mail" "1120,640"
                "c4modeler.element.payments" "0,640"
                "c4modeler.element.web" "560,360"
            }
        }
    }
}
`;

/** Whether the straight line between the centres of `from` and `to` runs through `box`. */
function lineCrosses(from: Box, to: Box, box: Box): boolean {
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  for (let step = 1; step < 400; step++) {
    const x = start.x + ((end.x - start.x) * step) / 400;
    const y = start.y + ((end.y - start.y) * step) / 400;
    if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) return true;
  }
  return false;
}

async function containersView(): Promise<Mounted> {
  const page = await mountModeler();
  page.modeler.views.open("Containers", { cause: "user" });
  return page;
}

function labelEditing(page: Mounted): LabelEditing {
  return service<LabelEditing>(page.modeler, "labelEditing");
}

function editor(page: Mounted): HTMLTextAreaElement {
  const field = page.host.querySelector<HTMLTextAreaElement>(".diagram-label-editor");
  if (!field) throw new Error("no label editor is open");
  return field;
}

function padActions(page: Mounted): string[] {
  return [...page.host.querySelectorAll<HTMLElement>(".djs-context-pad .entry[data-action]")].map(
    (entry) => entry.dataset.action ?? "",
  );
}

function padEntry(page: Mounted, action: string): HTMLElement {
  const entry = page.host.querySelector<HTMLElement>(`.djs-context-pad [data-action="${action}"]`);
  if (!entry) throw new Error(`no context pad entry ${action}`);
  return entry;
}

/** A pointer click on a pad entry, which takes no focus: it drops the focus to `<body>` first. */
function clickPadEntry(page: Mounted, action: string): void {
  const entry = padEntry(page, action);
  (document.activeElement as HTMLElement | null)?.blur?.();
  entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
}

/** The native drag a pointer starts on a pad entry, which diagram-js turns into its create. */
function dragPadEntry(page: Mounted, action: string): void {
  const entry = padEntry(page, action);
  const box = entry.getBoundingClientRect();
  entry.dispatchEvent(
    new DragEvent("dragstart", {
      bubbles: true,
      cancelable: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    }),
  );
}

function boxOf(page: Mounted, canvasId: string): Box {
  const { x, y, width, height } = shapeOf(page.modeler, canvasId) as unknown as Box;
  return { x, y, width, height };
}

function centreOf(page: Mounted, canvasId: string): Point {
  const box = boxOf(page, canvasId);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function overlap(first: Box, second: Box): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

function contains(outer: Box, inner: Box): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** Beside: the two boxes share a row or a column. */
function beside(first: Box, second: Box): boolean {
  const sharesRow = first.y < second.y + second.height && second.y < first.y + first.height;
  const sharesColumn = first.x < second.x + second.width && second.x < first.x + first.width;
  return sharesRow || sharesColumn;
}

function createdSince(page: Mounted, before: readonly ElementId[]) {
  return workspaceOf(page.modeler).elements.filter((element) => !before.includes(element.id));
}

function relationshipBetween(page: Mounted, sourceId: string, destinationId: string) {
  return workspaceOf(page.modeler).relationships.find(
    (relationship) =>
      relationship.sourceId === sourceId &&
      relationship.destinationId === destinationId &&
      !relationship.implied,
  );
}

function previewLine(page: Mounted): SVGPathElement | null {
  return page.host.querySelector<SVGPathElement>(".djs-dragger .c4-line");
}

function undo(page: Mounted): void {
  service<CommandStack>(page.modeler, "commandStack").undo();
}

describe("the context pad appends a connected element (P7)", () => {
  it("offers one entry per kind the view creates, first, in the palette's look", async () => {
    const page = await mountModeler();
    select(page.modeler, "bookshop");
    expect(padActions(page)).toEqual(LANDSCAPE_ENTRIES);
    expect(padEntry(page, "append.person").title).toBe("Append person");
    expect(padEntry(page, "append.softwareSystem").title).toBe("Append software system");
    expect(padEntry(page, "append.person").querySelector("svg")).not.toBeNull();
    const groups = [...page.host.querySelectorAll<HTMLElement>(".djs-context-pad .group")];
    expect(groups.map((group) => group.dataset.group)).toEqual(["append", "edit", "delete"]);

    page.modeler.views.open("Containers", { cause: "user" });
    select(page.modeler, "web");
    expect(padActions(page).slice(0, 5)).toEqual([...CONTAINER_APPENDS, "connect"]);
    expect(padEntry(page, "append.database").title).toBe("Append database");

    page.modeler.views.open("Components-api", { cause: "user" });
    select(page.modeler, "orders");
    expect(padActions(page).slice(0, 6)).toEqual([
      ...CONTAINER_APPENDS,
      "append.component",
      "connect",
    ]);
  });

  it("offers no append on a relationship", async () => {
    const page = await mountModeler();
    select(page.modeler, "rel:bookshop->payments");
    expect(padActions(page).some((action) => action.startsWith("append."))).toBe(false);
  });

  it("places a click's element beside the source, clear of the others, as one undo step", async () => {
    const page = await mountModeler();
    const before = page.modeler.exportText();
    const ids = workspaceOf(page.modeler).elements.map((element) => element.id);
    select(page.modeler, "bookshop");
    clickPadEntry(page, "append.softwareSystem");

    const [created] = createdSince(page, ids);
    expect(created).toMatchObject({ kind: "softwareSystem", name: "Software System" });
    expect(relationshipBetween(page, "bookshop", created!.id)).toBeDefined();
    const box = boxOf(page, created!.id);
    expect(beside(box, boxOf(page, "bookshop"))).toBe(true);
    for (const other of ["customer", "bookshop", "payments"]) {
      expect(overlap(box, boxOf(page, other)), `over ${other}`).toBe(false);
    }
    expect(page.modeler.exportText()).toContain(
      `"c4modeler.element.${created!.id}" "${box.x},${box.y}"`,
    );
    expect(service<Selection>(page.modeler, "selection").get()).toEqual([
      shapeOf(page.modeler, created!.id),
    ]);
    expect(labelEditing(page).openEdit()).toEqual({
      elementId: created!.id,
      field: "name",
      text: "Software System",
    });

    press(editor(page), "Escape");
    undo(page);
    expect(page.modeler.exportText()).toBe(before);
  });

  it("puts an appended container into the scope's frame, never around a stranger", async () => {
    const page = await containersView();
    const ids = workspaceOf(page.modeler).elements.map((element) => element.id);
    select(page.modeler, "web");
    clickPadEntry(page, "append.database");

    const [created] = createdSince(page, ids);
    expect(created).toMatchObject({ kind: "container", parentId: "bookshop" });
    expect(created!.tags).toContain("Database");
    expect(relationshipBetween(page, "web", created!.id)).toBeDefined();
    const box = boxOf(page, created!.id);
    const frame = service<C4SceneService>(page.modeler, "c4Scene")
      .current()
      .boundaries.find((boundary) => boundary.id === "bookshop")!.box;
    expect(contains(frame, box)).toBe(true);
    expect(overlap(frame, boxOf(page, "customer"))).toBe(false);
    for (const other of ["customer", "web", "api", "database"]) {
      expect(overlap(box, boxOf(page, other)), `over ${other}`).toBe(false);
    }
  });

  it("lines a click's element up with the source where the layout's grid puts it a few units off", async () => {
    const page = await mountModeler();
    const ids = workspaceOf(page.modeler).elements.map((element) => element.id);
    select(page.modeler, "bookshop");
    clickPadEntry(page, "append.person");

    const [created] = createdSince(page, ids);
    expect(centreOf(page, created!.id).x).toBe(centreOf(page, "bookshop").x);

    const lined = await mountModeler(frameNearStranger(false));
    const before = workspaceOf(lined.modeler).elements.map((element) => element.id);
    select(lined.modeler, "customer");
    clickPadEntry(lined, "append.container");
    const [container] = createdSince(lined, before);
    expect(centreOf(lined, container!.id).y).toBe(centreOf(lined, "customer").y);
  });

  it("keeps the grid's place where lining up would grow the frame over a stranger", async () => {
    const page = await mountModeler(frameNearStranger(true));
    const ids = workspaceOf(page.modeler).elements.map((element) => element.id);
    select(page.modeler, "customer");
    clickPadEntry(page, "append.container");

    const [created] = createdSince(page, ids);
    expect(created).toMatchObject({ kind: "container", parentId: "shop" });
    expect(centreOf(page, created!.id).y).not.toBe(centreOf(page, "customer").y);
    const frame = service<C4SceneService>(page.modeler, "c4Scene")
      .current()
      .boundaries.find((boundary) => boundary.id === "shop")!.box;
    expect(contains(frame, boxOf(page, created!.id))).toBe(true);
    expect(overlap(frame, boxOf(page, "mail"))).toBe(false);
  });

  it("runs a click's line clear of the other boxes and labels in a crowded view", async () => {
    const page = await mountModeler(CROWDED);
    const ids = workspaceOf(page.modeler).elements.map((element) => element.id);
    select(page.modeler, "api");
    clickPadEntry(page, "append.container");
    press(editor(page), "Escape");

    const [created] = createdSince(page, ids);
    expect(created).toMatchObject({ kind: "container", parentId: "shop" });
    const scene = service<C4SceneService>(page.modeler, "c4Scene").current();
    const box = boxOf(page, created!.id);
    const api = boxOf(page, "api");
    for (const other of ["customer", "web", "database", "payments", "mail"]) {
      expect(lineCrosses(api, box, boxOf(page, other)), `through ${other}`).toBe(false);
    }
    for (const relationship of scene.relationships) {
      if (relationship.destinationId === created!.id) continue;
      expect(
        lineCrosses(api, box, relationship.labelBox),
        `through the label of ${relationship.canvasKey}`,
      ).toBe(false);
    }
    const frame = scene.boundaries.find((boundary) => boundary.id === "shop")!.box;
    expect(contains(frame, box)).toBe(true);
    for (const stranger of ["customer", "payments", "mail"]) {
      expect(overlap(frame, boxOf(page, stranger)), `the frame over ${stranger}`).toBe(false);
    }
  });

  it("goes on from the name to the relationship's description on Enter, its key following the name", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    clickPadEntry(page, "append.person");
    editor(page).value = "Clerk";
    press(editor(page), "Enter");
    await wait();
    expect(labelEditing(page).openEdit()).toEqual({
      elementId: "payments->clerk",
      field: "description",
      text: "",
    });
    expect(service<Selection>(page.modeler, "selection").get()).toEqual([
      shapeOf(page.modeler, "rel:payments->clerk"),
    ]);

    editor(page).value = "Notifies";
    press(editor(page), "Enter");
    expect(relationshipBetween(page, "payments", "clerk")).toMatchObject({
      description: "Notifies",
    });
    expect(labelEditing(page).isActive()).toBe(false);
  });

  it("goes on to the relationship after the element's other fields, reached by Tab", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    clickPadEntry(page, "append.softwareSystem");
    editor(page).value = "Ledger";
    press(editor(page), "Tab");
    expect(labelEditing(page).openEdit()).toMatchObject({
      elementId: "ledger",
      field: "description",
    });
    editor(page).value = "Books every payment.";
    press(editor(page), "Enter");
    await wait();
    expect(labelEditing(page).openEdit()).toEqual({
      elementId: "payments->ledger",
      field: "description",
      text: "",
    });
  });

  it("ends with the name when Escape closes its editor", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    clickPadEntry(page, "append.person");
    press(editor(page), "Escape");
    await wait();
    expect(labelEditing(page).isActive()).toBe(false);
  });

  it("drops a dragged element where it is released, with the line drawn from the source", async () => {
    const page = await mountModeler();
    const ids = workspaceOf(page.modeler).elements.map((element) => element.id);
    const pointer = pointerOn(page.modeler.diagram);
    select(page.modeler, "bookshop");
    dragPadEntry(page, "append.softwareSystem");
    const spot = { x: centreOf(page, "bookshop").x, y: 520 };
    pointer.hover({ x: spot.x, y: spot.y - 40 });
    pointer.hover(spot);
    expect(previewLine(page), "the relationship's line while the element follows").not.toBeNull();

    pointer.release(spot);
    expect(previewLine(page)).toBeNull();
    const [created] = createdSince(page, ids);
    expect(created?.kind).toBe("softwareSystem");
    expect(relationshipBetween(page, "bookshop", created!.id)).toBeDefined();
    const centre = centreOf(page, created!.id);
    expect(Math.abs(centre.x - spot.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(centre.y - spot.y)).toBeLessThanOrEqual(1);

    await wait();
    expect(labelEditing(page).openEdit()).toMatchObject({ elementId: created!.id, field: "name" });
    editor(page).value = "Warehouse";
    press(editor(page), "Enter");
    await wait();
    expect(labelEditing(page).openEdit()).toMatchObject({
      elementId: "bookshop->warehouse",
      field: "description",
    });
  });

  it("stays an append when the drag is released over another element", async () => {
    const page = await mountModeler();
    const ids = workspaceOf(page.modeler).elements.map((element) => element.id);
    const pointer = pointerOn(page.modeler.diagram);
    const registry = service<ElementRegistry>(page.modeler, "elementRegistry");
    select(page.modeler, "bookshop");
    dragPadEntry(page, "append.person");
    const over = centreOf(page, "customer");
    pointer.hover({ x: over.x, y: over.y + 200 });
    pointer.hover(over, registry.getGraphics("customer"));
    pointer.moveTo({ x: over.x + 4, y: over.y + 4 });
    expect(previewLine(page), "the line stays while the element is over another").not.toBeNull();

    pointer.release({ x: over.x + 4, y: over.y + 4 });
    const [created] = createdSince(page, ids);
    expect(created?.kind).toBe("person");
    expect(relationshipBetween(page, "bookshop", created!.id)).toBeDefined();
  });

  it("keeps its pad on the canvas beside an element near the bottom edge", async () => {
    const page = await containersView();
    const canvas = service<Canvas>(page.modeler, "canvas");
    const database = boxOf(page, "database");
    const viewbox = canvas.viewbox();
    const height = canvas.getContainer().clientHeight;
    canvas.viewbox({
      x: viewbox.x,
      y: database.y - (height - 60),
      width: viewbox.outer.width,
      height: viewbox.outer.height,
    });
    select(page.modeler, "web");
    select(page.modeler, "database");
    await wait(20);

    const pad = page.host.querySelector<HTMLElement>(".djs-context-pad.open")!;
    const padBox = pad.getBoundingClientRect();
    const containerBox = canvas.getContainer().getBoundingClientRect();
    expect(padBox.height).toBeGreaterThan(200);
    expect(padBox.bottom).toBeLessThanOrEqual(containerBox.bottom);
    expect(padBox.top).toBeGreaterThanOrEqual(containerBox.top);
    const shape = shapeOf(page.modeler, "database").id;
    const elementBox = canvas.getGraphics(shape).getBoundingClientRect();
    expect(padBox.top).toBeLessThanOrEqual(elementBox.top);
  });
});
