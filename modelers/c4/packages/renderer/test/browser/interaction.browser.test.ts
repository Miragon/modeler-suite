import { afterEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import { C4_COLOUR_STYLES, type Point } from "@miragon/c4-schema-model";
import type SceneLookup from "../../src/draw/SceneLookup.js";
import type LabelEditing from "../../src/label-editing/LabelEditing.js";
import type ReadOnly from "../../src/read-only/ReadOnly.js";
import { isElementShape, isRelationshipConnection } from "../../src/scene/types.js";
import { EDIT_REFUSED_EVENT } from "../../src/services.js";
import { elementTextLayout, relationshipLabelLayout } from "../../src/text/elementTextLayout.js";
import { BLANK, BOOKSHOP } from "./support/interaction/fixtures.js";
import {
  destroyMounted,
  elementNamed,
  mountModeler,
  press,
  select,
  service,
  shapeOf,
  wait,
  workspaceOf,
  type Mounted,
} from "./support/interaction/mount.js";

afterEach(() => destroyMounted());

function canvasOf(page: Mounted): Canvas {
  return service<Canvas>(page.modeler, "canvas");
}

function labelEditing(page: Mounted): LabelEditing {
  return service<LabelEditing>(page.modeler, "labelEditing");
}

function editor(page: Mounted): HTMLTextAreaElement {
  const field = page.host.querySelector<HTMLTextAreaElement>(".diagram-label-editor");
  if (!field) throw new Error("no label editor is open");
  return field;
}

function clientOf(page: Mounted, point: Point): { clientX: number; clientY: number } {
  const canvas = canvasOf(page);
  const rect = canvas.getContainer().getBoundingClientRect();
  const viewbox = canvas.viewbox();
  return {
    clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
    clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
  };
}

function paletteActions(page: Mounted): string[] {
  return [...page.host.querySelectorAll<HTMLElement>(".djs-palette .entry[data-action]")].map(
    (entry) => entry.dataset.action ?? "",
  );
}

function paletteEntry(page: Mounted, action: string): HTMLElement {
  const entry = page.host.querySelector<HTMLElement>(`.djs-palette [data-action="${action}"]`);
  if (!entry) throw new Error(`no palette entry ${action}`);
  return entry;
}

/** The shell's synthetic click for Enter or Space on an entry: detail 0. */
function keyboardClick(entry: HTMLElement): void {
  entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
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

/** A press on free canvas, which ends an open label edit as the user's click there does. */
function pressCanvas(page: Mounted): void {
  const svg = canvasOf(page).getContainer().querySelector(":scope > svg")!;
  const at = clientOf(page, { x: 600, y: 560 });
  svg.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, ...at }));
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, ...at }));
}

/** A double-click at a point of the canvas, as diagram-js reports it. */
function doubleClick(page: Mounted, element: unknown, at: Point): void {
  service<EventBus>(page.modeler, "eventBus").fire("element.dblclick", {
    element,
    originalEvent: new MouseEvent("dblclick", { bubbles: true, ...clientOf(page, at) }),
  });
}

function bandCentre(page: Mounted, canvasId: string, band: string): Point {
  const shape = shapeOf(page.modeler, canvasId);
  const lookup = service<SceneLookup>(page.modeler, "c4SceneLookup");
  const layout = isRelationshipConnection(shape)
    ? relationshipLabelLayout(lookup.relationship(shape)!)
    : elementTextLayout(lookup.element(shape as never)!);
  const found = layout.bands.find((candidate) => candidate.band === band);
  if (!found) throw new Error(`${canvasId} has no ${band} band`);
  return { x: found.box.x + found.box.width / 2, y: found.box.y + found.box.height / 2 };
}

