import { matchChromeKey, type ProblemItem, type ShellMessages } from "../../core/index.js";
import { createElement } from "../element.js";
import { iconElement } from "../icons.js";
import { stopEscapeKeyup } from "../keys.js";

export interface ProblemsPopoverContext {
  ownerDocument: Document;
  /** The shell root: outside clicks and the window's blur close the popover, as the menu does. */
  root: HTMLElement;
  /** The shell's layer (40): the popover lives there, like the dropdown. */
  layer: HTMLElement;
  /** The pill, its trigger: gets `aria-haspopup="dialog"`, `aria-expanded` and `aria-controls`. */
  pill: HTMLButtonElement;
  /** `cd-shell-problems-N` on the popover. */
  id: string;
  /** `cd-shell-problems-title-N` on its title. */
  titleId: string;
  messages: ShellMessages;
  onSelectItem?: ((item: ProblemItem) => void) | undefined;
}

export interface ProblemsPopover {
  /** The `<div data-chrome="problems-popover" role="dialog">`. */
  readonly element: HTMLElement;
  isOpen(): boolean;
  /** Open (focus on the first row, else the popover) or close (focus back to the pill). */
  toggle(): void;
  open(): void;
  close(options?: { restoreFocus?: boolean | undefined }): void;
  /** The rows; while open the list re-renders and keeps the focused row. */
  setItems(items: readonly ProblemItem[]): void;
  destroy(): void;
}

interface Row {
  /** The same problem across `setItems`, so a re-render keeps the focus on it. */
  key: string;
  /** A `<button>` for a row with an element, else a `<div tabindex="-1">`. */
  element: HTMLElement;
}

const PILL_ATTRIBUTES = ["aria-haspopup", "aria-expanded", "aria-controls"] as const;

function isPrintable(event: KeyboardEvent): boolean {
  return (
    event.key.length === 1 &&
    /\S/.test(event.key) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  );
}

/**
 * The web app's problems list (guide §5.10): a popover above the pill, left-aligned with it
 * (`left: 12px`, its bottom 8px above the pill's top), `role="dialog"` without `aria-modal`,
 * `aria-labelledby` its title `messages.problemsTitle` (13px/600); opaque `--cd-ui-flaeche-hoch`,
 * 1px `--cd-ui-linie`, radius `md`, `shadow-3`, `min(320px, 100cqw − 24px)` wide, at most 320px
 * high with a scrolling list; pop-in 150ms from `translateY(4px)`. A row is at least 36px: the 16px
 * icon of the pill (`circle-x` in `--cd-ui-danger`, `triangle-alert` in `--cd-ui-warning`), the
 * message 13px `--cd-ui-text`, below it the location 13px `--cd-ui-text-leise`. Rows with an
 * `elementId` are buttons: a click closes the popover, returns the focus to the canvas and then
 * calls `onSelectItem(item)`; rows without one are text that still takes the focus (`tabindex="-1"`),
 * so the keyboard reads every row. ↑/↓/Home/End move between all rows and scroll the focused one
 * into the list; Enter and Space act only on a row button. Escape (the popover's own handler) and
 * Tab out close it with the focus back on the pill (Tab then moves on from the pill, Shift+Tab stays
 * on it); an outside `pointerdown` (capture) and the window's blur close it without moving the
 * focus. The zoom keys keep working (not modal).
 */
