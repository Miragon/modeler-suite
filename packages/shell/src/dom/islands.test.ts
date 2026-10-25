import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVALID_STATUS_DELAY_MS } from "../core/index.js";
import {
  FakeResizeObserver,
  chrome,
  cleanup,
  click,
  fakePalette,
  installFakes,
  mount,
  setBox,
  setContainerSize,
} from "../../test/support/dom.js";

beforeEach(installFakes);
afterEach(cleanup);

describe("problems pill (guide §5.10)", () => {
  it("shows count, accessible label and severity icon, hides at 0", () => {
    const onActivate = vi.fn();
    const { shell, root } = mount({ problems: { onActivate } });
    const pill = chrome(root, "problems");
    expect(pill.hidden).toBe(true);

    shell.setProblems({ count: 2, errors: 1 });
    expect(pill.hidden).toBe(false);
    expect(root.getAttribute("data-problems")).toBe("shown");
    expect(pill.textContent).toBe("2 problems");
    expect(pill.getAttribute("aria-label")).toBe("2 problems, 1 error");
    expect(pill.dataset.severity).toBe("danger");
    expect(pill.querySelector(".cd-shell-problems-icon svg circle")).not.toBeNull();

    shell.setProblems({ count: 1, errors: 0 });
    expect(pill.textContent).toBe("1 problem");
    expect(pill.getAttribute("aria-label")).toBe("1 problem, no errors");
    expect(pill.dataset.severity).toBe("warning");
    expect(pill.querySelector(".cd-shell-problems-icon svg circle")).toBeNull();

    pill.click();
    expect(onActivate).toHaveBeenCalledTimes(1);

    shell.setProblems({ count: 0, errors: 0 });
    expect(pill.hidden).toBe(true);
    expect(root.hasAttribute("data-problems")).toBe(false);
  });

  it("formats the numbers in the UI language", () => {
    const { shell, root } = mount({
      lang: "de",
      problems: { onActivate() {} },
      messages: {
        problems: (count, formatted) => `${formatted} ${count === 1 ? "Problem" : "Probleme"}`,
      },
    });
    shell.setProblems({ count: 1234, errors: 0 });
    expect(chrome(root, "problems").textContent).toBe("1.234 Probleme");
  });
});

