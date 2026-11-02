import type Canvas from "diagram-js/lib/core/Canvas";
import { DOCUMENT_EVENTS, eventBusOf, serviceOf } from "./access.js";
import { button, node } from "./dom.js";
import type { C4DialogModeler, DialogChrome, DialogTarget, OpenedDialog } from "./types.js";

const CLOSED: OpenedDialog = { isOpen: () => false, close: () => undefined };

export interface ModelerDialogOptions {
  readonly title: string;
  readonly className: string;
  /** Draws the body; runs again after every import, command and view switch while it is open. */
  render(body: HTMLElement, dialog: OpenedDialog): void;
  /** Redraw on document changes; a form that holds the user's input keeps it instead. */
  readonly follows?: boolean;
}

/**
 * Opens one of the modeler's dialogs on the host's chrome (the shell's dialog, guide §8). It
 * closes with the diagram, and the focus falls back to the canvas when the element that had it is
 * gone.
 */
export function openModelerDialog(
  target: DialogTarget,
  options: ModelerDialogOptions,
): OpenedDialog {
  const eventBus = eventBusOf(target.modeler);
  let dialog: OpenedDialog = CLOSED;
  let body: HTMLElement | undefined;
  const redraw = () => {
    if (body && dialog.isOpen()) options.render(body, dialog);
  };
  const close = () => dialog.close();
  const detach = () => {
    if (options.follows) eventBus.off(DOCUMENT_EVENTS, redraw);
    eventBus.off("diagram.destroy", close);
  };
  eventBus.on("diagram.destroy", close);
  if (options.follows) eventBus.on(DOCUMENT_EVENTS, redraw);
  try {
    dialog = target.openDialog({
      container: target.container,
      title: options.title,
      className: options.className,
      render: (rendered) => {
        body = rendered;
        options.render(rendered, {
          isOpen: () => dialog.isOpen(),
          close: () => dialog.close(),
        });
      },
      onClose: detach,
      focusFallback: () => focusCanvas(target),
    });
  } catch (error) {
    detach();
    throw error;
  }
  return dialog;
}

export function focusCanvas(target: Pick<DialogTarget, "modeler">): void {
  serviceOf<Canvas>(target.modeler, "canvas")?.focus();
}

export interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  /** The destructive button: "Delete from model", "Delete view". */
  readonly confirmLabel: string;
}

/**
 * A destructive action's confirmation (guide §8, §9): the message, then Cancel, which has the
 * focus first, and the destructive button. Resolves true only on the destructive button; with a
 * `modeler`, it closes with that diagram and resolves false.
 */
export function confirmDestructive(
  chrome: DialogChrome & { readonly modeler?: C4DialogModeler },
  request: ConfirmRequest,
  focusFallback?: () => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    let confirmed = false;
    let cancel: HTMLButtonElement | undefined;
    const eventBus = chrome.modeler && eventBusOf(chrome.modeler);
    const closeWithDiagram = () => dialog.close();
    const dialog = chrome.openDialog({
      container: chrome.container,
      title: request.title,
      className: "c4-confirm",
      render: (body) => {
        const owner = body.ownerDocument;
        cancel = button(owner, "Cancel", "secondary", () => dialog.close());
        cancel.autofocus = true;
        const confirm = button(owner, request.confirmLabel, "danger", () => {
          confirmed = true;
          dialog.close();
        });
        body.replaceChildren(
          node(
            owner,
            "div",
            "c4-dialog",
            node(owner, "p", "c4-dialog-text", request.message),
            node(owner, "div", "c4-dialog-footer", cancel, confirm),
          ),
        );
      },
      onClose: () => {
        eventBus?.off("diagram.destroy", closeWithDiagram);
        resolve(confirmed);
      },
      ...(focusFallback ? { focusFallback } : {}),
    });
    eventBus?.on("diagram.destroy", closeWithDiagram);
    cancel?.focus();
  });
}
