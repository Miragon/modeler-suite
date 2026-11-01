import type { EditOutcome } from "@miragon/c4-dsl";
import type { ViewKey } from "@miragon/c4-schema-model";
import { editAtField } from "../label-editing/fieldRefusal.js";
import { elementById, eventBusOf, isLocked, workspaceOf } from "./access.js";
import { confirmDestructive, focusCanvas, openModelerDialog } from "./dialog.js";
import {
  button,
  destructiveGhostButton,
  node,
  textField,
  valueRow,
  type TextField,
} from "./dom.js";
import type { DialogTarget, OpenedDialog } from "./types.js";

export const VIEW_SETTINGS_TITLE = "View settings";
export const WORKSPACE_SETTINGS_TITLE = "Workspace settings";

const TYPE_LABELS: Readonly<Record<string, string>> = {
  systemLandscape: "System Landscape",
  systemContext: "System Context",
  container: "Container",
  component: "Component",
};

const GENERIC_REFUSAL = "Couldn't write this change into the DSL. Edit the text instead.";

interface FormParts {
  readonly form: HTMLFormElement;
  readonly fields: HTMLFieldSetElement;
  readonly footer: HTMLElement;
}

/**
 * A dialog form: the fields, then Cancel and the primary button; Enter in a single-line field
 * saves. Under the read-only lock the fields are disabled and only Cancel acts.
 */
function formParts(
  owner: Document,
  dialog: OpenedDialog,
  locked: boolean,
  primaryLabel: string,
  onSubmit: () => void,
): FormParts {
  const form = node(owner, "form", "c4-dialog");
  const fields = node(owner, "fieldset", "c4-form");
  fields.disabled = locked;
  const cancel = button(owner, "Cancel", "secondary", () => dialog.close());
  const save = button(owner, primaryLabel, "primary", () => undefined);
  save.type = "submit";
  save.disabled = locked;
  const footer = node(owner, "div", "c4-dialog-footer", cancel, save);
  form.append(fields, footer);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!locked) onSubmit();
  });
  return { form, fields, footer };
}

/** Runs the edit; a refusal shows at `field` and keeps the dialog open. */
function commit(
  target: DialogTarget,
  dialog: OpenedDialog,
  field: TextField,
  edit: () => EditOutcome | undefined,
): void {
  field.clearError();
  const { outcome, refusal } = editAtField(eventBusOf(target.modeler), edit);
  if (refusal !== undefined || (outcome && !outcome.ok)) {
    field.showError(refusal ?? GENERIC_REFUSAL);
    field.control.focus();
    return;
  }
  dialog.close();
}

/** `""` clears a value: the statement or positional token goes (SPEC 3.4 `updateView`). */
function cleared(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * "View settings…" (SPEC 7.1): the view's title and description, its key, type and scope
 * read-only, and "Delete view…" for a view that is written in the file.
 */
export function showViewSettingsDialog(
  target: DialogTarget & { readonly view?: ViewKey },
): OpenedDialog {
  const { modeler } = target;
  const entry =
    (target.view === undefined ? undefined : modeler.views.catalog().resolve(target.view)) ??
    modeler.views.active();
  return openModelerDialog(target, {
    title: VIEW_SETTINGS_TITLE,
    className: "c4-view-settings-dialog",
    render: (body, dialog) => {
      const owner = body.ownerDocument;
      const workspace = workspaceOf(modeler);
      const locked = isLocked(modeler);
      const definition = entry.definition;
      const title = textField(owner, {
        label: "Title",
        value: definition?.title ?? "",
        placeholder: entry.title,
        name: "title",
      });
      const description = textField(owner, {
        label: "Description",
        value: definition?.description ?? "",
        multiline: true,
        name: "description",
      });
      const parts = formParts(owner, dialog, locked, "Save", () => {
        const fields: { title?: string | null; description?: string | null } = {};
        const nextTitle = cleared(title.control.value);
        const nextDescription = cleared(description.control.value);
        if (nextTitle !== (definition?.title ?? null)) fields.title = nextTitle;
        if (nextDescription !== (definition?.description ?? null)) {
          fields.description = nextDescription;
        }
        if (Object.keys(fields).length === 0) {
          dialog.close();
          return;
        }
        commit(target, dialog, title, () => modeler.c4.editView(entry.key, fields));
      });
      const scope = entry.scopeId === undefined ? undefined : elementById(workspace, entry.scopeId);
      parts.fields.append(
        title.root,
        description.root,
        valueRow(owner, "Type", TYPE_LABELS[entry.type] ?? entry.type),
        ...(scope ? [valueRow(owner, "Scope", scope.name)] : []),
        valueRow(owner, "Key", entry.key),
      );
      if (entry.state !== "written") {
        parts.fields.append(
          node(owner, "p", "c4-field-note", "Not in the file yet: saving writes the view."),
        );
      } else {
        const remove = destructiveGhostButton(owner, "Delete view…", () => {
          dialog.close();
          void confirmDestructive(
            target,
            {
              title: `Delete the view ${entry.title}?`,
              message:
                "Its layout goes with it. The elements stay in the model and in the other views.",
              confirmLabel: "Delete view",
            },
            () => focusCanvas(target),
          ).then((confirmed) => {
            if (confirmed) modeler.c4.deleteView(entry.key);
          });
        });
        remove.classList.add("c4-dialog-footer-start");
        remove.disabled = locked;
        parts.footer.prepend(remove);
      }
      body.replaceChildren(parts.form);
    },
  });
}

/** "Workspace settings…" (SPEC 7.1): the workspace's name and description. */
export function showWorkspaceSettingsDialog(target: DialogTarget): OpenedDialog {
  const { modeler } = target;
  return openModelerDialog(target, {
    title: WORKSPACE_SETTINGS_TITLE,
    className: "c4-workspace-settings-dialog",
    render: (body, dialog) => {
      const owner = body.ownerDocument;
      const workspace = workspaceOf(modeler);
      const name = textField(owner, { label: "Name", value: workspace.name, name: "name" });
      const description = textField(owner, {
        label: "Description",
        value: workspace.description,
        multiline: true,
        name: "description",
      });
      const parts = formParts(owner, dialog, isLocked(modeler), "Save", () => {
        const fields: { name?: string; description?: string } = {};
        const nextName = name.control.value.trim();
        const nextDescription = description.control.value.trim();
        if (nextName !== workspace.name) fields.name = nextName;
        if (nextDescription !== workspace.description) fields.description = nextDescription;
        if (Object.keys(fields).length === 0) {
          dialog.close();
          return;
        }
        commit(target, dialog, name, () => modeler.c4.editWorkspace(fields));
      });
      parts.fields.append(name.root, description.root);
      body.replaceChildren(parts.form);
    },
  });
}
