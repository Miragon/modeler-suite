import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanup, installFakes, setBox } from "../../test/support/dom.js";
import { centreOverContainer } from "./dialog-centre.js";

beforeEach(installFakes);
afterEach(cleanup);

type Box = { left: number; top: number; width: number; height: number };

const WINDOW = { width: 1280, height: 900 };
const DIALOG = { width: 560, height: 400 };

function setWindow(size: { width: number; height: number }): void {
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: size.width,
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: size.height,
  });
}

/** A container in the body and a dialog in it, as the shell lays them out; boxes are set per element. */
function setup(container: Box, dialogSize = DIALOG) {
  setWindow(WINDOW);
  const element = document.createElement("div");
  const dialog = document.createElement("dialog");
  element.append(dialog);
  document.body.append(element);
  setBox(element, container);
  setBox(dialog, { left: 0, top: 0, ...dialogSize });
  return { element, dialog };
}

function translateOf(dialog: HTMLElement): string {
  return dialog.style.getPropertyValue("translate");
}

describe("centreOverContainer (guide §5.1, §8)", () => {
  it("shifts the dialog from the window's centre to the container's centre", () => {
    const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });

    centreOverContainer(dialog, element);

    // The container's centre is (550, 430), the window's (640, 450).
    expect(translateOf(dialog)).toBe("-90px -20px");
  });

  it("leaves a container that is as large as the window where the top layer puts it", () => {
    const { element, dialog } = setup({ left: 0, top: 0, ...WINDOW });

    centreOverContainer(dialog, element);

    expect(translateOf(dialog)).toBe("");
  });

  it("falls back to the window's centre when the container is too small, in either axis", () => {
    const narrow = setup({ left: 100, top: 80, width: 500, height: 700 });
    centreOverContainer(narrow.dialog, narrow.element);
    expect(translateOf(narrow.dialog)).toBe("");

    const low = setup({ left: 100, top: 80, width: 900, height: 300 });
    centreOverContainer(low.dialog, low.element);
    expect(translateOf(low.dialog)).toBe("");
  });

  it("asks for the 16px band of guide §8 around the dialog, give or take a rounded pixel", () => {
    const exact = setup({ left: 100, top: 100, width: 592, height: 432 });
    centreOverContainer(exact.dialog, exact.element);
    expect(translateOf(exact.dialog)).toBe("-244px -134px");

    const rounded = setup({ left: 100, top: 100, width: 591, height: 431 });
    centreOverContainer(rounded.dialog, rounded.element);
    expect(translateOf(rounded.dialog)).toBe("-244px -134px");

    const short = setup({ left: 100, top: 100, width: 590, height: 432 });
    centreOverContainer(short.dialog, short.element);
    expect(translateOf(short.dialog)).toBe("");
  });

  it("centres over the part of the container inside the window", () => {
    const { element, dialog } = setup({ left: -300, top: 200, width: 1100, height: 900 });

    centreOverContainer(dialog, element);

    // Visible: x 0 to 800, y 200 to 900.
    expect(translateOf(dialog)).toBe("-240px 100px");
  });

  it("falls back when too little of the container shows in the window", () => {
    const { element, dialog } = setup({ left: -300, top: 200, width: 700, height: 900 });

    centreOverContainer(dialog, element);

    expect(translateOf(dialog)).toBe("");
  });

  it("falls back when nothing of the container shows", () => {
    const hidden = setup({ left: 0, top: 0, width: 0, height: 0 });
    centreOverContainer(hidden.dialog, hidden.element);
    expect(translateOf(hidden.dialog)).toBe("");

    const below = setup({ left: 100, top: 1000, width: 900, height: 700 });
    centreOverContainer(below.dialog, below.element);
    expect(translateOf(below.dialog)).toBe("");
  });

  it("centres over the part that an element around the container clips", () => {
    const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 1400 });
    const panel = document.createElement("section");
    panel.style.overflowX = "auto";
    panel.style.overflowY = "auto";
    document.body.append(panel);
    panel.append(element);
    setBox(panel, { left: 100, top: 80, width: 900, height: 700 });
    Object.defineProperty(panel, "clientWidth", { configurable: true, value: 885 });
    Object.defineProperty(panel, "clientHeight", { configurable: true, value: 700 });

    centreOverContainer(dialog, element);

    // Inside the panel's padding box, which its scrollbar narrows: x 100 to 985, y 80 to 780.
    expect(translateOf(dialog)).toBe("-97px -20px");
  });

  it("stops looking at the elements around a fixed container", () => {
    const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
    element.style.position = "fixed";
    const panel = document.createElement("section");
    panel.style.overflowX = "hidden";
    panel.style.overflowY = "hidden";
    document.body.append(panel);
    panel.append(element);
    setBox(panel, { left: 0, top: 0, width: 10, height: 10 });

    centreOverContainer(dialog, element);

    expect(translateOf(dialog)).toBe("-90px -20px");
  });

  it("scales the shift back where CSS zoom on the page has scaled the dialog's translate", () => {
    const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
    Object.defineProperty(dialog, "offsetWidth", { configurable: true, value: 448 });

    centreOverContainer(dialog, element);

    // The dialog is 560px wide on screen and was laid out 448px wide: zoom 1.25.
    expect(translateOf(dialog)).toBe("-72px -16px");
  });

  it("takes a dialog laid out a pixel narrower than it is rendered for no zoom", () => {
    const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
    Object.defineProperty(dialog, "offsetWidth", { configurable: true, value: 559 });

    centreOverContainer(dialog, element);

    expect(translateOf(dialog)).toBe("-90px -20px");
  });

  describe("which elements around the container clip it", () => {
    const CLIPPED = { left: 100, top: 80, width: 900, height: 500 };

    function clippingAround(
      container: HTMLElement,
      style: Partial<CSSStyleDeclaration>,
    ): HTMLElement {
      const clipper = document.createElement("section");
      Object.assign(clipper.style, { overflowX: "hidden", overflowY: "hidden", ...style });
      document.body.append(clipper);
      clipper.append(container);
      setBox(clipper, CLIPPED);
      Object.defineProperty(clipper, "clientWidth", { configurable: true, value: CLIPPED.width });
      Object.defineProperty(clipper, "clientHeight", { configurable: true, value: CLIPPED.height });
      return clipper;
    }

    const container = { left: 100, top: 80, width: 900, height: 700 };
    const UNCLIPPED = "-90px -20px";
    const CLIPPED_BY_PANEL = "-90px -120px";

    it("clips a container in the flow at the element around it", () => {
      const { element, dialog } = setup(container);
      clippingAround(element, {});

      centreOverContainer(dialog, element);

      expect(translateOf(dialog)).toBe(CLIPPED_BY_PANEL);
    });

    it("lets an absolutely positioned container escape an unpositioned element around it", () => {
      const { element, dialog } = setup(container);
      element.style.position = "absolute";
      clippingAround(element, {});

      centreOverContainer(dialog, element);

      expect(translateOf(dialog)).toBe(UNCLIPPED);
    });

    it("clips an absolutely positioned container at the element that positions it", () => {
      const { element, dialog } = setup(container);
      element.style.position = "absolute";
      clippingAround(element, { position: "relative" });

      centreOverContainer(dialog, element);

      expect(translateOf(dialog)).toBe(CLIPPED_BY_PANEL);
    });

    it("follows the chain on to the element that clips the one that positions the container", () => {
      const { element, dialog } = setup(container);
      element.style.position = "absolute";
      const positioning = document.createElement("div");
      positioning.style.position = "relative";
      document.body.append(positioning);
      positioning.append(element);
      setBox(positioning, container);
      clippingAround(positioning, {});

      centreOverContainer(dialog, element);

      expect(translateOf(dialog)).toBe(CLIPPED_BY_PANEL);
    });

    it("lets a fixed container escape every element around it but a transformed one", () => {
      const escaping = setup(container);
      escaping.element.style.position = "fixed";
      clippingAround(escaping.element, { position: "relative" });
      centreOverContainer(escaping.dialog, escaping.element);
      expect(translateOf(escaping.dialog)).toBe(UNCLIPPED);

      const held = setup(container);
      held.element.style.position = "fixed";
      clippingAround(held.element, { transform: "translateZ(0)" });
      centreOverContainer(held.dialog, held.element);
      expect(translateOf(held.dialog)).toBe(CLIPPED_BY_PANEL);
    });
  });

  it("measures the window by <body> in quirks mode, where <html> reports its own box", () => {
    const { element, dialog } = setup({ left: 300, top: 120, width: 800, height: 600 });
    Object.defineProperty(document, "compatMode", { configurable: true, value: "BackCompat" });
    setWindow({ width: 1280, height: 3000 });
    Object.defineProperty(document.body, "clientWidth", { configurable: true, value: 1280 });
    Object.defineProperty(document.body, "clientHeight", { configurable: true, value: 900 });

    try {
      centreOverContainer(dialog, element);
    } finally {
      Reflect.deleteProperty(document, "compatMode");
      Reflect.deleteProperty(document.body, "clientWidth");
      Reflect.deleteProperty(document.body, "clientHeight");
    }

    // The container's centre is (700, 420), the window's (640, 450).
    expect(translateOf(dialog)).toBe("60px -30px");
  });

  it("asks for a band of 16px of the dialog's own pixels under CSS zoom", () => {
    // Zoom 0.8: a dialog laid out 466 x 300 renders 372.8 x 240, its band 25.6px.
    const { element, dialog } = setup(
      { left: 560, top: 320, width: 400, height: 320 },
      { width: 372.8, height: 240 },
    );
    Object.defineProperty(dialog, "offsetWidth", { configurable: true, value: 466 });

    centreOverContainer(dialog, element);

    // The container's centre is (760, 480), the window's (640, 450); the shift is in laid-out px.
    expect(translateOf(dialog)).toBe("150px 38px");
  });

  describe("the dialog's size", () => {
    function sizeOf(dialog: HTMLElement): { width: string; height: string } {
      return {
        width: dialog.style.getPropertyValue("--modeler-shell-container-width"),
        height: dialog.style.getPropertyValue("--modeler-shell-container-height"),
      };
    }

    it("hands dialog.css the container's content box, inside its padding", () => {
      const { element, dialog } = setup({ left: 800, top: 0, width: 480, height: 900 });
      element.style.padding = "4px 8px";
      Object.defineProperty(element, "clientWidth", { configurable: true, value: 478 });
      Object.defineProperty(element, "clientHeight", { configurable: true, value: 898 });

      centreOverContainer(dialog, element);

      expect(sizeOf(dialog)).toEqual({ width: "462px", height: "890px" });
    });

    it("leaves the size to dialog.css for a container without a box", () => {
      const { element, dialog } = setup({ left: 0, top: 0, width: 0, height: 0 });

      centreOverContainer(dialog, element);

      expect(sizeOf(dialog)).toEqual({ width: "", height: "" });
    });
  });

  describe("while it is open", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    });

    it("follows a move of the container that changes no size, in the next frame", () => {
      const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
      centreOverContainer(dialog, element);

      setBox(element, { left: 0, top: 80, width: 900, height: 700 });
      expect(translateOf(dialog)).toBe("-90px -20px");
      vi.advanceTimersToNextFrame();

      expect(translateOf(dialog)).toBe("-190px -20px");
    });

    it("follows a resize of the container, of the dialog and of the window", () => {
      const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
      centreOverContainer(dialog, element);

      setBox(element, { left: 100, top: 80, width: 1000, height: 700 });
      vi.advanceTimersToNextFrame();
      expect(translateOf(dialog)).toBe("-40px -20px");

      setWindow({ width: 1200, height: 800 });
      vi.advanceTimersToNextFrame();
      expect(translateOf(dialog)).toBe("0px 30px");

      setBox(dialog, { left: 0, top: 0, width: 560, height: 700 });
      vi.advanceTimersToNextFrame();
      expect(translateOf(dialog)).toBe("");
    });

    it("follows an element around the container that clips more of it", () => {
      const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
      const panel = document.createElement("section");
      panel.style.overflowX = "auto";
      panel.style.overflowY = "auto";
      document.body.append(panel);
      panel.append(element);
      setBox(panel, { left: 100, top: 80, width: 900, height: 700 });
      Object.defineProperty(panel, "clientWidth", { configurable: true, value: 900 });
      Object.defineProperty(panel, "clientHeight", { configurable: true, value: 700 });
      centreOverContainer(dialog, element);
      expect(translateOf(dialog)).toBe("-90px -20px");

      Object.defineProperty(panel, "clientWidth", { configurable: true, value: 700 });
      vi.advanceTimersToNextFrame();

      expect(translateOf(dialog)).toBe("-190px -20px");
    });

    it("writes nothing in a frame that changes nothing", () => {
      const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
      centreOverContainer(dialog, element);
      const writes: MutationRecord[] = [];
      const observer = new MutationObserver((records) => writes.push(...records));
      observer.observe(dialog, { attributes: true });

      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
      observer.disconnect();
      writes.push(...observer.takeRecords());

      expect(writes).toEqual([]);
    });

    it("stops following when told to", () => {
      const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
      const stop = centreOverContainer(dialog, element);

      stop();
      setBox(element, { left: 0, top: 0, ...WINDOW });
      vi.advanceTimersToNextFrame();

      expect(translateOf(dialog)).toBe("-90px -20px");
      expect(vi.getTimerCount()).toBe(0);
    });

    it("stops following a dialog that left the document without closing", () => {
      const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
      centreOverContainer(dialog, element);

      element.remove();
      vi.advanceTimersToNextFrame();

      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it("works where the browser has no requestAnimationFrame", () => {
    const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
    vi.stubGlobal("requestAnimationFrame", undefined);

    const stop = centreOverContainer(dialog, element);

    expect(translateOf(dialog)).toBe("-90px -20px");
    expect(stop).not.toThrow();
  });
});
