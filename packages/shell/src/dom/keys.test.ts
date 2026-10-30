import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShellHost } from "../core/index.js";
import {
  cleanup,
  documentKeyups,
  fakeZoomTarget,
  installFakes,
  keydown,
  keyup,
  mount,
} from "../../test/support/dom.js";

beforeEach(installFakes);
afterEach(cleanup);

const HANDLED = [
  { key: "=", code: "Equal", metaKey: true },
  { key: "+", code: "Equal", metaKey: true, shiftKey: true },
  { key: "+", code: "NumpadAdd", ctrlKey: true },
  { key: "-", code: "Minus", ctrlKey: true },
  { key: "_", code: "Minus", metaKey: true, shiftKey: true },
  { key: "-", code: "NumpadSubtract", metaKey: true },
  { key: "0", code: "Digit0", metaKey: true },
  { key: "Insert", code: "Numpad0", ctrlKey: true },
  { key: "!", code: "Digit1", shiftKey: true },
];

function windowSpy() {
  const seen: string[] = [];
  const listener = (event: KeyboardEvent) => seen.push(`${event.key}/${event.code}`);
  window.addEventListener("keydown", listener);
  return { seen, dispose: () => window.removeEventListener("keydown", listener) };
}

/**
 * An element that edits through an `EditContext` (happy-dom has none, so the property is set as
 * Chromium sets it) and a focusable element inside a Monaco editor that is neither.
 */
function codeEditors(root: HTMLElement): HTMLElement[] {
  const editContextEditor = root.appendChild(document.createElement("div"));
  Object.defineProperty(editContextEditor, "editContext", { value: {} });
  const monaco = root.appendChild(document.createElement("div"));
  monaco.className = "monaco-editor";
  const insideMonaco = monaco.appendChild(document.createElement("div"));
  insideMonaco.tabIndex = -1;
  return [editContextEditor, insideMonaco];
}

