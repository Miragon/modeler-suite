/// <reference types="@vitest/browser-playwright" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { attachedHost } from "@miragon/modeler-api/conformance";
import {
  createCollaborativeModeler,
  type CollaborativeValueChainModeler,
} from "../../src/index.js";
import "../../src/assets/value-chain.css";
import ORDER_TO_CASH from "./fixtures/order-to-cash.vc.json?raw";
import { CanvasPointer } from "./support/pointer.js";

/** A step and an org unit: the provider opens the same text box over either, at its own inset. */
const LABELLED_SHAPES = ["step-credit", "org-finance"] as const;

const page = document.documentElement;

let modeler: CollaborativeValueChainModeler | undefined;
let wrapper: HTMLElement | undefined;

async function mount(): Promise<CollaborativeValueChainModeler> {
  const host = attachedHost(1000, 700);
  wrapper = host.parentElement ?? host;
  modeler = createCollaborativeModeler();
  modeler.attachTo(host);
  await modeler.importText(ORDER_TO_CASH);
  return modeler;
}

/**
 * Opens the label editor the way a user does, with a double-click on the shape. Its first press
 * has given the canvas the focus, and the text box takes it from there.
 */
function openEditor(on: CollaborativeValueChainModeler, id: string): HTMLElement {
  const pointer = new CanvasPointer(on);
  pointer.canvasSvg().focus();
  pointer.graphics(id).dispatchEvent(pointer.event("dblclick", pointer.centreOf(id)));
  const content = on.diagram.container.querySelector<HTMLElement>(".djs-direct-editing-content");
  const textBox = content?.parentElement;
  if (!content || !textBox?.classList.contains("djs-direct-editing-parent")) {
    throw new Error(`the label editor did not open on ${id}`);
  }
  expect(document.activeElement).toBe(content);
  return textBox;
}

/** A colour as the browser computes it, resolved where the editor resolves its roles. */
function computedColour(scope: HTMLElement, colour: string): string {
  const probe = document.createElement("span");
  probe.style.color = colour;
  scope.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

function focusRing(element: HTMLElement): {
  style: string;
  width: string;
  offset: string;
  colour: string;
} {
  const style = getComputedStyle(element);
  return {
    style: style.outlineStyle,
    width: style.outlineWidth,
    offset: style.outlineOffset,
    colour: style.outlineColor,
  };
}

afterEach(async () => {
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  page.removeAttribute("data-cd-theme");
  page.removeAttribute("data-cd-kontrast");
  modeler?.destroy();
  modeler = undefined;
  wrapper?.remove();
  wrapper = undefined;
});

describe("the label editor's focus ring (#359, guide §8)", () => {
  let mounted: CollaborativeValueChainModeler;

  beforeEach(async () => {
    mounted = await mount();
  });

  it.each(LABELLED_SHAPES)(
    "is drawn around the text box on %s while its content has the focus, next to the accent border",
    (id) => {
      const textBox = openEditor(mounted, id);
      const container = mounted.diagram.container;

      expect(focusRing(textBox)).toEqual({
        style: "solid",
        width: "2px",
        offset: "2px",
        colour: computedColour(container, "var(--cd-ui-fokus)"),
      });
      expect(getComputedStyle(textBox).borderTopColor).toBe(
        computedColour(container, "var(--cd-ui-interaktion)"),
      );
    },
  );

  it("is the only ring: the content inside the text box draws none of its own", () => {
    const textBox = openEditor(mounted, "step-credit");
    const content = textBox.querySelector<HTMLElement>(".djs-direct-editing-content")!;
    expect(focusRing(content).style).toBe("none");
  });

  it.each(LABELLED_SHAPES)("widens to 3px on %s in high contrast", (id) => {
    page.setAttribute("data-cd-kontrast", "hoch");
    const textBox = openEditor(mounted, id);
    expect(focusRing(textBox)).toMatchObject({ style: "solid", width: "3px", offset: "2px" });
  });

  // Chromium forces every outline to Highlight under forced colours by itself, so these cases
  // show that the ring survives there, not the stylesheet's own Highlight for other engines.
  it.each(LABELLED_SHAPES)("stays in forced colours on %s, in Highlight", async (id) => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }],
    });
    const textBox = openEditor(mounted, id);
    expect(focusRing(textBox)).toMatchObject({ style: "solid", width: "2px" });
    expect(focusRing(textBox).colour).toBe(computedColour(document.body, "Highlight"));
  });
});

describe("the label editor's focus ring under a host's appearance (#359)", () => {
  it("is 3px for a request of high contrast, also on a page in normal contrast", async () => {
    const mounted = await mount();
    mounted.appearance.set({ theme: "light", contrast: "high" });
    const textBox = openEditor(mounted, "step-credit");
    expect(focusRing(textBox)).toMatchObject({ style: "solid", width: "3px", offset: "2px" });
  });

  it("stays 2px for a request of normal contrast on a high-contrast page", async () => {
    page.setAttribute("data-cd-theme", "dark");
    page.setAttribute("data-cd-kontrast", "hoch");
    const mounted = await mount();
    mounted.appearance.set({ theme: "light", contrast: "normal" });
    const textBox = openEditor(mounted, "step-credit");
    expect(focusRing(textBox)).toMatchObject({ style: "solid", width: "2px", offset: "2px" });
  });
});
