import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chromeShortcutRows, defaultMessages } from "../core/index.js";
import { openShellDialog, type ShellDialog, type ShellDialogOptions } from "./dialog.js";
import { showShortcutsDialog } from "./shortcuts-dialog.js";
import {
  FakeResizeObserver,
  cleanup,
  click,
  installFakes,
  keydown,
  pointer,
  setBox,
} from "../../test/support/dom.js";

beforeEach(installFakes);
afterEach(cleanup);

const opened: ShellDialog[] = [];
afterEach(() => {
  for (const dialog of opened.splice(0)) dialog.close();
});

/** happy-dom queues `close` like a browser; the dialog's own teardown runs then. */
const closeEvent = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options: Partial<ShellDialogOptions> = {}) {
  const container = document.createElement("div");
  const opener = document.createElement("button");
  document.body.append(opener, container);
  opener.focus();
  const dialog = openShellDialog({
    container,
    title: "Keyboard shortcuts",
    render(body) {
      body.append(document.createTextNode("Content"));
    },
    ...options,
  });
  opened.push(dialog);
  const element = container.querySelector<HTMLDialogElement>("dialog.cd-shell-dialog")!;
  return { container, opener, dialog, element };
}

function closeButton(element: HTMLElement): HTMLButtonElement {
  return element.querySelector<HTMLButtonElement>(".cd-shell-dialog-close")!;
}

/** A body taller than its box: the dialog makes it a Tab stop. */
function scrollingBody(body: HTMLElement): void {
  Object.defineProperty(body, "scrollHeight", { configurable: true, value: 900 });
  Object.defineProperty(body, "clientHeight", { configurable: true, value: 300 });
}

