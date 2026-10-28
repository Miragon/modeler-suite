// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";
import EventStormingDrawTool from "../src/draw-tool/EventStormingDrawTool.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function harness() {
  const modelerContainer = document.createElement("div");
  modelerContainer.className = "event-storming-container";
  const canvasContainer = document.createElement("div");
  const svg = document.createElementNS(SVG_NS, "svg");
  const layer = document.createElementNS(SVG_NS, "g");
  svg.append(layer);
  const paletteEntry = paletteEntryFor("draw-tool");
  const lassoEntry = paletteEntryFor("lasso-tool");
  const palette = document.createElement("div");
  palette.className = "djs-palette";
  palette.append(lassoEntry, paletteEntry);
  const labelField = document.createElement("textarea");
  // diagram-js puts its overlays into the canvas container, next to the <svg>; a host's control
  // in an overlay sits there too.
  const overlayControl = document.createElement("div");
  overlayControl.tabIndex = 0;
  const overlay = document.createElement("div");
  overlay.className = "djs-overlay";
  overlay.append(overlayControl);
  const overlays = document.createElement("div");
  overlays.className = "djs-overlay-container";
  overlays.append(overlay);
  const buttonNextToCanvas = document.createElement("button");
  canvasContainer.append(svg, palette, labelField, overlays, buttonNextToCanvas);
  const zoomIn = document.createElement("button");
  zoomIn.dataset.zoom = "in";
  const zoomPanel = document.createElement("div");
  zoomPanel.className = "cd-shell-zoom";
  zoomPanel.dataset.chrome = "zoom";
  zoomPanel.append(zoomIn);
  const buttonInContainer = document.createElement("button");
  modelerContainer.append(canvasContainer, zoomPanel, buttonInContainer);
  const hostField = document.createElement("input");
  const hostButton = document.createElement("button");
  const otherModeler = otherModelerWithDrawEntry();
  document.body.append(modelerContainer, hostField, hostButton, otherModeler.container);

  const eventBus = new EventBus();
  const canvas = {
    getContainer: () => canvasContainer,
    getLayer: () => layer,
    getRootElement: () => ({ id: "root" }),
    viewbox: () => ({ x: 0, y: 0 }),
    zoom: () => 1,
    focus: vi.fn(),
  };
  const modeling = { createShape: vi.fn((shape: unknown) => shape) };
  const factory = {
    drawingFromCanvasPoints: vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 })),
  };
  const drawTool = new EventStormingDrawTool(
    canvas as never,
    eventBus,
    modeling as never,
    { select: vi.fn() } as never,
    factory as never,
  );

  cleanups.push(() => {
    eventBus.fire("diagram.destroy");
    modelerContainer.remove();
    hostField.remove();
    hostButton.remove();
    otherModeler.container.remove();
  });

  const pointAt = (x: number, y: number) =>
    svg.dispatchEvent(
      new MouseEvent("mousedown", { button: 0, clientX: x, clientY: y, bubbles: true }),
    );

  return {
    drawTool,
    canvas,
    modeling,
    svg,
    layer,
    paletteEntry,
    lassoEntry,
    labelField,
    overlayControl,
    buttonNextToCanvas,
    zoomIn,
    buttonInContainer,
    hostField,
    hostButton,
    otherDrawEntry: otherModeler.drawEntry,
    pointAt,
  };
}

function paletteEntryFor(action: string): HTMLElement {
  const entry = document.createElement("div");
  entry.className = "entry";
  entry.dataset.action = action;
  entry.tabIndex = 0;
  return entry;
}

