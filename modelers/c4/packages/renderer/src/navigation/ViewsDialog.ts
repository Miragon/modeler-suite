import type {
  ElementId,
  StaticViewType,
  ViewEntry,
  ViewType,
  Workspace,
} from "@miragon/c4-schema-model";
import { editAtField } from "../label-editing/fieldRefusal.js";
import { elementById, eventBusOf, isLocked, workspaceOf } from "./access.js";
import { focusCanvas, openModelerDialog } from "./dialog.js";
import { button, node, textField, uniqueId } from "./dom.js";
import type { DialogTarget, OpenedDialog } from "./types.js";

export const VIEWS_DIALOG_TITLE = "Views";

const EDITABLE_TYPES: readonly { readonly type: StaticViewType; readonly label: string }[] = [
  { type: "systemLandscape", label: "System Landscape" },
  { type: "systemContext", label: "System Context" },
  { type: "container", label: "Container" },
  { type: "component", label: "Component" },
];

const OTHER_TYPE_LABELS: Readonly<Record<Exclude<ViewType, StaticViewType>, string>> = {
  dynamic: "Dynamic",
  deployment: "Deployment",
  filtered: "Filtered",
  custom: "Custom",
  image: "Image",
};

function isStatic(type: ViewType): type is StaticViewType {
  return EDITABLE_TYPES.some((candidate) => candidate.type === type);
}

/** The elements a view of `type` can be scoped on (SPEC 4.6): systems, or containers. */
function scopesFor(workspace: Workspace, type: StaticViewType) {
  if (type === "systemLandscape") return [];
  const kind = type === "component" ? "container" : "softwareSystem";
  return workspace.elements
    .filter((element) => element.kind === kind)
    .map((element) => {
      const parent =
        element.parentId === undefined ? undefined : elementById(workspace, element.parentId);
      return { id: element.id, label: parent ? `${element.name} (${parent.name})` : element.name };
    });
}

interface ViewsState {
  /** The new-view form is open, with what the user chose so far. */
  form: { type: StaticViewType; scopeId: ElementId | undefined; title: string } | undefined;
}

/**
 * The "Views…" dialog (SPEC 7.1): one table per editable view type with title, scope and key, the
 * view on the canvas marked; a row shows its view and closes the dialog. Then the views only
 * Structurizr shows, then "New view…". Navigating writes nothing, so it works on a read-only
 * canvas too; creating a view is locked there.
 */
export function showViewsDialog(target: DialogTarget): OpenedDialog {
  const state: ViewsState = { form: undefined };
  return openModelerDialog(target, {
    title: VIEWS_DIALOG_TITLE,
    className: "c4-views-dialog",
    follows: true,
    render: (body, dialog) => renderViews(body, dialog, target, state),
  });
}

function renderViews(
  body: HTMLElement,
  dialog: OpenedDialog,
  target: DialogTarget,
  state: ViewsState,
): void {
  const owner = body.ownerDocument;
  const focused = owner.activeElement instanceof HTMLElement ? owner.activeElement : undefined;
  const focusKey = focused && body.contains(focused) ? focused.dataset.focusKey : undefined;
  const { modeler } = target;
  const workspace = workspaceOf(modeler);
  const catalog = modeler.views.catalog();
  const active = modeler.views.active();
  const entries = catalog.list();
  const content = node(owner, "div", "c4-dialog c4-views");

  // The dialog is modal: it closes first, so the canvas shows the view and takes the keys, also
  // after Enter or Space on the row.
  const show = (entry: ViewEntry) => {
    dialog.close();
    modeler.views.open(entry.key, { cause: "user" });
    focusCanvas(target);
  };

  for (const { type, label } of EDITABLE_TYPES) {
    const ofType = entries.filter((entry) => entry.type === type);
    if (ofType.length === 0) continue;
    content.append(viewTable(owner, label, ofType, active, workspace, show));
  }
  const others = entries.filter((entry) => !isStatic(entry.type));
  if (others.length > 0) content.append(otherViewsTable(owner, others));
  content.append(
    newViewSection(owner, target, state, dialog, () => renderViews(body, dialog, target, state)),
  );
  body.replaceChildren(content);
  if (focusKey !== undefined) {
    content.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
  }
}