describe("status box (guide §5.12)", () => {
  it("shows a danger status as an alert at once, a warning as status, and hides at once", () => {
    const { shell, root } = mount();
    const status = chrome(root, "status");
    shell.setStatus({ severity: "danger", text: "Broken" });
    expect(status.hidden).toBe(false);
    expect(status.getAttribute("role")).toBe("alert");
    expect(status.dataset.severity).toBe("danger");
    expect(status.querySelector(".cd-shell-status-text")?.textContent).toBe("Broken");
    expect(status.querySelector(".cd-shell-status-icon svg")).not.toBeNull();

    shell.setStatus({ severity: "warning", text: "Careful" });
    expect(status.getAttribute("role")).toBe("status");
    expect(status.dataset.severity).toBe("warning");

    shell.setStatus(null);
    expect(status.hidden).toBe(true);
  });

  it("waits the delay from the first invalid import, not the last", () => {
    vi.useFakeTimers();
    const { shell, root } = mount();
    const status = chrome(root, "status");
    const invalid = {
      severity: "danger",
      text: shell.messages.invalidFile("Event Storming board"),
    } as const;
    shell.setStatus(invalid, { delayMs: INVALID_STATUS_DELAY_MS });
    vi.advanceTimersByTime(500);
    shell.setStatus(invalid, { delayMs: INVALID_STATUS_DELAY_MS });
    vi.advanceTimersByTime(299);
    expect(status.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain("isn't a valid Event Storming board right now");
  });

  it("drops a pending status on null, so a valid import in time shows nothing", () => {
    vi.useFakeTimers();
    const { shell, root } = mount();
    shell.setStatus({ severity: "danger", text: "Invalid" }, { delayMs: INVALID_STATUS_DELAY_MS });
    vi.advanceTimersByTime(700);
    shell.setStatus(null);
    vi.advanceTimersByTime(1000);
    expect(chrome(root, "status").hidden).toBe(true);
  });

  it("does not rewrite an unchanged text", () => {
    const { shell, root } = mount();
    shell.setStatus({ severity: "danger", text: "Invalid" });
    const text = chrome(root, "status").querySelector(".cd-shell-status-text")!;
    const node = text.firstChild;
    shell.setStatus({ severity: "danger", text: "Invalid" });
    expect(text.firstChild).toBe(node);
  });
});

describe("legend (guide §5.10)", () => {
  it("renders once, with title, close button and the given start state", () => {
    const render = vi.fn((body: HTMLElement) => {
      body.innerHTML = '<div class="cd-shell-legend-row">Box</div>';
    });
    const { shell, root } = mount({ legend: { render, open: true } });
    const legend = chrome(root, "legend");
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(shell.legend?.body);
    const title = legend.querySelector(".cd-shell-legend-title");
    expect(legend.getAttribute("aria-labelledby")).toBe(title?.id);
    expect(title?.textContent).toBe("Legend");
    expect(legend.querySelector(".cd-shell-legend-close")?.getAttribute("aria-label")).toBe(
      "Close legend",
    );
    expect(legend.hidden).toBe(false);
    expect(root.getAttribute("data-legend")).toBe("open");
    expect(shell.legend?.isOpen()).toBe(true);
  });

  it.each([
    [390, 844],
    [441, 900],
    [1280, 900],
    [1920, 1200],
  ])("starts closed at %i × %ipx without a stored state, and without onToggle", (width, height) => {
    const onToggle = vi.fn();
    const { shell, root } = mount({ legend: { render() {}, onToggle } }, { width, height });
    expect(shell.legend?.isOpen()).toBe(false);
    expect(chrome(root, "legend").hidden).toBe(true);
    expect(root.hasAttribute("data-legend")).toBe(false);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it.each([
    [true, 390, 844],
    [true, 1280, 900],
    [false, 1280, 900],
  ])(
    "starts as the stored state says (%s at %i × %ipx), whatever the container",
    (open, width, height) => {
      const onToggle = vi.fn();
      const { shell, root } = mount({ legend: { render() {}, open, onToggle } }, { width, height });
      expect(shell.legend?.isOpen()).toBe(open);
      expect(chrome(root, "legend").hidden).toBe(!open);
      expect(onToggle).not.toHaveBeenCalled();
    },
  );

  it("stays closed when a hidden tab gets its first size, and opens from the menu checkbox", () => {
    const onToggle = vi.fn();
    const { shell, root } = mount({ legend: { render() {}, onToggle } }, { width: 0, height: 0 });
    expect(shell.legend?.isOpen()).toBe(false);
    setContainerSize(root, 1280, 900);
    FakeResizeObserver.resize(root);
    expect(shell.legend?.isOpen()).toBe(false);
    expect(onToggle).not.toHaveBeenCalled();
    shell.menu.open();
    const entry = shell.menu.dropdown.querySelector<HTMLElement>('[data-menu-id="legend"]');
    expect(entry?.getAttribute("aria-checked")).toBe("false");
    entry?.click();
    expect(shell.legend?.isOpen()).toBe(true);
    expect(root.getAttribute("data-legend")).toBe("open");
    expect(onToggle.mock.calls).toEqual([[true]]);
  });

  it("closes from its button, reports every toggle and moves the focus to the trigger", () => {
    const onToggle = vi.fn();
    const { shell, root } = mount({
      legend: { render() {}, open: true, onToggle },
      menu: { export: [{ kind: "action", id: "png", label: "Export as PNG", onSelect() {} }] },
    });
    const close = chrome(root, "legend").querySelector<HTMLButtonElement>(
      ".cd-shell-legend-close",
    )!;
    close.focus();
    close.click();
    expect(shell.legend?.isOpen()).toBe(false);
    expect(chrome(root, "legend").hidden).toBe(true);
    expect(root.hasAttribute("data-legend")).toBe(false);
    expect(document.activeElement).toBe(shell.menu.trigger);
    shell.legend?.toggle();
    shell.legend?.setOpen(true);
    expect(onToggle.mock.calls).toEqual([[false], [true]]);
  });

  // WebKit and Firefox on macOS leave a clicked button unfocused: the click finds `<body>` focused.
  it("moves the focus to the trigger after a pointer click on its button, though the button took none", () => {
    const { shell, root } = mount({
      legend: { render() {}, open: true },
      menu: { export: [{ kind: "action", id: "png", label: "Export as PNG", onSelect() {} }] },
    });
    expect(document.activeElement).toBe(document.body);
    click(chrome(root, "legend").querySelector(".cd-shell-legend-close")!, 1);
    expect(shell.legend?.isOpen()).toBe(false);
    expect(document.activeElement).toBe(shell.menu.trigger);
  });
});

describe("legend on a read-only canvas (view-only, stays usable)", () => {
  it("closes from its card and reopens from the menu checkbox, never aria-disabled", () => {
    vi.useFakeTimers();
    const onToggle = vi.fn();
    const { shell, root } = mount({ legend: { render() {}, open: true, onToggle } });
    const close = chrome(root, "legend").querySelector<HTMLButtonElement>(".cd-shell-legend-close");
    shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
    vi.advanceTimersByTime(INVALID_STATUS_DELAY_MS);
    expect(root.hasAttribute("data-readonly")).toBe(true);
    expect(close?.hasAttribute("aria-disabled")).toBe(false);
    close?.click();
    expect(shell.legend?.isOpen()).toBe(false);

    shell.menu.open();
    const checkbox = shell.menu.dropdown.querySelector<HTMLElement>('[data-menu-id="legend"]');
    expect(checkbox?.hasAttribute("aria-disabled")).toBe(false);
    checkbox?.click();
    expect(shell.legend?.isOpen()).toBe(true);
    expect(onToggle.mock.calls).toEqual([[false], [true]]);
  });
});

describe("inspector (guide §5.11)", () => {
  it("opens and closes the aside and the root attribute", () => {
    const { shell, root } = mount({ inspector: { label: "Properties" } });
    const aside = chrome(root, "inspector");
    expect(shell.inspector?.element).toBe(aside);
    shell.inspector?.open();
    expect(aside.hidden).toBe(false);
    expect(root.getAttribute("data-inspector")).toBe("open");
    expect(shell.inspector?.isOpen()).toBe(true);
    shell.inspector?.close();
    expect(aside.hidden).toBe(true);
    expect(root.hasAttribute("data-inspector")).toBe(false);
  });
});

describe("empty-file hint (guide §13.5)", () => {
  it("shows text and the example button centred in the free rectangle", () => {
    const onInsertExample = vi.fn();
    const { shell, root } = mount({ emptyHint: { onInsertExample } });
    const hint = root.querySelector<HTMLElement>(".cd-shell-hint")!;
    shell.setEmptyHint(true);
    expect(hint.hidden).toBe(false);
    expect(hint.querySelector(".cd-shell-hint-text")?.textContent).toBe(
      "Pick a tool from the palette to start.",
    );
    const action = hint.querySelector<HTMLButtonElement>(".cd-shell-hint-action")!;
    expect(action.textContent).toBe("Insert example");
    expect(hint.style.inset).toBe("88px 24px 64px 24px");
    action.click();
    expect(onInsertExample).toHaveBeenCalledTimes(1);
    shell.setEmptyHint(false);
    expect(hint.hidden).toBe(true);
  });

  it("has no button without an example", () => {
    const { root } = mount({ emptyHint: {} });
    expect(root.querySelector(".cd-shell-hint-action")).toBeNull();
  });
});

describe("fitInsets and the palette row (guide §5.9, §5.15)", () => {
  it("starts from the plain insets", () => {
    const { shell } = mount();
    expect(shell.fitInsets()).toEqual({ top: 88, right: 24, bottom: 64, left: 24 });
  });

  it("counts the open legend's width and the side inspector", () => {
    const { shell, root } = mount({
      legend: { render() {}, open: true },
      inspector: { label: "Properties" },
    });
    setBox(chrome(root, "legend"), { left: 12, top: 600, width: 200, height: 100 });
    expect(shell.fitInsets().left).toBe(12 + 200 + 24);
    shell.inspector?.open();
    expect(shell.fitInsets().right).toBe(324);
    shell.legend?.setOpen(false);
    expect(shell.fitInsets()).toEqual({ top: 88, right: 324, bottom: 64, left: 24 });
  });

  it("counts the bottom sheet's top edge in narrow containers", () => {
    const { shell, root } = mount(
      { inspector: { label: "Properties" } },
      { width: 700, height: 800 },
    );
    shell.inspector?.open();
    setBox(chrome(root, "inspector"), { left: 12, top: 500, width: 676, height: 288 });
    expect(shell.fitInsets()).toEqual({ top: 140, right: 24, bottom: 800 - 500 + 12, left: 24 });
  });

  it("web: reserves room for the shown pill", () => {
    const { shell } = mount({ host: "web", problems: { onActivate() {} } });
    shell.setProblems({ count: 1, errors: 1 });
    expect(shell.fitInsets().bottom).toBe(92);
    shell.setProblems({ count: 0, errors: 0 });
    expect(shell.fitInsets().bottom).toBe(64);
  });

  it("moves the palette to the second row up to 760px and when it would crowd the menu", () => {
    const { shell, root } = mount({}, { width: 1000, height: 800 });
    expect(root.getAttribute("data-palette")).toBe("top");
    const palette = fakePalette();
    Object.defineProperty(palette.element, "scrollWidth", { configurable: true, value: 400 });
    shell.registerPalette(palette);
    expect(root.getAttribute("data-palette")).toBe("top");

    Object.defineProperty(palette.element, "scrollWidth", { configurable: true, value: 880 });
    FakeResizeObserver.resize(palette.element);
    expect(root.getAttribute("data-palette")).toBe("second-row");
    expect(shell.fitInsets().top).toBe(140);

    Object.defineProperty(palette.element, "scrollWidth", { configurable: true, value: 400 });
    setContainerSize(root, 760, 800);
    FakeResizeObserver.resize(root);
    expect(root.getAttribute("data-palette")).toBe("second-row");
    setContainerSize(root, 761, 800);
    FakeResizeObserver.resize(root);
    expect(root.getAttribute("data-palette")).toBe("top");
  });

  it("measures the menu trigger for the clearance", () => {
    const { shell, root } = mount(
      { menu: { export: [{ kind: "action", id: "png", label: "Export as PNG", onSelect() {} }] } },
      { width: 1000, height: 800 },
    );
    setBox(shell.menu.trigger, { left: 12, top: 12, width: 40, height: 40 });
    const palette = fakePalette();
    // (1000 − 864) / 2 = 68 = 52 + 16: just fits
    Object.defineProperty(palette.element, "scrollWidth", { configurable: true, value: 864 });
    shell.registerPalette(palette);
    expect(root.getAttribute("data-palette")).toBe("top");
    setBox(shell.menu.trigger, { left: 12, top: 12, width: 41, height: 40 });
    FakeResizeObserver.resize(root);
    expect(root.getAttribute("data-palette")).toBe("second-row");
  });

  it("skips a 0 × 0 container (hidden tab)", () => {
    const { root } = mount({}, { width: 600, height: 800 });
    expect(root.getAttribute("data-palette")).toBe("second-row");
    setContainerSize(root, 0, 0);
    FakeResizeObserver.resize(root);
    expect(root.getAttribute("data-palette")).toBe("second-row");
  });

  it("re-places the shown hint on a layout change", () => {
    const { shell, root } = mount({ emptyHint: {}, inspector: { label: "Properties" } });
    shell.setEmptyHint(true);
    shell.inspector?.open();
    expect(root.querySelector<HTMLElement>(".cd-shell-hint")?.style.inset).toBe(
      "88px 324px 64px 24px",
    );
  });
});

const LOCKED = { locked: true, shown: false };
const READ_ONLY = { locked: true, shown: true };
const EDITABLE = { locked: false, shown: false };

describe("palette registration", () => {
  it("forwards the read-only state on registration and on every setReadOnly", () => {
    const { shell, root } = mount();
    shell.setReadOnly(true);
    expect(root.getAttribute("data-readonly")).toBe("");
    expect(shell.isReadOnly()).toBe(true);
    const palette = fakePalette();
    shell.registerPalette(palette);
    shell.setReadOnly(false);
    shell.setReadOnly(false);
    expect(palette.readOnlyCalls).toEqual([READ_ONLY, EDITABLE, EDITABLE]);
    expect(root.hasAttribute("data-readonly")).toBe(false);
  });

  it("observes only the current palette and unregisters once", () => {
    const { shell } = mount();
    const first = fakePalette();
    const second = fakePalette();
    const unregisterFirst = shell.registerPalette(first);
    shell.registerPalette(second);
    const observer = FakeResizeObserver.instances.find((candidate) =>
      candidate.observed.has(second.element),
    )!;
    expect(observer).toBeDefined();
    expect(observer.observed.has(first.element)).toBe(false);
    expect(observer.observed.has(second.element)).toBe(true);
    unregisterFirst();
    expect(observer.observed.has(second.element)).toBe(true);
    shell.setReadOnly(true);
    expect(first.readOnlyCalls).toEqual([EDITABLE]);
    expect(second.readOnlyCalls).toEqual([EDITABLE, READ_ONLY]);
  });
});

describe("read-only (guide §13.5)", () => {
  it("locks at once and shows its marks after the delay, keeping the first timer", () => {
    vi.useFakeTimers();
    const { shell, root } = mount({
      menu: { model: [{ kind: "action", id: "size", label: "Map size…", onSelect() {} }] },
    });
    const palette = fakePalette();
    shell.registerPalette(palette);

    shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
    expect(shell.isReadOnly()).toBe(true);
    expect(root.hasAttribute("data-readonly")).toBe(false);
    expect(palette.readOnlyCalls.at(-1)).toEqual(LOCKED);
    shell.menu.open();
    expect(
      shell.menu.dropdown.querySelector('[data-menu-id="size"]')?.getAttribute("aria-disabled"),
    ).toBe("true");
    shell.menu.close();

    vi.advanceTimersByTime(INVALID_STATUS_DELAY_MS - 300);
    shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
    vi.advanceTimersByTime(299);
    expect(root.hasAttribute("data-readonly")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(root.getAttribute("data-readonly")).toBe("");
    expect(palette.readOnlyCalls.at(-1)).toEqual(READ_ONLY);
  });

  it("unlocks at once and drops a pending timer", () => {
    vi.useFakeTimers();
    const { shell, root } = mount();
    const palette = fakePalette();
    shell.registerPalette(palette);
    shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
    shell.setReadOnly(false);
    expect(shell.isReadOnly()).toBe(false);
    vi.advanceTimersByTime(2 * INVALID_STATUS_DELAY_MS);
    expect(root.hasAttribute("data-readonly")).toBe(false);
    expect(palette.readOnlyCalls.at(-1)).toEqual(EDITABLE);
  });

  it("hands a palette registered during the delay the lock without the marks", () => {
    vi.useFakeTimers();
    const { shell } = mount();
    shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
    const palette = fakePalette();
    shell.registerPalette(palette);
    expect(palette.readOnlyCalls).toEqual([LOCKED]);
    vi.advanceTimersByTime(INVALID_STATUS_DELAY_MS);
    expect(palette.readOnlyCalls).toEqual([LOCKED, READ_ONLY]);
  });

  it("clears the timer on destroy", () => {
    vi.useFakeTimers();
    const { shell, root } = mount();
    shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
    shell.destroy();
    vi.advanceTimersByTime(2 * INVALID_STATUS_DELAY_MS);
    expect(root.hasAttribute("data-readonly")).toBe(false);
  });
});