/** A second modeler on the page, whose Draw entry is not this tool's. */
function otherModelerWithDrawEntry() {
  const drawEntry = paletteEntryFor("draw-tool");
  const palette = document.createElement("div");
  palette.className = "djs-palette";
  palette.append(drawEntry);
  const canvasContainer = document.createElement("div");
  canvasContainer.append(palette);
  const container = document.createElement("div");
  container.className = "event-storming-container";
  container.append(canvasContainer);
  return { container, drawEntry };
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/** Presses the key and tells whether it was prevented and whether it bubbled up to the window. */
function pressAndTrack(target: EventTarget, key: string) {
  let reachedWindow = false;
  const listener = () => (reachedWindow = true);
  window.addEventListener("keydown", listener);
  try {
    const event = press(target, key);
    return { prevented: event.defaultPrevented, reachedWindow };
  } finally {
    window.removeEventListener("keydown", listener);
  }
}

describe("EventStormingDrawTool: Enter and Escape", () => {
  it("finishes the line on Enter and cancels on Escape aimed at the canvas", () => {
    const { drawTool, modeling, svg, pointAt } = harness();
    drawTool.activate();
    pointAt(10, 10);
    pointAt(60, 40);
    expect(press(svg, "Enter").defaultPrevented).toBe(true);
    expect(drawTool.isActive()).toBe(false);
    expect(modeling.createShape).toHaveBeenCalledTimes(1);

    drawTool.activate();
    expect(press(svg, "Escape").defaultPrevented).toBe(true);
    expect(drawTool.isActive()).toBe(false);
  });

  it.each(["Enter", "Escape"])("commits the open line on %s aimed inside the canvas", (key) => {
    const { drawTool, modeling, layer, pointAt } = harness();
    drawTool.activate();
    pointAt(10, 10);
    pointAt(60, 40);
    expect(press(layer, key).defaultPrevented).toBe(true);
    expect(drawTool.isActive()).toBe(false);
    expect(modeling.createShape).toHaveBeenCalledTimes(1);
  });

  // Enter on the palette's Draw entry leaves the focus there (guide §5.5, §5.8).
  it("cancels on Escape aimed at the palette entry that started the tool", () => {
    const { drawTool, paletteEntry } = harness();
    drawTool.activate();
    expect(press(paletteEntry, "Escape").defaultPrevented).toBe(true);
    expect(drawTool.isActive()).toBe(false);
  });

  it.each(["Enter", "Escape"])(
    "commits the open line on %s aimed at the palette entry that started the tool",
    (key) => {
      const { drawTool, modeling, paletteEntry, pointAt } = harness();
      drawTool.activate();
      pointAt(10, 10);
      pointAt(60, 40);
      const { prevented, reachedWindow } = pressAndTrack(paletteEntry, key);
      expect(prevented).toBe(true);
      expect(reachedWindow).toBe(false);
      expect(drawTool.isActive()).toBe(false);
      expect(modeling.createShape).toHaveBeenCalledTimes(1);
    },
  );

  // Issue #180: only the canvas and the Draw entry are the tool's, inside the modeler's container too.
  it.each([
    ["a host button inside the modeler's container", "buttonInContainer"],
    ["a host button next to the canvas", "buttonNextToCanvas"],
    ["a focusable element in a host's overlay next to the canvas", "overlayControl"],
    ["the zoom panel", "zoomIn"],
    ["another palette entry", "lassoEntry"],
    ["another modeler's Draw entry", "otherDrawEntry"],
    ["a host button outside the modeler", "hostButton"],
    ["<body>", "body"],
  ] as const)("leaves Enter and Escape aimed at %s to the page", (_name, targetName) => {
    const setup = harness();
    const { drawTool, modeling, pointAt } = setup;
    const target = targetName === "body" ? document.body : setup[targetName];
    drawTool.activate();
    pointAt(10, 10);
    pointAt(60, 40);
    target.focus();
    for (const key of ["Enter", "Escape"]) {
      expect(pressAndTrack(target, key), key).toEqual({ prevented: false, reachedWindow: true });
    }
    expect(drawTool.isActive()).toBe(true);
    expect(modeling.createShape).not.toHaveBeenCalled();

    pointAt(120, 10);
    expect(press(setup.svg, "Enter").defaultPrevented).toBe(true);
    expect(drawTool.isActive()).toBe(false);
    expect(modeling.createShape).toHaveBeenCalledTimes(1);
  });

  // Issue #91: a host field, the zoom buttons, an open menu or dialog keep their Enter and Escape.
  it("leaves Enter and Escape aimed outside the modeler to their target", () => {
    const { drawTool, modeling, hostField, hostButton, pointAt } = harness();
    drawTool.activate();
    pointAt(10, 10);
    pointAt(60, 40);
    for (const target of [hostField, hostButton, document.body]) {
      expect(press(target, "Enter").defaultPrevented).toBe(false);
      expect(press(target, "Escape").defaultPrevented).toBe(false);
    }
    expect(drawTool.isActive()).toBe(true);
    expect(modeling.createShape).not.toHaveBeenCalled();
  });

  it("leaves Enter and Escape in a text field inside the modeler to the field", () => {
    const { drawTool, labelField } = harness();
    drawTool.activate();
    expect(press(labelField, "Enter").defaultPrevented).toBe(false);
    expect(press(labelField, "Escape").defaultPrevented).toBe(false);
    expect(drawTool.isActive()).toBe(true);
  });

  it("leaves an Enter that ends an IME composition to the input method", () => {
    const { drawTool, svg, pointAt } = harness();
    drawTool.activate();
    pointAt(10, 10);
    pointAt(60, 40);
    expect(press(svg, "Enter", { isComposing: true }).defaultPrevented).toBe(false);
    expect(drawTool.isActive()).toBe(true);
  });
});

describe("EventStormingDrawTool: focus", () => {
  // The tool prevents the mousedown's default, the browser's own focus move to the canvas.
  it("focuses the canvas on every point, so Enter and Escape reach the tool", () => {
    const { drawTool, svg, pointAt } = harness();
    const focus = vi.spyOn(svg, "focus");
    drawTool.activate();
    pointAt(10, 10);
    pointAt(60, 40);
    pointAt(120, 10);
    expect(focus).toHaveBeenCalledTimes(3);
  });

  // A pointer moved the focus, so the canvas must not show the keyboard focus ring.
  it("focuses the canvas without the keyboard focus ring", () => {
    const { drawTool, svg, pointAt } = harness();
    const focus = vi.spyOn(svg, "focus");
    drawTool.activate();
    pointAt(10, 10);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true, focusVisible: false });
  });
});
