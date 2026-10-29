// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  documentMarkedProbe,
  focusCanvasProbe,
  focusFrameProbe,
  installKeyRecorderProbe,
  installSizeRecorderProbe,
  legendOpenProbe,
  markDocumentProbe,
  selectedElementsProbe,
  takeKeyRecordsProbe,
  takeSizeRecordsProbe,
  takeViewFramesProbe,
  toggleLegendProbe,
  viewFactsProbe,
  watchViewFramesProbe,
  webviewFrameShownProbe,
  webviewMotionProbe,
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

describe("viewFactsProbe", () => {
  // happy-dom reads no transform list from the attribute, so the viewport brings the matrix itself.
  function viewportWithMatrix(matrix: { a: number; e: number; f: number } | null): void {
    const viewport = document.querySelector(".viewport");
    Object.defineProperty(viewport, "transform", {
      value: { baseVal: { consolidate: () => (matrix ? { matrix } : null) } },
    });
  }

  it("reads the viewport's scale and translation, the drawn elements and the selected ones", () => {
    document.body.innerHTML = [
      '<div class="djs-container"><svg><g class="viewport">',
      '<g class="djs-group"><g class="djs-element djs-shape selected" data-element-id="shape-b"></g></g>',
      '<g class="djs-group"><g class="djs-element djs-shape" data-element-id="shape-a"></g></g>',
      '<g class="djs-group"><g class="djs-element djs-connection selected" data-element-id="conn-1"></g></g>',
      '<g class="djs-group"><g class="djs-element djs-shape"></g></g>',
      "</g></svg></div>",
    ].join("");
    viewportWithMatrix({ a: 0.84, e: 12.4, f: -8 });

    expect(viewFactsProbe()).toEqual({
      scale: 0.84,
      translateX: 12.4,
      translateY: -8,
      elements: ["conn-1", "shape-a", "shape-b"],
      selected: ["conn-1", "shape-b"],
    });
  });

  it("falls back to the identity before the viewport has a transform, and to no elements without a canvas", () => {
    document.body.innerHTML =
      '<div class="djs-container"><svg><g class="viewport"></g></svg></div>';
    viewportWithMatrix(null);
    expect(viewFactsProbe()).toEqual({
      scale: 1,
      translateX: 0,
      translateY: 0,
      elements: [],
      selected: [],
    });

    document.body.replaceChildren();
    expect(viewFactsProbe().elements).toEqual([]);
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

describe("webviewMotionProbe", () => {
  afterEach(() => {
    document.body.classList.remove("vscode-reduce-motion");
    document.documentElement.classList.remove("cd-shell-reduce-motion");
  });

  it("reads VS Code's class on <body> and the shell's mirror on <html> apart", () => {
    const classes = { body: "vscode-reduce-motion", html: "cd-shell-reduce-motion" };
    const html = document.documentElement;
    expect(webviewMotionProbe(html, classes)).toEqual({ body: false, html: false });

    document.body.classList.add("vscode-reduce-motion");
    expect(webviewMotionProbe(html, classes)).toEqual({ body: true, html: false });

    html.classList.add("cd-shell-reduce-motion");
    expect(webviewMotionProbe(html, classes)).toEqual({ body: true, html: true });
  });
});

describe("watchViewFramesProbe and takeViewFramesProbe", () => {
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  it("records every view the viewport shows from frame to frame, the first one included", async () => {
    document.body.innerHTML =
      '<div class="djs-container"><svg><g class="viewport"></g></svg></div>';
    const matrix = { a: 1, d: 1, e: 0, f: 0 };
    Object.defineProperty(document.querySelector(".viewport"), "transform", {
      value: { baseVal: { consolidate: () => ({ matrix }) } },
    });

    expect(watchViewFramesProbe()).toBe(true);
    await frame();
    Object.assign(matrix, { a: 0.8, d: 0.8, e: 10 });
    await frame();
    await frame();
    Object.assign(matrix, { a: 0.62, d: 0.62, e: 24.5 });
    await frame();
    await frame();

    expect(takeViewFramesProbe()).toEqual(["1 1 0 0", "0.8 0.8 10 0", "0.62 0.62 24.5 0"]);
    expect(takeViewFramesProbe()).toEqual([]);
  });

  it("is false without a canvas", () => {
    expect(watchViewFramesProbe()).toBe(false);
    expect(takeViewFramesProbe()).toEqual([]);
  });
});

describe("markDocumentProbe", () => {
  it("leaves a mark only a new document lacks", () => {
    expect(documentMarkedProbe()).toBe(false);
    markDocumentProbe();
    expect(documentMarkedProbe()).toBe(true);
  });
});

describe("installSizeRecorderProbe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records the sizes the canvas container reports, once per document", () => {
    const observers: ((entries: { contentRect: { width: number; height: number } }[]) => void)[] =
      [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: (typeof observers)[number]) {
          observers.push(callback);
        }
        observe(): void {}
      },
    );
    expect(installSizeRecorderProbe()).toBe(false);

    document.body.innerHTML = '<div class="djs-container"></div>';
    expect(installSizeRecorderProbe()).toBe(true);
    expect(installSizeRecorderProbe()).toBe(true);
    expect(observers).toHaveLength(1);

    observers[0]!([{ contentRect: { width: 899.6, height: 600 } }]);
    observers[0]!([{ contentRect: { width: 0, height: 0 } }]);
    expect(takeSizeRecordsProbe()).toEqual([
      { width: 900, height: 600 },
      { width: 0, height: 0 },
    ]);
    expect(takeSizeRecordsProbe()).toEqual([]);
  });
});

