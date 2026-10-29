import {
  MAX_TOASTS,
  REDUCED_MOTION_CLASS,
  toastLifetime,
  toastToEvict,
  type ShellMessages,
  type ToastAction,
  type ToastRequest,
  type ToastSlot,
} from "../../core/index.js";
import { createElement, isPointerClick } from "../element.js";
import { iconElement } from "../icons.js";
import type { ToastHandle } from "../types.js";

export interface ToasterContext {
  ownerDocument: Document;
  messages: ShellMessages;
  /** `cd-shell-toast-N`: the prefix of the ids the Close buttons' `aria-describedby` names. */
  idPrefix: string;
  /**
   * Where the focus goes after a pointer click on a toast's button, and when a closing toast held it
   * and no other toast can take it.
   */
  focusFallback(): void;
  /** A toast came or went: the widest card, and with it the stack's bottom, may have changed. */
  onChange?: (() => void) | undefined;
}

export interface Toaster {
  /** The stack `<div class="cd-shell-toasts" data-chrome="toasts">`, always in the DOM, empty = no box. */
  readonly element: HTMLElement;
  /**
   * `<div class="cd-shell-live">` with the two live regions, always rendered and visually hidden,
   * outside the stack: `role="status"` (polite) and `role="alert"` (danger). The shell puts it in the
   * root, where it stays in the accessibility tree while the stack is empty or closed.
   */
  readonly announcer: HTMLElement;
  show(request: ToastRequest): ToastHandle;
  /** The stack's `bottom` in px from `toastStackBottom`, set by the shell's layout pass. */
  setBottom(bottom: number): void;
  /** Rendered width of the widest card in the stack; `undefined` while it is empty. */
  widestCard(): number | undefined;
  destroy(): void;
}

/** A paused toast resumes with at least this long, so it does not vanish the moment the pointer leaves. */
export const TOAST_RESUME_MIN_MS = 1500;

/** The leave animation runs `--cd-motion-base` (250ms); the toast goes after this even without `animationend`. */
export const TOAST_LEAVE_FALLBACK_MS = 400;

/** The keyframes of feedback.css the leaving toast runs. */
const LEAVE_ANIMATION = "cd-shell-toast-out";

/**
 * A live region announces a change of its content, not content it was created with; the text
 * arrives this long after the region was emptied, so a repeated toast is announced again too.
 */
export const TOAST_ANNOUNCE_DELAY_MS = 100;

const INERT_HANDLE: ToastHandle = Object.freeze({ dismiss() {} });

