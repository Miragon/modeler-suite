/// <reference types="@vitest/browser-playwright" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type { Element } from "diagram-js/lib/model/Types";
import { Modeler } from "../../src/index.js";
import { isEventStormingShape, type EventStormingShape } from "../../src/model/di-types.js";
import type EventStormingColorPicker from "../../src/color-picker/EventStormingColorPicker.js";
import type EventStormingLabelEditing from "../../src/label-editing/EventStormingLabelEditing.js";
import "../../src/assets/event-storming.css";

const DSL = `title Motion
event Order Placed [200, 300]
event Order Paid [440, 300]
note Remember the budget [320, 520]`;

type Chrome = "context pad" | "note toolbar" | "label suggestion" | "colour picker";

const CHROME: readonly Chrome[] = [
  "context pad",
  "note toolbar",
  "label suggestion",
  "colour picker",
];

/**
 * The board's own canvas chrome under `prefers-reduced-motion: reduce` (guide §5.14, §7): no hover
 * fades and no movement. Without that wish the hovers fade in 150ms on `--cd-ease`.
 */
describe("the canvas chrome's motion", () => {
  let container: HTMLElement;
  let modeler: Modeler;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    modeler = new Modeler({ container, width: 1024, height: 768, fitOnImport: false });
    await modeler.importDSL(DSL);
  });

  afterEach(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    modeler.destroy();
    container.remove();
  });

  function shapeLabelled(label: string): EventStormingShape {
    const shape = modeler
      .get<ElementRegistry>("elementRegistry")
      .find((element) => isEventStormingShape(element) && element.eventStormingLabel === label);
    if (!shape) throw new Error(`no ${label} on the board`);
    return shape as unknown as EventStormingShape;
  }

  function labelEditing(): EventStormingLabelEditing {
    return modeler.get<EventStormingLabelEditing>("eventStormingLabelEditing");
  }

  /** Opens the chrome and gives the element whose hover would move. */
  function open(chrome: Chrome): HTMLElement {
    switch (chrome) {
      case "context pad":
        modeler
          .get<ContextPad>("contextPad")
          .open(shapeLabelled("Order Paid") as unknown as Element);
        return shown(".djs-context-pad .entry.event-storming-cp-entry");
      case "note toolbar":
        labelEditing().activate(shapeLabelled("Remember the budget"));
        return shown(".event-storming-note-toolbar button");
      case "label suggestion": {
        labelEditing().activate(shapeLabelled("Order Paid"));
        const field = shown<HTMLTextAreaElement>(".event-storming-label-input");
        field.value = "Order";
        field.dispatchEvent(new Event("input"));
        return shown(".event-storming-label-suggestion");
      }
      case "colour picker":
        modeler
          .get<EventStormingColorPicker>("eventStormingColorPicker")
          .open(shapeLabelled("Order Paid"), 200, 200);
        return shown(".event-storming-cp-swatch");
    }
  }

  function shown<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = container.querySelector<T>(selector);
    if (!element) throw new Error(`nothing shows ${selector}`);
    return element;
  }

  async function reduceMotion(): Promise<void> {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  }

  /** The items of a computed list value, split at the commas outside parentheses. */
  function listed(value: string): Set<string> {
    return new Set(value.split(/,\s*(?![^()]*\))/));
  }

  it.each(CHROME)("fades the %s's hover in 150ms on --cd-ease", (chrome) => {
    const style = getComputedStyle(open(chrome));

    expect(listed(style.transitionDuration)).toEqual(new Set(["0.15s"]));
    expect(listed(style.transitionTimingFunction)).toEqual(
      new Set(["cubic-bezier(0.4, 0, 0.2, 1)"]),
    );
  });

  it.each(CHROME)("switches the %s's transitions off under reduced motion", async (chrome) => {
    const element = open(chrome);
    await reduceMotion();

    const style = getComputedStyle(element);
    expect([style.transitionProperty, style.transitionDuration]).toEqual(["none", "0s"]);
  });

  it("grows a hovered colour swatch, and keeps it still under reduced motion", async () => {
    const swatch = open("colour picker");
    await userEvent.hover(swatch);
    await vi.waitFor(() =>
      expect(getComputedStyle(swatch).transform).toBe("matrix(1.1, 0, 0, 1.1, 0, 0)"),
    );
    await userEvent.unhover(swatch);

    await reduceMotion();
    await userEvent.hover(swatch);
    expect(swatch.matches(":hover")).toBe(true);
    expect(getComputedStyle(swatch).transform).toBe("none");
  });
});