describe("legendOpenProbe and toggleLegendProbe", () => {
  /** The shell's menu as far as the probe reaches it: the trigger renders the legend's entry on open. */
  function shellWithLegend(): void {
    document.body.innerHTML = [
      '<button data-chrome="menu" aria-haspopup="menu" aria-expanded="false"></button>',
      '<div class="cd-shell-menu" hidden></div>',
      '<section data-chrome="legend" hidden></section>',
    ].join("");
    const trigger = document.querySelector<HTMLElement>('[data-chrome="menu"]')!;
    const dropdown = document.querySelector<HTMLElement>(".cd-shell-menu")!;
    const legend = document.querySelector<HTMLElement>('[data-chrome="legend"]')!;
    trigger.addEventListener("click", () => {
      const open = trigger.getAttribute("aria-expanded") !== "true";
      trigger.setAttribute("aria-expanded", String(open));
      dropdown.hidden = !open;
      dropdown.innerHTML = open
        ? '<div role="menuitemcheckbox" data-menu-id="legend" aria-checked="false"></div>'
        : "";
      dropdown
        .querySelector('[data-menu-id="legend"]')
        ?.addEventListener("click", () => (legend.hidden = !legend.hidden));
    });
  }

  it("toggles the legend through its menu entry and closes the menu again", () => {
    shellWithLegend();
    expect(legendOpenProbe()).toBe(false);

    expect(toggleLegendProbe()).toBe(true);
    expect(legendOpenProbe()).toBe(true);
    expect(document.querySelector('[data-chrome="menu"]')!.getAttribute("aria-expanded")).toBe(
      "false",
    );

    expect(toggleLegendProbe()).toBe(false);
    expect(legendOpenProbe()).toBe(false);
  });

  it("is null without a legend", () => {
    document.body.innerHTML = '<button data-chrome="menu" aria-expanded="false"></button>';
    expect(legendOpenProbe()).toBeNull();
    expect(toggleLegendProbe()).toBeNull();
  });
});

describe("focusFrameProbe", () => {
  it("focuses the webview frame, and is false without one", () => {
    expect(focusFrameProbe("iframe.webview")).toBe(false);

    document.body.innerHTML =
      '<button>Explorer</button><iframe class="webview" srcdoc=""></iframe>';
    document.querySelector("button")!.focus();
    expect(focusFrameProbe("iframe.webview")).toBe(true);
    expect(document.activeElement).toBe(document.querySelector("iframe"));
  });
});

describe("webviewFrameShownProbe", () => {
  function frameOf(size: { width: number; height: number }, visible: boolean): void {
    document.body.innerHTML = '<iframe class="webview" srcdoc=""></iframe>';
    const frame = document.querySelector("iframe")!;
    Object.assign(frame, {
      getBoundingClientRect: () => ({ ...size, top: 0, left: 0, right: 0, bottom: 0 }),
      checkVisibility: () => visible,
    });
  }

  it("tells a shown frame from one VS Code hid or gave no size", () => {
    expect(webviewFrameShownProbe("iframe.webview")).toBeUndefined();

    frameOf({ width: 900, height: 600 }, true);
    expect(webviewFrameShownProbe("iframe.webview")).toBe(true);

    frameOf({ width: 900, height: 600 }, false);
    expect(webviewFrameShownProbe("iframe.webview")).toBe(false);

    frameOf({ width: 0, height: 0 }, true);
    expect(webviewFrameShownProbe("iframe.webview")).toBe(false);
  });
});