describe("the palette (SPEC 5.1)", () => {
  it("offers the tools and what the view's type can create", async () => {
    const page = await mountModeler();
    const tools = ["lasso-tool", "hand-tool", "global-connect-tool"];
    expect(paletteActions(page)).toEqual([...tools, "create.person", "create.softwareSystem"]);
    page.modeler.views.open("Containers", { cause: "user" });
    expect(paletteActions(page)).toEqual([
      ...tools,
      "create.person",
      "create.softwareSystem",
      "create.container",
      "create.database",
    ]);
    page.modeler.views.open("Components-api", { cause: "user" });
    expect(paletteActions(page).at(-1)).toBe("create.component");
    const preview = paletteEntry(page, "create.database").querySelector("svg");
    expect(preview?.getAttribute("width")).toBe("24");
  });

  it("names the connect tool with its key, as the chrome's tooltip shows it", async () => {
    const page = await mountModeler();
    const entries = (
      service<{ getEntries(): Record<string, { title?: string; shortcut?: string }> }>(
        page.modeler,
        "palette",
      ) as { getEntries(): Record<string, { title?: string; shortcut?: string }> }
    ).getEntries();
    expect(entries["global-connect-tool"]).toMatchObject({ title: "Connect", shortcut: "C" });
    expect(entries["create.softwareSystem"]).toMatchObject({ title: "Software system" });
  });

  it("Enter on a creating entry places a named-by-default element, selected, its name editor open", async () => {
    const page = await mountModeler(BLANK);
    keyboardClick(paletteEntry(page, "create.softwareSystem"));
    const created = workspaceOf(page.modeler).elements;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ kind: "softwareSystem", name: "Software System" });
    expect(page.modeler.elements.selection()).toEqual([created[0]?.id]);
    expect(labelEditing(page).openEdit()).toMatchObject({ field: "name", text: "Software System" });
    expect(page.modeler.views.active().key).toBe("SystemLandscape");

    editor(page).value = "Payments";
    press(editor(page), "Enter");
    expect(elementNamed(page.modeler, "payments")?.name).toBe("Payments");
    expect(page.modeler.elements.selection()).toEqual(["payments"]);
  });

  it("draws the first element of a new diagram in the C4 colours", async () => {
    const page = await mountModeler(BLANK);
    keyboardClick(paletteEntry(page, "create.softwareSystem"));
    press(editor(page), "Escape");
    const [created] = workspaceOf(page.modeler).elements;
    const colours = C4_COLOUR_STYLES.find(({ tag }) => tag === "Software System")!;
    const body = canvasOf(page)
      .getContainer()
      .querySelector(`[data-element-id="${created?.id}"] .djs-visual .c4-body`);
    expect(body?.getAttribute("fill")?.toLowerCase()).toBe(colours.background.toLowerCase());
    expect(body?.getAttribute("stroke")?.toLowerCase()).toBe(colours.stroke.toLowerCase());
  });

  it("a database is a container of the view's system with the tag Database", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    keyboardClick(paletteEntry(page, "create.database"));
    const created = workspaceOf(page.modeler).elements.find(({ name }) => name === "Database 2");
    expect(created).toMatchObject({ kind: "container", parentId: "bookshop" });
    expect(created?.ownTags).toEqual(["Database"]);
    expect(page.modeler.elements.list().map(({ id }) => id)).toContain(created?.id);
  });

  it("a pointer create opens the name editor once its drop is done", async () => {
    const page = await mountModeler();
    const idsBefore = new Set(workspaceOf(page.modeler).elements.map(({ id }) => id));
    const entry = paletteEntry(page, "create.person");
    entry.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    const svg = canvasOf(page).getContainer().querySelector(":scope > svg")!;
    const spot = { x: 600, y: 520 };
    svg.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, ...clientOf(page, spot) }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, ...clientOf(page, spot) }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, ...clientOf(page, spot) }));
    const created = workspaceOf(page.modeler).elements.find(({ id }) => !idsBefore.has(id));
    expect(created).toMatchObject({ kind: "person", name: "Person" });
    expect(labelEditing(page).openEdit()).toBeUndefined();
    await wait();
    expect(labelEditing(page).openEdit()).toMatchObject({ elementId: created?.id, field: "name" });
  });

  it("the connect tool arms on its entry and Enter on it puts it down", async () => {
    const page = await mountModeler();
    const entry = paletteEntry(page, "global-connect-tool");
    entry.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(service<Dragging>(page.modeler, "dragging").context()?.prefix).toBe("global-connect");
    keyboardClick(entry);
    expect(service<Dragging>(page.modeler, "dragging").context()).toBeFalsy();
  });
});

