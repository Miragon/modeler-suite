import { SHELL, type PrimaryWidths, type ShellMessages } from "../../core/index.js";
import { createElement, isPointerClick, toggleAttribute } from "../element.js";
import { iconElement } from "../icons.js";
import type { TooltipController } from "../tooltip.js";
import type { PrimaryActionHandle, PrimaryActionOptions } from "../types.js";

export interface PrimaryActionContext {
  ownerDocument: Document;
  messages: ShellMessages;
  tooltip: TooltipController;
  options: PrimaryActionOptions;
  /** After a pointer click on the button: hands the focus to the canvas (guide §5.7, §5.8). */
  focusCanvas(): void;
}

export interface PrimaryActionController extends PrimaryActionHandle {
  /**
   * Border-box widths with and without the label for `decideTopRow`, measured also while the label
   * is collapsed (the label's width does not change with the state), cached until `refresh()`.
   */
  widths(): PrimaryWidths;
  /** Icon only (`true`) or icon and label; the `aria-label` stays, the tooltip shows only while collapsed. */
  setCollapsed(collapsed: boolean): void;
  destroy(): void;
}

/** On the button while it shows its icon only: the stylesheet's 40 × 40 (the root mirrors it as `data-primary`). */
const COLLAPSED_ATTRIBUTE = "data-collapsed";

/**
 * `<button type="button" class="cd-shell-primary cd-shell-button" data-variant="primary"
 * data-chrome="primary" aria-label="Share">` with the 16px icon and `<span
 * class="cd-shell-primary-label">` (guide §5.7): 40px high at `top: 12px; right: 12px`, layer 30,
 * blue (`dom/buttons.css`), hover lift. Collapsed: 40 × 40, label hidden, chrome tooltip with the
 * label (no `aria-describedby`, it repeats the name). `disabled()` → `aria-disabled`, no action.
 */
export function createPrimaryAction(context: PrimaryActionContext): PrimaryActionController {
  const { ownerDocument, messages, tooltip, options, focusCanvas } = context;
  const label = options.label ?? messages.share;
  const labelElement = createElement(
    ownerDocument,
    "span",
    { class: "cd-shell-primary-label" },
    label,
  );
  const element = createElement(
    ownerDocument,
    "button",
    {
      type: "button",
      class: "cd-shell-primary cd-shell-button",
      "data-variant": "primary",
      "data-chrome": "primary",
      "aria-label": label,
    },
    iconElement(options.icon ?? "share-2"),
    labelElement,
  );

  let collapsed = false;
  let disabled = false;
  let labelledWidth: number | undefined;

  function readDisabled(): void {
    disabled = options.disabled?.() ?? false;
    toggleAttribute(element, "aria-disabled", disabled ? "true" : null);
  }

  function showCollapsed(state: boolean): void {
    labelElement.hidden = state;
    toggleAttribute(element, COLLAPSED_ATTRIBUTE, state ? "" : null);
  }

  /** The labelled width; while collapsed the label shows for one synchronous layout, never painted. */
  function measureLabelledWidth(): number {
    if (!collapsed) return element.offsetWidth;
    showCollapsed(false);
    const width = element.offsetWidth;
    showCollapsed(true);
    return width;
  }

  function isEngaged(): boolean {
    if (ownerDocument.activeElement === element) return true;
    try {
      return element.matches(":hover");
    } catch {
      return false;
    }
  }

  const onClick = (event: MouseEvent): void => {
    // Before onSelect, so a dialog it opens gives the focus back to the canvas. Enter and Space
    // (detail 0) keep the keyboard user on the button.
    if (isPointerClick(event)) focusCanvas();
    if (disabled) {
      event.preventDefault();
      return;
    }
    options.onSelect();
  };
  element.addEventListener("click", onClick);
  const detachTooltip = tooltip.attach(element, () => (collapsed ? { label } : null));
  readDisabled();

  return {
    element,
    isCollapsed: () => collapsed,
    refresh() {
      readDisabled();
      labelledWidth = undefined;
    },
    widths() {
      // Measured fresh while the label shows (a late web font widens it), from the cache while collapsed.
      if (!collapsed || labelledWidth === undefined) {
        const measured = measureLabelledWidth();
        if (measured > 0) labelledWidth = measured;
      }
      return { withLabel: labelledWidth ?? 0, iconOnly: SHELL.row };
    },
    setCollapsed(next) {
      if (next === collapsed) return;
      collapsed = next;
      showCollapsed(next);
      // An expanded button names itself; a tooltip still showing for it would only repeat the label.
      if (!next && isEngaged()) tooltip.hide();
    },
    destroy() {
      detachTooltip();
      element.removeEventListener("click", onClick);
      element.remove();
    },
  };
}
