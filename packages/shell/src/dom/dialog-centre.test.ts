import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeResizeObserver, cleanup, installFakes, setBox } from "../../test/support/dom.js";
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

  describe("while it is open", () => {
    it("follows a resize of the container and of the dialog", () => {
      const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
      centreOverContainer(dialog, element);

      setBox(element, { left: 100, top: 80, width: 1000, height: 700 });
      FakeResizeObserver.resize(element);
      expect(translateOf(dialog)).toBe("-40px -20px");

      setBox(dialog, { left: 0, top: 0, width: 560, height: 700 });
      FakeResizeObserver.resize(dialog);
      expect(translateOf(dialog)).toBe("");
    });

    it("follows a resize of the window", () => {
      const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
      centreOverContainer(dialog, element);

      setWindow({ width: 1000, height: 800 });
      window.dispatchEvent(new Event("resize"));

      expect(translateOf(dialog)).toBe("50px 30px");
    });

    it("follows a scroll of the page and of an element around the container, not of another", () => {
      const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
      const panel = document.createElement("section");
      document.body.append(panel);
      panel.append(element);
      const aside = document.createElement("aside");
      document.body.append(aside);
      centreOverContainer(dialog, element);

      setBox(element, { left: 100, top: 40, width: 900, height: 700 });
      document.dispatchEvent(new Event("scroll"));
      expect(translateOf(dialog)).toBe("-90px -60px");

      setBox(element, { left: 100, top: 100, width: 900, height: 700 });
      panel.dispatchEvent(new Event("scroll"));
      expect(translateOf(dialog)).toBe("-90px 0px");

      setBox(element, { left: 100, top: 120, width: 900, height: 700 });
      aside.dispatchEvent(new Event("scroll"));
      expect(translateOf(dialog)).toBe("-90px 0px");
    });

    it("stops following when told to", () => {
      const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
      const stop = centreOverContainer(dialog, element);
      const observer = FakeResizeObserver.instances.at(-1)!;

      stop();
      setBox(element, { left: 0, top: 0, ...WINDOW });
      window.dispatchEvent(new Event("resize"));
      document.dispatchEvent(new Event("scroll"));

      expect(observer.disconnected).toBe(true);
      expect(translateOf(dialog)).toBe("-90px -20px");
    });
  });

  it("works where the browser has no ResizeObserver", () => {
    const { element, dialog } = setup({ left: 100, top: 80, width: 900, height: 700 });
    vi.stubGlobal("ResizeObserver", undefined);

    const stop = centreOverContainer(dialog, element);

    expect(translateOf(dialog)).toBe("-90px -20px");
    expect(stop).not.toThrow();
  });
});