describe("the context pad (SPEC 5.3)", () => {
  it("offers per selection what it can do, and no entry that switches the view", async () => {
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
    select(page.modeler, "rel:bookshop->payments");
    expect(padActions(page)).toEqual([
      "edit-description",
      "edit-technology",
      "remove-from-view",
      "delete-from-model",
    ]);
    select(page.modeler, "rel:implied:customer->bookshop");
    expect(padActions(page)).toEqual(["remove-from-view"]);

    page.modeler.views.open("Containers", { cause: "user" });
    select(page.modeler, "api");
    expect(padActions(page)).toContain("edit-technology");
    select(page.modeler, "boundary:bookshop");
    expect(padActions(page)).toEqual([]);
  });

  it("has nothing to offer under the lock, also for a pad open when it arrives", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    expect(padActions(page)).not.toEqual([]);
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    expect(padActions(page)).toEqual([]);
  });

  it("opens the description editor, and removes from the view", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    padEntry(page, "edit-description").click();
    expect(labelEditing(page).openEdit()).toMatchObject({
      elementId: "customer",
      field: "description",
      text: "Buys books.",
    });
    press(editor(page), "Escape");
    expect(page.modeler.exportText()).toBe(BOOKSHOP);

    select(page.modeler, "customer");
    padEntry(page, "remove-from-view").click();
    expect(page.modeler.elements.list().map(({ id }) => id)).not.toContain("customer");
    expect(elementNamed(page.modeler, "customer")).toBeDefined();
  });

  it("starts a connection from the element; Escape ends it", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    padEntry(page, "connect").click();
    expect(service<Dragging>(page.modeler, "dragging").context()?.prefix).toBe("connect");
    service<Dragging>(page.modeler, "dragging").cancel(true);
    expect(service<ElementRegistry>(page.modeler, "elementRegistry").get("payments")).toBeDefined();
  });
});

