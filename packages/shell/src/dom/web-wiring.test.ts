import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FakeResizeObserver,
  canvasWithSvg,
  chrome,
  cleanup,
  click,
  fakePalette,
  focusingZoomTarget,
  installFakes,
  keydown,
  mount,
  setBox,
} from "../../test/support/dom.js";
import { problemSummary } from "../core/index.js";
import type { ShellOptions } from "./types.js";

beforeEach(installFakes);
afterEach(cleanup);

const komet =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";

/** Every web-column option, as a web app passes them. */
function webOptions(): Partial<ShellOptions> {
  return {
    primary: { onSelect() {} },
    legal: { links: [{ label: "GitHub", href: "https://github.com/Miragon/modeler-suite" }] },
    file: { newDiagram: { onSelect() {} }, open: { onSelect() {} } },
    appearance: { themeColors: { light: "#335DE5", dark: "#1D1D1D" } },
    problems: { onActivate() {} },
    emptyState: { title: "Demo", text: "Start.", komet, onNewDiagram() {} },
    dropZone: { accept: [".demo"], onDrop() {} },
  };
}

function chromeNames(root: HTMLElement): string[] {
  return [...root.querySelectorAll("[data-chrome]")].map(
    (element) => element.getAttribute("data-chrome") ?? "",
  );
}

