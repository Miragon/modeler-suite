/*
 * The context pad by keyboard (guide §5.5, §5.14, Wardley Maps' pad): a toolbar with one tab stop
 * right after the canvas, its entries buttons named by their titles; the arrows, Home and End move
 * through every entry, Escape goes back to the canvas with the selection kept, Enter and Space run
 * the entry (the click append with its name editor chain, Add relationship… for Connect, a delete
 * with its confirmation). A pointer press still hands the focus to the canvas (wave 1).
 */
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Shape } from "diagram-js/lib/model/Types";
import type { ElementId } from "@miragon/c4-schema-model";
import type LabelEditing from "../../src/label-editing/LabelEditing.js";
import { ADD_RELATIONSHIP_TITLE } from "../../src/navigation/AddRelationshipDialog.js";
import type { C4ModelingMethods } from "../../src/services.js";
import {
  canvasSvg,
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

const LANDSCAPE_ENTRIES = [
  "append.person",
  "append.softwareSystem",
  "connect",
  "edit-name",
  "edit-description",
  "remove-from-view",
  "delete-from-model",
];

/** Two systems so close above each other that the column of their line's pad covers both. */
const CLOSE_ABOVE = `workspace "Row" {
    model {
        shop = softwareSystem "Shop"
        stock = softwareSystem "Stock"
        shop -> stock
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.shop" "400,0"
                "c4modeler.element.stock" "400,240"
            }
        }
    }
}
`;

function pad(page: Mounted): HTMLElement {
  const open = page.host.querySelector<HTMLElement>(".djs-context-pad.open");
  if (!open) throw new Error("no context pad is open");
  return open;
}

function entries(page: Mounted): HTMLElement[] {
  return [...pad(page).querySelectorAll<HTMLElement>(".entry[data-action]")];
}

function padEntry(page: Mounted, action: string): HTMLElement {
  const entry = pad(page).querySelector<HTMLElement>(`.entry[data-action="${action}"]`);
  if (!entry) throw new Error(`no context pad entry ${action}`);
  return entry;
}

function focused(): string | undefined {
  return (document.activeElement as HTMLElement | null)?.dataset?.action;
}

function tabStops(page: Mounted): string[] {
  return entries(page)
    .filter((entry) => entry.tabIndex === 0)
    .map((entry) => entry.dataset.action ?? "");
}

/** Focuses an entry as the keyboard does, with its ring. */
function focusEntry(page: Mounted, action: string): HTMLElement {
  const entry = padEntry(page, action);
  entry.focus({ focusVisible: true });
  return entry;
}

function labelEditing(page: Mounted): LabelEditing {
  return service<LabelEditing>(page.modeler, "labelEditing");
}

function editor(page: Mounted): HTMLTextAreaElement {
  const field = page.host.querySelector<HTMLTextAreaElement>(".diagram-label-editor");
  if (!field) throw new Error("no label editor is open");
  return field;
}

function selectedIds(page: Mounted): string[] {
  return service<Selection>(page.modeler, "selection")
    .get()
    .map((element) => element.id);
}

function createdSince(page: Mounted, before: readonly ElementId[]) {
  return workspaceOf(page.modeler).elements.filter((element) => !before.includes(element.id));
}

describe("the context pad is a toolbar the keyboard reaches (guide §5.5, §5.14)", () => {
  it("names the pad by what it acts on and each entry by its title, with one tab stop", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    expect(pad(page).getAttribute("role")).toBe("toolbar");
    expect(pad(page).getAttribute("aria-label")).toBe("Element actions");
    expect(pad(page).getAttribute("aria-orientation")).toBe("vertical");
    expect(entries(page).map((entry) => entry.dataset.action)).toEqual(LANDSCAPE_ENTRIES);
    for (const entry of entries(page)) {
      expect(entry.getAttribute("role")).toBe("button");
      expect(entry.title).not.toBe("");
      expect(entry.getAttribute("aria-label")).toBe(entry.title);
    }
    expect(padEntry(page, "delete-from-model").getAttribute("aria-label")).toBe(
      "Delete from model…",
    );
    expect(tabStops(page)).toEqual(["append.person"]);

    select(page.modeler, "rel:bookshop->payments");
    expect(pad(page).getAttribute("aria-label")).toBe("Relationship actions");
    expect(tabStops(page)).toEqual(["edit-description"]);

    select(page.modeler, "customer", "payments");
    expect(pad(page).getAttribute("aria-label")).toBe("Selection actions");
    expect(tabStops(page)).toEqual(["remove-from-view"]);
  });

  it("says when a relationship's pad runs as a row", async () => {
    const page = await mountModeler(CLOSE_ABOVE);
    select(page.modeler, "rel:shop->stock");
    await wait(20);
    expect(pad(page).classList.contains("c4-pad-row")).toBe(true);
    expect(pad(page).getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("is the first stop after the canvas, before the breadcrumb, and Shift+Tab goes back", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    select(page.modeler, "web");
    canvasSvg(page.modeler).focus();

    await userEvent.tab();
    expect(focused()).toBe("append.person");
    await userEvent.tab();
    expect(document.activeElement?.closest(".c4-breadcrumbs")).not.toBeNull();
    await userEvent.tab({ shift: true });
    expect(focused()).toBe("append.person");
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(canvasSvg(page.modeler));
  });

  it("moves the focus with the arrows across the separators, wrapping, and leaves the element", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    const customer = shapeOf(page.modeler, "customer") as Shape;
    const place = { x: customer.x, y: customer.y };
    focusEntry(page, "append.person");

    const steps: [string, string][] = [
      ["ArrowDown", "append.softwareSystem"],
      ["ArrowDown", "connect"],
      ["ArrowRight", "edit-name"],
      ["ArrowUp", "connect"],
      ["ArrowLeft", "append.softwareSystem"],
      ["ArrowUp", "append.person"],
      ["ArrowUp", "delete-from-model"],
      ["ArrowDown", "append.person"],
    ];
    for (const [key, expected] of steps) {
      expect(press(document.activeElement!, key), `${key} is the pad's`).toBe(false);
      expect(focused(), `after ${key}`).toBe(expected);
      expect(tabStops(page)).toEqual([expected]);
    }
    expect({ x: customer.x, y: customer.y }).toEqual(place);
    expect(selectedIds(page)).toEqual(["customer"]);
  });

  it("jumps to the first and the last entry with Home and End", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    focusEntry(page, "connect");
    expect(press(document.activeElement!, "End")).toBe(false);
    expect(focused()).toBe("delete-from-model");
    expect(press(document.activeElement!, "Home")).toBe(false);
    expect(focused()).toBe("append.person");
    expect(tabStops(page)).toEqual(["append.person"]);
  });

  it("goes back to the canvas on Escape and keeps the selection", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    focusEntry(page, "edit-name");
    expect(press(document.activeElement!, "Escape")).toBe(false);
    expect(document.activeElement).toBe(canvasSvg(page.modeler));
    expect(selectedIds(page)).toEqual(["customer"]);
    expect(pad(page)).toBeDefined();
  });

  it("leaves a modified key and a held key's repeats alone", async () => {
    const page = await mountModeler();
    const ids = workspaceOf(page.modeler).elements.map((element) => element.id);
    select(page.modeler, "customer");
    const entry = focusEntry(page, "append.person");
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(press(entry, "ArrowDown", modifier)).toBe(true);
      expect(press(entry, "Enter", modifier)).toBe(true);
    }
    expect(press(entry, "Enter", { repeat: true })).toBe(false);
    expect(focused()).toBe("append.person");
    expect(createdSince(page, ids)).toEqual([]);
  });

  it("leaves its keys to the page once the host hides the diagram", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    const entry = focusEntry(page, "append.person");
    page.host.inert = true;
    expect(press(entry, "ArrowDown")).toBe(true);
    expect(press(entry, "Escape")).toBe(true);
    expect(document.activeElement).toBe(entry);
    page.host.inert = false;
  });
});