function section(owner: Document, title: string): { root: HTMLElement; headingId: string } {
  const root = node(owner, "section", "c4-dialog-section");
  const heading = node(owner, "h3", "c4-dialog-heading", title);
  heading.id = uniqueId("c4-views-heading");
  root.append(heading);
  return { root, headingId: heading.id };
}

function headerRow(owner: Document, titles: readonly string[]): HTMLTableSectionElement {
  const head = owner.createElement("thead");
  const row = head.insertRow();
  for (const title of titles) {
    const cell = node(owner, "th", "", title);
    cell.scope = "col";
    row.append(cell);
  }
  return head;
}

function viewTable(
  owner: Document,
  label: string,
  entries: readonly ViewEntry[],
  active: ViewEntry,
  workspace: Workspace,
  show: (entry: ViewEntry) => void,
): HTMLElement {
  const { root, headingId } = section(owner, label);
  const scoped = entries.some((entry) => entry.scopeId !== undefined);
  const table = node(owner, "table", "c4-dialog-table");
  table.setAttribute("aria-labelledby", headingId);
  table.append(headerRow(owner, scoped ? ["Title", "Scope", "Key"] : ["Title", "Key"]));
  const rows = table.createTBody();
  for (const entry of entries) {
    const row = rows.insertRow();
    const open = node(owner, "button", "c4-dialog-row", entry.title);
    open.type = "button";
    open.dataset.view = entry.key;
    open.dataset.focusKey = `view:${entry.key}`;
    if (entry.key === active.key) open.setAttribute("aria-current", "true");
    const note = noteOf(entry);
    if (note) open.append(node(owner, "span", "c4-dialog-note", note));
    open.addEventListener("click", () => show(entry));
    row.append(node(owner, "td", "", open));
    if (scoped) {
      const scope = entry.scopeId === undefined ? undefined : elementById(workspace, entry.scopeId);
      row.append(node(owner, "td", "", scope?.name ?? ""));
    }
    row.append(node(owner, "td", "", node(owner, "code", "c4-dialog-code", entry.key)));
  }
  root.append(table);
  return root;
}

function noteOf(entry: ViewEntry): string | undefined {
  if (entry.state !== "written") return "Not in the file yet";
  if (!entry.editable) return "Read-only: it uses an expression the modeler can't show";
  return undefined;
}

function otherViewsTable(owner: Document, entries: readonly ViewEntry[]): HTMLElement {
  const { root, headingId } = section(owner, "Other views");
  const table = node(owner, "table", "c4-dialog-table");
  table.setAttribute("aria-labelledby", headingId);
  table.append(headerRow(owner, ["Type", "Key", ""]));
  const rows = table.createTBody();
  for (const entry of entries) {
    const row = rows.insertRow();
    row.dataset.view = entry.key;
    const type = isStatic(entry.type) ? entry.type : OTHER_TYPE_LABELS[entry.type];
    row.append(
      node(owner, "td", "", type),
      node(owner, "td", "", node(owner, "code", "c4-dialog-code", entry.key)),
      node(owner, "td", "c4-dialog-note", "Shown in Structurizr only"),
    );
  }
  root.append(table);
  return root;
}