export function createProblemsPopover(context: ProblemsPopoverContext): ProblemsPopover {
  const { ownerDocument, root, layer, pill, id, titleId, messages } = context;
  const view = ownerDocument.defaultView;

  const list = createElement(ownerDocument, "ul", {
    class: "cd-shell-problems-list",
    role: "list",
  });
  const element = createElement(
    ownerDocument,
    "div",
    {
      class: "cd-shell-problems-popover",
      "data-chrome": "problems-popover",
      role: "dialog",
      id,
      "aria-labelledby": titleId,
      tabindex: "-1",
    },
    createElement(
      ownerDocument,
      "h2",
      { class: "cd-shell-problems-popover-title", id: titleId },
      messages.problemsTitle,
    ),
    list,
  );
  element.hidden = true;
  layer.append(element);

  pill.setAttribute("aria-haspopup", "dialog");
  pill.setAttribute("aria-expanded", "false");
  pill.setAttribute("aria-controls", id);

  let items: readonly ProblemItem[] = [];
  let rows: Row[] = [];
  let destroyed = false;

  const isOpen = (): boolean => !element.hidden;

  function keyOf(item: ProblemItem): string {
    return `${item.elementId ?? ""}\u0000${item.severity}\u0000${item.message}`;
  }

  function rowElement(item: ProblemItem): HTMLElement {
    const severity = item.severity === "error" ? "error" : "warning";
    const parts = [
      // The shape and colour of the icon carry the severity on screen, its name for screen readers.
      createElement(
        ownerDocument,
        "span",
        {
          class: "cd-shell-problem-icon",
          role: "img",
          "aria-label": messages.problemSeverity(severity),
        },
        iconElement(severity === "error" ? "circle-x" : "triangle-alert"),
      ),
      createElement(ownerDocument, "span", { class: "cd-shell-problem-message" }, item.message),
      item.location
        ? createElement(
            ownerDocument,
            "span",
            { class: "cd-shell-problem-location" },
            item.location,
          )
        : undefined,
    ];
    const attributes = { class: "cd-shell-problem", "data-severity": severity };
    if (!item.elementId) {
      const text = createElement(ownerDocument, "div", { ...attributes, tabindex: "-1" }, ...parts);
      rows.push({ key: keyOf(item), element: text });
      return text;
    }
    const button = createElement(
      ownerDocument,
      "button",
      { type: "button", ...attributes },
      ...parts,
    );
    button.addEventListener("click", () => select(item));
    rows.push({ key: keyOf(item), element: button });
    return button;
  }

  function focusedRowIndex(): number {
    return rows.findIndex((row) => row.element === ownerDocument.activeElement);
  }

  function render(): void {
    const focusedIndex = focusedRowIndex();
    const focusedKey = rows[focusedIndex]?.key;
    rows = [];
    list.replaceChildren(
      ...items.map((item) => createElement(ownerDocument, "li", {}, rowElement(item))),
    );
    if (focusedKey === undefined || !isOpen()) return;
    const kept =
      rows.find((row) => row.key === focusedKey) ?? rows[Math.min(focusedIndex, rows.length - 1)];
    if (kept) focusRowElement(kept.element);
    else element.focus({ preventScroll: true });
  }

  // Scrolls only the list: `focus()` and `scrollIntoView()` would also scroll the shell root.
  function revealInList(row: HTMLElement): void {
    const rowBox = row.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top;
    else if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom;
  }

  function focusRowElement(row: HTMLElement): void {
    row.focus({ preventScroll: true });
    revealInList(row);
  }

  function focusCanvas(): void {
    const canvas = root.querySelector<HTMLElement | SVGElement>(".cd-shell-canvas svg[tabindex]");
    canvas?.focus({ preventScroll: true });
    if ((!canvas || ownerDocument.activeElement !== canvas) && !pill.hidden)
      pill.focus({ preventScroll: true });
  }

  function select(item: ProblemItem): void {
    close();
    focusCanvas();
    context.onSelectItem?.(item);
  }

  function focusRow(index: number): void {
    if (rows.length === 0) return;
    const row = rows[(index + rows.length) % rows.length];
    if (row) focusRowElement(row.element);
  }

  const onOutsidePointerDown = (event: PointerEvent): void => {
    const target = event.target as Node | null;
    if (target && (element.contains(target) || pill.contains(target))) return;
    close();
  };

  // The focus left the document (another window, an iframe of the host page): from the user's
  // view a click outside, so the popover closes without moving the focus.
  const onWindowBlur = (): void => close();

  function open(): void {
    if (destroyed || isOpen()) return;
    element.hidden = false;
    pill.setAttribute("aria-expanded", "true");
    // Capture phase: diagram-js stops pointer events on palette, context pad and canvas.
    ownerDocument.addEventListener("pointerdown", onOutsidePointerDown, true);
    view?.addEventListener("blur", onWindowBlur);
    list.scrollTop = 0;
    const first = rows[0];
    if (first) focusRowElement(first.element);
    else element.focus({ preventScroll: true });
  }

  function close(options: { restoreFocus?: boolean | undefined } = {}): void {
    if (!isOpen()) return;
    element.hidden = true;
    pill.setAttribute("aria-expanded", "false");
    ownerDocument.removeEventListener("pointerdown", onOutsidePointerDown, true);
    view?.removeEventListener("blur", onWindowBlur);
    if (options.restoreFocus && !pill.hidden) pill.focus({ preventScroll: true });
  }

  // Keys typed in the list stop here, like the menu's: a modeler's keyboard on document (Event
  // Storming deletes the selection on Delete) must never act on them.
  function consume(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  element.addEventListener("keydown", (event) => {
    // Zoom and fit keys still act with the popover open; the shell's key listener runs them.
    if (matchChromeKey(event)) return;
    const index = focusedRowIndex();
    switch (event.key) {
      case "Escape":
        consume(event);
        close({ restoreFocus: true });
        stopEscapeKeyup(ownerDocument);
        return;
      case "Tab": {
        // Without a row the popover itself holds the focus and is first and last at once.
        const first = index <= 0;
        const last = rows.length === 0 || index === rows.length - 1;
        if (event.shiftKey && first) {
          consume(event);
          close({ restoreFocus: true });
        } else if (!event.shiftKey && last) {
          // The browser's Tab runs after this handler from the pill, so it moves on to what follows it.
          event.stopPropagation();
          close({ restoreFocus: true });
        }
        return;
      }
      case "ArrowDown":
        focusRow(index + 1);
        break;
      case "ArrowUp":
        focusRow(index < 0 ? rows.length - 1 : index - 1);
        break;
      case "Home":
        focusRow(0);
        break;
      case "End":
        focusRow(rows.length - 1);
        break;
      case "Enter":
      case " ":
      case "Delete":
      case "Backspace":
        // A row button's native click handles Enter and Space; nothing else may act on these keys.
        event.stopPropagation();
        return;
      default:
        if (isPrintable(event)) event.stopPropagation();
        return;
    }
    consume(event);
  });

  return {
    element,
    isOpen,
    toggle() {
      if (isOpen()) close({ restoreFocus: true });
      else open();
    },
    open,
    close,
    setItems(next) {
      items = next;
      if (!destroyed) render();
    },
    destroy() {
      if (destroyed) return;
      close();
      destroyed = true;
      for (const name of PILL_ATTRIBUTES) pill.removeAttribute(name);
      element.remove();
    },
  };
}
