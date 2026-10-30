import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import {
  createCollaborativeModeler,
  type CollaborativeValueChainModeler,
} from "../../src/index.js";
import "../../src/assets/value-chain.css";
import PORTER from "../../../../example/porter.vc.json?raw";

/**
 * Keys stay on the canvas: the modeler acts on a key only while its canvas holds the focus, and
 * leaves alone what a host or an input method has taken. A pointer on a palette or context pad
 * entry gives the focus back to the canvas, so the next key acts without another click. No shell
 * is mounted here, as in a host that brings no chrome of its own.
 */

const STEP = "step-testing";
const SEQUENCE = "seq-1";

interface Mounted {
  modeler: CollaborativeValueChainModeler;
  wrapper: HTMLElement;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { modeler, wrapper } of mounted.splice(0)) {
    modeler.destroy();
    wrapper.remove();
  }
});

async function mount(): Promise<CollaborativeValueChainModeler> {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "width:1000px;height:600px;position:absolute;left:0;top:0";
  const host = document.createElement("div");
  host.style.cssText = "width:100%;height:100%";
  wrapper.append(host);
  document.body.append(wrapper);
  const modeler = createCollaborativeModeler();
  modeler.attachTo(host);
  mounted.push({ modeler, wrapper });
  await modeler.importText(PORTER);
  return modeler;
}

function canvasSvg(modeler: CollaborativeValueChainModeler): SVGSVGElement {
  const container = modeler.diagram.get<Canvas>("canvas").getContainer();
  return container.querySelector<SVGSVGElement>(":scope > svg")!;
}

function has(modeler: CollaborativeValueChainModeler, id: string): boolean {
  return modeler.diagram.get<ElementRegistry>("elementRegistry").get(id) !== undefined;
}

function select(modeler: CollaborativeValueChainModeler, id: string): void {
  const element = modeler.diagram.get<ElementRegistry>("elementRegistry").get(id)!;
  modeler.diagram.get<Selection>("selection").select(element);
}

function entry(modeler: CollaborativeValueChainModeler, where: "palette" | "pad", action: string) {
  const root = where === "palette" ? ".djs-palette" : ".djs-context-pad";
  return modeler.diagram.container.querySelector<HTMLElement>(
    `${root} .entry[data-action="${action}"]`,
  )!;
}

function shape(modeler: CollaborativeValueChainModeler, id: string): SVGElement {
  return modeler.diagram.container.querySelector<SVGElement>(
    `.djs-shape[data-element-id="${id}"] .djs-hit`,
  )!;
}