describe("Enter and Space run the entry", () => {
  it("an append adds the connected element beside the source and opens its name, then the relationship's description", async () => {
    const page = await mountModeler();
    const before = page.modeler.exportText();
    const ids = workspaceOf(page.modeler).elements.map((element) => element.id);
    select(page.modeler, "payments");
    focusEntry(page, "append.person");
    expect(press(document.activeElement!, "Enter")).toBe(false);

    const [created] = createdSince(page, ids);
    expect(created).toMatchObject({ kind: "person", name: "Person" });
    expect(selectedIds(page)).toEqual([created!.id]);
    expect(labelEditing(page).openEdit()).toEqual({
      elementId: created!.id,
      field: "name",
      text: "Person",
    });
    expect(document.activeElement).toBe(editor(page));

    editor(page).value = "Clerk";
    press(editor(page), "Enter");
    await wait();
    expect(labelEditing(page).openEdit()).toEqual({
      elementId: "payments->clerk",
      field: "description",
      text: "",
    });
    press(editor(page), "Escape");

    const stack = service<CommandStack>(page.modeler, "commandStack");
    stack.undo();
    stack.undo();
    expect(page.modeler.exportText()).toBe(before);
  });

  it("Space on an edit opens that field's editor, of an element and of a relationship", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    focusEntry(page, "edit-name");
    expect(press(document.activeElement!, " ")).toBe(false);
    expect(labelEditing(page).openEdit()).toMatchObject({ elementId: "customer", field: "name" });
    press(editor(page), "Escape");

    select(page.modeler, "customer");
    focusEntry(page, "edit-description");
    press(document.activeElement!, "Enter");
    expect(labelEditing(page).openEdit()).toMatchObject({ field: "description" });
    press(editor(page), "Escape");

    select(page.modeler, "rel:bookshop->payments");
    focusEntry(page, "edit-description");
    press(document.activeElement!, " ");
    expect(labelEditing(page).openEdit()).toMatchObject({ field: "description" });
    expect(document.activeElement).toBe(editor(page));
    press(editor(page), "Escape");

    page.modeler.views.open("Containers", { cause: "user" });
    select(page.modeler, "web");
    focusEntry(page, "edit-technology");
    press(document.activeElement!, "Enter");
    expect(labelEditing(page).openEdit()).toMatchObject({ elementId: "web", field: "technology" });
  });

  it("Connect opens Add relationship… from the element, as no pointer can drag a line", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    focusEntry(page, "connect");
    expect(press(document.activeElement!, "Enter")).toBe(false);
    expect(service<Dragging>(page.modeler, "dragging").context()).toBeFalsy();
    const dialog = page.dialogs.current();
    expect(dialog?.options.title).toBe(ADD_RELATIONSHIP_TITLE);
    expect(dialog?.element.textContent).toContain("Payment Provider");
    expect(dialog?.element.contains(document.activeElement)).toBe(true);
  });

  it("Remove from view hands the focus to the canvas, where Cmd/Ctrl+Z undoes it", async () => {
    const page = await mountModeler();
    const before = page.modeler.exportText();
    select(page.modeler, "payments");
    focusEntry(page, "remove-from-view");
    press(document.activeElement!, "Enter");
    expect(page.modeler.elements.list().map(({ id }) => id)).not.toContain("payments");
    expect(document.activeElement).toBe(canvasSvg(page.modeler));
    press(document.activeElement!, "z", { ctrlKey: true });
    expect(page.modeler.exportText()).toBe(before);
  });

  it("Delete from model deletes at once, or asks first and gives the focus back on Cancel", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    focusEntry(page, "delete-from-model");
    press(document.activeElement!, "Enter");
    expect(elementNamed(page.modeler, "payments")).toBeUndefined();
    expect(document.activeElement).toBe(canvasSvg(page.modeler));

    select(page.modeler, "bookshop");
    const trash = focusEntry(page, "delete-from-model");
    press(trash, " ");
    const dialog = page.dialogs.current();
    expect(dialog?.element.contains(document.activeElement)).toBe(true);
    dialog!.dialog.close();
    expect(elementNamed(page.modeler, "bookshop")).toBeDefined();
    expect(document.activeElement).toBe(trash);
  });
});

