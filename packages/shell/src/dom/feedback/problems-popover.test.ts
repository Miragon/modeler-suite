import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultMessages, type ProblemItem } from "../../core/index.js";
import { documentKeyups, keyup } from "../../../test/support/dom.js";
import {
  createProblemsPopover,
  type ProblemsPopover,
  type ProblemsPopoverContext,
} from "./problems-popover.js";

let popovers: ProblemsPopover[] = [];

afterEach(() => {
  for (const popover of popovers.splice(0)) popover.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const ITEMS: readonly ProblemItem[] = [
  {
    severity: "error",
    message: "Unknown sticky type “evnt”.",
    location: "Line 12",
    elementId: "Sticky_1",
  },
  { severity: "warning", message: "Unused aggregate.", location: "Line 30" },
  { severity: "warning", message: "A box without a name.", elementId: "Box_2" },
];

function setup(overrides: Partial<ProblemsPopoverContext> = {}) {
  const root = document.createElement("div");
  root.className = "cd-shell";
  const canvas = document.createElement("div");
  canvas.className = "cd-shell-canvas";
  canvas.innerHTML = '<div class="djs-container"><svg tabindex="0" role="application"></svg></div>';
  const pill = document.createElement("button");
  pill.className = "cd-shell-problems";
  const layer = document.createElement("div");
  layer.className = "cd-shell-layer";
  root.append(canvas, pill, layer);
  document.body.append(root);
  const onSelectItem = vi.fn();
  const popover = createProblemsPopover({
    ownerDocument: document,
    root,
    layer,
    pill,
    id: "cd-shell-problems-1",
    titleId: "cd-shell-problems-title-1",
    messages: defaultMessages,
    onSelectItem,
    ...overrides,
  });
  popovers.push(popover);
  const svg = canvas.querySelector("svg") as unknown as HTMLElement;
  return { root, pill, layer, popover, element: popover.element, svg, onSelectItem };
}

function rowButtons(element: HTMLElement): HTMLButtonElement[] {
  return [...element.querySelectorAll<HTMLButtonElement>("button.cd-shell-problem")];
}

function allRows(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(".cd-shell-problem")];
}

function keydown(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("problems popover: trigger and dialog ARIA (guide §5.10)", () => {
  it("wires the pill to a non-modal dialog titled Problems", () => {
    const { pill, layer, element } = setup();
    expect(pill.getAttribute("aria-haspopup")).toBe("dialog");
    expect(pill.getAttribute("aria-expanded")).toBe("false");
    expect(pill.getAttribute("aria-controls")).toBe("cd-shell-problems-1");
    expect(element.parentElement).toBe(layer);
    expect(element.id).toBe("cd-shell-problems-1");
    expect(element.dataset.chrome).toBe("problems-popover");
    expect(element.getAttribute("role")).toBe("dialog");
    expect(element.hasAttribute("aria-modal")).toBe(false);
    expect(element.getAttribute("aria-labelledby")).toBe("cd-shell-problems-title-1");
    expect(element.hidden).toBe(true);
    const title = document.getElementById("cd-shell-problems-title-1");
    expect(title?.textContent).toBe("Problems");
    expect(title?.className).toBe("cd-shell-problems-popover-title");
  });

  it("takes the title from the messages table", () => {
    const { element } = setup({ messages: { ...defaultMessages, problemsTitle: "Probleme" } });
    expect(element.querySelector(".cd-shell-problems-popover-title")?.textContent).toBe("Probleme");
  });

  it("removes the pill's attributes and the popover on destroy", () => {
    const { pill, popover, element } = setup();
    popover.setItems(ITEMS);
    popover.open();
    popover.destroy();
    expect(element.isConnected).toBe(false);
    for (const name of ["aria-haspopup", "aria-expanded", "aria-controls"]) {
      expect(pill.hasAttribute(name)).toBe(false);
    }
    popover.open();
    expect(popover.isOpen()).toBe(false);
    expect(() => popover.destroy()).not.toThrow();
  });
});

describe("problems popover: rows", () => {
  it("renders message, location and the pill's icons; rows with an element are buttons", () => {
    const { popover, element } = setup();
    popover.setItems(ITEMS);
    const rows = [
      ...element.querySelectorAll<HTMLElement>(".cd-shell-problems-list > li > .cd-shell-problem"),
    ];
    expect(rows.map((row) => row.localName)).toEqual(["button", "div", "button"]);
    expect(rows.map((row) => row.dataset.severity)).toEqual(["error", "warning", "warning"]);
    expect(rows.map((row) => row.querySelector(".cd-shell-problem-message")?.textContent)).toEqual([
      "Unknown sticky type “evnt”.",
      "Unused aggregate.",
      "A box without a name.",
    ]);
    expect(
      rows.map((row) => row.querySelector(".cd-shell-problem-location")?.textContent ?? null),
    ).toEqual(["Line 12", "Line 30", null]);
    // circle-x has a circle, triangle-alert none: the shape carries the severity.
    expect(
      rows.map((row) => row.querySelector(".cd-shell-problem-icon svg circle") !== null),
    ).toEqual([true, false, false]);
    expect(rowButtons(element).every((button) => button.type === "button")).toBe(true);
  });

  it("names each row's severity for screen readers through its icon", () => {
    const { popover, element } = setup();
    popover.setItems(ITEMS);
    const icons = [...element.querySelectorAll<HTMLElement>(".cd-shell-problem-icon")];
    expect(
      icons.map((icon) => [icon.getAttribute("role"), icon.getAttribute("aria-label")]),
    ).toEqual([
      ["img", "Error"],
      ["img", "Warning"],
      ["img", "Warning"],
    ]);
    expect(
      icons.every((icon) => icon.querySelector("svg")?.getAttribute("aria-hidden") === "true"),
    ).toBe(true);
  });

  it("re-renders on setItems while closed as well", () => {
    const { popover, element } = setup();
    popover.setItems(ITEMS);
    popover.setItems(ITEMS.slice(0, 1));
    expect(element.querySelectorAll(".cd-shell-problem")).toHaveLength(1);
  });
});

describe("problems popover: opening and closing", () => {
  it("opens on toggle with the focus on the first row button, closes back to the pill", () => {
    const { popover, element, pill } = setup();
    popover.setItems(ITEMS);
    pill.focus();
    popover.toggle();
    expect(popover.isOpen()).toBe(true);
    expect(element.hidden).toBe(false);
    expect(pill.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(rowButtons(element)[0]);
    popover.toggle();
    expect(popover.isOpen()).toBe(false);
    expect(pill.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(pill);
  });

  it("focuses the first row even when it is text, and the popover itself only without rows", () => {
    const { popover, element } = setup();
    popover.setItems([{ severity: "warning", message: "Unused aggregate." }]);
    popover.open();
    const [row] = allRows(element);
    expect(row?.tagName).toBe("DIV");
    expect(row?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(row);
    popover.close();
    popover.setItems([]);
    popover.open();
    expect(element.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(element);
  });

  it("Escape closes with the focus back on the pill and stops at the popover", () => {
    const { popover, element, pill } = setup();
    const onDocument = vi.fn();
    document.addEventListener("keydown", onDocument);
    popover.setItems(ITEMS);
    popover.open();
    const event = keydown(rowButtons(element)[0]!, { key: "Escape" });
    document.removeEventListener("keydown", onDocument);
    expect(event.defaultPrevented).toBe(true);
    expect(onDocument).not.toHaveBeenCalled();
    expect(popover.isOpen()).toBe(false);
    expect(document.activeElement).toBe(pill);
  });

  it("Escape keeps its keyup from document, where diagram-js's dragging would put down an armed tool (#482)", () => {
    const { popover, element, pill } = setup();
    popover.setItems(ITEMS);
    popover.open();
    const keyups = documentKeyups();

    keydown(rowButtons(element)[0]!, { key: "Escape" });
    keyup(pill, { key: "Escape" });
    keydown(pill, { key: "Escape" });
    keyup(pill, { key: "Escape" });
    keyups.dispose();

    expect(keyups.seen).toEqual(["Escape"]);
  });

  it("Tab out of the last row closes back to the pill and lets the browser move on", () => {
    const { popover, element, pill } = setup();
    popover.setItems(ITEMS);
    popover.open();
    const [first, last] = rowButtons(element);
    const inside = keydown(first!, { key: "Tab" });
    expect(inside.defaultPrevented).toBe(false);
    expect(popover.isOpen()).toBe(true);
    last!.focus();
    const out = keydown(last!, { key: "Tab" });
    expect(out.defaultPrevented).toBe(false);
    expect(popover.isOpen()).toBe(false);
    expect(document.activeElement).toBe(pill);
  });

  it("Shift+Tab out of the first row closes onto the pill", () => {
    const { popover, element, pill } = setup();
    popover.setItems(ITEMS);
    popover.open();
    const [first, last] = rowButtons(element);
    last!.focus();
    expect(keydown(last!, { key: "Tab", shiftKey: true }).defaultPrevented).toBe(false);
    expect(popover.isOpen()).toBe(true);
    first!.focus();
    const out = keydown(first!, { key: "Tab", shiftKey: true });
    expect(out.defaultPrevented).toBe(true);
    expect(popover.isOpen()).toBe(false);
    expect(document.activeElement).toBe(pill);
  });

  it("Tab and Shift+Tab from the focused popover without rows close it", () => {
    const { popover, element, pill } = setup();
    popover.open();
    keydown(element, { key: "Tab" });
    expect(popover.isOpen()).toBe(false);
    expect(document.activeElement).toBe(pill);
    popover.open();
    keydown(element, { key: "Tab", shiftKey: true });
    expect(popover.isOpen()).toBe(false);
  });

  it("an outside pointerdown closes without moving the focus; inside and on the pill it stays", () => {
    const { popover, element, pill, root } = setup();
    popover.setItems(ITEMS);
    popover.open();
    const focused = document.activeElement;
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    pill.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(popover.isOpen()).toBe(true);
    const stopper = (event: Event) => event.stopPropagation();
    // Capture phase: diagram-js stops pointer events on the canvas.
    root.addEventListener("pointerdown", stopper);
    root
      .querySelector(".cd-shell-canvas")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    root.removeEventListener("pointerdown", stopper);
    expect(popover.isOpen()).toBe(false);
    expect(document.activeElement).toBe(focused);
    expect(document.activeElement).not.toBe(pill);
  });

  it("the window's blur closes without moving the focus", () => {
    const { popover, element } = setup();
    popover.setItems(ITEMS);
    popover.open();
    window.dispatchEvent(new Event("blur"));
    expect(popover.isOpen()).toBe(false);
    expect(document.activeElement).toBe(rowButtons(element)[0]);
  });

  it("stops listening once closed", () => {
    const { popover } = setup();
    const removed = vi.spyOn(document, "removeEventListener");
    popover.open();
    popover.close();
    expect(removed).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    popover.open();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(popover.isOpen()).toBe(false);
  });
});

describe("problems popover: keys inside", () => {
  it("lets the zoom keys through to the shell and keeps the others from a modeler", () => {
    const { popover, element } = setup();
    const onDocument = vi.fn();
    document.addEventListener("keydown", onDocument);
    popover.setItems(ITEMS);
    popover.open();
    const row = rowButtons(element)[0]!;
    keydown(row, { key: "=", code: "Equal", metaKey: true });
    keydown(row, { key: "Delete" });
    keydown(row, { key: "e" });
    keydown(row, { key: "Enter" });
    document.removeEventListener("keydown", onDocument);
    expect(onDocument).toHaveBeenCalledTimes(1);
    expect(popover.isOpen()).toBe(true);
  });

  it("moves between every row, text rows included, with the arrow keys, Home and End", () => {
    const { popover, element } = setup();
    popover.setItems(ITEMS);
    popover.open();
    const [first, text, last] = allRows(element);
    expect(text?.tagName).toBe("DIV");
    expect(keydown(first!, { key: "ArrowDown" }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(text);
    keydown(text!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(last);
    keydown(last!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(first);
    keydown(first!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(last);
    keydown(last!, { key: "Home" });
    expect(document.activeElement).toBe(first);
    keydown(first!, { key: "End" });
    expect(document.activeElement).toBe(last);
  });

  it("reads a list of text rows to its end, scrolling each focused row into the list", () => {
    const { popover, element } = setup();
    const items = Array.from({ length: 10 }, (_, index) => ({
      severity: "warning" as const,
      message: `Line problem ${index + 1}.`,
      location: `Line ${index + 1}`,
    }));
    popover.setItems(items);
    const list = element.querySelector<HTMLElement>(".cd-shell-problems-list")!;
    // happy-dom has no layout: a 270px list showing rows of 56px from its scroll position.
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 320, 270));
    allRows(element).forEach((row, index) =>
      vi
        .spyOn(row, "getBoundingClientRect")
        .mockImplementation(() => new DOMRect(0, 100 + index * 56 - list.scrollTop, 320, 56)),
    );
    popover.open();
    const rows = allRows(element);
    keydown(rows[0]!, { key: "End" });
    expect(document.activeElement).toBe(rows[9]);
    // Row 10 ends at 660, the list at 370: it scrolls by the difference.
    expect(list.scrollTop).toBe(290);
    keydown(rows[9]!, { key: "Home" });
    expect(document.activeElement).toBe(rows[0]);
    expect(list.scrollTop).toBe(0);
  });

  it("acts on Enter only on a row with an element", () => {
    const { popover, element, onSelectItem } = setup();
    popover.setItems(ITEMS);
    popover.open();
    const text = allRows(element)[1]!;
    text.focus();
    const enter = keydown(text, { key: "Enter" });
    expect(enter.defaultPrevented).toBe(false);
    expect(onSelectItem).not.toHaveBeenCalled();
    expect(popover.isOpen()).toBe(true);
  });
});

describe("problems popover: selecting a row", () => {
  it("closes, focuses the canvas, then calls onSelectItem", () => {
    const seen: { open: boolean; focus: Element | null }[] = [];
    const onSelectItem = vi.fn(() =>
      seen.push({ open: popover.isOpen(), focus: document.activeElement }),
    );
    const { popover, element, svg } = setup({ onSelectItem });
    popover.setItems(ITEMS);
    popover.open();
    rowButtons(element)[1]?.click();
    expect(onSelectItem).toHaveBeenCalledWith(ITEMS[2]);
    expect(seen).toEqual([{ open: false, focus: svg }]);
  });

  it("falls back to the pill without a canvas to focus", () => {
    const { popover, element, svg, pill } = setup();
    svg.removeAttribute("tabindex");
    popover.setItems(ITEMS);
    popover.open();
    rowButtons(element)[0]?.click();
    expect(document.activeElement).toBe(pill);
  });

  it("works without onSelectItem", () => {
    const { popover, element } = setup({ onSelectItem: undefined });
    popover.setItems(ITEMS);
    popover.open();
    expect(() => rowButtons(element)[0]?.click()).not.toThrow();
    expect(popover.isOpen()).toBe(false);
  });
});

describe("problems popover: setItems while open", () => {
  it("keeps the focused problem when rows move", () => {
    const { popover, element } = setup();
    popover.setItems(ITEMS);
    popover.open();
    rowButtons(element)[1]?.focus();
    const added: ProblemItem = {
      severity: "error",
      message: "Arrow to nowhere.",
      elementId: "Arrow_9",
    };
    popover.setItems([added, ...ITEMS]);
    const focused = document.activeElement as HTMLElement;
    expect(focused.querySelector(".cd-shell-problem-message")?.textContent).toBe(
      "A box without a name.",
    );
    expect(rowButtons(element).indexOf(focused as HTMLButtonElement)).toBe(2);
  });

  it("falls back to the row at the same place, then to the popover", () => {
    const { popover, element } = setup();
    popover.setItems(ITEMS);
    popover.open();
    rowButtons(element)[1]?.focus();
    popover.setItems([ITEMS[0]!]);
    expect(document.activeElement).toBe(rowButtons(element)[0]);
    popover.setItems([{ severity: "warning", message: "Text only." }]);
    expect(document.activeElement).toBe(allRows(element)[0]);
    popover.setItems([]);
    expect(document.activeElement).toBe(element);
  });

  it("does not take the focus while it is elsewhere", () => {
    const { popover, pill } = setup();
    popover.setItems(ITEMS);
    popover.open();
    pill.focus();
    popover.setItems(ITEMS.slice(1));
    expect(document.activeElement).toBe(pill);
  });
});
