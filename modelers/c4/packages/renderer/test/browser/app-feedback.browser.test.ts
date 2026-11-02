import { afterEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { insetsClearOfBreadcrumb } from "../../src/menu/breadcrumbClearance.js";
import type C4Dialogs from "../../src/navigation/C4Dialogs.js";
import type ReadOnly from "../../src/read-only/ReadOnly.js";
import {
  DELETE_DONE_EVENT,
  LAYOUT_APPLIED_EVENT,
  type DeleteDoneEvent,
  type LayoutAppliedEvent,
} from "../../src/services.js";
import { BOOKSHOP } from "./support/interaction/fixtures.js";
import {
  destroyMounted,
  mountModeler,
  pressOnCanvas,
  service,
  workspaceOf,
  type Mounted,
} from "./support/interaction/mount.js";

/*
 * What the renderer tells the apps after "Lay out automatically" and Delete, so they fit the view
 * and say what Delete did; "Add relationship…" of the Model menu; the fit's clearance of the
 * breadcrumb. BOOKSHOP's landscape is pinned and excludes the e-mail system; its container view
 * shows the customer as well.
 */

afterEach(() => destroyMounted());

function events<T>(page: Mounted, name: string): T[] {
  const fired: T[] = [];
  service<EventBus>(page.modeler, "eventBus").on(name, (event: T) => {
    fired.push(event);
  });
  return fired;
}

function select(page: Mounted, ...ids: string[]): void {
  const registry = service<ElementRegistry>(page.modeler, "elementRegistry");
  service<Selection>(page.modeler, "selection").select(
    ids.map((id) => {
      const element = registry.get(id);
      if (!element) throw new Error(`no element ${id} on the canvas`);
      return element;
    }),
  );
}

function deleteDone(event: DeleteDoneEvent | undefined) {
  return event && { fromModel: event.fromModel, fromView: event.fromView };
}

describe("Lay out automatically tells the apps to fit (P6.2)", () => {
  it("fires c4.layout.applied after its command, when the layout changed", async () => {
    const page = await mountModeler();
    const order: string[] = [];
    const bus = service<EventBus>(page.modeler, "eventBus");
    bus.on("commandStack.changed", () => order.push("command"));
    const applied = events<LayoutAppliedEvent>(page, LAYOUT_APPLIED_EVENT);
    let boundsAtEvent: unknown;
    bus.on(LAYOUT_APPLIED_EVENT, () => {
      order.push("applied");
      boundsAtEvent = page.modeler.contentBounds();
    });

    page.modeler.c4.layOutAutomatically();

    expect(applied).toEqual([{ view: "Landscape" }]);
    expect(order).toEqual(["command", "applied"]);
    expect(boundsAtEvent, "the shapes show the new layout when it fires").toEqual(
      page.modeler.contentBounds(),
    );
  });

  it("stays silent when nothing changed: the view is laid out automatically already", async () => {
    const page = await mountModeler();
    page.modeler.c4.layOutAutomatically();
    const applied = events<LayoutAppliedEvent>(page, LAYOUT_APPLIED_EVENT);

    page.modeler.c4.layOutAutomatically();

    expect(applied).toEqual([]);
  });

  it("stays silent when it was refused", async () => {
    const page = await mountModeler();
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    const applied = events<LayoutAppliedEvent>(page, LAYOUT_APPLIED_EVENT);

    page.modeler.c4.layOutAutomatically();

    expect(applied).toEqual([]);
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });
});

describe("Delete tells the apps what it did (P6.3)", () => {
  it("names what went from the model and what only from the view", async () => {
    const page = await mountModeler();
    const done = events<DeleteDoneEvent>(page, DELETE_DONE_EVENT);
    select(page, "customer", "payments");

    pressOnCanvas(page.modeler, { key: "Delete" });

    expect(done).toHaveLength(1);
    expect(done[0]?.view).toBe("Landscape");
    expect(deleteDone(done[0])).toEqual({
      fromModel: { elements: ["Payment Provider"], relationships: [] },
      fromView: { elements: ["Customer"], relationships: [] },
    });
    const ids = workspaceOf(page.modeler).elements.map((element) => element.id);
    expect(ids).toContain("customer");
    expect(ids).not.toContain("payments");
  });

  it("names a relationship by its ends: an implied one only leaves the view", async () => {
    const page = await mountModeler();
    const done = events<DeleteDoneEvent>(page, DELETE_DONE_EVENT);
    select(page, "rel:bookshop->payments", "rel:implied:customer->bookshop");

    pressOnCanvas(page.modeler, { key: "Backspace" });

    expect(deleteDone(done[0])).toEqual({
      fromModel: { elements: [], relationships: ["Bookshop → Payment Provider"] },
      fromView: { elements: [], relationships: ["Customer → Bookshop"] },
    });
  });

  it("fires after the command, so an undo takes the delete back", async () => {
    const page = await mountModeler();
    const order: string[] = [];
    const bus = service<EventBus>(page.modeler, "eventBus");
    bus.on("commandStack.changed", () => order.push("command"));
    bus.on(DELETE_DONE_EVENT, () => order.push("done"));
    select(page, "payments");

    pressOnCanvas(page.modeler, { key: "Delete" });
    service<CommandStack>(page.modeler, "commandStack").undo();

    expect(order).toEqual(["command", "done", "command"]);
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("says nothing for a refused delete, a boundary, or Delete from model", async () => {
    const page = await mountModeler(BOOKSHOP, {});
    const done = events<DeleteDoneEvent>(page, DELETE_DONE_EVENT);
    page.modeler.views.open("Containers", { cause: "user" });
    select(page, "boundary:bookshop");
    pressOnCanvas(page.modeler, { key: "Delete" });
    page.modeler.c4.deleteFromModel(["database"], []);
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    select(page, "customer");
    pressOnCanvas(page.modeler, { key: "Delete" });

    expect(done).toEqual([]);
  });
});

describe('"Add relationship…" of the Model menu (wave 1 follow-up)', () => {
  function dialogOf(page: Mounted): HTMLDialogElement {
    const current = page.dialogs.current();
    if (!current) throw new Error("no dialog is open");
    return current.element;
  }

  function selectField(dialog: Element, name: string): HTMLSelectElement {
    const found = dialog.querySelector<HTMLSelectElement>(`select[data-field="${name}"]`);
    if (!found) throw new Error(`no select ${name}`);
    return found;
  }

  const labels = (select: HTMLSelectElement) =>
    [...select.options].map((option) => option.textContent);

  it("lets both ends be chosen; the destinations follow the source", async () => {
    const page = await mountModeler();
    service<C4Dialogs>(page.modeler, "c4Dialogs").showNewRelationship();
    const dialog = dialogOf(page);
    const source = selectField(dialog, "source");
    const destination = selectField(dialog, "destination");
    expect(document.activeElement).toBe(source);
    expect(labels(source)).toEqual(["Customer", "Bookshop", "Payment Provider"]);
    expect(source.value).toBe("customer");
    expect(labels(destination)).toEqual(["Bookshop", "Payment Provider"]);

    destination.value = "payments";
    source.value = "bookshop";
    source.dispatchEvent(new Event("change"));
    expect(labels(destination)).toEqual(["Customer", "Payment Provider"]);
    expect(destination.value, "the destination chosen before stays").toBe("payments");
    destination.value = "customer";
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();

    expect(page.dialogs.current()).toBeUndefined();
    expect(
      workspaceOf(page.modeler).relationships.some(
        (relationship) =>
          !relationship.implied &&
          relationship.sourceId === "bookshop" &&
          relationship.destinationId === "customer",
      ),
    ).toBe(true);
  });

  it("starts on the selected elements: the first is the source, the second the destination", async () => {
    const page = await mountModeler();
    select(page, "payments", "customer");
    service<C4Dialogs>(page.modeler, "c4Dialogs").showNewRelationship();
    const dialog = dialogOf(page);
    expect(selectField(dialog, "source").value).toBe("payments");
    expect(selectField(dialog, "destination").value).toBe("customer");
  });
});

describe("the keys the shortcuts dialog lists now act on the canvas (P6.4)", () => {
  it("moves the canvas with Cmd/Ctrl and an arrow, and holds the hand while Space is down", async () => {
    const page = await mountModeler();
    const canvas = service<Canvas>(page.modeler, "canvas");
    const before = canvas.viewbox().x;
    pressOnCanvas(page.modeler, { key: "ArrowRight", ctrlKey: true, metaKey: true });
    expect(canvas.viewbox().x).not.toBe(before);

    pressOnCanvas(page.modeler, { key: " ", code: "Space" });
    expect(service<{ isActive(): boolean }>(page.modeler, "handTool").isActive()).toBe(true);
  });
});

describe("the fit keeps clear of the breadcrumb (P6.5)", () => {
  const INSETS = { top: 88, right: 24, bottom: 64, left: 24 };

  it("leaves 8px below the breadcrumb while it shows, and the insets as they are without it", async () => {
    const page = await mountModeler();
    const container = page.modeler.diagram.container;
    expect(insetsClearOfBreadcrumb(container, INSETS)).toEqual(INSETS);

    page.modeler.views.open("Containers", { cause: "user" });
    const breadcrumb = container.querySelector<HTMLElement>("nav.c4-breadcrumbs");
    expect(breadcrumb?.hidden).toBe(false);
    const bottom =
      breadcrumb!.getBoundingClientRect().bottom - container.getBoundingClientRect().top;
    expect(insetsClearOfBreadcrumb(container, INSETS)).toEqual({
      ...INSETS,
      top: Math.max(INSETS.top, Math.ceil(bottom) + 8),
    });
    expect(insetsClearOfBreadcrumb(container, { ...INSETS, top: 0 }).top).toBe(
      Math.ceil(bottom) + 8,
    );

    breadcrumb!.setAttribute("data-covered", "");
    expect(insetsClearOfBreadcrumb(container, INSETS)).toEqual(INSETS);
  });
});
