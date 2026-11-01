import type {
  ElementId,
  ElementKind,
  ModelElement,
  ViewEntry,
  Workspace,
} from "@miragon/c4-schema-model";
import { editAtField } from "../label-editing/fieldRefusal.js";
import { eventBusOf, isLocked, membersOf, workspaceOf } from "./access.js";
import { focusCanvas, openModelerDialog } from "./dialog.js";
import { button, node, uniqueId } from "./dom.js";
import { selectAndReveal } from "./reveal.js";
import type { C4DialogModeler, DialogTarget, OpenedDialog } from "./types.js";

export const ADD_ELEMENT_TITLE = "Add existing element";

/** The kinds a static view shows (SPEC 4.1); containers and components only of its scope. */
function fitsView(workspace: Workspace, view: ViewEntry, element: ModelElement): boolean {
  const base: readonly ElementKind[] = ["person", "softwareSystem", "custom"];
  if (base.includes(element.kind)) return true;
  if (view.scopeId === undefined) return false;
  if (view.type === "container") {
    return element.kind === "container" && element.parentId === view.scopeId;
  }
  if (view.type === "component") {
    const scope = workspace.elements.find((candidate) => candidate.id === view.scopeId);
    if (element.kind === "component") return element.parentId === view.scopeId;
    return element.kind === "container" && element.parentId === scope?.parentId;
  }
  return false;
}

/** The scope and its ancestors are the view's frames, never members to add. */
function framesOf(workspace: Workspace, view: ViewEntry): Set<ElementId> {
  const frames = new Set<ElementId>();
  for (let id = view.scopeId; id !== undefined;) {
    frames.add(id);
    id = workspace.elements.find((candidate) => candidate.id === id)?.parentId;
  }
  return frames;
}

/** The model elements the view type allows and the view does not show yet, in document order. */
export function addableElements(modeler: C4DialogModeler): ModelElement[] {
  const workspace = workspaceOf(modeler);
  const view = modeler.views.active();
  const members = new Set(membersOf(modeler, view).elements);
  const frames = framesOf(workspace, view);
  return workspace.elements.filter(
    (element) =>
      !members.has(element.id) && !frames.has(element.id) && fitsView(workspace, view, element),
  );
}

function matches(element: ModelElement, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return (
    needle === "" ||
    element.name.toLowerCase().includes(needle) ||
    element.id.toLowerCase().includes(needle)
  );
}

/**
 * "Add existing element…" (SPEC 7.1): a searchable list of the elements the view lacks; the
 * checked ones go into the view as one command (`includeInView`), and the canvas selects them and
 * scrolls them into sight, so the user sees where they landed.
 */
export function showAddElementDialog(target: DialogTarget): OpenedDialog {
  const { modeler } = target;
  const checked = new Set<ElementId>();
  let query = "";
  return openModelerDialog(target, {
    title: ADD_ELEMENT_TITLE,
    className: "c4-add-element-dialog",
    render: (body, dialog) => {
      const owner = body.ownerDocument;
      const workspace = workspaceOf(modeler);
      const candidates = addableElements(modeler);
      const locked = isLocked(modeler);
      const form = node(owner, "form", "c4-dialog");
      const fields = node(owner, "fieldset", "c4-form");
      fields.disabled = locked;
      const search = node(owner, "input", "c4-field-control");
      search.type = "search";
      search.value = query;
      search.dataset.field = "search";
      search.setAttribute("aria-label", "Search elements");
      search.placeholder = "Search by name";
      search.autofocus = true;
      const searchField = node(
        owner,
        "label",
        "c4-field",
        node(owner, "span", "c4-field-label", "Search"),
        search,
      );
      const list = node(owner, "div", "c4-dialog-choices");
      list.setAttribute("role", "group");
      list.setAttribute("aria-label", "Elements");
      const error = node(owner, "p", "c4-field-error");
      error.id = uniqueId("c4-add-element-error");
      error.hidden = true;
      error.setAttribute("role", "alert");
      const add = button(owner, "Add to view", "primary", () => undefined);
      add.type = "submit";
      const sync = () => {
        add.disabled = locked || checked.size === 0;
      };
      const fill = () => {
        list.replaceChildren();
        const shown = candidates.filter((element) => matches(element, query));
        if (candidates.length === 0) {
          list.append(
            node(
              owner,
              "p",
              "c4-dialog-text",
              "Every element this view can show is in it already.",
            ),
          );
        } else if (shown.length === 0) {
          list.append(node(owner, "p", "c4-dialog-text", `No element matches “${query.trim()}”.`));
        }
        for (const element of shown) {
          const box = node(owner, "input");
          box.type = "checkbox";
          box.value = element.id;
          box.checked = checked.has(element.id);
          box.addEventListener("change", () => {
            if (box.checked) checked.add(element.id);
            else checked.delete(element.id);
            sync();
          });
          const parent = workspace.elements.find(({ id }) => id === element.parentId);
          list.append(
            node(
              owner,
              "label",
              "c4-field-check",
              box,
              node(
                owner,
                "span",
                "",
                element.name,
                " ",
                node(
                  owner,
                  "span",
                  "c4-dialog-note",
                  parent ? `${kindLabel(element)} in ${parent.name}` : kindLabel(element),
                ),
              ),
            ),
          );
        }
      };
      search.addEventListener("input", () => {
        query = search.value;
        fill();
      });
      fill();
      sync();
      fields.append(searchField, list, error);
      const cancel = button(owner, "Cancel", "secondary", () => dialog.close());
      form.append(fields, node(owner, "div", "c4-dialog-footer", cancel, add));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (locked || checked.size === 0) return;
        const ids = candidates.filter(({ id }) => checked.has(id)).map(({ id }) => id);
        const { outcome, refusal } = editAtField(eventBusOf(modeler), () =>
          modeler.c4.includeInView(ids),
        );
        if (refusal !== undefined || (outcome && !outcome.ok)) {
          error.textContent =
            refusal ?? "Couldn't write this change into the DSL. Edit the text instead.";
          error.hidden = false;
          return;
        }
        dialog.close();
        focusCanvas(target);
        selectAndReveal(modeler.diagram, ids);
      });
      body.replaceChildren(form);
    },
  });
}

const KIND_LABELS: Readonly<Record<ElementKind, string>> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
  custom: "Element",
};

function kindLabel(element: ModelElement): string {
  return KIND_LABELS[element.kind];
}
