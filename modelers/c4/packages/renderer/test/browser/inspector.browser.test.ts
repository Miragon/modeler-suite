import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import {
  mountInspector,
  type InspectorHandle,
  type InspectorOptions,
  type InspectorSlot,
} from "../../src/inspector/index.js";
import type ReadOnly from "../../src/read-only/ReadOnly.js";
import { EDIT_REFUSED_EVENT, TEXT_REBASED_EVENT } from "../../src/services.js";
import { BOOKSHOP } from "./support/interaction/fixtures.js";
import {
  destroyMounted,
  elementNamed,
  mountModeler,
  press,
  select,
  service,
  shapeOf,
  typeInto,
  wait,
  workspaceOf,
  type Mounted,
} from "./support/interaction/mount.js";

interface Panel {
  readonly slot: InspectorSlot & { readonly opened: boolean[] };
  readonly handle: InspectorHandle;
}

const handles: InspectorHandle[] = [];

/** A name set with a constant, which the inspector shows read-only. */
const CONSTANT = `workspace "Constant" {
    !constant PAY "Payment Gateway"
    model {
        shop = softwareSystem "Shop"
        pay = softwareSystem "\${PAY}"
        shop -> pay "Charges"
    }
    views {
        systemLandscape "Landscape" {
            include *
        }
    }
}
`;

afterEach(() => {
  for (const handle of handles.splice(0)) handle.destroy();
  for (const aside of document.querySelectorAll("[data-inspector-host]")) aside.remove();
  destroyMounted();
});

/** The shell's inspector slot as far as the content relies on it: an `<aside>` it opens and closes. */
function panelFor(page: Mounted, options: InspectorOptions = {}): Panel {
  const element = document.createElement("aside");
  element.dataset.inspectorHost = "";
  element.hidden = true;
  document.body.append(element);
  const opened: boolean[] = [];
  const slot = {
    element,
    opened,
    isOpen: () => !element.hidden,
    open: () => {
      element.hidden = false;
      opened.push(true);
    },
    close: () => {
      element.hidden = true;
      opened.push(false);
    },
  };
  const handle = mountInspector(slot, page.modeler, options);
  handles.push(handle);
  return { slot, handle };
}