describe("web-column wiring (0.2)", () => {
  it("renders none of the web column in the IDE host, whatever is passed", () => {
    const { shell, root } = mount({ host: "ide", ...webOptions() });
    expect(chromeNames(root)).toEqual(["menu", "status", "problems", "zoom"]);
    expect(shell.primary).toBeUndefined();
    expect(shell.appearance).toBeUndefined();
    expect(shell.isEmptyStateShown()).toBe(false);
    shell.setEmptyState(true);
    expect(root.hasAttribute("data-empty-state")).toBe(false);
    const handle = shell.toast({ status: "success", text: "Link copied" });
    expect(() => handle.dismiss()).not.toThrow();
  });

  it("keeps the embedded host to toasts and, without onActivate, the problems popover", () => {
    const withList = mount({ host: "embedded", ...webOptions(), problems: {} });
    expect(chromeNames(withList.root)).toEqual([
      "menu",
      "status",
      "problems",
      "zoom",
      "problems-popover",
      "toasts",
    ]);
    const withOwnView = mount({ host: "embedded", problems: { onActivate() {} } });
    expect(chromeNames(withOwnView.root)).not.toContain("problems-popover");
  });

  it("puts the web column in the tab order of §5.14", () => {
    const { root } = mount({ host: "web", ...webOptions() });
    expect(chromeNames(root)).toEqual([
      "menu",
      "primary",
      "status",
      "empty-state",
      "problems",
      "legal",
      "zoom",
      "problems-popover",
      "drop-zone",
      "toasts",
    ]);
    const children = [...root.children];
    expect(children.indexOf(root.querySelector('[data-chrome="primary"]')!)).toBe(1);
    expect(children.at(-1)?.getAttribute("data-chrome")).toBe("toasts");
  });

  it("shows the start screen: root state, inert canvas, chrome keys left to the browser", () => {
    const { shell, root } = mount({ host: "web", ...webOptions() });
    const zoom = {
      zoom: () => 1,
      stepZoom: vi.fn(),
      zoomToActual: vi.fn(),
      fit: vi.fn(),
      canFit: () => true,
    };
    shell.setZoomTarget({ ...zoom, onChange: () => () => {} });

    shell.setEmptyState(true);
    expect(shell.isEmptyStateShown()).toBe(true);
    expect(root.getAttribute("data-empty-state")).toBe("shown");
    expect(shell.canvas.hasAttribute("inert")).toBe(true);
    // No diagram to zoom: the browser zooms the page.
    const event = keydown(document.body, { key: "=", code: "Equal", metaKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(
      keydown(document.body, { key: "!", code: "Digit1", shiftKey: true }).defaultPrevented,
    ).toBe(false);
    expect(zoom.stepZoom).not.toHaveBeenCalled();
    expect(zoom.fit).not.toHaveBeenCalled();

    shell.setEmptyState(false);
    expect(root.hasAttribute("data-empty-state")).toBe(false);
    expect(shell.canvas.hasAttribute("inert")).toBe(false);
    keydown(document.body, { key: "=", code: "Equal", metaKey: true });
    expect(zoom.stepZoom).toHaveBeenCalledTimes(1);
  });

  it("hands the focus of a closed toast to New diagram on the start screen", () => {
    const { shell, root } = mount({ host: "web", ...webOptions() });
    shell.setEmptyState(true);
    shell.toast({ status: "danger", text: "Couldn't read the board in this link." });
    const close = chrome(root, "toasts").querySelector<HTMLButtonElement>(".cd-shell-toast-close");
    close?.focus();
    close?.click();
    const newDiagram = chrome(root, "empty-state").querySelector(
      '.cd-shell-button[data-variant="primary"]',
    );
    expect(document.activeElement).toBe(newDiagram);
  });

  it("makes the canvas slot the page's main landmark in the web host only", () => {
    const web = mount({ host: "web", ...webOptions() });
    expect(web.shell.canvas.getAttribute("role")).toBe("main");
    web.shell.destroy();
    expect(web.shell.canvas.hasAttribute("role")).toBe(false);
    expect(mount({ host: "embedded" }).shell.canvas.hasAttribute("role")).toBe(false);
    expect(mount({ host: "ide" }).shell.canvas.hasAttribute("role")).toBe(false);
  });

  it("keeps the toasts' live regions in the root, outside the stack", () => {
    const { shell, root } = mount({ host: "web", ...webOptions() });
    const live = root.querySelector(".cd-shell-live");
    expect(live?.parentElement).toBe(root);
    expect([...(live?.children ?? [])].map((region) => region.getAttribute("role"))).toEqual([
      "status",
      "alert",
    ]);
    shell.destroy();
    expect(live?.isConnected).toBe(false);
  });

  it("moves a focus the start screen hides to its New diagram button, else leaves it", () => {
    const { shell, root } = mount({ host: "web", ...webOptions() });
    const primary = chrome(root, "primary");
    primary.focus();
    shell.setEmptyState(true);
    const newDiagram = chrome(root, "empty-state").querySelector<HTMLElement>(
      '.cd-shell-button[data-variant="primary"]',
    );
    expect(document.activeElement).toBe(newDiagram);

    shell.setEmptyState(false);
    const legalLink = chrome(root, "legal").querySelector("a");
    legalLink?.focus();
    shell.setEmptyState(true);
    expect(document.activeElement).toBe(legalLink);
  });

  // WebKit and Firefox on macOS leave a clicked button unfocused: the click finds `<body>` focused.
  it("hands the focus to the canvas after a pointer click on the card, though no button took it", () => {
    const { canvas, svg } = canvasWithSvg();
    const calls: string[] = [];
    const { shell, root } = mount({
      host: "web",
      ...webOptions(),
      canvas,
      emptyState: {
        title: "Demo",
        text: "Start.",
        komet,
        onNewDiagram: () => calls.push("new"),
        onShowExample: () => calls.push("example"),
      },
    });
    const card = chrome(root, "empty-state");
    const blur = () => (document.activeElement as HTMLElement | SVGElement | null)?.blur();
    for (const button of card.querySelectorAll(".cd-shell-button")) {
      shell.setEmptyState(true);
      blur();
      click(button, 1);
      expect(document.activeElement).toBe(svg);
    }
    expect(calls).toEqual(["new", "example"]);

    // "Open a file…" keeps the card up until the modeler has loaded the file.
    shell.setEmptyState(true);
    blur();
    click(card.querySelector(".cd-shell-empty-state-open")!, 1);
    expect(shell.isEmptyStateShown()).toBe(true);
    shell.setEmptyState(false);
    expect(document.activeElement).toBe(svg);
  });

  it("leaves a focus that went elsewhere after the pointer click on the card where it is", () => {
    const { canvas } = canvasWithSvg();
    const { shell, root } = mount({ host: "web", ...webOptions(), canvas });
    shell.setEmptyState(true);
    click(chrome(root, "empty-state").querySelector(".cd-shell-empty-state-open")!, 1);
    const legalLink = chrome(root, "legal").querySelector("a");
    legalLink?.focus();
    shell.setEmptyState(false);
    expect(document.activeElement).toBe(legalLink);
  });

  it("hands the focus to the canvas after a pointer click on Share, though no button took it (guide §5.7)", () => {
    const { canvas, svg } = canvasWithSvg();
    const calls: string[] = [];
    const { shell, root } = mount({
      host: "web",
      ...webOptions(),
      canvas,
      primary: { onSelect: () => calls.push(String(document.activeElement === svg)) },
    });
    shell.setZoomTarget(focusingZoomTarget(svg));
    const primary = chrome(root, "primary");
    primary.focus();
    click(primary, 1);
    expect(document.activeElement).toBe(svg);
    expect(calls).toEqual(["true"]);

    (document.activeElement as SVGElement).blur();
    click(primary, 1);
    expect(document.activeElement).toBe(svg);
  });

  it("leaves the focus on Share after Enter or Space, and where the click put it without a zoom target", () => {
    const { canvas, svg } = canvasWithSvg();
    const { shell, root } = mount({ host: "web", ...webOptions(), canvas });
    const primary = chrome(root, "primary");
    primary.focus();
    click(primary, 1);
    expect(document.activeElement).toBe(primary);

    shell.setZoomTarget(focusingZoomTarget(svg));
    click(primary, 0);
    expect(document.activeElement).toBe(primary);
  });

  it("keeps the focus off <body> when the last problem goes while the list holds it", () => {
    const { shell, root } = mount({ host: "web", ...webOptions(), problems: {} });
    shell.setProblems(
      problemSummary([{ severity: "warning", message: "Unused aggregate.", elementId: "Box_1" }]),
    );
    chrome(root, "problems").click();
    const popover = chrome(root, "problems-popover");
    expect(popover.contains(document.activeElement)).toBe(true);
    shell.setProblems({ count: 0, errors: 0 });
    expect(popover.hidden).toBe(true);
    expect(document.activeElement).toBe(shell.menu.trigger);
  });

  it("recomputes the toasts' bottom when the inspector opens and closes", () => {
    const { shell, root } = mount(
      { host: "web", ...webOptions(), inspector: { label: "Properties" } },
      {
        width: 720,
        height: 700,
      },
    );
    const toasts = chrome(root, "toasts");
    const legal = chrome(root, "legal");
    const zoom = chrome(root, "zoom");
    setBox(legal, { left: 12, top: 668, width: 696, height: 20 });
    setBox(zoom, { left: 535, top: 648, width: 173, height: 40 });
    FakeResizeObserver.resize(root);
    const before = toasts.style.bottom;
    // The bottom sheet hides the zoom panel (guide §5.11), so only the legal line stays in the way.
    setBox(zoom, { left: 0, top: 0, width: 0, height: 0 });
    shell.inspector?.open();
    expect(toasts.style.bottom).not.toBe(before);
    expect(toasts.style.bottom).toBe("40px");
  });

  it("stands the bottom row on the legal line's measured height when it wraps", () => {
    const { shell, root } = mount({ host: "web", ...webOptions() }, { width: 320, height: 700 });
    const legal = chrome(root, "legal");
    setBox(legal, { left: 12, top: 668, width: 296, height: 20 });
    FakeResizeObserver.resize(root);
    expect(root.style.getPropertyValue("--modeler-shell-legal-height")).toBe("20px");
    setBox(legal, { left: 12, top: 648, width: 296, height: 40 });
    setBox(chrome(root, "zoom"), { left: 135, top: 588, width: 173, height: 40 });
    FakeResizeObserver.resize(legal);
    expect(root.style.getPropertyValue("--modeler-shell-legal-height")).toBe("40px");
    expect(root.getAttribute("data-zoom-row")).toBe("raised");
    expect(shell.fitInsets().bottom).toBe(112);
    shell.destroy();
    expect(root.style.getPropertyValue("--modeler-shell-legal-height")).toBe("");
  });

  it("decides the top row again when the primary action resizes (a late web font)", () => {
    const { shell, root } = mount({ host: "web", ...webOptions() }, { width: 900, height: 700 });
    const palette = fakePalette();
    for (const [name, value] of Object.entries({
      offsetWidth: 648,
      clientWidth: 646,
      scrollWidth: 646,
    })) {
      Object.defineProperty(palette.element, name, { configurable: true, value });
    }
    shell.registerPalette(palette);
    const primary = chrome(root, "primary");
    Object.defineProperty(primary, "offsetWidth", { configurable: true, value: 80 });
    FakeResizeObserver.resize(primary);
    expect(root.hasAttribute("data-primary")).toBe(false);

    Object.defineProperty(primary, "offsetWidth", { configurable: true, value: 100 });
    FakeResizeObserver.resize(primary);
    expect(root.getAttribute("data-primary")).toBe("collapsed");
    expect(root.getAttribute("data-palette")).toBe("top");
  });

  it("offers shell.appearance to a dark-capable web modeler only", () => {
    expect(mount({ host: "web", ...webOptions() }).shell.appearance).toBeUndefined();
    expect(
      mount({ host: "web", ...webOptions(), themes: ["light", "dark"] }).shell.appearance,
    ).toBeDefined();
  });

  it("removes the web column and the canvas's inert again on destroy", () => {
    const { shell, root } = mount({ host: "web", ...webOptions() });
    shell.setEmptyState(true);
    shell.destroy();
    expect(chromeNames(root)).toEqual([]);
    expect(root.attributes.length).toBe(1); // id="app"
    expect(shell.canvas.hasAttribute("inert")).toBe(false);
  });
});
