/** What a dialog of guide §8 takes to open: the shell's `ShellDialogOptions`, structurally. */
export interface ChromeDialogOptions {
  readonly container: HTMLElement;
  readonly title: string;
  readonly className: string;
  render(body: HTMLElement): void;
  onClose?(): void;
  focusFallback?(): void;
}

/** An open dialog: the shell's `ShellDialog`, structurally. */
export interface ChromeDialog {
  isOpen(): boolean;
  close(): void;
}

/**
 * Where the dialogs open: `{ container: shell.root, openDialog: openShellDialog }` with a mounted
 * shell, the modeler's element in an embedding host without one.
 */
export interface DialogChrome {
  readonly container: HTMLElement;
  openDialog(options: ChromeDialogOptions): ChromeDialog;
  /** Where the focus goes when the dialog closes and its opener is gone: the canvas. */
  focusFallback?(): void;
}

let fieldCount = 0;

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

export function labelled(label: string, control: HTMLInputElement): HTMLElement {
  fieldCount += 1;
  control.id = `bmc-dialog-field-${fieldCount}`;
  const row = element("div", "bmc-dialog-row");
  const caption = element("label", "bmc-dialog-label", label);
  caption.htmlFor = control.id;
  row.append(caption, control);
  return row;
}

export function textField(value: string | undefined): HTMLInputElement {
  const field = element("input", "bmc-dialog-input");
  field.type = "text";
  field.autocomplete = "off";
  field.value = value ?? "";
  return field;
}

/** A form with Cancel and Apply (guide §8): Enter applies, Escape and Cancel close. */
export function dialogForm(
  fields: HTMLElement[],
  close: () => void,
  apply: () => void,
): HTMLFormElement {
  const form = element("form", "bmc-dialog-form");
  form.noValidate = true;
  const footer = element("div", "bmc-dialog-footer");
  const cancel = element("button", "bmc-dialog-button", "Cancel");
  cancel.type = "button";
  cancel.dataset.variant = "secondary";
  cancel.addEventListener("click", close);
  const submit = element("button", "bmc-dialog-button", "Apply");
  submit.type = "submit";
  submit.dataset.variant = "primary";
  footer.append(cancel, submit);
  form.append(...fields, footer);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    close();
    apply();
  });
  return form;
}
