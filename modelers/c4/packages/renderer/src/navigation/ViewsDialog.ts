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
export const NEW_VIEW_TITLE = "New view";

export const VIEW_TYPE_LABELS: Readonly<Record<StaticViewType, string>> = {
  systemLandscape: "System landscape",
  systemContext: "System context",
  container: "Container",
  component: "Component",
};

const EDITABLE_TYPES: readonly StaticViewType[] = [
  "systemLandscape",
  "systemContext",
  "container",
  "component",
];

const OTHER_TYPE_LABELS: Readonly<Record<Exclude<ViewType, StaticViewType>, string>> = {
  dynamic: "Dynamic",
  deployment: "Deployment",
  filtered: "Filtered",
  custom: "Custom",
  image: "Image",
};

function isStatic(type: ViewType): type is StaticViewType {
  return (EDITABLE_TYPES as readonly ViewType[]).includes(type);
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

/** Restores the focus a redraw took, by the `data-focus-key` the focused control had. */
function redrawKeepingFocus(body: HTMLElement, draw: () => HTMLElement): void {
  const owner = body.ownerDocument;
  const focused = owner.activeElement instanceof HTMLElement ? owner.activeElement : undefined;
  const focusKey = focused && body.contains(focused) ? focused.dataset.focusKey : undefined;
  const content = draw();
  body.replaceChildren(content);
  if (focusKey !== undefined) {
    content.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
  }
}

/**
 * The "Views…" dialog (SPEC 7.1): one table per editable view type with title, scope and key on
 * one set of columns, the view on the canvas marked; a row shows its view and closes the dialog.
 * Then the views only Structurizr shows, and "New view…" in the footer. Navigating writes
 * nothing, so it works on a read-only canvas too; creating a view is locked there.
 */
export function showViewsDialog(
  target: DialogTarget,
  options: ViewsDialogOptions = {},
): OpenedDialog {
  const newView = options.onNewView ?? (() => showNewViewDialog(target));
  return openModelerDialog(target, {
    title: VIEWS_DIALOG_TITLE,
    className: "c4-views-dialog",
    follows: true,
    render: (body, dialog) =>
      redrawKeepingFocus(body, () => renderViews(dialog, target, body, newView)),
  });
}

export interface ViewsDialogOptions {
  /** Opens "New view…" once the views dialog has closed; `c4Dialogs` keeps it the one dialog open. */
  readonly onNewView?: () => void;
}

function renderViews(
  dialog: OpenedDialog,
  target: DialogTarget,
  body: HTMLElement,
  newView: () => void,
): HTMLElement {
  const owner = body.ownerDocument;
  const { modeler } = target;
  const workspace = workspaceOf(modeler);
  const active = modeler.views.active();
  const entries = modeler.views.catalog().list();
  const content = node(owner, "div", "c4-dialog c4-views");

  // The dialog is modal: it closes first, so the canvas shows the view and takes the keys, also
  // after Enter or Space on the row.
  const show = (entry: ViewEntry) => {
    dialog.close();
    modeler.views.open(entry.key, { cause: "user" });
    focusCanvas(target);
  };

  for (const type of EDITABLE_TYPES) {
    const ofType = entries.filter((entry) => entry.type === type);
    if (ofType.length === 0) continue;
    content.append(viewTable(owner, VIEW_TYPE_LABELS[type], ofType, active, workspace, show));
  }
  const others = entries.filter((entry) => !isStatic(entry.type));
  if (others.length > 0) content.append(otherViewsTable(owner, others, workspace));
  content.append(footer(owner, target, dialog, newView));
  return content;
}

function section(owner: Document, title: string): { root: HTMLElement; headingId: string } {
  const root = node(owner, "section", "c4-dialog-section");
  const heading = node(owner, "h3", "c4-dialog-heading", title);
  heading.id = uniqueId("c4-views-heading");
  root.append(heading);
  return { root, headingId: heading.id };
}

/** The same three columns in every table, so titles, scopes and keys line up from one to the next. */
function viewsTable(owner: Document, headingId: string): HTMLTableElement {
  const table = node(owner, "table", "c4-dialog-table c4-views-table");
  table.setAttribute("aria-labelledby", headingId);
  const columns = node(owner, "colgroup");
  for (const name of ["title", "scope", "key"]) {
    columns.append(node(owner, "col", `c4-views-column-${name}`));
  }
  table.append(columns);
  return table;
}

function headerRow(
  owner: Document,
  cells: readonly { readonly title: string; readonly span?: number }[],
): HTMLTableSectionElement {
  const head = owner.createElement("thead");
  const row = head.insertRow();
  for (const { title, span } of cells) {
    const cell = node(owner, "th", "", title);
    cell.scope = "col";
    if (span !== undefined) cell.colSpan = span;
    row.append(cell);
  }
  return head;
}

/** A key on one line, cut with an ellipsis where the column ends; the whole key is its tooltip. */
function keyCell(owner: Document, key: string): HTMLTableCellElement {
  const code = node(owner, "code", "c4-dialog-code", key);
  code.title = key;
  return node(owner, "td", "c4-views-key", code);
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
  const table = viewsTable(owner, headingId);
  table.append(
    headerRow(
      owner,
      scoped
        ? [{ title: "Title" }, { title: "Scope" }, { title: "Key" }]
        : [{ title: "Title", span: 2 }, { title: "Key" }],
    ),
  );
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
    const titleCell = node(owner, "td", "", open);
    if (!scoped) titleCell.colSpan = 2;
    row.append(titleCell);
    if (scoped) {
      const scope = entry.scopeId === undefined ? undefined : elementById(workspace, entry.scopeId);
      row.append(node(owner, "td", "c4-views-value", scope?.name ?? ""));
    }
    row.append(keyCell(owner, entry.key));
  }
  root.append(table);
  return root;
}