function control(panel: Panel, name: string): HTMLInputElement | HTMLTextAreaElement {
  const found = panel.slot.element.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[data-field="${name}"]`,
  );
  if (!found) throw new Error(`the inspector has no field ${name}`);
  return found;
}

function buttonNamed(panel: Panel, label: string): HTMLButtonElement {
  const found = [...panel.slot.element.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label || button.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`the inspector has no button "${label}"`);
  return found;
}

function labels(panel: Panel): string[] {
  return [...panel.slot.element.querySelectorAll(".c4-field-label")].map(
    (label) => label.textContent ?? "",
  );
}

function canvasSvg(page: Mounted): Element | null {
  return service<Canvas>(page.modeler, "canvas").getContainer().querySelector(":scope > svg");
}

/** Longer than the keeper's glide (250 ms, --cd-motion-base) and the frame it waits for. */
const GLIDE_OVER_MS = 400;

/**
 * The shell's side panel over the right of the 800 × 600 canvas at the page's top left, where the
 * landscape's payment provider (x 760) sits, while the customer (x 40) stays clear of it.
 */
function besideTheCanvas(panel: Panel): void {
  panel.slot.element.style.cssText = "position:absolute;top:0;left:480px;width:320px;height:600px";
}

function viewboxX(page: Mounted): number {
  return service<Canvas>(page.modeler, "canvas").viewbox().x;
}

function undoSteps(page: Mounted): number {
  const stack = service<CommandStack>(page.modeler, "commandStack") as unknown as {
    _stack: unknown[];
  };
  return stack._stack.length;
}

describe("the inspector's content (SPEC 5.6)", () => {
  it("shows the panel that fits the selection, and nothing without one", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    expect(panel.slot.isOpen()).toBe(false);

    select(page.modeler, "payments");
    expect(panel.slot.isOpen()).toBe(true);
    expect(panel.slot.element.querySelector("h2")?.textContent).toBe("Software System");
    expect(labels(panel)).toEqual(["Name", "Description", "Tags", "URL", "Identifier", "In views"]);
    expect(control(panel, "name").value).toBe("Payment Provider");
    expect(control(panel, "identifier").value).toBe("payments");

    page.modeler.views.open("Containers", { cause: "user" });
    select(page.modeler, "api");
    expect(panel.slot.element.querySelector("h2")?.textContent).toBe("Container");
    expect(control(panel, "technology").value).toBe("Java");

    service<Selection>(page.modeler, "selection").select(null);
    expect(panel.slot.isOpen()).toBe(false);
    expect(panel.slot.element.childElementCount).toBe(0);
  });

  it("commits a field's draft once, on Enter, and hands the focus to the canvas", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    const name = control(panel, "name");
    typeInto(name, "Payments Inc");
    expect(elementNamed(page.modeler, "payments")?.name).toBe("Payment Provider");
    press(name, "Enter");
    expect(elementNamed(page.modeler, "payments")?.name).toBe("Payments Inc");
    expect(undoSteps(page)).toBe(1);
    expect(document.activeElement).toBe(canvasSvg(page));
    name.dispatchEvent(new FocusEvent("blur"));
    expect(undoSteps(page)).toBe(1);
  });

  it("commits on blur, and keeps a text area's Enter for its line breaks", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    const description = control(panel, "description");
    typeInto(description, "Takes the payments.\nAnd refunds them.");
    expect(press(description, "Enter")).toBe(true);
    expect(document.activeElement).toBe(description);
    description.blur();
    expect(elementNamed(page.modeler, "payments")?.description).toBe(
      "Takes the payments.\nAnd refunds them.",
    );
  });

  it("lets Escape undo a field's draft without closing the panel", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    const name = control(panel, "name");
    typeInto(name, "Something else");
    expect(press(name, "Escape")).toBe(false);
    expect(name.value).toBe("Payment Provider");
    expect(panel.slot.isOpen()).toBe(true);
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("closes on an Escape that no field used, and on Close, handing the focus to the canvas", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    press(control(panel, "name"), "Escape");
    expect(panel.slot.isOpen()).toBe(false);
    expect(page.modeler.elements.selection()).toEqual([]);
    expect(document.activeElement).toBe(canvasSvg(page));

    select(page.modeler, "payments");
    buttonNamed(panel, "Close").click();
    expect(panel.slot.isOpen()).toBe(false);
    expect(document.activeElement).toBe(canvasSvg(page));
  });

  it("keeps the focus in the panel while Tab commits one field after the other", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    const name = control(panel, "name");
    typeInto(name, "Payments Inc");
    const description = control(panel, "description");
    description.focus();
    expect(elementNamed(page.modeler, "payments")?.name).toBe("Payments Inc");
    expect(document.activeElement).toBe(description);
    expect(control(panel, "description")).toBe(description);
  });

  it("shows a refused value at its field, keeps the draft and tells the app nothing", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    const atTheApp: string[] = [];
    service<EventBus>(page.modeler, "eventBus").on(EDIT_REFUSED_EVENT, () =>
      atTheApp.push("toast"),
    );
    select(page.modeler, "payments");
    const name = control(panel, "name");
    typeInto(name, "Bookshop");
    press(name, "Enter");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.value).toBe("Bookshop");
    const message = document.getElementById(name.getAttribute("aria-describedby") ?? "");
    expect(message?.textContent).toContain("Bookshop");
    expect(atTheApp).toEqual([]);
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
    typeInto(name, "Payments Inc");
    expect(name.hasAttribute("aria-invalid")).toBe(false);
  });

  it("writes tags, the URL and a new identifier, each as one command", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    typeInto(control(panel, "tags"), "External, Payments");
    control(panel, "tags").blur();
    typeInto(control(panel, "url"), "https://pay.example");
    control(panel, "url").blur();
    expect(elementNamed(page.modeler, "payments")).toMatchObject({
      ownTags: ["External", "Payments"],
      url: "https://pay.example",
    });
    typeInto(control(panel, "identifier"), "paymentProvider");
    press(control(panel, "identifier"), "Enter");
    expect(elementNamed(page.modeler, "paymentProvider")?.name).toBe("Payment Provider");
    expect(page.modeler.elements.selection()).toEqual(["paymentProvider"]);
    expect(undoSteps(page)).toBe(3);
  });

  it("lists the views that show the element and opens its deeper view", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "bookshop");
    const list = panel.slot.element.querySelector(".c4-inspector-view-list");
    const views = [...(list?.querySelectorAll<HTMLButtonElement>("button[data-view]") ?? [])];
    expect(views.map((view) => view.textContent)).toEqual([
      "System Landscape diagram",
      "Container diagram for Bookshop",
    ]);
    expect(views[0]?.getAttribute("aria-current")).toBe("true");
    const drill = buttonNamed(panel, "Open container view");
    expect(list?.contains(drill), "the drill is a button of its own, not a view").toBe(false);
    expect(drill.dataset.variant).toBe("secondary");
    drill.click();
    expect(page.modeler.views.active().key).toBe("Containers");
    expect(page.modeler.elements.selection()).toEqual(["bookshop"]);
    expect(panel.slot.element.querySelector(".c4-field-note")?.textContent).toBe(
      "The frame of this view.",
    );
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("offers the defining line where the host can show it", async () => {
    const page = await mountModeler();
    const lines: number[] = [];
    const panel = panelFor(page, { onRevealSource: (line) => lines.push(line) });
    select(page.modeler, "payments");
    buttonNamed(panel, "Defined on line 12").click();
    expect(lines).toEqual([12]);

    const plain = panelFor(page);
    expect(plain.slot.element.textContent).not.toContain("Defined on line");
  });

  it("follows a rebase, whose new formatting moves the defining line", async () => {
    const page = await mountModeler();
    const lines: number[] = [];
    const panel = panelFor(page, { onRevealSource: (line) => lines.push(line) });
    select(page.modeler, "payments");
    expect(buttonNamed(panel, "Defined on line 12")).toBeDefined();

    const rebases: unknown[] = [];
    service<EventBus>(page.modeler, "eventBus").on(TEXT_REBASED_EVENT, (event) => {
      rebases.push(event);
    });
    const reformatted = BOOKSHOP.replace("    model {\n", "    model {\n\n        // People\n");
    expect(page.modeler.rebaseText(reformatted)).toBe(true);
    expect(rebases).toHaveLength(1);
    buttonNamed(panel, "Defined on line 14").click();
    expect(lines).toEqual([14]);
    expect(page.modeler.elements.selection()).toEqual(["payments"]);

    expect(page.modeler.rebaseText(reformatted)).toBe(true);
    expect(page.modeler.rebaseText(BOOKSHOP.replace('"Customer"', '"Shopper"'))).toBe(false);
    expect(rebases).toHaveLength(1);
  });

  it("edits an explicit relationship and explains an implied one", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "rel:bookshop->payments");
    expect(panel.slot.element.querySelector("h2")?.textContent).toBe("Relationship");
    expect(panel.slot.element.textContent).toContain("Bookshop → Payment Provider");
    typeInto(control(panel, "technology"), "REST");
    press(control(panel, "technology"), "Enter");
    expect(
      workspaceOf(page.modeler).relationships.find(({ key }) => key === "bookshop->payments")
        ?.technology,
    ).toBe("REST");

    select(page.modeler, "rel:implied:customer->bookshop");
    expect(panel.slot.element.querySelector("h2")?.textContent).toBe("Implied relationship");
    expect(panel.slot.element.textContent).toContain("Implied by Customer → Web App.");
  });

  it("shows an implied relationship's values read-only and opens the view of its origin", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "rel:implied:customer->bookshop");
    const description = control(panel, "description");
    const technology = control(panel, "technology");
    expect(description.value).toBe("Buys books");
    expect(technology.value).toBe("HTTPS");
    for (const field of [description, technology]) {
      expect(field.readOnly).toBe(true);
      const reason = document.getElementById(field.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent).toBe(
        "Implied by Customer → Web App. Edit that relationship to change it.",
      );
    }
    buttonNamed(panel, "Open Container diagram for Bookshop").click();
    expect(page.modeler.views.active().key).toBe("Containers");
    const selected = service<Selection>(page.modeler, "selection").get();
    expect(selected.map((element) => element.id)).toEqual(["rel:customer->web"]);
    expect(panel.slot.element.querySelector("h2")?.textContent).toBe("Relationship");
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("names a constant's token in typographic quotes", async () => {
    const page = await mountModeler(CONSTANT);
    const panel = panelFor(page);
    select(page.modeler, "pay");
    const name = control(panel, "name");
    expect(name.readOnly).toBe(true);
    const reason = document.getElementById(name.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Set with “${PAY}”. Edit the constant in the text.");
  });

  it("shows a taken identifier in typographic quotes", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "bookshop");
    const identifier = control(panel, "identifier");
    typeInto(identifier, "customer");
    press(identifier, "Enter");
    const message = document.getElementById(identifier.getAttribute("aria-describedby") ?? "");
    expect(message?.textContent).toBe(
      "The identifier “customer” is already in use. Choose another one.",
    );
  });

  it("offers no Remove from view for the system a system context view is about", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    page.modeler.views.open("SystemContext-bookshop", { cause: "user" });
    select(page.modeler, "bookshop");
    const remove = buttonNamed(panel, "Remove from view");
    expect(remove.disabled).toBe(true);
    const reason = document.getElementById(remove.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("A system context view always shows its system.");
    const disabledSurface = getComputedStyle(remove).backgroundColor;

    select(page.modeler, "customer");
    const enabled = buttonNamed(panel, "Remove from view");
    expect(enabled.disabled).toBe(false);
    expect(disabledSurface, "a disabled secondary button keeps its surface (guide §8)").toBe(
      getComputedStyle(enabled).backgroundColor,
    );
  });

  it("suggests the tags the styles use, each added as one command", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    const suggestions = panel.slot.element.querySelector('[role="group"].c4-tag-suggestions');
    const named = document.getElementById(suggestions?.getAttribute("aria-labelledby") ?? "");
    expect(named?.textContent).toBe("Tags with a style");
    const offered = [...(suggestions?.querySelectorAll("button") ?? [])];
    expect(offered.map((button) => button.textContent)).toEqual(["Database"]);
    offered[0]?.click();
    expect(elementNamed(page.modeler, "payments")?.ownTags).toEqual(["Database"]);
    expect(control(panel, "tags").value).toBe("Database");
    expect(undoSteps(page)).toBe(1);
    expect(panel.slot.element.querySelector(".c4-tag-suggestions")).toBeNull();
  });

  it("marks a software system external with the tag the C4 colours draw grey", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    expect(panel.slot.element.querySelector('[data-field="external"]')).toBeNull();

    page.modeler.c4.applyC4Colours();
    select(page.modeler, "payments");
    const external = panel.slot.element.querySelector<HTMLInputElement>('[data-field="external"]');
    expect(external?.type).toBe("checkbox");
    expect(external?.checked).toBe(false);
    expect(external?.closest("label")?.textContent).toContain("External");
    const offered = [...panel.slot.element.querySelectorAll(".c4-tag-suggestions button")];
    expect(offered.map((button) => button.textContent)).toEqual(["Database"]);
    const steps = undoSteps(page);
    external?.click();
    expect(elementNamed(page.modeler, "payments")?.ownTags).toEqual(["Existing System"]);
    expect(undoSteps(page)).toBe(steps + 1);
    const after = panel.slot.element.querySelector<HTMLInputElement>('[data-field="external"]');
    expect(after?.checked).toBe(true);
    after?.click();
    expect(elementNamed(page.modeler, "payments")?.ownTags).toEqual([]);

    select(page.modeler, "customer");
    expect(panel.slot.element.querySelector('[data-field="external"]')).toBeNull();
  });

  it("keeps the focus among the tag choices when the chosen one goes", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    page.modeler.c4.applyC4Colours();
    select(page.modeler, "customer");
    const choice = (tag: string) => buttonNamed(panel, `Add the tag “${tag}”`);
    const first = choice("Existing System");
    first.focus();
    first.click();
    expect(elementNamed(page.modeler, "customer")?.ownTags).toEqual(["Existing System"]);
    expect(document.activeElement, "the next choice").toBe(choice("Database"));

    choice("Database").click();
    expect(elementNamed(page.modeler, "customer")?.ownTags).toEqual([
      "Existing System",
      "Database",
    ]);
    expect(document.activeElement, "the field once no choice is left").toBe(control(panel, "tags"));
  });

  it("lets Tab go on from a committed field to the control after it", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    page.modeler.c4.applyC4Colours();
    select(page.modeler, "payments");
    typeInto(control(panel, "tags"), "Legacy");
    await userEvent.tab();
    expect(elementNamed(page.modeler, "payments")?.ownTags).toEqual(["Legacy"]);
    expect((document.activeElement as HTMLElement | null)?.dataset.field).toBe("external");

    typeInto(control(panel, "identifier"), "gateway");
    await userEvent.tab();
    expect(elementNamed(page.modeler, "gateway")).toBeDefined();
    expect(document.activeElement?.textContent).toBe("System Landscape diagram");
    expect(panel.slot.element.contains(document.activeElement)).toBe(true);
  });

  it("adds a relationship from the keyboard through its dialog", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "customer");
    const add = buttonNamed(panel, "Add relationship…");
    add.focus();
    add.click();
    const dialog = page.dialogs.current();
    expect(dialog?.options.title).toBe("Add relationship");
    const destination = dialog?.element.querySelector<HTMLSelectElement>(
      '[data-field="destination"]',
    );
    expect(document.activeElement).toBe(destination);

    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    dialog?.dialog.close();
    expect(buttonNamed(panel, "Add relationship…").disabled).toBe(true);
  });

  it("follows a rename of a relationship's end, keeping the draft typed in another field", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "rel:bookshop->payments");
    const description = control(panel, "description");
    typeInto(description, "Charges the cards");
    page.modeler.c4.editElement("payments", { name: "Card Payments" });
    expect(panel.slot.element.textContent).toContain("Bookshop → Card Payments");
    expect(panel.slot.element.textContent).not.toContain("Payment Provider");
    expect(control(panel, "description")).toBe(description);
    expect(description.value).toBe("Charges the cards");
  });

  it("names the view's own frame apart from the frame around it", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    page.modeler.views.open("Components-api", { cause: "user" });
    select(page.modeler, "boundary:api");
    expect(panel.slot.element.querySelector(".c4-field-note")?.textContent).toBe(
      "The frame of this view.",
    );
    select(page.modeler, "boundary:bookshop");
    expect(panel.slot.element.querySelector(".c4-field-note")?.textContent).toBe(
      "A frame in this view, around the frame of its scope.",
    );
  });

  it("marks a destructive action with its icon, not with a coloured edge", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    const remove = buttonNamed(panel, "Delete from model…");
    expect(remove.querySelector("svg")).not.toBeNull();
    expect(getComputedStyle(remove).borderTopColor).toBe(getComputedStyle(remove).backgroundColor);
  });

  it("deletes a multi-selection together", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "customer", "payments");
    expect(panel.slot.element.querySelector("h2")?.textContent).toBe("2 items selected");
    buttonNamed(panel, "Remove from view").click();
    expect(page.modeler.elements.list().map(({ id }) => id)).toEqual(["bookshop"]);
    expect(elementNamed(page.modeler, "customer")).toBeDefined();
    expect(undoSteps(page)).toBe(1);
    expect(document.activeElement).toBe(canvasSvg(page));
  });

  it("asks before a delete from the model that reaches beyond the selection", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "bookshop");
    buttonNamed(panel, "Delete from model…").click();
    expect(page.dialogs.current()?.options.title).toBe("Delete Bookshop?");
    page.dialogs.current()?.dialog.close();
    await wait();
    expect(elementNamed(page.modeler, "bookshop")).toBeDefined();
  });

  it("disables every control that changes the document while read-only, not the navigation", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "bookshop");
    panel.handle.setReadOnly(true);
    expect(panel.slot.element.querySelector("fieldset")?.disabled).toBe(true);
    expect(buttonNamed(panel, "Delete from model…").disabled).toBe(true);
    expect(buttonNamed(panel, "Close").disabled).toBe(false);
    buttonNamed(panel, "Open container view").click();
    expect(page.modeler.views.active().key).toBe("Containers");

    panel.handle.setReadOnly(false);
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    select(page.modeler, "web");
    expect(panel.slot.element.querySelector("fieldset")?.disabled).toBe(true);
  });

  it("follows the canvas lock while it shows a selection", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    const lock = service<ReadOnly>(page.modeler, "readOnly");
    lock.setReadOnly(true);
    expect(panel.slot.element.querySelector("fieldset")?.disabled).toBe(true);
    lock.setReadOnly(false);
    expect(panel.slot.element.querySelector("fieldset")?.disabled).toBe(false);
  });

  it("gives the canvas the focus a removed panel field had", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    typeInto(control(panel, "name"), "Payments Inc");
    press(control(panel, "name"), "Enter");
    select(page.modeler, "payments");
    control(panel, "description").focus();
    service<CommandStack>(page.modeler, "commandStack").undo();
    expect(elementNamed(page.modeler, "payments")?.name).toBe("Payment Provider");
    expect(control(panel, "name").value).toBe("Payment Provider");

    page.modeler.c4.deleteFromModel(["payments"], []);
    expect(panel.slot.isOpen()).toBe(false);
    expect(document.activeElement).toBe(canvasSvg(page));
  });

  it("commits the field being typed in for a save, once", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "payments");
    typeInto(control(panel, "description"), "Typed, not left yet.");
    expect(panel.handle.commitDraft()).toBe(true);
    expect(elementNamed(page.modeler, "payments")?.description).toBe("Typed, not left yet.");
    expect(document.activeElement).toBe(control(panel, "description"));
    expect(panel.handle.commitDraft()).toBe(false);
    expect(undoSteps(page)).toBe(1);
  });

  it("stops gliding the canvas once the panel closes", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    besideTheCanvas(panel);
    select(page.modeler, "payments");
    const atRest = viewboxX(page);
    await expect.poll(() => viewboxX(page)).not.toBe(atRest);

    service<Selection>(page.modeler, "selection").select(null);
    expect(panel.slot.isOpen()).toBe(false);
    const stopped = viewboxX(page);
    await wait(GLIDE_OVER_MS);
    expect(viewboxX(page)).toBe(stopped);
  });

  it("stops the glide for an element once the panel shows another one", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    besideTheCanvas(panel);
    select(page.modeler, "payments");
    const atRest = viewboxX(page);
    await expect.poll(() => viewboxX(page)).not.toBe(atRest);

    select(page.modeler, "customer");
    const stopped = viewboxX(page);
    await wait(GLIDE_OVER_MS);
    expect(viewboxX(page)).toBe(stopped);
  });

  it("stops listening once destroyed", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    panel.handle.destroy();
    service<Selection>(page.modeler, "selection").select(shapeOf(page.modeler, "payments"));
    expect(panel.slot.element.childElementCount).toBe(0);
    expect(panel.slot.opened).not.toContain(true);
  });
});