describe("the focus around a rebuilt pad", () => {
  it("stays on the same entry when the pad is built anew under it, and goes to the canvas with the element", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    focusEntry(page, "edit-description");
    press(document.activeElement!, "ArrowDown");
    expect(focused()).toBe("remove-from-view");
    const modeling = service<C4ModelingMethods>(page.modeler, "modeling");
    const before = padEntry(page, "remove-from-view");

    modeling.editElement("customer", { name: "Shopper" });
    expect(padEntry(page, "remove-from-view")).not.toBe(before);
    expect(focused()).toBe("remove-from-view");
    expect(tabStops(page)).toEqual(["remove-from-view"]);

    modeling.removeFromView(["customer"], []);
    await wait();
    expect(document.activeElement).toBe(canvasSvg(page.modeler));
  });
});

describe("a pointer on a focusable entry (wave 1)", () => {
  /** A press focuses the entry, as the browser does for a focusable one, then the click. */
  function pressAndClick(page: Mounted, action: string): void {
    const entry = padEntry(page, action);
    entry.focus({ focusVisible: false });
    entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  }

  it("still hands the focus to the canvas after Connect and Remove from view", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    pressAndClick(page, "connect");
    expect(service<Dragging>(page.modeler, "dragging").context()?.prefix).toBe("connect");
    expect(document.activeElement).toBe(canvasSvg(page.modeler));
    service<Dragging>(page.modeler, "dragging").cancel(true);

    select(page.modeler, "payments");
    pressAndClick(page, "remove-from-view");
    expect(document.activeElement).toBe(canvasSvg(page.modeler));
  });

  it("leaves the focus in the editor an edit opens", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    pressAndClick(page, "edit-name");
    expect(document.activeElement).toBe(editor(page));
  });

  it("gives the focus to the canvas, not to the trash, when the confirmation is cancelled", async () => {
    const page = await mountModeler();
    const before = page.modeler.exportText();
    select(page.modeler, "bookshop");
    pressAndClick(page, "delete-from-model");
    const dialog = page.dialogs.current();
    expect(dialog?.element.contains(document.activeElement)).toBe(true);
    dialog!.dialog.close();
    expect(elementNamed(page.modeler, "bookshop")).toBeDefined();
    expect(document.activeElement).toBe(canvasSvg(page.modeler));
    press(document.activeElement!, "Delete");
    expect(page.modeler.exportText()).not.toBe(before);
  });
});