function noteOf(entry: ViewEntry): string | undefined {
  if (entry.state !== "written") return "Not in the file yet";
  if (!entry.editable) return "Read-only: it uses an expression the modeler can't show";
  return undefined;
}

function otherViewsTable(
  owner: Document,
  entries: readonly ViewEntry[],
  workspace: Workspace,
): HTMLElement {
  const { root, headingId } = section(owner, "Other views");
  const table = viewsTable(owner, headingId);
  table.append(headerRow(owner, [{ title: "Title" }, { title: "Type" }, { title: "Key" }]));
  const rows = table.createTBody();
  for (const entry of entries) {
    const row = rows.insertRow();
    row.dataset.view = entry.key;
    const scope = entry.scopeId === undefined ? undefined : elementById(workspace, entry.scopeId);
    const type = isStatic(entry.type)
      ? VIEW_TYPE_LABELS[entry.type]
      : OTHER_TYPE_LABELS[entry.type];
    row.append(
      node(
        owner,
        "td",
        "c4-views-value",
        node(owner, "span", "c4-views-title", entry.title || scope?.name || entry.key),
        node(owner, "span", "c4-dialog-note", "Shown in Structurizr only"),
      ),
      node(owner, "td", "c4-views-value", type),
      keyCell(owner, entry.key),
    );
  }
  root.append(table);
  return root;
}

function footer(
  owner: Document,
  target: DialogTarget,
  dialog: OpenedDialog,
  newView: () => void,
): HTMLElement {
  const locked = isLocked(target.modeler);
  const start = button(owner, `${NEW_VIEW_TITLE}…`, "secondary", () => {
    dialog.close();
    newView();
  });
  start.dataset.focusKey = "new-view";
  start.disabled = locked;
  const parts: HTMLElement[] = [];
  if (locked) {
    const note = node(
      owner,
      "span",
      "c4-field-note c4-dialog-footer-start",
      "The file is read-only.",
    );
    note.id = uniqueId("c4-views-locked");
    start.setAttribute("aria-describedby", note.id);
    parts.push(note);
  }
  return node(owner, "div", "c4-dialog-footer", ...parts, start);
}

