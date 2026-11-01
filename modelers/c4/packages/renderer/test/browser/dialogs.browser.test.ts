import { afterEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type C4Dialogs from "../../src/navigation/C4Dialogs.js";
import { confirmDeleteFromModel } from "../../src/navigation/deleteFromModel.js";
import type ReadOnly from "../../src/read-only/ReadOnly.js";
import {
  EDIT_REFUSED_EVENT,
  VIEW_CHANGED_EVENT,
  type ViewChangedEvent,
} from "../../src/services.js";
import { BOOKSHOP } from "./support/interaction/fixtures.js";
import {
  destroyMounted,
  elementNamed,
  mountModeler,
  press,
  service,
  typeInto,
  wait,
  workspaceOf,
  type Mounted,
} from "./support/interaction/mount.js";

afterEach(() => destroyMounted());

function dialogs(page: Mounted): C4Dialogs {
  return service<C4Dialogs>(page.modeler, "c4Dialogs");
}

function openDialog(page: Mounted): HTMLDialogElement {
  const current = page.dialogs.current();
  if (!current) throw new Error("no dialog is open");
  return current.element;
}

function buttonNamed(container: Element, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim().startsWith(label) ?? false,
  );
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

function field(container: Element, name: string): HTMLInputElement | HTMLTextAreaElement {
  const found = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[data-field="${name}"]`,
  );
  if (!found) throw new Error(`no field ${name}`);
  return found;
}

/** The view changes in order, as a host's glue sees them. */
function viewChanges(page: Mounted): ViewChangedEvent[] {
  const changes: ViewChangedEvent[] = [];
  service<EventBus>(page.modeler, "eventBus").on(VIEW_CHANGED_EVENT, (event: ViewChangedEvent) => {
    changes.push({ view: event.view, previous: event.previous, cause: event.cause });
  });
  return changes;
}

/** Refusals that reach the app (its toast); a field shows its own instead. */
function refusalsAtTheApp(page: Mounted): string[] {
  const messages: string[] = [];
  service<EventBus>(page.modeler, "eventBus").on(
    EDIT_REFUSED_EVENT,
    (event: { message: string }) => {
      messages.push(event.message);
    },
  );
  return messages;
}

describe('"Views…" (SPEC 7.1)', () => {
  it("lists one table per editable type, the current view marked, drafts noted", async () => {
    const page = await mountModeler();
    dialogs(page).showViews();
    const dialog = openDialog(page);
    const headings = [...dialog.querySelectorAll("h3")].map((heading) => heading.textContent);
    expect(headings).toEqual([
      "System Landscape",
      "System Context",
      "Container",
      "Component",
      "Other views",
      "New view",
    ]);
    const current = dialog.querySelector('[aria-current="true"]');
    expect(current?.getAttribute("data-view")).toBe("Landscape");
    const rows = [...dialog.querySelectorAll<HTMLButtonElement>("button[data-view]")];
    expect(rows.map((row) => row.dataset.view)).toEqual([
      "Landscape",
      "SystemContext-bookshop",
      "SystemContext-mail",
      "SystemContext-payments",
      "Containers",
      "Components-api",
    ]);
    const draft = rows.find((row) => row.dataset.view === "Components-api");
    expect(draft?.textContent).toContain("Not in the file yet");
    expect(rows.find((row) => row.dataset.view === "Containers")?.textContent).not.toContain(
      "Not in the file yet",
    );
  });

  it("names the views only Structurizr shows, without opening them", async () => {
    const page = await mountModeler();
    dialogs(page).showViews();
    const other = openDialog(page).querySelector('tr[data-view="Checkout"]');
    expect(other?.textContent).toContain("Dynamic");
    expect(other?.textContent).toContain("Shown in Structurizr only");
    expect(other?.querySelector("button")).toBeNull();
  });

  it("a row shows its view, closes the dialog and gives the canvas the focus, writing nothing", async () => {
    const page = await mountModeler();
    const changes = viewChanges(page);
    dialogs(page).showViews();
    openDialog(page).querySelector<HTMLButtonElement>('[data-view="Components-api"]')?.click();
    expect(page.dialogs.current()).toBeUndefined();
    expect(page.modeler.views.active().key).toBe("Components-api");
    expect(changes).toEqual([{ view: "Components-api", previous: "Landscape", cause: "user" }]);
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
    const svg = service<Canvas>(page.modeler, "canvas").getContainer().querySelector("svg");
    expect(document.activeElement).toBe(svg);
  });

  it("follows the document while it is open", async () => {
    const page = await mountModeler();
    dialogs(page).showViews();
    page.modeler.views.open("Containers", { cause: "user" });
    expect(openDialog(page).querySelector('[aria-current="true"]')?.getAttribute("data-view")).toBe(
      "Containers",
    );
    page.modeler.c4.createView("systemContext", "payments", "Payments");
    expect(
      openDialog(page).querySelector('[data-view="SystemContext-payments"]')?.textContent,
    ).toBe("Payments");
  });

  it('"New view…" creates a view of a type and scope, shows it and undoes in one step', async () => {
    const page = await mountModeler();
    const changes = viewChanges(page);
    dialogs(page).showViews();
    buttonNamed(openDialog(page), "New view…").click();
    const dialog = openDialog(page);
    expect(document.activeElement).toBe(field(dialog, "type"));
    const scope = field(dialog, "scope") as unknown as HTMLSelectElement;
    expect([...scope.options].map((option) => option.textContent)).toEqual([
      "Bookshop",
      "Payment Provider",
      "E-mail System",
    ]);
    scope.value = "payments";
    scope.dispatchEvent(new Event("change"));
    typeInto(field(dialog, "title"), "Payments in context");
    buttonNamed(dialog, "Create view").click();

    expect(page.dialogs.current()).toBeUndefined();
    const created = workspaceOf(page.modeler).views.find(
      (view) => view.type === "systemContext" && view.scopeId === "payments",
    );
    expect(created?.title).toBe("Payments in context");
    expect(page.modeler.views.active().key).toBe(created?.key);
    expect(changes.at(-1)).toMatchObject({ previous: "Landscape", cause: "user" });

    service<CommandStack>(page.modeler, "commandStack").undo();
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
    expect(page.modeler.views.active().key).toBe("Landscape");
  });

  it('"New view…" offers containers as the scope of a component view', async () => {
    const page = await mountModeler();
    dialogs(page).showViews();
    buttonNamed(openDialog(page), "New view…").click();
    const type = field(openDialog(page), "type") as unknown as HTMLSelectElement;
    type.value = "component";
    type.dispatchEvent(new Event("change"));
    const scope = field(openDialog(page), "scope") as unknown as HTMLSelectElement;
    expect([...scope.options].map((option) => option.textContent)).toEqual([
      "Web App (Bookshop)",
      "API (Bookshop)",
      "Database (Bookshop)",
    ]);
  });

  it("navigates on a read-only canvas and locks the new view", async () => {
    const page = await mountModeler();
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    dialogs(page).showViews();
    expect(buttonNamed(openDialog(page), "New view…").disabled).toBe(true);
    openDialog(page).querySelector<HTMLButtonElement>('[data-view="Containers"]')?.click();
    expect(page.modeler.views.active().key).toBe("Containers");
  });

  it("locks the new view when the lock arrives while it is open", async () => {
    const page = await mountModeler();
    dialogs(page).showViews();
    expect(buttonNamed(openDialog(page), "New view…").disabled).toBe(false);
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    expect(buttonNamed(openDialog(page), "New view…").disabled).toBe(true);
  });

  it("is open once at a time and closes with the modeler", async () => {
    const page = await mountModeler();
    const first = dialogs(page).showViews();
    expect(dialogs(page).showViews()).toBe(first);
    expect(page.dialogs.opened).toHaveLength(1);
    page.modeler.destroy();
    expect(first?.isOpen()).toBe(false);
  });
});

describe('"View settings…" (SPEC 7.1, 4.6)', () => {
  it("writes the title and the description as one command, and clears them again", async () => {
    const page = await mountModeler();
    dialogs(page).showViewSettings();
    const dialog = openDialog(page);
    expect(dialog.textContent).toContain("Landscape");
    typeInto(field(dialog, "title"), "The shop and its neighbours");
    typeInto(field(dialog, "description"), "Who uses the shop.");
    buttonNamed(dialog, "Save").click();
    expect(page.dialogs.current()).toBeUndefined();
    const view = workspaceOf(page.modeler).views.find(({ key }) => key === "Landscape");
    expect(view).toMatchObject({
      title: "The shop and its neighbours",
      description: "Who uses the shop.",
    });
    expect(service<CommandStack>(page.modeler, "commandStack").canUndo()).toBe(true);

    dialogs(page).showViewSettings();
    typeInto(field(openDialog(page), "title"), "");
    buttonNamed(openDialog(page), "Save").click();
    expect(workspaceOf(page.modeler).views.find(({ key }) => key === "Landscape")?.title).toBe(
      undefined,
    );
  });

  it("deletes a written view after a confirmation and shows its parent", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    const changes = viewChanges(page);
    dialogs(page).showViewSettings();
    buttonNamed(openDialog(page), "Delete view…").click();
    const confirm = openDialog(page);
    expect(confirm.textContent).toContain("The elements stay in the model");
    expect(document.activeElement?.textContent).toBe("Cancel");
    buttonNamed(confirm, "Delete view").click();
    await wait();
    expect(workspaceOf(page.modeler).views.some(({ key }) => key === "Containers")).toBe(false);
    expect(page.modeler.views.active().key).toBe("Landscape");
    expect(changes).toEqual([{ view: "Landscape", previous: "Containers", cause: "removed" }]);
  });

  it("offers no delete for a view that is not in the file, and saving writes it", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Components-api", { cause: "user" });
    dialogs(page).showViewSettings();
    const dialog = openDialog(page);
    expect(
      [...dialog.querySelectorAll("button")].map((button) => button.textContent),
    ).not.toContain("Delete view…");
    typeInto(field(dialog, "title"), "Inside the API");
    buttonNamed(dialog, "Save").click();
    const written = workspaceOf(page.modeler).views.find(({ key }) => key === "Components-api");
    expect(written?.title).toBe("Inside the API");
    expect(page.modeler.views.active().key).toBe("Components-api");
  });

  it("shows a refused value at its field, not as the app's toast", async () => {
    const page = await mountModeler();
    const atTheApp = refusalsAtTheApp(page);
    dialogs(page).showViewSettings();
    const title = field(openDialog(page), "title");
    typeInto(title, "C:\\new");
    buttonNamed(openDialog(page), "Save").click();
    expect(page.dialogs.current()).toBeDefined();
    expect(title.getAttribute("aria-invalid")).toBe("true");
    const message = document.getElementById(title.getAttribute("aria-describedby") ?? "");
    expect(message?.textContent).toContain("can't be stored in the DSL");
    expect(atTheApp).toEqual([]);
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });
});

describe('"Add existing element…" (SPEC 7.1)', () => {
  it("lists what the view lacks, filters by search and adds the checked ones as one command", async () => {
    const page = await mountModeler();
    dialogs(page).showAddElement();
    const dialog = openDialog(page);
    const names = () =>
      [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(
        (box) => box.value,
      );
    expect(names()).toEqual(["mail"]);
    typeInto(field(dialog, "search"), "pay");
    expect(names()).toEqual([]);
    expect(dialog.textContent).toContain("No element matches “pay”.");
    typeInto(field(dialog, "search"), "mail");
    const add = buttonNamed(dialog, "Add to view");
    expect(add.disabled).toBe(true);
    const box = dialog.querySelector<HTMLInputElement>('input[value="mail"]');
    const unchecked = box && getComputedStyle(box);
    const surface = unchecked?.backgroundColor;
    const edge = unchecked?.borderTopColor;
    box?.click();
    expect(add.disabled).toBe(false);
    expect(getComputedStyle(box!).backgroundColor, "a checked box keeps its surface").toBe(surface);
    expect(getComputedStyle(box!).borderTopColor).not.toBe(edge);
    add.click();
    expect(page.dialogs.current()).toBeUndefined();
    expect(page.modeler.elements.list().map(({ id }) => id)).toContain("mail");
    service<CommandStack>(page.modeler, "commandStack").undo();
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("offers the scope's containers in its container view, never the scope itself", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    dialogs(page).showAddElement();
    const values = [
      ...openDialog(page).querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].map((box) => box.value);
    expect(values).toEqual(["payments", "mail"]);
  });

  it("says so when the view shows everything it can", async () => {
    const page = await mountModeler();
    page.modeler.c4.includeInView(["mail"]);
    dialogs(page).showAddElement();
    expect(openDialog(page).textContent).toContain(
      "Every element this view can show is in it already.",
    );
  });
});

describe('"Workspace settings…" (SPEC 7.1)', () => {
  it("writes the name and the description", async () => {
    const page = await mountModeler();
    dialogs(page).showWorkspaceSettings();
    const dialog = openDialog(page);
    expect(field(dialog, "name").value).toBe("Bookshop");
    typeInto(field(dialog, "name"), "Book Shop");
    press(field(dialog, "name"), "Enter");
    field(dialog, "name").form?.requestSubmit();
    expect(workspaceOf(page.modeler).name).toBe("Book Shop");
    expect(page.dialogs.current()).toBeUndefined();
  });

  it("disables the fields while the canvas is read-only", async () => {
    const page = await mountModeler();
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    dialogs(page).showWorkspaceSettings();
    const dialog = openDialog(page);
    expect(dialog.querySelector("fieldset")?.disabled).toBe(true);
    expect(buttonNamed(dialog, "Save").disabled).toBe(true);
    buttonNamed(dialog, "Cancel").click();
    expect(page.dialogs.current()).toBeUndefined();
  });
});

describe('"Delete from model…" confirmation (SPEC 5.4)', () => {
  it("resolves at once when only the selection goes", async () => {
    const page = await mountModeler();
    await expect(
      confirmDeleteFromModel({
        ...page.dialogs.chrome,
        modeler: page.modeler,
        ids: ["payments"],
        relationships: [],
      }),
    ).resolves.toBe(true);
    expect(page.dialogs.opened).toHaveLength(0);
  });

  it("names what goes with it, and Escape answers no", async () => {
    const page = await mountModeler();
    const answer = confirmDeleteFromModel({
      ...page.dialogs.chrome,
      modeler: page.modeler,
      ids: ["api"],
      relationships: [],
    });
    const dialog = openDialog(page);
    expect(page.dialogs.current()?.options.title).toBe("Delete API?");
    expect(dialog.textContent).toContain("It has 2 components");
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(answer).resolves.toBe(false);
    expect(elementNamed(page.modeler, "api")).toBeDefined();
  });

  it("closes with the modeler and answers no", async () => {
    const page = await mountModeler();
    const answer = confirmDeleteFromModel({
      ...page.dialogs.chrome,
      modeler: page.modeler,
      ids: ["api"],
      relationships: [],
    });
    const confirmation = page.dialogs.current();
    page.modeler.destroy();
    expect(confirmation?.dialog.isOpen()).toBe(false);
    await expect(answer).resolves.toBe(false);
  });

  it("counts other views and dynamic steps", async () => {
    const page = await mountModeler();
    void confirmDeleteFromModel({
      ...page.dialogs.chrome,
      modeler: page.modeler,
      ids: ["customer"],
      relationships: [],
    });
    expect(openDialog(page).textContent).toContain(
      "It appears in 1 other view and is a step in 1 dynamic view.",
    );
  });

  it("refuses a far-reaching delete when the app gave no chrome to ask on", async () => {
    const page = await mountModeler(BOOKSHOP, { connectDialogs: false });
    const atTheApp = refusalsAtTheApp(page);
    dialogs(page).deleteFromModel({ ids: ["bookshop"], relationships: [] });
    expect(atTheApp).toHaveLength(1);
    expect(elementNamed(page.modeler, "bookshop")).toBeDefined();
  });
});