describe("the label editor (SPEC 5.5)", () => {
  it("opens the band under the double-click, the name for a band it can't edit", async () => {
    const page = await mountModeler();
    const customer = shapeOf(page.modeler, "customer");
    doubleClick(page, customer, bandCentre(page, "customer", "description"));
    expect(labelEditing(page).openEdit()?.field).toBe("description");
    labelEditing(page).cancel();
    doubleClick(page, customer, bandCentre(page, "customer", "type"));
    expect(labelEditing(page).openEdit()?.field).toBe("name");
    labelEditing(page).cancel();

    page.modeler.views.open("Containers", { cause: "user" });
    doubleClick(page, shapeOf(page.modeler, "api"), bandCentre(page, "api", "type"));
    expect(labelEditing(page).openEdit()).toMatchObject({ field: "technology", text: "Java" });
    labelEditing(page).cancel();
    doubleClick(
      page,
      shapeOf(page.modeler, "rel:web->api"),
      bandCentre(page, "rel:web->api", "technology"),
    );
    expect(labelEditing(page).openEdit()).toMatchObject({
      field: "technology",
      text: "JSON/HTTPS",
    });
  });

  it("lies over the band it edits, in the band's font size at the zoom", async () => {
    const page = await mountModeler();
    canvasOf(page).zoom(1.5);
    labelEditing(page).activate(shapeOf(page.modeler, "payments") as never);
    expect(canvasOf(page).getContainer().scrollLeft, "the field scrolls nothing into view").toBe(0);
    const centre = clientOf(page, bandCentre(page, "payments", "name"));
    const box = editor(page).getBoundingClientRect();
    expect(Math.abs(box.left + box.width / 2 - centre.clientX)).toBeLessThan(1.5);
    expect(box.top).toBeLessThan(centre.clientY);
    expect(box.bottom).toBeGreaterThan(centre.clientY);
    expect(getComputedStyle(editor(page)).fontSize).toBe(`${15 * 1.5}px`);
  });

  it("Tab commits and opens the next field: name, technology, description", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    labelEditing(page).activate(shapeOf(page.modeler, "web") as never);
    editor(page).value = "Web Shop";
    press(editor(page), "Tab");
    expect(labelEditing(page).openEdit()).toMatchObject({ field: "technology", text: "React" });
    editor(page).value = "Vue";
    press(editor(page), "Tab");
    expect(labelEditing(page).openEdit()?.field).toBe("description");
    press(editor(page), "Tab", { shiftKey: true });
    expect(labelEditing(page).openEdit()?.field).toBe("technology");
    expect(elementNamed(page.modeler, "web")).toMatchObject({
      name: "Web Shop",
      technology: "Vue",
    });
  });

  it("breaks a description's line on Shift+Enter and commits it on Enter", async () => {
    const page = await mountModeler();
    labelEditing(page).activate(shapeOf(page.modeler, "payments") as never, "description");
    expect(press(editor(page), "Enter", { shiftKey: true })).toBe(true);
    editor(page).value = "Takes the payments.\nAnd refunds them.";
    expect(press(editor(page), "Enter")).toBe(false);
    expect(elementNamed(page.modeler, "payments")?.description).toBe(
      "Takes the payments.\nAnd refunds them.",
    );
    const svg = canvasOf(page).getContainer().querySelector(":scope > svg");
    expect(document.activeElement).toBe(svg);
  });

  it("cancels on Escape and hands the focus to the canvas", async () => {
    const page = await mountModeler();
    labelEditing(page).activate(shapeOf(page.modeler, "payments") as never);
    editor(page).value = "Not this";
    press(editor(page), "Escape");
    expect(labelEditing(page).isActive()).toBe(false);
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
    expect(document.activeElement).toBe(
      canvasOf(page).getContainer().querySelector(":scope > svg"),
    );
  });

  it("shows a value the DSL can't take under the field, commits nothing and tells the app nothing", async () => {
    const page = await mountModeler();
    const atTheApp: string[] = [];
    service<EventBus>(page.modeler, "eventBus").on(EDIT_REFUSED_EVENT, () =>
      atTheApp.push("toast"),
    );
    labelEditing(page).activate(shapeOf(page.modeler, "payments") as never);
    editor(page).value = "Bookshop";
    press(editor(page), "Enter");
    expect(labelEditing(page).isActive()).toBe(true);
    expect(editor(page).getAttribute("aria-invalid")).toBe("true");
    const error = page.host.querySelector(".c4-label-error");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toContain("Bookshop");
    expect(atTheApp).toEqual([]);
    editor(page).value = "Payments Inc";
    editor(page).dispatchEvent(new Event("input"));
    expect(page.host.querySelector(".c4-label-error")).toBeNull();
    pressCanvas(page);
    expect(elementNamed(page.modeler, "payments")?.name).toBe("Payments Inc");
  });

  it("drops a refused value when the user goes on to the canvas", async () => {
    const page = await mountModeler();
    labelEditing(page).activate(shapeOf(page.modeler, "payments") as never);
    editor(page).value = "C:\\new";
    pressCanvas(page);
    expect(labelEditing(page).isActive()).toBe(false);
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("opens no editor on an implied relationship or under the lock", async () => {
    const page = await mountModeler();
    expect(
      labelEditing(page).activate(shapeOf(page.modeler, "rel:implied:customer->bookshop") as never),
    ).toBe(false);
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    doubleClick(page, shapeOf(page.modeler, "payments"), bandCentre(page, "payments", "name"));
    expect(labelEditing(page).isActive()).toBe(false);
  });

  it("keeps an edit through an import of the same text, with its field and typed text", async () => {
    const page = await mountModeler();
    labelEditing(page).activate(shapeOf(page.modeler, "payments") as never, "description");
    editor(page).value = "typed, not committed";
    await page.modeler.importText(BOOKSHOP);
    await wait();
    expect(labelEditing(page).openEdit()).toEqual({
      elementId: "payments",
      field: "description",
      text: "typed, not committed",
    });
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("parks an edit whose element the imported view lacks until the host shows its view again", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    labelEditing(page).activate(shapeOf(page.modeler, "web") as never);
    editor(page).value = "typed in the container view";
    await page.modeler.importText(BOOKSHOP);
    await wait();
    expect(page.modeler.views.active().key).toBe("Landscape");
    expect(labelEditing(page).isActive()).toBe(false);
    await wait(20);
    page.modeler.setViewState({ view: "Containers", x: 0, y: 0, width: 1200, height: 900 });
    await wait();
    expect(labelEditing(page).openEdit()).toEqual({
      elementId: "web",
      field: "name",
      text: "typed in the container view",
    });
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("forgets a parked edit once the user acts on the canvas", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    labelEditing(page).activate(shapeOf(page.modeler, "web") as never);
    await page.modeler.importText(BOOKSHOP);
    await wait();
    pressCanvas(page);
    page.modeler.views.open("Containers", { cause: "user" });
    await wait();
    expect(labelEditing(page).isActive()).toBe(false);
  });
});

describe("the drill badge (SPEC 6.5, 7.2)", () => {
  it("a click on a system's badge opens its deeper view and selects nothing", async () => {
    const page = await mountModeler();
    const registry = service<ElementRegistry>(page.modeler, "elementRegistry");
    const hit = registry.getGraphics("bookshop").querySelector<SVGElement>(".djs-hit.c4-drill");
    expect(hit).not.toBeNull();
    const box = hit!.getBoundingClientRect();
    hit!.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
      }),
    );
    expect(page.modeler.views.active().key).toBe("Containers");
    expect(page.modeler.elements.selection()).toEqual([]);
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("the rest of a double-click on the badge goes nowhere in the view it opened", async () => {
    const page = await mountModeler();
    const registry = service<ElementRegistry>(page.modeler, "elementRegistry");
    const badgeOf = (id: string) =>
      registry.getGraphics(id).querySelector<SVGElement>(".djs-hit.c4-drill")!;
    badgeOf("bookshop").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(page.modeler.views.active().key).toBe("Containers");

    const web = badgeOf("web");
    web.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    web.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
    expect(page.modeler.views.active().key).toBe("Containers");
    expect(page.modeler.elements.selection()).toEqual([]);
    expect(labelEditing(page).isActive()).toBe(false);

    web.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(page.modeler.views.active()).toMatchObject({ type: "component", scopeId: "web" });
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("a double-click elsewhere on a system still opens its label editor", async () => {
    const page = await mountModeler();
    const graphics = service<ElementRegistry>(page.modeler, "elementRegistry").getGraphics(
      "bookshop",
    );
    graphics.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    graphics.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    graphics.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
    expect(labelEditing(page).openEdit()).toMatchObject({ elementId: "bookshop", field: "name" });
  });

  it("a click elsewhere on the system selects it", async () => {
    const page = await mountModeler();
    const element = shapeOf(page.modeler, "bookshop");
    expect(isElementShape(element)).toBe(true);
    service<EventBus>(page.modeler, "eventBus").fire("element.click", {
      element,
      originalEvent: new MouseEvent("click", { bubbles: true }),
    });
    expect(page.modeler.views.active().key).toBe("Landscape");
  });
});