interface NewViewForm {
  type: StaticViewType;
  scopeId: ElementId | undefined;
  title: string;
}

/**
 * "New view…" (SPEC 7.1): the type, the scope it needs and an optional title; "Create view"
 * writes the view as one command and shows it. It starts on the type.
 */
export function showNewViewDialog(target: DialogTarget): OpenedDialog {
  const form: NewViewForm = { type: "systemContext", scopeId: undefined, title: "" };
  return openModelerDialog(target, {
    title: NEW_VIEW_TITLE,
    className: "c4-new-view-dialog",
    follows: true,
    render: (body, dialog) => {
      const redraw = () =>
        redrawKeepingFocus(body, () => renderNewView(body, dialog, target, form, redraw));
      redraw();
    },
  });
}

function renderNewView(
  body: HTMLElement,
  dialog: OpenedDialog,
  target: DialogTarget,
  form: NewViewForm,
  redraw: () => void,
): HTMLElement {
  const owner = body.ownerDocument;
  const { modeler } = target;
  const locked = isLocked(modeler);
  const workspace = workspaceOf(modeler);
  const scopes = scopesFor(workspace, form.type);
  if (form.scopeId === undefined || !scopes.some((scope) => scope.id === form.scopeId)) {
    form.scopeId = scopes[0]?.id;
  }
  const root = node(owner, "form", "c4-dialog");
  const fields = node(owner, "fieldset", "c4-form");
  fields.disabled = locked;

  const typeField = node(owner, "label", "c4-field", node(owner, "span", "c4-field-label", "Type"));
  const typeSelect = node(owner, "select", "c4-field-control");
  typeSelect.dataset.focusKey = "new-view:type";
  typeSelect.dataset.field = "type";
  typeSelect.autofocus = true;
  for (const type of EDITABLE_TYPES) {
    const option = node(owner, "option", "", VIEW_TYPE_LABELS[type]);
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

  if (form.type !== "systemLandscape") {
    const scopeField = node(
      owner,
      "label",
      "c4-field",
      node(owner, "span", "c4-field-label", "Scope"),
    );
    const scopeSelect = node(owner, "select", "c4-field-control");
    scopeSelect.dataset.focusKey = "new-view:scope";
    scopeSelect.dataset.field = "scope";
    for (const scope of scopes) {
      const option = node(owner, "option", "", scope.label);
      option.value = scope.id;
      option.selected = scope.id === form.scopeId;
      scopeSelect.append(option);
    }
    scopeSelect.addEventListener("change", () => {
      form.scopeId = scopeSelect.value;
    });
    scopeField.append(scopeSelect);
    if (scopes.length === 0) {
      scopeSelect.disabled = true;
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
    title.clearError();
  });
  fields.append(title.root);

  const cancel = button(owner, "Cancel", "secondary", () => dialog.close());
  const create = button(owner, "Create view", "primary", () => undefined);
  create.type = "submit";
  create.disabled = locked || (form.type !== "systemLandscape" && scopes.length === 0);
  create.dataset.focusKey = "new-view:create";
  root.append(fields, node(owner, "div", "c4-dialog-footer", cancel, create));
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    if (create.disabled) return;
    const scopeId = form.type === "systemLandscape" ? undefined : form.scopeId;
    const trimmed = form.title.trim();
    const { outcome, refusal } = editAtField(eventBusOf(modeler), () =>
      modeler.c4.createView(form.type, scopeId, trimmed === "" ? undefined : trimmed),
    );
    if (refusal !== undefined || !outcome?.ok) {
      title.showError(refusal ?? "Couldn't write this view into the DSL. Edit the text instead.");
      title.control.focus();
      return;
    }
    dialog.close();
    focusCanvas(target);
  });
  return root;
}
