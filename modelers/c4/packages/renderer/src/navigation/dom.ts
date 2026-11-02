/*
 * The form parts of the modeler's dialogs and its inspector (guide §8: fields, buttons, errors),
 * plain DOM. The look is in `forms.css`, on the renderer's own classes: the dialogs live in the
 * shell's dialog and the inspector in the shell's panel, outside the canvas container.
 */
import { padIcon } from "../context-pad/icons.js";
import "./forms.css";

let counter = 0;

/** An id unique in the page, for `aria-labelledby` and `aria-describedby`. */
export function uniqueId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function node<K extends keyof HTMLElementTagNameMap>(
  owner: Document,
  tag: K,
  className?: string,
  ...children: readonly (Node | string)[]
): HTMLElementTagNameMap[K] {
  const created = owner.createElement(tag);
  if (className) created.className = className;
  created.append(...children);
  return created;
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function button(
  owner: Document,
  label: string,
  variant: ButtonVariant,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
  const created = node(owner, "button", "c4-button", label);
  created.type = "button";
  created.dataset.variant = variant;
  created.addEventListener("click", onClick);
  return created;
}

/** A destructive action as a ghost (guide §8): Lucide `trash-2` in the danger role, then the label. */
export function destructiveGhostButton(
  owner: Document,
  label: string,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
  const created = button(owner, label, "ghost", onClick);
  created.dataset.danger = "";
  created.insertAdjacentHTML("afterbegin", padIcon("trash-2"));
  return created;
}

export interface TextField {
  readonly root: HTMLElement;
  readonly control: HTMLInputElement | HTMLTextAreaElement;
  showError(message: string): void;
  clearError(): void;
}

export interface TextFieldOptions {
  readonly label: string;
  readonly value: string;
  readonly multiline?: boolean;
  readonly placeholder?: string;
  /** Why the value cannot be edited here; the field shows it and stays read-only. */
  readonly readOnlyReason?: string | undefined;
  /** `data-field` on the control, for focus restore and tests. */
  readonly name: string;
}

/** A labelled input or text area with the guide's error pattern (`aria-invalid`, a message). */
export function textField(owner: Document, options: TextFieldOptions): TextField {
  const root = node(owner, "label", "c4-field");
  const label = node(owner, "span", "c4-field-label", options.label);
  const control = options.multiline
    ? node(owner, "textarea", "c4-field-control")
    : node(owner, "input", "c4-field-control");
  if (control instanceof HTMLInputElement) control.type = "text";
  else control.rows = 3;
  control.value = options.value;
  control.dataset.field = options.name;
  control.spellcheck = false;
  if (options.placeholder) control.placeholder = options.placeholder;
  root.append(label, control);
  if (options.readOnlyReason) {
    control.readOnly = true;
    const note = node(owner, "span", "c4-field-note", options.readOnlyReason);
    note.id = uniqueId("c4-field-note");
    control.setAttribute("aria-describedby", note.id);
    root.append(note);
  }
  let error: HTMLElement | undefined;
  return {
    root,
    control,
    showError(message) {
      if (!error) {
        error = node(owner, "span", "c4-field-error");
        error.id = uniqueId("c4-field-error");
        error.setAttribute("role", "alert");
        root.append(error);
      }
      error.textContent = message;
      control.setAttribute("aria-invalid", "true");
      control.setAttribute("aria-describedby", error.id);
    },
    clearError() {
      if (!error) return;
      error.remove();
      error = undefined;
      control.removeAttribute("aria-invalid");
      control.removeAttribute("aria-describedby");
    },
  };
}

/** A read-only value with its label, as the inspector's Type and the view's key. */
export function valueRow(owner: Document, label: string, value: string): HTMLElement {
  const root = node(owner, "div", "c4-field");
  root.append(
    node(owner, "span", "c4-field-label", label),
    node(owner, "span", "c4-field-value", value),
  );
  return root;
}

/** The click Enter or Space sends to a button: no pointer, `detail` 0. */
export function isKeyboardClick(event: MouseEvent): boolean {
  return event.detail === 0;
}
