import { afterEach, describe, expect, it } from "vitest";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type LabelEditing from "../../src/label-editing/LabelEditing.js";
import type ReadOnly from "../../src/read-only/ReadOnly.js";
import {
  destroyMounted,
  elementNamed,
  mountModeler,
  pressOnCanvas,
  select,
  service,
  shapeOf,
  type Mounted,
} from "./support/interaction/mount.js";
import { BOOKSHOP } from "./support/interaction/fixtures.js";

afterEach(() => destroyMounted());

function labelEditing(page: Mounted): LabelEditing {
  return service<LabelEditing>(page.modeler, "labelEditing");
}

function dragPrefix(page: Mounted): string | undefined {
  return service<Dragging>(page.modeler, "dragging").context()?.prefix;
}

/** Selects `payments`, focuses the canvas and moves it once, so the canvas is known to take keys. */
function focusCanvasThatTakesKeys(page: Mounted): string {
  select(page.modeler, "payments");
  const imported = page.modeler.exportText();
  expect(pressOnCanvas(page.modeler, { key: "ArrowRight" })).toBe(false);
  const before = page.modeler.exportText();
  expect(before).not.toBe(imported);
  return before;
}

function expectNothingChanged(page: Mounted, before: string): void {
  expect(page.modeler.exportText()).toBe(before);
  expect(page.modeler.elements.selection()).toEqual(["payments"]);
  expect(page.modeler.views.active().key).toBe("Landscape");
  expect(service<Dragging>(page.modeler, "dragging").context()).toBeFalsy();
  expect(labelEditing(page).openEdit()).toBeUndefined();
  expect(page.dialogs.current()).toBeUndefined();
}

const CANVAS_KEYS: KeyboardEventInit[] = [
  { key: "Delete" },
  { key: "Backspace" },
  { key: "Delete", shiftKey: true },
  { key: "ArrowLeft" },
  { key: "e" },
  { key: "h" },
  { key: "l" },
  { key: "c" },
  { key: "u" },
  { key: "g" },
  { key: "Enter" },
  { key: "a", ctrlKey: true },
  { key: "z", ctrlKey: true },
  { key: "z", metaKey: true },
];

describe("keys stay on the canvas", () => {
  it.each([
    ["made it inert", (host: HTMLElement) => (host.inert = true)],
    ["hid it with display: none", (host: HTMLElement) => (host.style.display = "none")],
    ["hid it with visibility: hidden", (host: HTMLElement) => (host.style.visibility = "hidden")],
  ])(
    "a key that reaches the canvas before the browser moves the focus off it passes, once the host %s",
    async (_how, hide) => {
      const page = await mountModeler();
      const before = focusCanvasThatTakesKeys(page);
      hide(page.host);
      for (const init of CANVAS_KEYS) {
        expect(pressOnCanvas(page.modeler, init), JSON.stringify(init)).toBe(true);
      }
      expectNothingChanged(page, before);
    },
  );

  it("a key the host has handled already passes", async () => {
    const page = await mountModeler();
    const before = focusCanvasThatTakesKeys(page);
    const handledByTheHost = (event: Event) => event.preventDefault();
    window.addEventListener("keydown", handledByTheHost, true);
    try {
      for (const init of CANVAS_KEYS) pressOnCanvas(page.modeler, init);
    } finally {
      window.removeEventListener("keydown", handledByTheHost, true);
    }
    expectNothingChanged(page, before);
  });

  it.each([
    ["while it composes", { isComposing: true }],
    ["when it confirms a candidate in Safari", { isComposing: false, keyCode: 229 }],
  ])("a key of an input method passes %s", async (_when, composition) => {
    const page = await mountModeler();
    const before = focusCanvasThatTakesKeys(page);
    for (const init of CANVAS_KEYS) {
      expect(pressOnCanvas(page.modeler, { ...init, ...composition }), init.key).toBe(true);
    }
    expectNothingChanged(page, before);
  });
});

