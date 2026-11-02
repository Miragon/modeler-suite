/*
 * Focus, keys and label editing around the context pad (SPEC 5.3, 5.5, 5.7): the canvas keeps the
 * keyboard after a pad action, a new relationship opens its description, Escape clears the
 * selection, confirming a default name settles the identifier, a field that cannot be edited says
 * why, and the editor shows a placeholder and a note when the canvas cuts its text short.
 */
import { afterEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type { Shape } from "diagram-js/lib/model/Types";
import type { Point } from "@miragon/c4-schema-model";
import type SceneLookup from "../../src/draw/SceneLookup.js";
import type LabelEditing from "../../src/label-editing/LabelEditing.js";
import { isRelationshipConnection, type C4Connection } from "../../src/scene/types.js";
import { EDIT_REFUSED_EVENT, type EditRefusedEvent } from "../../src/services.js";
import { elementTextLayout, relationshipLabelLayout } from "../../src/text/elementTextLayout.js";
import { pointerOn } from "./support/pointer.js";
import { BOOKSHOP } from "./support/interaction/fixtures.js";
import {
  canvasSvg,
  destroyMounted,
  elementNamed,
  mountModeler,
  press,
  pressOnCanvas,
  select,
  service,
  shapeOf,
  typeInto,
  wait,
  workspaceOf,
  type Mounted,
} from "./support/interaction/mount.js";

afterEach(() => destroyMounted());

/** A name set with a constant, an explicit relationship and the implied one beside it. */
const READ_ONLY = `workspace "Read-only" {
    !constant PAY "Payment Gateway"
    model {
        user = person "User" "A user."
        pay = softwareSystem "\${PAY}" "Takes money."
        shop = softwareSystem "Shop" "Sells things." {
            web = container "Web"
        }
        user -> web "Buys from"
        shop -> pay "Charges"
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.pay" "760,40"
                "c4modeler.element.shop" "400,40"
                "c4modeler.element.user" "40,40"
            }
        }
    }
}
`;

/** The bookshop's system context view: the system it is about cannot leave it. */
const CONTEXT = `workspace "Context" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        customer -> shop "Buys from"
    }
    views {
        systemContext shop "ShopContext" {
            include *
            properties {
                "c4modeler.element.customer" "40,40"
                "c4modeler.element.shop" "400,40"
            }
        }
    }
}
`;

/** A relationship with a technology and no description. */
const TECHNOLOGY_ONLY = `workspace "Technology only" {
    model {
        user = person "User"
        shop = softwareSystem "Shop"
        user -> shop "" "HTTPS"
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.shop" "40,400"
                "c4modeler.element.user" "40,40"
            }
        }
    }
}
`;

/** Screen px the label editor's focus ring reaches outside the field (2px wide, 2px out). */
const FOCUS_RING = 4;

const LONG_DESCRIPTION =
  "Takes card payments. It also refunds orders, handles chargebacks, stores tokenised cards for " +
  "returning customers and reports fraud to the bank every night, and much more besides that.";

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

function centreOf(page: Mounted, canvasId: string): Point {
  const shape = shapeOf(page.modeler, canvasId) as Shape;
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

/** A connect from `from` to `to` by diagram-js's connect, released on the target. */
function connect(page: Mounted, from: string, to: string): void {
  const pointer = pointerOn(page.modeler.diagram);
  const registry = service<ElementRegistry>(page.modeler, "elementRegistry");
  service<{ start(event: MouseEvent, source: Shape, autoActivate?: boolean): void }>(
    page.modeler,
    "connect",
  ).start(
    pointer.event("mousedown", centreOf(page, from)),
    shapeOf(page.modeler, from) as Shape,
    true,
  );
  pointer.hover(centreOf(page, to), registry.getGraphics(to));
  pointer.release(centreOf(page, to));
}

function bandBox(page: Mounted, canvasId: string, band: string) {
  const shape = shapeOf(page.modeler, canvasId);
  const lookup = service<SceneLookup>(page.modeler, "c4SceneLookup");
  const layout = isRelationshipConnection(shape)
    ? relationshipLabelLayout(lookup.relationship(shape)!)
    : elementTextLayout(lookup.element(shape as never)!);
  const found = layout.bands.find((candidate) => candidate.band === band);
  if (!found) throw new Error(`${canvasId} has no ${band} band`);
  return found.box;
}

function clientOf(page: Mounted, point: Point): { clientX: number; clientY: number } {
  const canvas = service<Canvas>(page.modeler, "canvas");
  const rect = canvas.getContainer().getBoundingClientRect();
  const viewbox = canvas.viewbox();
  return {
    clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
    clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
  };
}

function doubleClick(page: Mounted, canvasId: string, at: Point): void {
  service<EventBus>(page.modeler, "eventBus").fire("element.dblclick", {
    element: shapeOf(page.modeler, canvasId),
    originalEvent: new MouseEvent("dblclick", { bubbles: true, ...clientOf(page, at) }),
  });
}

function bandCentre(page: Mounted, canvasId: string, band: string): Point {
  const box = bandBox(page, canvasId, band);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A press on free canvas, as the user's click there. */
function pressCanvas(page: Mounted, at: Point = { x: 600, y: 560 }): void {
  const point = clientOf(page, at);
  canvasSvg(page.modeler).dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, button: 0, ...point }),
  );
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, ...point }));
}