describe("the focus ring (guide §5.14, §8)", () => {
  function ring(entry: HTMLElement) {
    const style = getComputedStyle(entry);
    return {
      style: style.outlineStyle,
      width: style.outlineWidth,
      offset: style.outlineOffset,
      color: style.outlineColor,
    };
  }

  function fokus(page: Mounted): string {
    const probe = document.createElement("span");
    probe.style.color = "var(--cd-ui-fokus)";
    page.modeler.diagram.container.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }

  it("is 2px in --cd-ui-fokus 2px outside the focused entry, and none after a pointer press", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    const entry = focusEntry(page, "connect");
    expect(entry.matches(":focus-visible")).toBe(true);
    expect(ring(entry)).toEqual({
      style: "solid",
      width: "2px",
      offset: "2px",
      color: fokus(page),
    });

    const preview = focusEntry(page, "append.person");
    expect(ring(preview)).toMatchObject({ style: "solid", width: "2px" });

    entry.focus({ focusVisible: false });
    expect(entry.matches(":focus-visible")).toBe(false);
    expect(ring(entry).style).toBe("none");
  });

  it("is 3px and still outside in high contrast, as the palette's in its row", async () => {
    const page = await mountModeler();
    page.modeler.diagram.container.setAttribute("data-cd-kontrast", "hoch");
    select(page.modeler, "customer");
    const entry = focusEntry(page, "connect");
    expect(ring(entry)).toMatchObject({ style: "solid", width: "3px", offset: "2px" });
  });
});
