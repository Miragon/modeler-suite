import { defaultMessages } from "../core/index.js";
import { centreOverContainer } from "./dialog-centre.js";
import { createElement } from "./element.js";
import { iconElement } from "./icons.js";
import { stopEscapeKeyup } from "./keys.js";

export interface ShellDialogOptions {
  /**
   * Where the `<dialog>` lives: the shell root, or the modeler's element in an embedding host, so
   * the dialog takes its mode (`data-cd-theme`), contrast and language, and its sizes refer to this
   * element's content box (guide §5.1; no size container needed), and never exceed the window
   * minus 32px. It shows in the top layer and is centred over the part of this element that
   * shows, as long as it fits there with 16px around it, and else in the window; its backdrop
   * covers the whole window. It follows every change of the element's size or place and of what
   * shows of it (a scroll, a move, a clipping panel that shrinks) while it is open.
   */
  container: HTMLElement;
  /** The title (21px/600) and the dialog's accessible name. */
  title: string;
  /** Fills the scrolling body once, before the dialog opens: text 16px/1.6, tables and forms 13px. */
  render(body: HTMLElement): void;
  /** `aria-label` of Close; default `defaultMessages.close` ("Close"). */
  closeLabel?: string | undefined;
  /** Classes next to `cd-shell-dialog`, for the dialog's own rules. */
  className?: string | undefined;
  /** `lang` on the `<dialog>`, for a container whose language is not the tool's. */
  lang?: string | undefined;
  /** Runs once the dialog closed and left the DOM, before the focus goes back. */
  onClose?: (() => void) | undefined;
  /**
   * Where the focus goes once the dialog closed when the element that had it before the dialog
   * opened cannot take it again (removed, hidden, inert). Default: wherever the browser puts it.
   */
  focusFallback?: (() => void) | undefined;
}

/** An open dialog of `openShellDialog`; it removes itself from the DOM when it closes. */
export interface ShellDialog {
  isOpen(): boolean;
  /** Closes it as Escape, Close and a click on the backdrop do; a second call does nothing. */
  close(): void;
}

/** The shell's own teardown: closes and removes the dialog without moving the focus. */
export interface OwnedShellDialog extends ShellDialog {
  discard(): void;
}

// Page-global like the shell's mount counter: two shells bundled into one page must not share ids.
const DIALOG_COUNTER = Symbol.for("@miragon/modeler-shell.dialogs");

/** A page-unique id `cd-shell-<name>-<n>`. */
export function uniqueDialogId(name: string): string {
  const scope = globalThis as unknown as Record<symbol, number | undefined>;
  const index = (scope[DIALOG_COUNTER] ?? 0) + 1;
  scope[DIALOG_COUNTER] = index;
  return `cd-shell-${name}-${index}`;
}

const TABBABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "iframe",
  "summary",
  "[tabindex]",
  '[contenteditable]:not([contenteditable="false"])',
].join(", ");

function isShown(element: HTMLElement): boolean {
  if (element.closest("[hidden], [inert]")) return false;
  return (
    typeof element.checkVisibility !== "function" ||
    element.checkVisibility({ visibilityProperty: true })
  );
}

/** A named radio group is one Tab stop, as in the browser: its checked radio, else its first. */
function isRadioGroupStop(element: HTMLElement, candidates: readonly HTMLElement[]): boolean {
  if (!(element instanceof HTMLInputElement) || element.type !== "radio" || element.name === "") {
    return true;
  }
  const group = candidates.filter(
    (other): other is HTMLInputElement =>
      other instanceof HTMLInputElement &&
      other.type === "radio" &&
      other.name === element.name &&
      other.form === element.form,
  );
  return (group.find((radio) => radio.checked) ?? group[0]) === element;
}

/** The dialog's Tab stops in DOM order (no positive `tabindex` in the chrome, guide §5.14). */
function tabStops(dialog: HTMLDialogElement): HTMLElement[] {
  const candidates = [...dialog.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)].filter(
    (element) => element.tabIndex >= 0 && !element.matches(":disabled") && isShown(element),
  );
  return candidates.filter((element) => isRadioGroupStop(element, candidates));
}

/**
 * The stop after (`forward`) or before `from` in DOM order, wrapping at the dialog's ends; from
 * outside the dialog or from the `<dialog>` itself the first or the last stop.
 */