function newViewSection(
  owner: Document,
  target: DialogTarget,
  state: ViewsState,
  dialog: OpenedDialog,
  redraw: () => void,
): HTMLElement {
  const { modeler } = target;
  const { root } = section(owner, "New view");
  const locked = isLocked(modeler);
  if (!state.form) {
    const start = button(owner, "New view…", "secondary", () => {
      state.form = { type: "systemContext", scopeId: undefined, title: "" };
      redraw();
      root.ownerDocument.querySelector<HTMLElement>('[data-focus-key="new-view:type"]')?.focus();
    });
    start.dataset.focusKey = "new-view:start";
    start.disabled = locked;
    root.append(start);
    if (locked) root.append(node(owner, "span", "c4-field-note", "The file is read-only."));
    return root;
  }
  const form = state.form;
  const workspace = workspaceOf(modeler);
  const scopes = scopesFor(workspace, form.type);
  if (form.scopeId === undefined || !scopes.some((scope) => scope.id === form.scopeId)) {
    form.scopeId = scopes[0]?.id;
  }
  const fields = node(owner, "form", "c4-form");
  const typeField = node(owner, "label", "c4-field", node(owner, "span", "c4-field-label", "Type"));
  const typeSelect = node(owner, "select", "c4-field-control");
  typeSelect.dataset.focusKey = "new-view:type";
  typeSelect.dataset.field = "type";
  for (const { type, label } of EDITABLE_TYPES) {
    const option = node(owner, "option", "", label);
    option.value = type;
    option.selected = type === form.type;
    typeSelect.append(option);
  }
  typeSelect.addEventListener("change", () => {
    form.type = typeSelect.value as StaticViewType;
    redraw();
  });
  typeField.append(typeSelect);
  fields.append(typeField);

  let scopeSelect: HTMLSelectElement | undefined;
  if (form.type !== "systemLandscape") {
    const scopeField = node(
      owner,
      "label",
      "c4-field",
      node(owner, "span", "c4-field-label", "Scope"),
    );
    scopeSelect = node(owner, "select", "c4-field-control");
    scopeSelect.dataset.focusKey = "new-view:scope";
    scopeSelect.dataset.field = "scope";
    for (const scope of scopes) {
      const option = node(owner, "option", "", scope.label);
      option.value = scope.id;
      option.selected = scope.id === form.scopeId;
      scopeSelect.append(option);
    }
    const select = scopeSelect;
    select.addEventListener("change", () => {
      form.scopeId = select.value;
    });
    scopeField.append(select);
    if (scopes.length === 0) {
      select.disabled = true;
      scopeField.append(
        node(
          owner,
          "span",
          "c4-field-note",
          form.type === "component" ? "Add a container first." : "Add a software system first.",
        ),
      );
    }
    fields.append(scopeField);
  }
  const title = textField(owner, {
    label: "Title (optional)",
    value: form.title,
    name: "title",
  });
  title.control.dataset.focusKey = "new-view:title";
  title.control.addEventListener("input", () => {
    form.title = title.control.value;
  });
  fields.append(title.root);

  const cancel = button(owner, "Cancel", "secondary", () => {
    state.form = undefined;
    redraw();
    root.ownerDocument.querySelector<HTMLElement>('[data-focus-key="new-view:start"]')?.focus();
  });
  const create = button(owner, "Create view", "primary", () => undefined);
  create.type = "submit";
  create.disabled = locked || (form.type !== "systemLandscape" && scopes.length === 0);
  create.dataset.focusKey = "new-view:create";
  fields.append(node(owner, "div", "c4-dialog-footer", cancel, create));
  fields.addEventListener("submit", (event) => {
    event.preventDefault();
    if (create.disabled) return;
    const scopeId = form.type === "systemLandscape" ? undefined : form.scopeId;
    const trimmed = form.title.trim();
    const { outcome, refusal } = editAtField(eventBusOf(modeler), () =>
      modeler.c4.createView(form.type, scopeId, trimmed === "" ? undefined : trimmed),
    );
    if (refusal !== undefined || !outcome?.ok) {
      title.showError(refusal ?? "Couldn't write this view into the DSL. Edit the text instead.");
      return;
    }
    dialog.close();
    focusCanvas(target);
  });
  root.append(fields);
  return root;
}