interface LiveToast {
  readonly id: number;
  readonly element: HTMLElement;
  readonly closeButton: HTMLButtonElement;
  readonly handle: ToastHandle;
  request: ToastRequest;
  actionButton: HTMLButtonElement | undefined;
  hovered: boolean;
  focused: boolean;
  /** Milliseconds left while paused, the whole lifetime while running; `undefined` never closes. */
  remaining: number | undefined;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * The web host's toast stack (guide §8, §9): centred at `bottom` (`toastStackBottom`),
 * `toastStackWidth` wide, column with 8px gap, newest at the bottom, layer 60
 * (`--cd-shell-ebene-toast`). The stack is a manual popover, re-shown on every toast that arrives
 * while a modal dialog is open, so it stays above a `showModal()` dialog in the top layer.
 *
 * A toast: `<div class="cd-shell-toast" data-status>`, opaque `--cd-ui-flaeche-hoch`, 1px
 * `--cd-ui-linie`, a straight 4px bar and an 8px dot in `--cd-ui-<status>`, radius `md`,
 * `shadow-3`, at least 40px high, padding `4px 4px 4px 16px`, gap 8px, text 13px/1.5
 * `--cd-ui-text`; then the action as a 32px ghost button and Close as a 32 × 32 ghost icon button
 * (Lucide `x`, `aria-label` `messages.close`, `aria-describedby` the toast's text). Slide and fade
 * in from `translateY(8px)` (250ms), out the same way; none under reduced motion.
 *
 * Screen readers hear a toast through the two persistent live regions of `announcer` (guide §8,
 * §12): its text goes to `role="alert"` for danger, else to `role="status"` (`aria-live="polite"`),
 * `TOAST_ANNOUNCE_DELAY_MS` after the region was emptied; a repeat is announced again. The cards
 * themselves carry no live role, so nothing is read twice and re-showing the stack re-announces
 * nothing. The region empties again when its toast closes.
 *
 * Lifetime `toastLifetime(request)`, paused while hovered or focused (and resumed with at least
 * 1.5 s left); a toast with an action never closes by itself. A fourth toast evicts per
 * `toastToEvict`. A request equal to a shown toast (status and text) restarts that toast's timer
 * instead of stacking a second; its action and lifetime become the new request's, so an "Undo"
 * always undoes the latest change. An action click closes the toast, then runs `onSelect`. A
 * closing toast that held the focus hands it to the next toast's Close button, else
 * `focusFallback()`; a pointer click on its Close or action hands it to `focusFallback()`.
 */
export function createToaster(context: ToasterContext): Toaster {
  const { ownerDocument, messages } = context;
  const element = createElement(ownerDocument, "div", {
    class: "cd-shell-toasts",
    "data-chrome": "toasts",
    popover: "manual",
  });
  const liveRegion = (politeness: "polite" | "assertive"): HTMLElement =>
    createElement(ownerDocument, "div", {
      class: "cd-shell-live-region",
      "data-live": politeness,
      role: politeness === "polite" ? "status" : "alert",
      "aria-live": politeness,
      "aria-atomic": "true",
    });
  const politeRegion = liveRegion("polite");
  const assertiveRegion = liveRegion("assertive");
  const announcer = createElement(
    ownerDocument,
    "div",
    { class: "cd-shell-live" },
    politeRegion,
    assertiveRegion,
  );

  /** Shown toasts, oldest first; a leaving toast is no longer one of them. */
  const live: LiveToast[] = [];
  const leaveTimers = new Set<ReturnType<typeof setTimeout>>();
  const announceTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  let lastId = 0;
  let destroyed = false;

  function regionFor(request: ToastRequest): HTMLElement {
    return request.status === "danger" ? assertiveRegion : politeRegion;
  }

  function announce(request: ToastRequest): void {
    const region = regionFor(request);
    clearTimeout(announceTimers.get(region));
    region.textContent = "";
    announceTimers.set(
      region,
      setTimeout(() => {
        announceTimers.delete(region);
        if (!destroyed) region.textContent = request.text;
      }, TOAST_ANNOUNCE_DELAY_MS),
    );
  }

  // A closed toast's text stays out of the regions, where a screen reader's reading cursor finds it.
  function silence(request: ToastRequest): void {
    const region = regionFor(request);
    if (region.textContent === request.text) region.textContent = "";
  }

  function changed(): void {
    if (!destroyed) context.onChange?.();
  }

  function supportsPopover(): boolean {
    return typeof element.showPopover === "function" && typeof element.hidePopover === "function";
  }

  function popoverOpen(): boolean {
    try {
      return element.matches(":popover-open");
    } catch {
      return false;
    }
  }

  function modalOpen(): boolean {
    try {
      return ownerDocument.querySelector(":modal") !== null;
    } catch {
      return true;
    }
  }

  // Showing a popover again puts it on top of the top layer, above a modal dialog opened since. An
  // open stack without a modal dialog stays as it is: hiding it would rebuild it for screen readers.
  function raise(): void {
    if (!supportsPopover() || !element.isConnected) return;
    if (popoverOpen() && !modalOpen()) return;
    const focused = ownerDocument.activeElement as HTMLElement | null;
    const keepFocus = focused && element.contains(focused) ? focused : undefined;
    try {
      element.hidePopover();
      element.showPopover();
    } catch {
      return;
    }
    if (keepFocus && ownerDocument.activeElement !== keepFocus)
      keepFocus.focus({ preventScroll: true });
  }

  function lowerWhenEmpty(): void {
    if (element.childElementCount > 0 || !supportsPopover()) return;
    try {
      element.hidePopover();
    } catch {
      // Not shown (or never connected): nothing to hide.
    }
  }

  function engaged(toast: LiveToast): boolean {
    return toast.hovered || toast.focused;
  }

  function stopTimer(toast: LiveToast): void {
    clearTimeout(toast.timer);
    toast.timer = undefined;
  }

  function runTimer(toast: LiveToast): void {
    stopTimer(toast);
    if (toast.remaining === undefined || engaged(toast)) return;
    toast.startedAt = Date.now();
    toast.timer = setTimeout(() => close(toast), toast.remaining);
  }

  function pause(toast: LiveToast): void {
    if (toast.timer === undefined) return;
    stopTimer(toast);
    if (toast.remaining !== undefined) {
      toast.remaining = Math.max(0, toast.remaining - (Date.now() - toast.startedAt));
    }
  }

  function setEngagement(toast: LiveToast, hovered: boolean, focused: boolean): void {
    if (!live.includes(toast)) return;
    const wasEngaged = engaged(toast);
    toast.hovered = hovered;
    toast.focused = focused;
    if (engaged(toast) === wasEngaged) return;
    if (wasEngaged) {
      if (toast.remaining !== undefined)
        toast.remaining = Math.max(toast.remaining, TOAST_RESUME_MIN_MS);
      runTimer(toast);
    } else {
      pause(toast);
    }
  }

  function reducedMotion(): boolean {
    if (ownerDocument.documentElement.classList.contains(REDUCED_MOTION_CLASS)) return true;
    const view = ownerDocument.defaultView;
    return (
      typeof view?.matchMedia === "function" &&
      view.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function removeElement(toastElement: HTMLElement): void {
    toastElement.remove();
    lowerWhenEmpty();
    changed();
  }

  function leave(toastElement: HTMLElement): void {
    toastElement.setAttribute("data-leaving", "");
    // Nothing on its way out takes a click or the focus.
    toastElement.inert = true;
    if (reducedMotion()) {
      removeElement(toastElement);
      return;
    }
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(fallback);
      leaveTimers.delete(fallback);
      removeElement(toastElement);
    };
    toastElement.addEventListener("animationend", (event) => {
      if (event.target === toastElement && event.animationName === LEAVE_ANIMATION) finish();
    });
    const fallback = setTimeout(finish, TOAST_LEAVE_FALLBACK_MS);
    leaveTimers.add(fallback);
  }

  /**
   * `byPointer`: a click with a pointer on Close or the action, which hands the focus on whether or
   * not the button holds it. WebKit and Firefox on macOS do not focus a clicked button, so it would
   * stay on `<body>`, where the canvas keys do not act (guide §5.8).
   */
  function close(toast: LiveToast, byPointer = false): void {
    const index = live.indexOf(toast);
    if (index < 0) return;
    live.splice(index, 1);
    stopTimer(toast);
    silence(toast.request);
    if (byPointer) {
      context.focusFallback();
    } else if (toast.element.contains(ownerDocument.activeElement)) {
      const next = live[index] ?? live[index - 1];
      if (next) next.closeButton.focus({ preventScroll: true });
      else context.focusFallback();
    }
    leave(toast.element);
  }

  function setAction(toast: LiveToast, action: ToastAction | undefined): void {
    const previous = toast.actionButton;
    const hadFocus = previous !== undefined && ownerDocument.activeElement === previous;
    previous?.remove();
    toast.actionButton = undefined;
    if (action) {
      const button = createElement(
        ownerDocument,
        "button",
        { type: "button", class: "cd-shell-toast-action cd-shell-button", "data-variant": "ghost" },
        action.label,
      );
      button.addEventListener("click", (event) => {
        close(toast, isPointerClick(event));
        action.onSelect();
      });
      toast.closeButton.before(button);
      toast.actionButton = button;
    }
    if (hadFocus) (toast.actionButton ?? toast.closeButton).focus({ preventScroll: true });
  }

  function slotOf(toast: LiveToast): ToastSlot {
    return { id: toast.id, hasAction: toast.request.action !== undefined, engaged: engaged(toast) };
  }

  function render(request: ToastRequest): LiveToast {
    const id = ++lastId;
    const textId = `${context.idPrefix}-${id}`;
    // Three Close buttons in a stack are told apart by the text of their toast.
    const closeButton = createElement(
      ownerDocument,
      "button",
      {
        type: "button",
        class: "cd-shell-toast-close",
        "aria-label": messages.close,
        "aria-describedby": textId,
      },
      iconElement("x"),
    );
    const toastElement = createElement(
      ownerDocument,
      "div",
      { class: "cd-shell-toast", "data-status": request.status },
      createElement(ownerDocument, "span", { class: "cd-shell-toast-dot", "aria-hidden": "true" }),
      createElement(
        ownerDocument,
        "span",
        { class: "cd-shell-toast-text", id: textId },
        request.text,
      ),
      closeButton,
    );
    const toast: LiveToast = {
      id,
      element: toastElement,
      closeButton,
      handle: Object.freeze({ dismiss: () => close(toast) }),
      request,
      actionButton: undefined,
      hovered: false,
      focused: false,
      remaining: toastLifetime(request),
      startedAt: Date.now(),
      timer: undefined,
    };
    setAction(toast, request.action);
    closeButton.addEventListener("click", (event) => close(toast, isPointerClick(event)));
    toastElement.addEventListener("mouseenter", () => setEngagement(toast, true, toast.focused));
    toastElement.addEventListener("mouseleave", () => setEngagement(toast, false, toast.focused));
    toastElement.addEventListener("focusin", () => setEngagement(toast, toast.hovered, true));
    toastElement.addEventListener("focusout", (event) =>
      setEngagement(
        toast,
        toast.hovered,
        toastElement.contains(event.relatedTarget as Node | null),
      ),
    );
    return toast;
  }

  function show(request: ToastRequest): ToastHandle {
    if (destroyed) return INERT_HANDLE;
    const same = live.find(
      (toast) => toast.request.status === request.status && toast.request.text === request.text,
    );
    if (same) {
      same.request = request;
      setAction(same, request.action);
      same.remaining = toastLifetime(request);
      runTimer(same);
      raise();
      announce(request);
      changed();
      return same.handle;
    }
    while (live.length >= MAX_TOASTS) {
      const evictedId = toastToEvict(live.map(slotOf));
      const evicted = live.find((toast) => toast.id === evictedId) ?? live[0];
      if (!evicted) break;
      close(evicted);
    }
    const toast = render(request);
    live.push(toast);
    element.append(toast.element);
    raise();
    runTimer(toast);
    announce(request);
    changed();
    return toast.handle;
  }

  return {
    element,
    announcer,
    show,
    setBottom(bottom) {
      element.style.bottom = `${bottom}px`;
    },
    widestCard() {
      let widest: number | undefined;
      for (const card of element.children) {
        const width = card.getBoundingClientRect().width;
        if (width > 0) widest = Math.max(widest ?? 0, width);
      }
      return widest;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const toast of live.splice(0)) stopTimer(toast);
      for (const timer of leaveTimers) clearTimeout(timer);
      leaveTimers.clear();
      for (const timer of announceTimers.values()) clearTimeout(timer);
      announceTimers.clear();
      element.remove();
      announcer.remove();
    },
  };
}