function hint(page: Mounted): HTMLElement | null {
  return page.host.querySelector<HTMLElement>(".c4-label-hint");
}

describe("the context pad hands the keyboard back to the canvas", () => {
  it("after Remove from view, so Cmd/Ctrl+Z undoes it at once", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    clickPadEntry(page, "remove-from-view");
    expect(page.modeler.elements.list().map(({ id }) => id)).not.toContain("payments");
    expect(document.activeElement).toBe(canvasSvg(page.modeler));
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("after a click on Connect, so Escape reaches the canvas", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    clickPadEntry(page, "connect");
    expect(service<Dragging>(page.modeler, "dragging").context()?.prefix).toBe("connect");
    expect(document.activeElement).toBe(canvasSvg(page.modeler));
  });

  it("after Delete from model, unless its confirmation took the focus", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    clickPadEntry(page, "delete-from-model");
    expect(elementNamed(page.modeler, "payments")).toBeUndefined();
    expect(document.activeElement).toBe(canvasSvg(page.modeler));

    select(page.modeler, "bookshop");
    clickPadEntry(page, "delete-from-model");
    const dialog = page.dialogs.current();
    expect(dialog).toBeDefined();
    expect(dialog?.element.contains(document.activeElement)).toBe(true);
  });
});

describe("the context pad matches the family's (guide §8)", () => {
  it("offers the appends, Edit name, the edits and the deletes in one column, separated", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    expect(padActions(page)).toEqual([
      "append.person",
      "append.softwareSystem",
      "connect",
      "edit-name",
      "edit-description",
      "remove-from-view",
      "delete-from-model",
    ]);
    const pad = page.host.querySelector<HTMLElement>(".djs-context-pad.open")!;
    expect(getComputedStyle(pad).flexDirection).toBe("column");
    const groups = [...pad.querySelectorAll<HTMLElement>(".group")];
    expect(groups.map((group) => group.dataset.group)).toEqual(["append", "edit", "delete"]);
    expect(getComputedStyle(groups[0]!).borderTopStyle).toBe("none");
    expect(getComputedStyle(groups[1]!).borderTopStyle).toBe("solid");
    expect(getComputedStyle(groups[2]!).borderTopStyle).toBe("solid");
    expect(getComputedStyle(padEntry(page, "delete-from-model")).color).toBe(
      getComputedStyle(padEntry(page, "connect")).color,
    );

    padEntry(page, "edit-name").click();
    expect(labelEditing(page).openEdit()).toEqual({
      elementId: "customer",
      field: "name",
      text: "Customer",
    });
  });

  it("offers no Remove from view for the system a system context view is about", async () => {
    const page = await mountModeler(CONTEXT);
    select(page.modeler, "shop");
    expect(padActions(page)).not.toContain("remove-from-view");
    expect(padActions(page)).toContain("delete-from-model");
    select(page.modeler, "customer");
    expect(padActions(page)).toContain("remove-from-view");
  });
});