describe("the C4 keys (SPEC 5.7)", () => {
  it("E opens the name of the selected element, and a relationship's description", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    expect(pressOnCanvas(page.modeler, { key: "e" })).toBe(false);
    expect(labelEditing(page).openEdit()).toEqual({
      elementId: "customer",
      text: "Customer",
      field: "name",
    });
    labelEditing(page).cancel();

    select(page.modeler, "rel:bookshop->payments");
    pressOnCanvas(page.modeler, { key: "E" });
    expect(labelEditing(page).openEdit()).toMatchObject({
      elementId: "bookshop->payments",
      field: "description",
      text: "Charges cards",
    });
  });

  it("Enter opens the view one level deeper of a system or container, U the parent", async () => {
    const page = await mountModeler();
    select(page.modeler, "bookshop");
    expect(pressOnCanvas(page.modeler, { key: "Enter" })).toBe(false);
    expect(page.modeler.views.active().key).toBe("Containers");

    select(page.modeler, "api");
    pressOnCanvas(page.modeler, { key: "Enter" });
    expect(page.modeler.views.active()).toMatchObject({
      type: "component",
      scopeId: "api",
      state: "draft",
    });
    expect(page.modeler.exportText()).toBe(BOOKSHOP);

    expect(pressOnCanvas(page.modeler, { key: "u" })).toBe(false);
    expect(page.modeler.views.active().key).toBe("Containers");
    pressOnCanvas(page.modeler, { key: "U" });
    expect(page.modeler.views.active().key).toBe("Landscape");
    expect(pressOnCanvas(page.modeler, { key: "u" }), "no parent of a landscape").toBe(true);
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("Enter on a person, or on more than one element, passes", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    expect(pressOnCanvas(page.modeler, { key: "Enter" })).toBe(true);
    select(page.modeler, "bookshop", "payments");
    expect(pressOnCanvas(page.modeler, { key: "Enter" })).toBe(true);
    expect(page.modeler.views.active().key).toBe("Landscape");
  });

  it("G opens the Views dialog, and passes without a dialog chrome", async () => {
    const page = await mountModeler();
    expect(pressOnCanvas(page.modeler, { key: "g" })).toBe(false);
    expect(page.dialogs.current()?.options.title).toBe("Views");

    const bare = await mountModeler(BOOKSHOP, { connectDialogs: false });
    expect(pressOnCanvas(bare.modeler, { key: "g" })).toBe(true);
    expect(bare.dialogs.opened).toHaveLength(0);
  });

  it("C arms the connect tool and puts it down again", async () => {
    const page = await mountModeler();
    expect(pressOnCanvas(page.modeler, { key: "c" })).toBe(false);
    expect(dragPrefix(page)).toBe("global-connect");
    pressOnCanvas(page.modeler, { key: "c" });
    expect(dragPrefix(page)).toBeUndefined();
  });

  it("Delete removes from this view what another view shows, and from the model what not", async () => {
    const page = await mountModeler();
    select(page.modeler, "customer");
    pressOnCanvas(page.modeler, { key: "Delete" });
    expect(elementNamed(page.modeler, "customer")).toBeDefined();
    expect(page.modeler.elements.list().map(({ id }) => id)).not.toContain("customer");

    select(page.modeler, "payments");
    pressOnCanvas(page.modeler, { key: "Backspace" });
    expect(elementNamed(page.modeler, "payments")).toBeUndefined();
  });

  it("Shift+Delete deletes from the model at once when nothing else goes with it", async () => {
    const page = await mountModeler();
    select(page.modeler, "payments");
    expect(pressOnCanvas(page.modeler, { key: "Delete", shiftKey: true })).toBe(false);
    expect(elementNamed(page.modeler, "payments")).toBeUndefined();
    expect(page.dialogs.opened).toHaveLength(0);
  });

  it("Shift+Delete asks first when the delete reaches beyond the selection", async () => {
    const page = await mountModeler();
    select(page.modeler, "bookshop");
    pressOnCanvas(page.modeler, { key: "Backspace", shiftKey: true });
    const dialog = page.dialogs.current();
    expect(dialog?.options.title).toBe("Delete Bookshop?");
    expect(dialog?.element.textContent).toContain("3 containers and 2 components");
    expect(dialog?.element.textContent).toContain("appears in 1 other view");
    expect(document.activeElement?.textContent).toBe("Cancel");
    (document.activeElement as HTMLButtonElement).click();
    await Promise.resolve();
    expect(elementNamed(page.modeler, "bookshop")).toBeDefined();

    select(page.modeler, "bookshop");
    pressOnCanvas(page.modeler, { key: "Delete", shiftKey: true });
    const confirm = [...(page.dialogs.current()?.element.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Delete from model",
    );
    confirm?.click();
    await Promise.resolve();
    expect(elementNamed(page.modeler, "bookshop")).toBeUndefined();
    expect(elementNamed(page.modeler, "web")).toBeUndefined();
  });

  it("Cmd/Ctrl+A selects every element shape of the view", async () => {
    const page = await mountModeler();
    pressOnCanvas(page.modeler, { key: "a", ctrlKey: true });
    expect(page.modeler.elements.selection().sort()).toEqual(["bookshop", "customer", "payments"]);
  });

  it("the lock keeps the edit keys off and the navigation on", async () => {
    const page = await mountModeler();
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    select(page.modeler, "payments");
    pressOnCanvas(page.modeler, { key: "Delete", shiftKey: true });
    pressOnCanvas(page.modeler, { key: "e" });
    pressOnCanvas(page.modeler, { key: "c" });
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
    expect(labelEditing(page).openEdit()).toBeUndefined();
    expect(dragPrefix(page)).toBeUndefined();

    service<Selection>(page.modeler, "selection").select(shapeOf(page.modeler, "bookshop"));
    pressOnCanvas(page.modeler, { key: "Enter" });
    expect(page.modeler.views.active().key).toBe("Containers");
    pressOnCanvas(page.modeler, { key: "u" });
    expect(page.modeler.views.active().key).toBe("Landscape");
    pressOnCanvas(page.modeler, { key: "g" });
    expect(page.dialogs.current()?.options.title).toBe("Views");
  });
});