describe("the one keydown listener", () => {
  it("ide: every chrome key acts exactly once and never reaches window", () => {
    const { shell } = mount({ host: "ide" });
    const target = fakeZoomTarget(1.5);
    shell.setZoomTarget(target);
    const spy = windowSpy();
    for (const init of HANDLED) {
      expect(keydown(document.body, init).defaultPrevented, init.code).toBe(true);
    }
    spy.dispose();
    expect(spy.seen).toEqual([]);
    expect(target.calls).toEqual([
      "step:1",
      "step:1",
      "step:1",
      "step:-1",
      "step:-1",
      "step:-1",
      "actual",
      "actual",
      "fit",
    ]);
  });

  it("ide: Escape with the open menu closes it and stays in the webview", () => {
    const { shell } = mount({
      host: "ide",
      menu: { export: [{ kind: "action", id: "png", label: "Export as PNG", onSelect() {} }] },
    });
    shell.menu.open();
    const spy = windowSpy();
    const event = keydown(document.activeElement!, { key: "Escape", code: "Escape" });
    spy.dispose();
    expect(event.defaultPrevented).toBe(true);
    expect(shell.menu.isOpen()).toBe(false);
    expect(spy.seen).toEqual([]);
  });

  it("ide: keys the canvas handled and undo in text fields stop, the rest goes on to VS Code", () => {
    const { root } = mount({ host: "ide" });
    const svg = root.querySelector(".cd-shell-canvas")!.appendChild(document.createElement("div"));
    svg.addEventListener("keydown", (event) => {
      if (event.key === "a") event.preventDefault();
    });
    const input = root.appendChild(document.createElement("input"));
    const spy = windowSpy();
    keydown(svg, { key: "a", code: "KeyA", metaKey: true });
    const undo = keydown(input, { key: "z", code: "KeyZ", metaKey: true });
    keydown(input, { key: "=", code: "Equal", metaKey: true });
    keydown(input, { key: "!", code: "Digit1", shiftKey: true });
    keydown(svg, { key: "s", code: "KeyS", metaKey: true });
    keydown(svg, { key: "=", code: "Equal" });
    spy.dispose();
    expect(undo.defaultPrevented).toBe(false);
    expect(spy.seen).toEqual(["!/Digit1", "s/KeyS", "=/Equal"]);
  });

  it("does not zoom in text fields, while composing or with a modal dialog", () => {
    const { shell, root } = mount({ host: "web" });
    const target = fakeZoomTarget(0.5);
    shell.setZoomTarget(target);
    const editable = root.appendChild(document.createElement("div"));
    editable.contentEditable = "true";
    expect(keydown(editable, { key: "=", code: "Equal", metaKey: true }).defaultPrevented).toBe(
      false,
    );
    expect(
      keydown(document.body, { key: "=", code: "Equal", metaKey: true, isComposing: true })
        .defaultPrevented,
    ).toBe(false);
    const dialog = root.appendChild(document.createElement("div"));
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    expect(
      keydown(document.body, { key: "0", code: "Digit0", ctrlKey: true }).defaultPrevented,
    ).toBe(false);
    dialog.hidden = true;
    expect(
      keydown(document.body, { key: "0", code: "Digit0", ctrlKey: true }).defaultPrevented,
    ).toBe(true);
    expect(target.calls).toEqual(["actual"]);
  });

  it("leaves the chrome keys to an EditContext editor and to a Monaco editor", () => {
    const { shell, root } = mount({ host: "web" });
    const target = fakeZoomTarget(1);
    shell.setZoomTarget(target);
    const spy = windowSpy();
    for (const editor of codeEditors(root)) {
      const typed = keydown(editor, { key: "!", code: "Digit1", shiftKey: true });
      const zoomIn = keydown(editor, { key: "=", code: "Equal", ctrlKey: true });
      const zoomOut = keydown(editor, { key: "-", code: "Minus", metaKey: true });
      expect([typed, zoomIn, zoomOut].map((event) => event.defaultPrevented)).toEqual([
        false,
        false,
        false,
      ]);
    }
    spy.dispose();
    expect(target.calls).toEqual([]);
    expect(spy.seen).toHaveLength(6);
  });

  it("ide: in an EditContext or Monaco editor Shift+1 types, undo and the zoom keys stop", () => {
    const { shell, root } = mount({ host: "ide" });
    const target = fakeZoomTarget(1);
    shell.setZoomTarget(target);
    const spy = windowSpy();
    for (const editor of codeEditors(root)) {
      keydown(editor, { key: "!", code: "Digit1", shiftKey: true });
      expect(keydown(editor, { key: "z", code: "KeyZ", metaKey: true }).defaultPrevented).toBe(
        false,
      );
      expect(keydown(editor, { key: "=", code: "Equal", metaKey: true }).defaultPrevented).toBe(
        false,
      );
    }
    spy.dispose();
    expect(target.calls).toEqual([]);
    expect(spy.seen).toEqual(["!/Digit1", "!/Digit1"]);
  });

  it("web: zoom keys zoom the diagram, not the page, and still reach window", () => {
    const { shell } = mount({ host: "web" });
    const target = fakeZoomTarget(1);
    shell.setZoomTarget(target);
    const spy = windowSpy();
    const event = keydown(document.body, { key: "-", code: "Minus", ctrlKey: true });
    spy.dispose();
    expect(event.defaultPrevented).toBe(true);
    expect(spy.seen).toEqual(["-/Minus"]);
    expect(target.calls).toEqual(["step:-1"]);
  });

  it("zoom out never zooms in below 20 %", () => {
    const { shell } = mount();
    const target = fakeZoomTarget(0.15);
    shell.setZoomTarget(target);
    expect(
      keydown(document.body, { key: "-", code: "Minus", metaKey: true }).defaultPrevented,
    ).toBe(true);
    expect(target.calls).toEqual([]);
  });

  it("embedded: listens on the root only, so keys outside the modeler stay the page's", () => {
    const { shell, root } = mount({ host: "embedded" });
    const target = fakeZoomTarget(1);
    shell.setZoomTarget(target);
    const outside = document.body.appendChild(document.createElement("button"));
    expect(keydown(outside, { key: "=", code: "Equal", metaKey: true }).defaultPrevented).toBe(
      false,
    );
    expect(
      keydown(root.querySelector(".cd-shell-canvas")!, { key: "=", code: "Equal", metaKey: true })
        .defaultPrevented,
    ).toBe(true);
    expect(target.calls).toEqual(["step:1"]);
  });

  it("keyScope overrides the host default", () => {
    const { shell } = mount({ host: "embedded", keyScope: "document" });
    const target = fakeZoomTarget(1);
    shell.setZoomTarget(target);
    keydown(document.body, { key: "!", code: "Digit1", shiftKey: true });
    expect(target.calls).toEqual(["fit"]);
  });

  it("installs exactly one keydown listener on its target", () => {
    const add = vi.spyOn(document, "addEventListener");
    mount({
      host: "ide",
      menu: { export: [{ kind: "action", id: "png", label: "Export as PNG", onSelect() {} }] },
    });
    expect(add.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    expect(add.mock.calls.find(([type]) => type === "keydown")?.[2]).toBeUndefined();
  });
});

describe("dialogs a modeler hides through CSS", () => {
  it("count as closed: zoom keys act again", () => {
    const { shell } = mount();
    const target = fakeZoomTarget(1);
    shell.setZoomTarget(target);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    keydown(document.body, { key: "=", code: "Equal", metaKey: true });
    expect(target.calls).toEqual([]);
    dialog.style.display = "none";
    keydown(document.body, { key: "=", code: "Equal", metaKey: true });
    expect(target.calls).toEqual(["step:1"]);
  });
});

describe("the keyup of an Escape that closed the menu (#482)", () => {
  const MENU = {
    export: [{ kind: "action" as const, id: "png", label: "Export as PNG", onSelect() {} }],
  };

  it.each<ShellHost>(["ide", "web", "embedded"])(
    "%s: stops before document, where diagram-js's dragging would put down an armed tool",
    (host) => {
      const { shell } = mount({ host, menu: MENU });
      shell.menu.open();
      const keyups = documentKeyups();

      keydown(document.activeElement!, { key: "Escape", code: "Escape" });
      expect(shell.menu.isOpen()).toBe(false);
      keyup(document.activeElement!, { key: "Escape", code: "Escape" });

      keydown(document.activeElement!, { key: "Escape", code: "Escape" });
      keyup(document.activeElement!, { key: "Escape", code: "Escape" });
      keyups.dispose();
      expect(keyups.seen).toEqual(["Escape"]);
    },
  );

  it("lets the keyups of other keys through and waits through the repeats of a held Escape", () => {
    const { shell } = mount({ menu: MENU });
    shell.menu.open();
    const keyups = documentKeyups();

    keydown(document.activeElement!, { key: "Escape", code: "Escape" });
    keyup(document.activeElement!, { key: "Shift", code: "ShiftLeft" });
    keydown(document.activeElement!, { key: "Escape", code: "Escape", repeat: true });
    keyup(document.activeElement!, { key: "Escape", code: "Escape" });
    keyups.dispose();

    expect(keyups.seen).toEqual(["Shift"]);
  });

  it("lets the keyup of the next Escape through when the first one's went elsewhere", () => {
    const { shell } = mount({ menu: MENU });
    shell.menu.open();
    const keyups = documentKeyups();

    keydown(document.activeElement!, { key: "Escape", code: "Escape" });
    keydown(document.activeElement!, { key: "Escape", code: "Escape" });
    keyup(document.activeElement!, { key: "Escape", code: "Escape" });
    keyups.dispose();

    expect(keyups.seen).toEqual(["Escape"]);
  });

  it("lets the keyup of an Escape through that closed nothing, and one the IME composed", () => {
    const { shell } = mount({ menu: MENU });
    const keyups = documentKeyups();

    keydown(shell.menu.trigger, { key: "Escape", code: "Escape" });
    keyup(shell.menu.trigger, { key: "Escape", code: "Escape" });
    shell.menu.open();
    keydown(document.activeElement!, { key: "Escape", code: "Escape", isComposing: true });
    keyup(document.activeElement!, { key: "Escape", code: "Escape" });
    keyups.dispose();

    expect(shell.menu.isOpen()).toBe(true);
    expect(keyups.seen).toEqual(["Escape", "Escape"]);
  });
});