describe("openShellDialog (guide §8)", () => {
  it("opens a modal <dialog> in the container, named by its title", () => {
    const { element, dialog } = setup({ className: "demo-dialog", lang: "de" });

    expect(element.open).toBe(true);
    expect(dialog.isOpen()).toBe(true);
    expect(element.className).toBe("cd-shell-dialog demo-dialog");
    expect(element.getAttribute("lang")).toBe("de");
    const title = element.querySelector(".cd-shell-dialog-header > h2.cd-shell-dialog-title");
    expect(title?.textContent).toBe("Keyboard shortcuts");
    expect(element.getAttribute("aria-labelledby")).toBe(title?.id);
    expect(element.querySelector(".cd-shell-dialog-body")?.textContent).toBe("Content");
  });

  it("gives Close an aria-label, the lucide x and no text", () => {
    const { element } = setup();
    const close = closeButton(element);
    expect(close.type).toBe("button");
    expect(close.getAttribute("aria-label")).toBe(defaultMessages.close);
    expect(close.textContent).toBe("");
    expect(close.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(closeButton(setup({ closeLabel: "Schließen" }).element).getAttribute("aria-label")).toBe(
      "Schließen",
    );
  });

  it("gives every dialog of the page its own title id", () => {
    const first = setup().element.getAttribute("aria-labelledby");
    const second = setup().element.getAttribute("aria-labelledby");
    expect(first).not.toBe(second);
  });

  it("closes on Close, leaves the DOM and returns the focus to the element that had it", async () => {
    const onClose = vi.fn();
    const { element, opener, dialog, container } = setup({ onClose });
    closeButton(element).focus();

    click(closeButton(element), 1);
    await closeEvent();

    expect(dialog.isOpen()).toBe(false);
    expect(container.querySelector("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it("closes through its handle at once, and a second close does nothing", () => {
    const onClose = vi.fn();
    const { dialog, container, opener } = setup({ onClose });

    dialog.close();
    dialog.close();

    expect(container.querySelector("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it("closes when the browser closes it (Escape)", async () => {
    const { element, container } = setup();
    element.close();
    await closeEvent();
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("hands the focus to the fallback when the element that had it is gone", () => {
    const fallback = document.createElement("button");
    document.body.append(fallback);
    const { opener, dialog } = setup({ focusFallback: () => fallback.focus() });
    opener.remove();

    dialog.close();

    expect(document.activeElement).toBe(fallback);
  });

  it("closes on a click on the backdrop, not on one that started on the panel", () => {
    const { element, dialog } = setup();
    setBox(element, { left: 360, top: 200, width: 560, height: 400 });

    pointer(element, "pointerdown", { clientX: 600, clientY: 300 });
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
    expect(dialog.isOpen()).toBe(true);

    pointer(element, "pointerdown", { clientX: 360, clientY: 300 });
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 360, clientY: 300 }));
    expect(dialog.isOpen()).toBe(true);

    pointer(element, "pointerdown", { clientX: 10, clientY: 10 });
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
    expect(element.open).toBe(false);
  });

  it("keeps Tab and Shift+Tab inside: one stop holds the focus", () => {
    const { element } = setup();
    const close = closeButton(element);
    close.focus();

    expect(keydown(close, { key: "Tab" }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    expect(keydown(close, { key: "Tab", shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it("makes a scrolling body a Tab stop and moves between Close and the body itself", () => {
    const { element } = setup({ render: scrollingBody });
    const close = closeButton(element);
    const body = element.querySelector<HTMLElement>(".cd-shell-dialog-body")!;
    expect(body.getAttribute("tabindex")).toBe("0");

    body.focus();
    expect(keydown(body, { key: "Tab" }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    expect(keydown(close, { key: "Tab", shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(body);
    // WebKit's own Shift+Tab would skip Close and land on the <dialog>.
    expect(keydown(body, { key: "Tab", shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    expect(keydown(close, { key: "Tab" }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(body);
  });

  it("walks the stops of its content in DOM order, a radio group as one stop", () => {
    const { element } = setup({
      render(body) {
        body.innerHTML = `
          <input id="title">
          <input type="radio" name="size" id="small"><input type="radio" name="size" id="large" checked>
          <button id="hidden" hidden>Hidden</button>
          <button id="apply">Apply</button>`;
      },
    });
    const close = closeButton(element);
    const walk = (key: Partial<KeyboardEventInit>) => {
      const seen: string[] = [];
      for (let press = 0; press < 4; press++) {
        keydown(document.activeElement!, { key: "Tab", ...key });
        seen.push(document.activeElement!.id || document.activeElement!.className);
      }
      return seen;
    };
    close.focus();

    expect(walk({})).toEqual(["title", "large", "apply", "cd-shell-dialog-close"]);
    expect(walk({ shiftKey: true })).toEqual(["apply", "large", "title", "cd-shell-dialog-close"]);
  });

  it("leaves the Tab of a dialog opened above it to that dialog", () => {
    const below = setup();
    const above = setup({ render: scrollingBody });
    const aboveClose = closeButton(above.element);
    const aboveBody = above.element.querySelector<HTMLElement>(".cd-shell-dialog-body")!;
    aboveClose.focus();

    expect(keydown(aboveClose, { key: "Tab" }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(aboveBody);
    expect(keydown(aboveBody, { key: "Tab", shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(aboveClose);
    expect(below.element.contains(document.activeElement)).toBe(false);
  });

  it("leaves the Tab of a host's own modal dialog above it to the browser", () => {
    setup();
    const host = document.createElement("dialog");
    host.innerHTML = '<input id="first"><input id="second">';
    document.body.append(host);
    host.showModal();
    const first = host.querySelector<HTMLInputElement>("#first")!;
    first.focus();

    expect(keydown(first, { key: "Tab" }).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);
    host.close();
    host.remove();
  });

  it("leaves a Tab alone that the dialog's content handled itself", () => {
    const { element } = setup({ render: scrollingBody });
    const body = element.querySelector<HTMLElement>(".cd-shell-dialog-body")!;
    body.addEventListener("keydown", (event) => event.preventDefault());
    body.focus();

    keydown(body, { key: "Tab" });

    expect(document.activeElement).toBe(body);
  });

  it("drops the body's Tab stop once it no longer scrolls", () => {
    const { element } = setup({ render: scrollingBody });
    const body = element.querySelector<HTMLElement>(".cd-shell-dialog-body")!;
    Object.defineProperty(body, "scrollHeight", { configurable: true, value: 300 });
    FakeResizeObserver.resize(body);
    expect(body.hasAttribute("tabindex")).toBe(false);
  });

  it("keeps the focus inside when the focused body stops scrolling", () => {
    const { element } = setup({ render: scrollingBody });
    const body = element.querySelector<HTMLElement>(".cd-shell-dialog-body")!;
    body.focus();

    Object.defineProperty(body, "scrollHeight", { configurable: true, value: 300 });
    FakeResizeObserver.resize(body);

    expect(body.hasAttribute("tabindex")).toBe(false);
    expect(document.activeElement).toBe(closeButton(element));
  });

  it("brings a focus that left the dialog back on Tab", () => {
    const { element } = setup();
    const outsider = document.createElement("button");
    document.body.append(outsider);
    outsider.focus();

    expect(keydown(outsider, { key: "Tab" }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeButton(element));
  });

  it("stops listening once closed", () => {
    const { dialog } = setup();
    dialog.close();
    const outsider = document.createElement("button");
    document.body.append(outsider);
    outsider.focus();
    expect(keydown(outsider, { key: "Tab" }).defaultPrevented).toBe(false);
    expect(FakeResizeObserver.instances.every((instance) => instance.disconnected)).toBe(true);
  });
});

describe("showShortcutsDialog without a mounted shell (guide §5.4)", () => {
  const groups = [
    {
      title: "View",
      rows: chromeShortcutRows({ platform: "mac", lang: "en", messages: defaultMessages }),
    },
    { title: "Tools", rows: [] },
    {
      title: "Edit",
      rows: [
        { action: "Undo", keys: ["⌘Z"] },
        { action: "Delete", keys: ["Del", "Backspace"] },
      ],
    },
  ];

  function open(options: Partial<Parameters<typeof showShortcutsDialog>[1]> = {}) {
    const container = document.createElement("div");
    document.body.append(container);
    opened.push(showShortcutsDialog(groups, { container, ...options }));
    return container.querySelector<HTMLDialogElement>("dialog")!;
  }

  it("shows one table per group in their order, without empty ones, named by its heading", () => {
    const element = open();
    expect(element.classList).toContain("cd-shell-shortcuts");
    const sections = [...element.querySelectorAll(".cd-shell-shortcuts-group")];
    expect(sections.map((section) => section.querySelector("h3")?.textContent)).toEqual([
      "View",
      "Edit",
    ]);
    for (const section of sections) {
      const heading = section.querySelector("h3.cd-shell-shortcuts-title")!;
      const table = section.querySelector("table.cd-shell-shortcuts-table")!;
      expect(table.getAttribute("aria-labelledby")).toBe(heading.id);
    }
  });

  it("puts the action in a row header and every key in a chip of the tooltip", () => {
    const element = open();
    const rows = [...element.querySelectorAll("tr")];
    expect(rows.map((row) => row.querySelector('th[scope="row"]')?.textContent)).toEqual([
      "Zoom in",
      "Zoom out",
      "Zoom to 100%",
      "Fit to view",
      "Undo",
      "Delete",
    ]);
    const deleteKeys = [...rows[5]!.querySelectorAll("td.cd-shell-shortcuts-keys > kbd")];
    expect(deleteKeys.map((key) => [key.className, key.textContent])).toEqual([
      ["cd-shell-kbd", "Del"],
      ["cd-shell-kbd", "Backspace"],
    ]);
  });

  it("marks the chrome's rows with their key", () => {
    const element = open();
    expect(
      [...element.querySelectorAll("tr")].map((row) => row.getAttribute("data-chrome-key")),
    ).toEqual(["zoomIn", "zoomOut", "zoomToActual", "fit", null, null]);
  });

  it("takes title and Close from the messages and lang for the container", () => {
    const element = open({
      messages: { shortcutsTitle: "Tastenkürzel", close: "Schließen" },
      lang: "de",
    });
    expect(element.querySelector(".cd-shell-dialog-title")?.textContent).toBe("Tastenkürzel");
    expect(closeButton(element).getAttribute("aria-label")).toBe("Schließen");
    expect(element.getAttribute("lang")).toBe("de");
  });
});