describe("a new relationship opens its description (SPEC 5.5)", () => {
  it("then the technology below it on Tab, with the pad closed while the editor is open", async () => {
    const page = await mountModeler();
    connect(page, "payments", "customer");
    const key = "payments->customer";
    expect(workspaceOf(page.modeler).relationships.some((r) => r.canvasKey === key)).toBe(true);
    await wait();
    expect(labelEditing(page).openEdit()).toEqual({
      elementId: key,
      field: "description",
      text: "",
    });
    expect(editor(page).placeholder).toBe("Description");
    expect(service<ContextPad>(page.modeler, "contextPad").isOpen()).toBe(false);

    editor(page).value = "Notifies about failed payments";
    press(editor(page), "Tab");
    expect(labelEditing(page).openEdit()).toMatchObject({ elementId: key, field: "technology" });
    expect(service<ContextPad>(page.modeler, "contextPad").isOpen()).toBe(false);
    const description = bandBox(page, `rel:${key}`, "description");
    const descriptionBottom = clientOf(page, {
      x: description.x,
      y: description.y + description.height,
    }).clientY;
    expect(editor(page).getBoundingClientRect().top - FOCUS_RING).toBeGreaterThanOrEqual(
      descriptionBottom,
    );

    editor(page).value = "Webhook";
    press(editor(page), "Enter");
    const relationship = workspaceOf(page.modeler).relationships.find((r) => r.canvasKey === key);
    expect(relationship).toMatchObject({
      description: "Notifies about failed payments",
      technology: "Webhook",
    });
    expect(service<ContextPad>(page.modeler, "contextPad").isOpen()).toBe(true);
    expect(document.activeElement).toBe(canvasSvg(page.modeler));
  });

  it("opens an empty description above the technology, clear of it at any zoom", async () => {
    const page = await mountModeler(TECHNOLOGY_ONLY);
    for (const zoom of [1, 1.6]) {
      service<Canvas>(page.modeler, "canvas").zoom(zoom, { x: 160, y: 300 });
      labelEditing(page).activate(shapeOf(page.modeler, "rel:user->shop") as never, "description");
      expect(labelEditing(page).openEdit()).toMatchObject({ field: "description", text: "" });
      const technology = bandBox(page, "rel:user->shop", "technology");
      const technologyTop = clientOf(page, technology).clientY;
      expect(editor(page).getBoundingClientRect().bottom + FOCUS_RING).toBeLessThanOrEqual(
        technologyTop,
      );
      press(editor(page), "Escape");
    }
  });

  it("Escape leaves the relationship unlabelled, and E opens its description again", async () => {
    const page = await mountModeler();
    connect(page, "payments", "customer");
    await wait();
    press(editor(page), "Escape");
    expect(labelEditing(page).isActive()).toBe(false);
    expect(page.modeler.exportText()).toContain("payments -> customer\n");
    expect(pressOnCanvas(page.modeler, { key: "e" })).toBe(false);
    expect(labelEditing(page).openEdit()).toMatchObject({
      elementId: "payments->customer",
      field: "description",
    });
  });
});

describe("Escape on the canvas (SPEC 5.7)", () => {
  it("clears the selection, and passes when nothing is selected", async () => {
    const page = await mountModeler();
    select(page.modeler, "bookshop");
    expect(pressOnCanvas(page.modeler, { key: "Escape" })).toBe(false);
    expect(page.modeler.elements.selection()).toEqual([]);
    expect(pressOnCanvas(page.modeler, { key: "Escape" })).toBe(true);
  });

  it("leaves the selection to a running connect, which ends on the key's release", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    padEntry(page, "connect").click();
    expect(pressOnCanvas(page.modeler, { key: "Escape" })).toBe(true);
    expect(page.modeler.elements.selection()).toEqual(["payments"]);
  });
});

describe("the name of a fresh element", () => {
  it("settles a readable identifier when its default name is confirmed", async () => {
    const page = await mountModeler();
    const entry = page.host.querySelector<HTMLElement>(
      '.djs-palette [data-action="create.person"]',
    )!;
    entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    const created = workspaceOf(page.modeler).elements.find(({ name }) => name === "Person");
    expect(created?.id).toMatch(/^person_[0-9a-z]{4}$/);
    expect(labelEditing(page).openEdit()).toMatchObject({ field: "name", text: "Person" });
    press(editor(page), "Enter");
    const settled = workspaceOf(page.modeler).elements.find(({ name }) => name === "Person");
    expect(settled?.id).toMatch(/^person\d*$/);
    expect(page.modeler.elements.selection()).toEqual([settled?.id]);
  });

  it("keeps its identifier fresh when the editor is cancelled", async () => {
    const page = await mountModeler();
    const entry = page.host.querySelector<HTMLElement>(
      '.djs-palette [data-action="create.person"]',
    )!;
    entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    press(editor(page), "Escape");
    const created = workspaceOf(page.modeler).elements.find(({ name }) => name === "Person");
    expect(created?.id).toMatch(/^person_[0-9a-z]{4}$/);
  });
});

