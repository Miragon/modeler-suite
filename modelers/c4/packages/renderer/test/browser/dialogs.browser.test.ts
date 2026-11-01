import { afterEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type C4Dialogs from "../../src/navigation/C4Dialogs.js";
import { confirmDeleteFromModel } from "../../src/navigation/deleteFromModel.js";
import type ReadOnly from "../../src/read-only/ReadOnly.js";
import {
  EDIT_REFUSED_EVENT,
  VIEW_CHANGED_EVENT,
  type ViewChangedEvent,
} from "../../src/services.js";
import { BOOKSHOP, SINGLE } from "./support/interaction/fixtures.js";
import {
  canvasSvg,
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
      "System landscape",
      "System context",
      "Container",
      "Component",
      "Other views",
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

  it("lines every table up on one set of columns and keeps a key on one line", async () => {
    const page = await mountModeler();
    dialogs(page).showViews();
    const dialog = openDialog(page);
    const tables = [...dialog.querySelectorAll<HTMLTableElement>("table")];
    expect(tables).toHaveLength(5);
    const keyColumns = tables.map((table) => {
      const header = [...table.querySelectorAll("th")].find((cell) => cell.textContent === "Key");
      return Math.round(header?.getBoundingClientRect().left ?? -1);
    });
    expect(new Set(keyColumns).size, `Key starts at ${keyColumns.join(", ")}`).toBe(1);
    const titleColumns = tables.map((table) =>
      Math.round(table.querySelector("th")?.getBoundingClientRect().left ?? -1),
    );
    expect(new Set(titleColumns).size).toBe(1);
    for (const key of dialog.querySelectorAll<HTMLElement>("code.c4-dialog-code")) {
      const style = getComputedStyle(key);
      expect(style.whiteSpace).toBe("nowrap");
      expect(style.textOverflow).toBe("ellipsis");
      expect(key.title).toBe(key.textContent);
      expect(key.getBoundingClientRect().height).toBeLessThan(2 * parseFloat(style.lineHeight));
    }
  });

  it("lines a row's scope and key up with its title", async () => {
    const page = await mountModeler();
    dialogs(page).showViews();
    const row = openDialog(page).querySelector('button[data-view="Containers"]')?.closest("tr");
    const [title, scope, key] = [...(row?.cells ?? [])].map(
      (cell) => cell.querySelector("button, code") ?? cell,
    );
    const textTop = (element: Element | undefined) => {
      if (!element) return -1;
      const range = document.createRange();
      range.selectNodeContents(element.firstChild ?? element);
      return Math.round(range.getBoundingClientRect().top);
    };
    expect(textTop(scope)).toBe(textTop(title));
    expect(Math.abs(textTop(key) - textTop(title))).toBeLessThanOrEqual(1);
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

  it('"New view…" opens its own dialog, which creates a view, shows it and undoes in one step', async () => {
    const page = await mountModeler();
    const changes = viewChanges(page);
    dialogs(page).showViews();
    const views = page.dialogs.current();
    const start = buttonNamed(openDialog(page), "New view…");
    expect(start.closest(".c4-dialog-footer"), "an action of the dialog's footer").not.toBeNull();
    start.click();
    expect(views?.dialog.isOpen()).toBe(false);
    expect(page.dialogs.current()?.options.title).toBe("New view");
    const dialog = openDialog(page);
    expect(document.activeElement).toBe(field(dialog, "type"));
    const type = field(dialog, "type") as unknown as HTMLSelectElement;
    expect([...type.options].map((option) => option.textContent)).toEqual([
      "System landscape",
      "System context",
      "Container",
      "Component",
    ]);
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
  it("starts on the first field, names the type in sentence case and the key as code", async () => {
    const page = await mountModeler();
    dialogs(page).showViewSettings();
    const dialog = openDialog(page);
    expect(document.activeElement).toBe(field(dialog, "title"));
    expect(dialog.textContent).toContain("System landscape");
    expect(dialog.querySelector("code.c4-dialog-code")?.textContent).toBe("Landscape");
  });

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
    expect(page.modeler.views.active().key).toBe("SystemContext-bookshop");
    expect(changes).toEqual([
      { view: "SystemContext-bookshop", previous: "Containers", cause: "removed" },
    ]);
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
  it("starts on the first field", async () => {
    const page = await mountModeler();
    dialogs(page).showWorkspaceSettings();
    expect(document.activeElement).toBe(field(openDialog(page), "name"));
  });

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

describe('"Add relationship…"', () => {
  it("writes one relationship to an element of the view, selects it and gives the canvas the focus", async () => {
    const page = await mountModeler();
    dialogs(page).showAddRelationship("customer");
    const dialog = openDialog(page);
    expect(page.dialogs.current()?.options.title).toBe("Add relationship");
    expect(dialog.textContent).toContain("Customer");
    const destination = field(dialog, "destination") as unknown as HTMLSelectElement;
    expect(document.activeElement).toBe(destination);
    expect([...destination.options].map((option) => option.textContent)).toEqual([
      "Bookshop",
      "Payment Provider",
    ]);
    destination.value = "payments";
    destination.dispatchEvent(new Event("change"));
    typeInto(field(dialog, "description"), "Pays with");
    typeInto(field(dialog, "technology"), "Card");
    buttonNamed(dialog, "Add relationship").click();

    expect(page.dialogs.current()).toBeUndefined();
    const created = workspaceOf(page.modeler).relationships.find(
      ({ sourceId, destinationId }) => sourceId === "customer" && destinationId === "payments",
    );
    expect(created).toMatchObject({ description: "Pays with", technology: "Card" });
    const selected = service<Selection>(page.modeler, "selection").get();
    expect(selected.map((element) => element.id)).toEqual([`rel:${created?.canvasKey}`]);
    expect(document.activeElement).toBe(canvasSvg(page.modeler));
    service<CommandStack>(page.modeler, "commandStack").undo();
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("shows a refused relationship at its field, not as the app's toast", async () => {
    const page = await mountModeler();
    const atTheApp = refusalsAtTheApp(page);
    dialogs(page).showAddRelationship("bookshop");
    const dialog = openDialog(page);
    const destination = field(dialog, "destination") as unknown as HTMLSelectElement;
    destination.value = "payments";
    destination.dispatchEvent(new Event("change"));
    const description = field(dialog, "description");
    typeInto(description, "Charges cards");
    buttonNamed(dialog, "Add relationship").click();
    expect(page.dialogs.current()).toBeDefined();
    expect(description.getAttribute("aria-invalid")).toBe("true");
    const message = document.getElementById(description.getAttribute("aria-describedby") ?? "");
    expect(message?.textContent).toContain("already connected");
    expect(atTheApp).toEqual([]);
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("says so when no other element of the view can take one", async () => {
    const page = await mountModeler(SINGLE);
    dialogs(page).showAddRelationship("customer");
    const dialog = openDialog(page);
    const destination = field(dialog, "destination");
    expect((destination as unknown as HTMLSelectElement).disabled).toBe(true);
    expect(getComputedStyle(destination).cursor).toBe("not-allowed");
    expect(dialog.textContent).toContain("No other element in this view to connect to.");
    expect(buttonNamed(dialog, "Add relationship").disabled).toBe(true);
  });

  it("draws its destination like the fields beside it, as a choice that takes input", async () => {
    const page = await mountModeler();
    dialogs(page).showAddRelationship("customer");
    const dialog = openDialog(page);
    const destination = getComputedStyle(field(dialog, "destination"));
    const description = getComputedStyle(field(dialog, "description"));
    expect(destination.color, "a select matches :read-only, yet takes input").toBe(
      description.color,
    );
    expect(destination.borderColor).toBe(description.borderColor);
    expect(destination.cursor).toBe("pointer");
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
