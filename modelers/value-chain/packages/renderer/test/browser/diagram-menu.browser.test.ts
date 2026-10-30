import { afterEach, describe, expect, it } from "vitest";
import {
  Modeler,
  blobToBase64,
  createShortcutsDialog,
  svgToPng,
  type ShortcutsDialogChrome,
} from "../../src/index.js";
import "../../src/assets/value-chain.css";
import PORTER from "../../../../example/porter.vc.json?raw";
import { parseDocumentJSON } from "@miragon/value-chain-schema-model";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function chrome(): ShortcutsDialogChrome {
  const root = document.createElement("div");
  const trigger = document.createElement("button");
  trigger.textContent = "Menu";
  root.append(trigger);
  document.body.append(root);
  cleanups.push(() => root.remove());
  return {
    root,
    platform: "mac",
    lang: "en",
    menu: { trigger },
    messages: {
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      zoomToActual: (percent) => `Zoom to ${percent}`,
      fit: "Fit to view",
      close: "Close",
      keyNames: { ctrl: "Ctrl", shift: "Shift", plus: "Plus", minus: "Minus" },
    },
  };
}

describe("the keyboard shortcuts dialog", () => {
  it("opens modal in the chrome root, labelled, with one table per group", () => {
    const host = chrome();
    const dialog = createShortcutsDialog(host);
    dialog.open();

    const element = host.root.querySelector("dialog.vc-shortcuts")!;
    expect(dialog.isOpen()).toBe(true);
    expect(element.matches(":modal")).toBe(true);
    expect(document.getElementById(element.getAttribute("aria-labelledby")!)?.textContent).toBe(
      "Keyboard shortcuts",
    );
    expect(element.querySelectorAll("table[aria-labelledby]")).toHaveLength(3);
    expect(element.querySelector(".vc-shortcuts-close")?.getAttribute("aria-label")).toBe("Close");
    expect(element.contains(document.activeElement)).toBe(true);
  });

  it("shows the web app’s File keys in a table of their own first", () => {
    const host = chrome();
    createShortcutsDialog(host, { fileKeys: true }).open();

    const titles = [...host.root.querySelectorAll(".vc-shortcuts-group-title")].map(
      (title) => title.textContent,
    );
    expect(titles).toEqual(["File", "View", "Edit", "Tools"]);
    const firstTable = host.root.querySelector("table")!;
    expect([...firstTable.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual([
      "Open…",
      "Export as JSON",
    ]);
  });

  it("closes on its Close button and returns the focus to the menu trigger", async () => {
    const host = chrome();
    const dialog = createShortcutsDialog(host);
    dialog.open();
    host.root.querySelector<HTMLButtonElement>(".vc-shortcuts-close")!.click();
    // The `close` event comes in a task of its own.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dialog.isOpen()).toBe(false);
    expect(document.activeElement).toBe(host.menu.trigger);
  });

  it("is removed by destroy()", () => {
    const host = chrome();
    const dialog = createShortcutsDialog(host);
    dialog.open();
    dialog.destroy();
    expect(host.root.querySelector("dialog")).toBeNull();
  });
});

describe("the keyboard shortcuts dialog follows the nearest carrier of the contrast (#401)", () => {
  function highContrastPage(): void {
    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    cleanups.push(() => document.documentElement.removeAttribute("data-cd-kontrast"));
  }

  function resolved(scope: HTMLElement, property: string, value: string): string {
    const probe = document.createElement("div");
    probe.style.setProperty(property, value);
    scope.append(probe);
    const computed = getComputedStyle(probe).getPropertyValue(property);
    probe.remove();
    return computed;
  }

  /** The dialog's shadow and edge, and the ring of its Close button, which the keyboard focuses. */
  function openedLook(host: ShortcutsDialogChrome): { dialog: string[]; ring: string } {
    createShortcutsDialog(host).open();
    const close = host.root.querySelector<HTMLButtonElement>(".vc-shortcuts-close")!;
    close.focus({ focusVisible: true } as FocusOptions);
    expect(close.matches(":focus-visible")).toBe(true);
    const dialog = getComputedStyle(host.root.querySelector("dialog.vc-shortcuts")!);
    return {
      dialog: [dialog.boxShadow, dialog.borderTopColor],
      ring: getComputedStyle(close).outlineWidth,
    };
  }

  it("keeps its shadow, the --cd-ui-linie edge and a 2px ring inside a carrier in normal contrast on a high-contrast page", () => {
    highContrastPage();
    const host = chrome();
    host.root.setAttribute("data-cd-theme", "light");

    expect(openedLook(host)).toEqual({
      dialog: [
        resolved(host.root, "box-shadow", "var(--cd-shadow-3)"),
        resolved(host.root, "border-top-color", "var(--cd-ui-linie)"),
      ],
      ring: "2px",
    });
  });

  it("drops its shadow, takes the --cd-ui-kontur edge and a 3px ring on a high-contrast page without a carrier between", () => {
    highContrastPage();
    const host = chrome();

    expect(openedLook(host)).toEqual({
      dialog: ["none", resolved(host.root, "border-top-color", "var(--cd-ui-kontur)")],
      ring: "3px",
    });
  });

  it("drops its shadow, takes the --cd-ui-kontur edge and a 3px ring inside a high-contrast carrier that is not the page", () => {
    const host = chrome();
    host.root.setAttribute("data-cd-theme", "light");
    host.root.setAttribute("data-cd-kontrast", "hoch");

    expect(openedLook(host)).toEqual({
      dialog: ["none", resolved(host.root, "border-top-color", "var(--cd-ui-kontur)")],
      ring: "3px",
    });
  });
});

describe("svgToPng", () => {
  it("rasterizes the SVG export at twice its size", async () => {
    const host = document.createElement("div");
    host.style.cssText = "width:800px;height:600px";
    document.body.append(host);
    const modeler = new Modeler({ container: host });
    cleanups.push(() => {
      modeler.destroy();
      host.remove();
    });
    modeler.importDocument(parseDocumentJSON(PORTER));
    const { svg } = modeler.saveSVG();
    const width = Number(/width="([\d.]+)"/.exec(svg)![1]);

    const png = await svgToPng(svg);
    expect(png.type).toBe("image/png");
    const bitmap = await createImageBitmap(png);
    expect(bitmap.width).toBe(Math.round(width * 2));
    expect((await blobToBase64(png)).startsWith("iVBORw0KGgo")).toBe(true);
  });
});
