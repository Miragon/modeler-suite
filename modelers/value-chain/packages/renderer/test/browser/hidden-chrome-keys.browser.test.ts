import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Element } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  isVcShape,
  type CollaborativeValueChainModeler,
  type VcShape,
} from "../../src/index.js";
import "../../src/assets/value-chain.css";
import PORTER from "../../../../example/porter.vc.json?raw";

const STEP = "step-testing";

/**
 * The ways a host hides a diagram it keeps. The browser moves the focus off the hidden control only
 * at its next rendering update, so each case presses its keys at the still-focused control first.
 */
const hostHidings = [
  {
    how: "made it inert",
    hide: (host: HTMLElement) => (host.inert = true),
    show: (host: HTMLElement) => (host.inert = false),
  },
  {
    how: "hid it with display: none",
    hide: (host: HTMLElement) => (host.style.display = "none"),
    show: (host: HTMLElement) => host.style.removeProperty("display"),
  },
  {
    how: "hid it with visibility: hidden",
    hide: (host: HTMLElement) => host.style.setProperty("visibility", "hidden"),
    show: (host: HTMLElement) => host.style.removeProperty("visibility"),
  },
];

/**
 * diagram-js-direct-editing moves the focus into its box only inside a frame that has the focus,
 * as it has for a user who opened the editor.
 */
async function focusTheFrame(): Promise<void> {
  const target = document.createElement("div");
  target.style.width = "16px";
  target.style.height = "16px";
  document.body.append(target);
  await userEvent.click(target);
  target.remove();
  expect(document.hasFocus()).toBe(true);
}