describe("a value the DSL refuses", () => {
  it("goes to the app with its reason when a click away drops it", async () => {
    const page = await mountModeler();
    const heard: string[] = [];
    service<EventBus>(page.modeler, "eventBus").on(EDIT_REFUSED_EVENT, (event: unknown) => {
      heard.push((event as EditRefusedEvent).message);
    });
    labelEditing(page).activate(shapeOf(page.modeler, "payments") as never);
    editor(page).value = "Bookshop";
    press(editor(page), "Enter");
    expect(heard).toEqual([]);
    pressCanvas(page);
    expect(labelEditing(page).isActive()).toBe(false);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toContain("Bookshop");
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });
});

describe("a field that cannot be edited here says why", () => {
  it("a name set with a constant, at its band, until the next key", async () => {
    const page = await mountModeler(READ_ONLY);
    doubleClick(page, "pay", bandCentre(page, "pay", "name"));
    expect(labelEditing(page).isActive()).toBe(false);
    expect(hint(page)?.textContent).toContain("${PAY}");
    expect(hint(page)?.textContent).toContain("Edit the constant in the text.");
    expect(hint(page)?.getAttribute("role")).toBe("status");
    pressOnCanvas(page.modeler, { key: "ArrowDown" });
    expect(hint(page)).toBeNull();
  });

  it("an implied relationship, with the relationship it comes from", async () => {
    const page = await mountModeler(READ_ONLY);
    const implied = shapeOf(page.modeler, "rel:implied:user->shop") as C4Connection;
    const [from, to] = [implied.waypoints[0]!, implied.waypoints.at(-1)!];
    doubleClick(page, "rel:implied:user->shop", {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
    });
    expect(labelEditing(page).isActive()).toBe(false);
    expect(hint(page)?.textContent).toBe("Comes from User → Web. Edit it there.");
    pressCanvas(page, { x: 400, y: 600 });
    expect(hint(page)).toBeNull();
  });

  it("beside the open pad, whose entries it leaves free", async () => {
    const page = await mountModeler(READ_ONLY);
    for (const canvasId of ["rel:implied:user->shop", "pay"]) {
      // The double-click's second press selects and opens the pad, which diagram-js positions in
      // a scheduled task.
      select(page.modeler, canvasId);
      const shape = shapeOf(page.modeler, canvasId);
      const at = isRelationshipConnection(shape)
        ? bandCentre(page, canvasId, "description")
        : bandCentre(page, canvasId, "name");
      doubleClick(page, canvasId, at);
      await wait(20);
      const pad = page.host.querySelector<HTMLElement>(".djs-context-pad.open");
      expect(pad, canvasId).not.toBeNull();
      const note = hint(page)!.getBoundingClientRect();
      const entries = pad!.getBoundingClientRect();
      const overlaps =
        note.left < entries.right &&
        entries.left < note.right &&
        note.top < entries.bottom &&
        entries.top < note.bottom;
      expect(overlaps, canvasId).toBe(false);
    }
  });

  it("an editable band still opens, the description of the same element too", async () => {
    const page = await mountModeler(READ_ONLY);
    doubleClick(page, "pay", bandCentre(page, "pay", "description"));
    expect(labelEditing(page).openEdit()).toMatchObject({ field: "description" });
    expect(hint(page)).toBeNull();
  });
});

describe("the label editor's text", () => {
  it("names the empty field it edits", async () => {
    const page = await mountModeler(READ_ONLY);
    labelEditing(page).activate(shapeOf(page.modeler, "rel:shop->pay") as never, "technology");
    expect(editor(page).value).toBe("");
    expect(editor(page).placeholder).toBe("Technology");
    const placeholder = getComputedStyle(editor(page), "::placeholder").color;
    expect(placeholder).not.toBe(getComputedStyle(editor(page)).color);
  });

  it("notes while the canvas would cut the typed text short, and drops the note when it fits", async () => {
    const page = await mountModeler();
    labelEditing(page).activate(shapeOf(page.modeler, "payments") as never, "description");
    expect(hint(page)).toBeNull();
    typeInto(editor(page), LONG_DESCRIPTION);
    expect(hint(page)?.textContent).toBe("Shortened on the canvas. The file keeps the full text.");
    expect(editor(page).getAttribute("aria-describedby")).toBe(hint(page)?.id);
    const field = editor(page).getBoundingClientRect();
    expect(hint(page)!.getBoundingClientRect().top).toBeGreaterThan(field.bottom);
    typeInto(editor(page), "Takes payments.");
    expect(hint(page)).toBeNull();
    expect(editor(page).hasAttribute("aria-describedby")).toBe(false);
  });
});