function adjacentStop(
  dialog: HTMLDialogElement,
  stops: readonly HTMLElement[],
  from: Element | null,
  forward: boolean,
): HTMLElement | undefined {
  const inside = from !== null && from !== dialog && dialog.contains(from);
  if (inside && forward) {
    const next = stops.find(
      (stop) => from.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    if (next) return next;
  }
  if (inside && !forward) {
    for (let index = stops.length - 1; index >= 0; index--) {
      const stop = stops[index]!;
      if (from.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_PRECEDING) return stop;
    }
  }
  return forward ? stops[0] : stops.at(-1);
}

/** The focus sits in another open dialog, one opened above this one: its Tab is its own. */
function focusInOtherDialog(dialog: HTMLDialogElement, active: Element | null): boolean {
  const owner = active?.closest("dialog") ?? null;
  return owner !== null && owner !== dialog && owner.open && !dialog.contains(owner);
}

function canTakeFocus(element: HTMLElement | SVGElement): boolean {
  return element.isConnected && (!(element instanceof HTMLElement) || isShown(element));
}

function focusedElement(ownerDocument: Document): HTMLElement | SVGElement | null {
  const active = ownerDocument.activeElement;
  if (!active || active === ownerDocument.body) return null;
  return active instanceof HTMLElement || active instanceof SVGElement ? active : null;
}

function outside(dialog: HTMLDialogElement, event: MouseEvent): boolean {
  const box = dialog.getBoundingClientRect();
  return (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  );
}

/**
 * A dialog of guide §8: a native `<dialog>` opened with `showModal()`, so it lies in the top layer
 * above every island and the page behind it is inert, with a header (title, Close) and a scrolling
 * body, centred over its container (see `ShellDialogOptions.container`). Escape, Close and a click
 * on the backdrop close it; the focus stays inside (Tab and Shift+Tab wrap, also in a VS Code
 * webview, whose Tab would otherwise leave for the workbench) and returns to the element that had
 * it before. The dialog is built on open and removed on close.
 */
export function openOwnedShellDialog(options: ShellDialogOptions): OwnedShellDialog {
  const { container } = options;
  const ownerDocument = container.ownerDocument;
  const opener = focusedElement(ownerDocument);
  const titleId = uniqueDialogId("dialog-title");
  const dialog = createElement(ownerDocument, "dialog", {
    class: options.className ? `cd-shell-dialog ${options.className}` : "cd-shell-dialog",
    "aria-labelledby": titleId,
    lang: options.lang,
  });
  const close = createElement(
    ownerDocument,
    "button",
    {
      type: "button",
      class: "cd-shell-dialog-close",
      "aria-label": options.closeLabel ?? defaultMessages.close,
    },
    iconElement("x"),
  );
  const header = createElement(
    ownerDocument,
    "div",
    { class: "cd-shell-dialog-header" },
    createElement(
      ownerDocument,
      "h2",
      { class: "cd-shell-dialog-title", id: titleId },
      options.title,
    ),
    close,
  );
  const body = createElement(ownerDocument, "div", { class: "cd-shell-dialog-body" });
  options.render(body);
  dialog.append(header, body);

  let finished = false;
  let stopCentring: (() => void) | undefined;
  const ResizeObserverClass = globalThis.ResizeObserver;

  /** A body that scrolls is a Tab stop, so the keyboard can scroll it (in every engine alike). */
  function updateScrollStop(): void {
    const scrolls = body.scrollHeight > body.clientHeight + 1;
    if (scrolls === body.hasAttribute("tabindex")) return;
    if (scrolls) {
      body.setAttribute("tabindex", "0");
      return;
    }
    const bodyHadFocus = ownerDocument.activeElement === body;
    body.removeAttribute("tabindex");
    // The browser would drop the focus of an element that is no Tab stop any more to <body>.
    if (bodyHadFocus) adjacentStop(dialog, tabStops(dialog), body, true)?.focus();
  }
  const resizeObserver = ResizeObserverClass
    ? new ResizeObserverClass(() => updateScrollStop())
    : undefined;

  /**
   * Moves the focus between the dialog's stops itself: the browser's Tab would leave the dialog at
   * its ends, and WebKit's Shift+Tab skips Close and lands on the `<dialog>`.
   */
  function onTab(event: KeyboardEvent): void {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.defaultPrevented || !dialog.open) return;
    const active = ownerDocument.activeElement;
    if (focusInOtherDialog(dialog, active)) return;
    const target = adjacentStop(dialog, tabStops(dialog), active, !event.shiftKey);
    if (!target) {
      event.preventDefault();
      return;
    }
    target.focus();
    // Behind a newer modal dialog this one is inert and takes no focus: the browser's Tab goes on.
    if (ownerDocument.activeElement === target) event.preventDefault();
  }

  // In the capture phase, so a listener that stops the key on its way up (the shell's own in the
  // IDE host, a host page's) cannot keep it from here.
  function onEscape(event: KeyboardEvent): void {
    if (event.key === "Escape" && dialog.open) stopEscapeKeyup(ownerDocument);
  }

  let pressedOnBackdrop = false;
  const onPointerDown = (event: PointerEvent): void => {
    pressedOnBackdrop = event.target === dialog && outside(dialog, event);
  };
  // A press that started on the panel (selecting text, then releasing outside) is no backdrop click.
  const onClick = (event: MouseEvent): void => {
    const onBackdrop = pressedOnBackdrop && event.target === dialog && outside(dialog, event);
    pressedOnBackdrop = false;
    if (onBackdrop) dialog.close();
  };

  function finish(restoreFocus: boolean): void {
    if (finished) return;
    finished = true;
    ownerDocument.removeEventListener("keydown", onTab);
    ownerDocument.removeEventListener("keydown", onEscape, true);
    stopCentring?.();
    resizeObserver?.disconnect();
    if (dialog.open) dialog.close();
    dialog.remove();
    options.onClose?.();
    if (!restoreFocus) return;
    if (opener && canTakeFocus(opener)) opener.focus({ preventScroll: true });
    if (!opener || ownerDocument.activeElement !== opener) options.focusFallback?.();
  }

  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("pointerdown", onPointerDown);
  dialog.addEventListener("click", onClick);
  dialog.addEventListener("close", () => finish(true));
  container.append(dialog);
  try {
    dialog.showModal();
  } catch (error) {
    dialog.remove();
    throw error;
  }
  stopCentring = centreOverContainer(dialog, container);
  ownerDocument.addEventListener("keydown", onTab);
  ownerDocument.addEventListener("keydown", onEscape, true);
  resizeObserver?.observe(body);
  updateScrollStop();

  return {
    isOpen: () => !finished && dialog.open,
    close: () => finish(true),
    discard: () => finish(false),
  };
}

/**
 * Opens a dialog of guide §8 in `options.container`, with or without a mounted shell (an embedding
 * host such as designIQ): see `openOwnedShellDialog`. Load `@miragon/modeler-shell/shell.css`
 * (after the tokens) for its look.
 */
export function openShellDialog(options: ShellDialogOptions): ShellDialog {
  const { isOpen, close } = openOwnedShellDialog(options);
  return { isOpen, close };
}