function press(target: EventTarget, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

function connectionCount(modeler: CollaborativeValueChainModeler): number {
  return (JSON.parse(modeler.exportText()) as { connections: unknown[] }).connections.length;
}

function elementCount(modeler: CollaborativeValueChainModeler): number {
  return (JSON.parse(modeler.exportText()) as { elements: unknown[] }).elements.length;
}

function clickWithoutPointer(target: HTMLElement): void {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
}

/** One task: diagram-js restores the focus on a debounced timeout. */
function aTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe("keys on the focused canvas", () => {
  it("act there: Backspace deletes the selection", async () => {
    const modeler = await mount();
    select(modeler, STEP);
    canvasSvg(modeler).focus();
    press(canvasSvg(modeler), { key: "Backspace" });
    expect(has(modeler, STEP)).toBe(false);
  });

  it("but not with nothing focused", async () => {
    const modeler = await mount();
    select(modeler, STEP);
    (document.activeElement as HTMLElement | SVGElement | null)?.blur();
    press(document.body, { key: "Backspace" });
    expect(has(modeler, STEP)).toBe(true);
  });

  it.each([
    "made the canvas inert",
    "hid the canvas with display: none",
    "hid the canvas with visibility: hidden",
  ] as const)(
    "but not once the host %s, before the browser moves the focus off it",
    async (how) => {
      const modeler = await mount();
      select(modeler, STEP);
      canvasSvg(modeler).focus();
      if (how === "made the canvas inert") modeler.diagram.container.inert = true;
      else if (how === "hid the canvas with display: none")
        modeler.diagram.container.style.display = "none";
      else modeler.diagram.container.style.visibility = "hidden";
      expect(document.activeElement).toBe(canvasSvg(modeler));
      const before = modeler.exportText();

      for (const init of [
        { key: "Backspace" },
        { key: "Delete" },
        { key: "ArrowLeft" },
        { key: " " },
        { key: "l" },
        { key: "h" },
        { key: "a", ctrlKey: true },
        { key: "z", ctrlKey: true },
      ]) {
        const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
        canvasSvg(modeler).dispatchEvent(event);
        expect(event.defaultPrevented, init.key).toBe(false);
      }
      expect(modeler.exportText()).toBe(before);
      expect(has(modeler, STEP)).toBe(true);
      expect(modeler.diagram.get<Selection>("selection").get()).toHaveLength(1);
      expect(modeler.diagram.get<Dragging>("dragging").context()).toBeFalsy();
    },
  );

  it("leave a key alone that a host has handled already", async () => {
    const modeler = await mount();
    select(modeler, STEP);
    canvasSvg(modeler).focus();
    const handledByTheHost = (event: Event) => event.preventDefault();
    window.addEventListener("keydown", handledByTheHost, true);
    try {
      press(canvasSvg(modeler), { key: "Backspace" });
    } finally {
      window.removeEventListener("keydown", handledByTheHost, true);
    }
    expect(has(modeler, STEP)).toBe(true);
  });

  it("leave a key alone that belongs to an input method's composition", async () => {
    const modeler = await mount();
    select(modeler, STEP);
    canvasSvg(modeler).focus();
    const composing = new KeyboardEvent("keydown", {
      key: "Backspace",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    canvasSvg(modeler).dispatchEvent(composing);
    expect(has(modeler, STEP)).toBe(true);
    expect(composing.defaultPrevented).toBe(false);
  });

  it("ignore a keydown without a key, without an error", async () => {
    const modeler = await mount();
    select(modeler, STEP);
    canvasSvg(modeler).focus();
    const errors: string[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.message);
    window.addEventListener("error", onError);
    try {
      canvasSvg(modeler).dispatchEvent(new Event("keydown", { bubbles: true, cancelable: true }));
      press(canvasSvg(modeler), { ctrlKey: true });
    } finally {
      window.removeEventListener("error", onError);
    }
    expect(errors).toEqual([]);
    expect(has(modeler, STEP)).toBe(true);
  });
});

describe("a pointer on an entry hands the focus back to the canvas", () => {
  it("the context pad's Delete: Cmd/Ctrl+Z brings the step back", async () => {
    const modeler = await mount();
    select(modeler, STEP);
    await userEvent.click(entry(modeler, "pad", "delete"));
    expect(has(modeler, STEP)).toBe(false);
    expect(document.activeElement).toBe(canvasSvg(modeler));
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(has(modeler, STEP)).toBe(true);
  });

  it("switching a relation's type: Backspace deletes the relation", async () => {
    const modeler = await mount();
    select(modeler, SEQUENCE);
    await userEvent.click(entry(modeler, "pad", "toggle-type"));
    expect(document.activeElement).toBe(canvasSvg(modeler));
    await userEvent.keyboard("{Backspace}");
    expect(has(modeler, SEQUENCE)).toBe(false);
  });

  it("the context pad's Connect: Cmd/Ctrl+Z takes the new relation back", async () => {
    const modeler = await mount();
    const before = connectionCount(modeler);
    select(modeler, STEP);
    await userEvent.click(entry(modeler, "pad", "connect.sequence"));
    await userEvent.click(shape(modeler, "step-assembly"));
    expect(connectionCount(modeler)).toBe(before + 1);
    expect(document.activeElement).toBe(canvasSvg(modeler));
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(connectionCount(modeler)).toBe(before);
  });

  it("a palette tool: Cmd/Ctrl+Z undoes the last change", async () => {
    const modeler = await mount();
    select(modeler, STEP);
    canvasSvg(modeler).focus();
    press(canvasSvg(modeler), { key: "Backspace" });
    await userEvent.click(entry(modeler, "palette", "hand-tool"));
    expect(document.activeElement).toBe(canvasSvg(modeler));
    await userEvent.keyboard("{Escape}{Control>}z{/Control}");
    expect(has(modeler, STEP)).toBe(true);
    // diagram-js shows the entry's tooltip 300ms after the hover and keeps that timer past
    // destroy(), where it would draw into a removed container: leave the entry first.
    await userEvent.hover(canvasSvg(modeler));
  });

  it("dragging the palette's step onto the canvas: Cmd/Ctrl+Z takes the new step back", async () => {
    const modeler = await mount();
    // An empty stretch of the plane, so the drop lands on no other element.
    modeler.diagram.get<Canvas>("canvas").viewbox({ x: -5000, y: -5000, width: 1000, height: 600 });
    const before = elementCount(modeler);
    const source = entry(modeler, "palette", "create.step");
    const start = source.getBoundingClientRect();
    // Near the palette: the test frame is narrower than the canvas, and a target out of view would
    // scroll the page in the middle of the drag.
    await userEvent.dragAndDrop(source, canvasSvg(modeler), {
      targetPosition: { x: start.right + 120, y: start.bottom + 120 },
      steps: 8,
    });
    expect(elementCount(modeler)).toBe(before + 1);
    expect(document.activeElement).toBe(canvasSvg(modeler));
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(elementCount(modeler)).toBe(before);
  });

  it("and the label editor Append opens keeps it", async () => {
    const modeler = await mount();
    select(modeler, STEP);
    await userEvent.click(entry(modeler, "pad", "append.step"));
    expect(document.activeElement?.classList.contains("djs-direct-editing-content")).toBe(true);
  });

  it("and so does the colour picker", async () => {
    const modeler = await mount();
    select(modeler, STEP);
    await userEvent.click(entry(modeler, "pad", "set-color"));
    expect(document.activeElement?.closest(".djs-popup")).not.toBeNull();
  });

  it("Enter or Space on an entry whose action leaves the focus nowhere: the canvas takes it", async () => {
    const modeler = await mount();
    select(modeler, STEP);
    (document.activeElement as HTMLElement | SVGElement | null)?.blur();
    clickWithoutPointer(entry(modeler, "pad", "delete"));
    expect(has(modeler, STEP)).toBe(false);
    expect(document.activeElement).toBe(document.body);
    await aTick();
    expect(document.activeElement).toBe(canvasSvg(modeler));
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(has(modeler, STEP)).toBe(true);
  });

  it("but Enter or Space on an entry (a click without a pointer) leaves the focus where it is", async () => {
    const modeler = await mount();
    const hostButton = document.createElement("button");
    document.body.append(hostButton);
    try {
      hostButton.focus();
      clickWithoutPointer(entry(modeler, "palette", "lasso-tool"));
      await aTick();
      expect(document.activeElement).toBe(hostButton);
    } finally {
      hostButton.remove();
    }
  });
});
