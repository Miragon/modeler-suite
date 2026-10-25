import type { ShellMessages } from "../core/index.js";
import { createElement, isPointerClick } from "./element.js";
import { iconElement } from "./icons.js";
import type { TooltipController } from "./tooltip.js";
import type { LegendHandle, LegendOptions } from "./types.js";

export interface LegendController extends LegendHandle {
  /** The start state at mount; never reported through `onToggle`. */
  start(open: boolean): void;
  destroy(): void;
}

export interface LegendContext {
  ownerDocument: Document;
  messages: ShellMessages;
  tooltip: TooltipController;
  titleId: string;
  options: LegendOptions;
  onChange(open: boolean): void;
  /** Where the focus goes when the close button hides the legend under it or a pointer clicks it. */
  focusAfterClose(): void;
}

export function createLegend(context: LegendContext): LegendController {
  const { ownerDocument, messages, tooltip, titleId, options } = context;
  const close = createElement(ownerDocument, "button", {
    type: "button",
    class: "cd-shell-legend-close",
    "aria-label": messages.closeLegend,
  });
  close.append(iconElement("x"));
  const body = createElement(ownerDocument, "div", { class: "cd-shell-legend-body" });
  const element = createElement(
    ownerDocument,
    "section",
    {
      class: "cd-shell-legend cd-shell-island",
      "data-chrome": "legend",
      "aria-labelledby": titleId,
    },
    createElement(
      ownerDocument,
      "div",
      { class: "cd-shell-legend-header" },
      createElement(
        ownerDocument,
        "div",
        { class: "cd-shell-legend-title", id: titleId },
        messages.legend,
      ),
      close,
    ),
    body,
  );
  element.hidden = true;
  options.render(body);

  let open = false;
  let started = false;
  const detachTooltip = tooltip.attach(close, { label: messages.closeLegend });

  /**
   * `byPointer`: a click with a pointer on the close button, which hands the focus on whether or not
   * the legend holds it. WebKit and Firefox on macOS do not focus a clicked button, so it would stay
   * on `<body>`.
   */
  function apply(next: boolean, byPointer = false): boolean {
    started = true;
    if (next === open) return false;
    open = next;
    element.hidden = !open;
    if (!open && (byPointer || element.contains(ownerDocument.activeElement))) {
      context.focusAfterClose();
    }
    context.onChange(open);
    return true;
  }

  function setOpen(next: boolean, byPointer = false): void {
    if (apply(next, byPointer)) options.onToggle?.(next);
  }

  close.addEventListener("click", (event) => setOpen(false, isPointerClick(event)));

  return {
    element,
    body,
    isOpen: () => open,
    setOpen,
    toggle: () => setOpen(!open),
    start(initial) {
      if (!started) apply(initial);
    },
    destroy() {
      detachTooltip();
      element.remove();
    },
  };
}