describe("the diagram's own chrome on a diagram the host hides, without the shell", () => {
  let wrapper: HTMLElement;
  let modeler: CollaborativeValueChainModeler;
  const keysAtWindow: string[] = [];
  const countKeyAtWindow = (event: KeyboardEvent) => keysAtWindow.push(event.key);

  beforeEach(async () => {
    await focusTheFrame();
    wrapper = document.createElement("div");
    wrapper.style.cssText = "width:1000px;height:600px;position:absolute;left:0;top:0";
    const host = document.createElement("div");
    host.style.cssText = "width:100%;height:100%";
    wrapper.append(host);
    document.body.append(wrapper);
    modeler = createCollaborativeModeler();
    modeler.attachTo(host);
    await modeler.importText(PORTER);
    window.addEventListener("keydown", countKeyAtWindow);
  });

  afterEach(() => {
    window.removeEventListener("keydown", countKeyAtWindow);
    keysAtWindow.length = 0;
    modeler.destroy();
    wrapper.remove();
  });

  function shapes(): VcShape[] {
    return modeler.diagram
      .get<ElementRegistry>("elementRegistry")
      .filter((element) => isVcShape(element)) as VcShape[];
  }

  function step(): VcShape {
    return modeler.diagram.get<ElementRegistry>("elementRegistry").get(STEP) as unknown as VcShape;
  }

  function directEditingIsActive(): boolean {
    return modeler.diagram.get<{ isActive(): boolean }>("directEditing").isActive();
  }

  function pressKey(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  /** Each key reaches the page untouched: not prevented and on to the window. */
  function expectLeftToPage(target: EventTarget, keys: readonly KeyboardEventInit[]): void {
    for (const init of keys) {
      const before = keysAtWindow.length;
      expect(pressKey(target, init).defaultPrevented, init.key).toBe(false);
      expect(keysAtWindow.length, `${init.key} at the window`).toBe(before + 1);
    }
  }

  it.each(hostHidings)(
    "the palette toolbar neither triggers an entry nor moves the focus once the host $how",
    ({ hide, show }) => {
      const create = wrapper.querySelector<HTMLElement>(
        '.djs-palette .entry[data-action="create.step"]',
      )!;
      create.focus();
      const before = shapes().length;
      hide(wrapper);
      expect(document.activeElement).toBe(create);

      expectLeftToPage(
        create,
        ["Enter", " ", "ArrowRight", "ArrowLeft", "Home", "End"].map((key) => ({ key })),
      );
      expect(shapes()).toHaveLength(before);
      expect(document.activeElement).toBe(create);

      show(wrapper);
      expect(pressKey(create, { key: "Enter" }).defaultPrevented).toBe(true);
      expect(shapes()).toHaveLength(before + 1);
    },
  );

  /** Opens a popup menu of the context pad's and selects its entry at `index`, as arrow keys do. */
  async function openPopupMenu(
    target: Element | Element[],
    provider: string,
    index: number,
  ): Promise<HTMLElement> {
    modeler.diagram
      .get<{ open(target: unknown, id: string, position: { x: number; y: number }): void }>(
        "popupMenu",
      )
      .open(target, provider, { x: 100, y: 100 });
    const focused = document.activeElement as HTMLElement;
    expect(focused.closest(".djs-popup")).not.toBeNull();
    // The menu selects its first entry once more after the first paint, as a user sees it.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
    for (let entry = 0; entry < index; entry++) {
      pressKey(focused, { key: "ArrowDown" });
      // The menu renders its new selection a microtask later, and Enter picks the rendered one.
      await Promise.resolve();
    }
    return focused;
  }

  function popupMenuIsOpen(): boolean {
    return modeler.diagram.get<{ isOpen(): boolean }>("popupMenu").isOpen();
  }

  it.each(hostHidings)(
    "the colour menu picks no colour once the host $how",
    async ({ hide, show }) => {
      const focused = await openPopupMenu(step() as unknown as Element, "vc-color-picker", 1);
      hide(wrapper);

      expectLeftToPage(focused, [{ key: "Enter" }]);
      expect(step().color).toBeUndefined();
      expect(popupMenuIsOpen()).toBe(true);
      expect(document.activeElement).toBe(focused);

      show(wrapper);
      expect(pressKey(focused, { key: "Enter" }).defaultPrevented).toBe(true);
      expect(step().color).toBeDefined();
    },
  );

  it.each(hostHidings)(
    "the alignment menu aligns nothing once the host $how",
    async ({ hide, show }) => {
      const steps = shapes().filter((shape) => shape.vcType === "step");
      const positions = () => steps.map((shape) => `${shape.x},${shape.y}`).join(" ");
      const before = positions();
      const focused = await openPopupMenu(steps as unknown as Element[], "vc-align-elements", 0);
      hide(wrapper);

      expectLeftToPage(focused, [{ key: "Enter" }]);
      expect(positions()).toBe(before);
      expect(popupMenuIsOpen()).toBe(true);
      expect(document.activeElement).toBe(focused);

      show(wrapper);
      expect(pressKey(focused, { key: "Enter" }).defaultPrevented).toBe(true);
      expect(positions()).not.toBe(before);
    },
  );

  it.each(hostHidings)(
    "the label editor neither saves nor closes once the host $how",
    ({ hide, show }) => {
      const label = step().vcLabel;
      modeler.diagram
        .get<{ activate(element: Element): boolean }>("directEditing")
        .activate(step() as unknown as Element);
      const content = wrapper.querySelector<HTMLElement>(".djs-direct-editing-content")!;
      expect(document.activeElement).toBe(content);
      content.innerText = "Quality assurance";
      hide(wrapper);

      expectLeftToPage(content, [
        { key: "Enter", keyCode: 13 },
        { key: "Escape", keyCode: 27 },
      ]);
      expect(directEditingIsActive()).toBe(true);
      expect(step().vcLabel).toBe(label);

      show(wrapper);
      expect(pressKey(content, { key: "Enter", keyCode: 13 }).defaultPrevented).toBe(true);
      expect(directEditingIsActive()).toBe(false);
      expect(step().vcLabel).toBe("Quality assurance");
    },
  );
});
