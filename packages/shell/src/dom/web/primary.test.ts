import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultMessages } from "../../core/index.js";
import { createTooltip } from "../tooltip.js";
import type { PrimaryActionOptions } from "../types.js";
import { createPrimaryAction } from "./primary.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

const LABELLED_WIDTH = 96;

function setup(options: Partial<PrimaryActionOptions> = {}) {
  const root = document.createElement("div");
  const layer = document.createElement("div");
  root.append(layer);
  document.body.append(root);
  const tooltip = createTooltip({ root, layer, id: "tooltip" });
  const onSelect = vi.fn();
  const focusCanvas = vi.fn();
  const primary = createPrimaryAction({
    ownerDocument: document,
    messages: defaultMessages,
    tooltip,
    options: { onSelect, ...options },
    focusCanvas,
  });
  root.prepend(primary.element);
  const label = primary.element.querySelector<HTMLElement>(".cd-shell-primary-label")!;
  // happy-dom has no layout: the button is as wide as the label it shows.
  Object.defineProperty(primary.element, "offsetWidth", {
    configurable: true,
    get: () => (label.hidden ? 40 : LABELLED_WIDTH),
  });
  return { primary, tooltip, label, onSelect, focusCanvas };
}

function hover(element: HTMLElement): void {
  element.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
  vi.advanceTimersByTime(300);
}

describe("primary action (guide §5.7)", () => {
  it("is a blue primary button with the Share icon and label", () => {
    const { primary, label } = setup();
    const button = primary.element;
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect([...button.classList]).toEqual(["cd-shell-primary", "cd-shell-button"]);
    expect(button.getAttribute("data-variant")).toBe("primary");
    expect(button.getAttribute("data-chrome")).toBe("primary");
    expect(button.getAttribute("aria-label")).toBe("Share");
    expect(button.querySelector("svg")?.getAttribute("width")).toBe("16");
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(label.textContent).toBe("Share");
    expect(label.hidden).toBe(false);
    expect(button.hasAttribute("aria-disabled")).toBe(false);
  });

  it("takes the modeler's label and icon", () => {
    const { primary, label } = setup({ label: "Publish", icon: "import" });
    expect(primary.element.getAttribute("aria-label")).toBe("Publish");
    expect(label.textContent).toBe("Publish");
  });

  it("runs onSelect on a click", () => {
    const { primary, onSelect } = setup();
    primary.element.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("hands the focus to the canvas before onSelect runs after a pointer click (guide §5.7)", () => {
    const calls: string[] = [];
    const { primary, onSelect, focusCanvas } = setup();
    focusCanvas.mockImplementation(() => calls.push("focus"));
    onSelect.mockImplementation(() => calls.push("select"));
    primary.element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(calls).toEqual(["focus", "select"]);
  });

  it("leaves the focus on the button after Enter or Space, which click with detail 0", () => {
    const { primary, onSelect, focusCanvas } = setup();
    primary.element.click();
    primary.element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(focusCanvas).not.toHaveBeenCalled();
  });

  it("hands the focus back after a pointer click while disabled too, which runs nothing", () => {
    const { primary, onSelect, focusCanvas } = setup({ disabled: () => true });
    primary.element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(focusCanvas).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("collapses to its icon and keeps the aria-label (guide §5.15)", () => {
    const { primary, label } = setup();
    primary.setCollapsed(true);
    expect(primary.isCollapsed()).toBe(true);
    expect(label.hidden).toBe(true);
    expect(primary.element.hasAttribute("data-collapsed")).toBe(true);
    expect(primary.element.getAttribute("aria-label")).toBe("Share");
    primary.setCollapsed(false);
    expect(primary.isCollapsed()).toBe(false);
    expect(label.hidden).toBe(false);
    expect(primary.element.hasAttribute("data-collapsed")).toBe(false);
    expect(primary.element.getAttribute("aria-label")).toBe("Share");
  });

  it("shows the chrome tooltip only while collapsed, never as a description", () => {
    vi.useFakeTimers();
    const { primary, tooltip } = setup();
    hover(primary.element);
    expect(tooltip.element.hidden).toBe(true);
    primary.element.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    vi.advanceTimersByTime(1000);

    primary.setCollapsed(true);
    hover(primary.element);
    expect(tooltip.element.hidden).toBe(false);
    expect(tooltip.element.textContent).toBe("Share");
    expect(primary.element.hasAttribute("aria-describedby")).toBe(false);
  });

  it("maps disabled() to aria-disabled, read on mount and on refresh", () => {
    let disabled = true;
    const { primary, onSelect } = setup({ disabled: () => disabled });
    expect(primary.element.getAttribute("aria-disabled")).toBe("true");
    expect(primary.element.hasAttribute("disabled")).toBe(false);
    primary.element.click();
    expect(onSelect).not.toHaveBeenCalled();

    disabled = false;
    expect(primary.element.getAttribute("aria-disabled")).toBe("true");
    primary.refresh();
    expect(primary.element.hasAttribute("aria-disabled")).toBe(false);
    primary.element.click();
    expect(onSelect).toHaveBeenCalledTimes(1);

    disabled = true;
    primary.refresh();
    expect(primary.element.getAttribute("aria-disabled")).toBe("true");
  });

  it("reports the labelled width also while collapsed", () => {
    const { primary, label } = setup();
    expect(primary.widths()).toEqual({ withLabel: LABELLED_WIDTH, iconOnly: 40 });
    primary.setCollapsed(true);
    expect(primary.widths()).toEqual({ withLabel: LABELLED_WIDTH, iconOnly: 40 });
    expect(label.hidden).toBe(true);
  });

  it("measures the label while collapsed after a refresh, without leaving it shown", () => {
    const { primary, label } = setup();
    primary.setCollapsed(true);
    primary.refresh();
    expect(primary.widths().withLabel).toBe(LABELLED_WIDTH);
    expect(label.hidden).toBe(true);
    expect(primary.element.hasAttribute("data-collapsed")).toBe(true);
  });

  it("removes its button, click handler and tooltip on destroy", () => {
    vi.useFakeTimers();
    const { primary, tooltip, onSelect } = setup();
    primary.setCollapsed(true);
    primary.destroy();
    expect(primary.element.isConnected).toBe(false);
    primary.element.click();
    expect(onSelect).not.toHaveBeenCalled();
    document.body.append(primary.element);
    hover(primary.element);
    expect(tooltip.element.hidden).toBe(true);
  });
});
