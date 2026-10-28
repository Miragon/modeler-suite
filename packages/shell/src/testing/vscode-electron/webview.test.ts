// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  focusCanvasProbe,
  installKeyRecorderProbe,
  selectedElementsProbe,
  takeKeyRecordsProbe,
  workbenchFocusProbe,
  zoomReadoutProbe,
} from "./webview.js";

afterEach(() => {
  document.body.replaceChildren();
});

function keydown(target: EventTarget, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

describe("installKeyRecorderProbe", () => {
  const SHELL_KEYS = new Set(["Equal", "KeyA"]);

  // Like the shell in the IDE host: one listener on the document, there before the recorder,
  // stops what it or the canvas handled.
  beforeAll(() => {
    document.addEventListener("keydown", (event) => {
      if (event.code === "Equal") event.preventDefault();
      if (event.defaultPrevented && SHELL_KEYS.has(event.code)) event.stopPropagation();
    });
    installKeyRecorderProbe();
    installKeyRecorderProbe();
  });

  it("records what was handled and what reached the window, once per key", () => {
    const canvas = document.body.appendChild(document.createElement("div"));
    canvas.addEventListener("keydown", (event) => {
      if (event.code === "KeyA" || event.code === "KeyC") event.preventDefault();
    });

    keydown(canvas, { key: "=", code: "Equal", ctrlKey: true });
    keydown(canvas, { key: "a", code: "KeyA", ctrlKey: true });
    keydown(canvas, { key: "c", code: "KeyC", ctrlKey: true });
    keydown(canvas, { key: "s", code: "KeyS", ctrlKey: true });

    expect(takeKeyRecordsProbe()).toEqual([
      { key: "=", code: "Equal", handled: true, reachedWindow: false },
      { key: "a", code: "KeyA", handled: true, reachedWindow: false },
      { key: "c", code: "KeyC", handled: true, reachedWindow: true },
      { key: "s", code: "KeyS", handled: false, reachedWindow: true },
    ]);
    expect(takeKeyRecordsProbe()).toEqual([]);
  });

  it("leaves handled unknown for a key stopped before the document", () => {
    const root = document.body.appendChild(document.createElement("div"));
    root.addEventListener("keydown", (event) => event.stopPropagation());

    keydown(root, { key: "-", code: "Minus", metaKey: true });

    expect(takeKeyRecordsProbe()).toEqual([
      { key: "-", code: "Minus", handled: null, reachedWindow: false },
    ]);
  });
});

describe("focusCanvasProbe", () => {
  it("focuses the canvas <svg> and clears the text selection", () => {
    document.body.innerHTML =
      '<p>chrome text</p><div class="djs-container"><svg tabindex="0"></svg></div>';
    document.getSelection()?.selectAllChildren(document.body);

    expect(focusCanvasProbe()).toBe(true);
    expect(document.activeElement).toBe(document.querySelector(".djs-container > svg"));
    expect(document.getSelection()?.toString()).toBe("");
  });

  it("is false without a canvas", () => {
    expect(focusCanvasProbe()).toBe(false);
  });
});

describe("zoomReadoutProbe and selectedElementsProbe", () => {
  it("read the zoom panel's readout and the selected canvas elements", () => {
    document.body.innerHTML = [
      '<div data-chrome="zoom"><button data-zoom="out"></button><button data-zoom="actual">86%</button></div>',
      '<svg><g class="djs-element djs-shape selected"></g><g class="djs-element selected"></g>',
      '<g class="djs-element"></g></svg>',
    ].join("");

    expect(zoomReadoutProbe()).toBe("86%");
    expect(selectedElementsProbe()).toBe(2);
  });

  it("read nothing without a zoom panel or a selection", () => {
    expect(zoomReadoutProbe()).toBeNull();
    expect(selectedElementsProbe()).toBe(0);
  });
});

describe("workbenchFocusProbe", () => {
  it("names the side bar, a webview frame and other focused elements", () => {
    // srcdoc: happy-dom loads no frame page from a URL and reports each one as an error.
    document.body.innerHTML = [
      '<div class="part sidebar" id="workbench.parts.sidebar"><div class="monaco-list" tabindex="0"></div></div>',
      '<iframe class="webview ready" srcdoc=""></iframe>',
      '<button class="monaco-button primary">Run</button>',
    ].join("");

    document.querySelector<HTMLElement>(".monaco-list")!.focus();
    expect(workbenchFocusProbe()).toEqual({
      webview: false,
      sideBar: true,
      where: "workbench.parts.sidebar",
    });

    document.querySelector<HTMLElement>("iframe")!.focus();
    expect(workbenchFocusProbe()).toEqual({
      webview: true,
      sideBar: false,
      where: "iframe.webview.ready",
    });

    document.querySelector<HTMLElement>("button")!.focus();
    expect(workbenchFocusProbe()).toMatchObject({ webview: false, sideBar: false });
  });
});
