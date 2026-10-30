import { DEFAULT_MAP_TITLE } from "@miragon/wardley-schema-model";
import type { Modeler } from "../Modeler.js";
import { isImeCompositionKey } from "../label-editing/index.js";
import { READ_ONLY_CHANGED } from "../read-only/index.js";
import { createMapDialog, dialogButton, type DialogChrome, type MapDialog } from "./dialog.js";
import { element, uniqueId } from "./dom.js";

export type TitleDialogChrome = DialogChrome;
export type TitleDialog = MapDialog;

function currentTitle(modeler: Modeler): string {
  return modeler.exportMap().config.title ?? DEFAULT_MAP_TITLE;
}

/**
 * The "Map title…" dialog of the Model group: guide §5.4 keeps form fields out of the menu, so the
 * entry opens a dialog (§8) with the title field, Cancel and Apply. Enter applies, Escape and
 * Cancel keep the title; an unchanged title writes nothing, so the map's history gets no empty
 * step. A canvas that turns read-only closes it without writing, as it locks the entry.
 */
export function createTitleDialog(chrome: TitleDialogChrome, modeler: Modeler): TitleDialog {
  const field = element("input", "wardley-field-input");
  field.id = uniqueId("wardley-title-field");
  field.type = "text";
  field.autocomplete = "off";
  field.spellcheck = false;
  field.maxLength = 120;
  // showModal() focuses the first focusable element, which would be the header's Close button.
  field.autofocus = true;
  // The form submits on the browser's Enter and the dialog closes on its Escape; while an input
  // method composes, these keys confirm or cancel its candidate instead.
  field.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === "Escape") && isImeCompositionKey(event)) {
      event.preventDefault();
    }
  });

  const dialog = createMapDialog(chrome, {
    className: "wardley-title-dialog",
    title: "Map title",
    beforeOpen() {
      field.value = currentTitle(modeler);
    },
    afterOpen() {
      field.select();
    },
    content(close) {
      const form = element("form", "wardley-dialog-form");
      form.noValidate = true;
      const body = element("div", "wardley-dialog-body");
      const wrapper = element("div", "wardley-field");
      const label = element("label", "wardley-field-label", "Title");
      label.htmlFor = field.id;
      wrapper.append(label, field);
      body.append(wrapper);
      const footer = element("div", "wardley-dialog-footer");
      const cancel = dialogButton("Cancel", "secondary");
      cancel.addEventListener("click", close);
      const apply = dialogButton("Apply", "primary");
      apply.type = "submit";
      footer.append(cancel, apply);
      form.append(body, footer);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = field.value.replace(/\s+/g, " ").trim() || DEFAULT_MAP_TITLE;
        close();
        if (title !== currentTitle(modeler)) modeler.setTitle(title);
      });
      return [form];
    },
  });

  const onReadOnly = (event: unknown) => {
    if ((event as { readOnly?: boolean }).readOnly) dialog.close();
  };
  modeler.on(READ_ONLY_CHANGED, onReadOnly);
  return {
    open: () => dialog.open(),
    isOpen: () => dialog.isOpen(),
    close: () => dialog.close(),
    destroy() {
      modeler.off(READ_ONLY_CHANGED, onReadOnly);
      dialog.destroy();
    },
  };
}
