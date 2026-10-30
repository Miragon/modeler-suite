import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModuleDeclaration } from "didi";
import PaletteTooltip from "diagram-js/lib/features/palette/PaletteTooltip";
import { createEmptyDocument } from "@miragon/value-chain-schema-model";
import { Modeler } from "../../src/index.js";
import "../../src/assets/value-chain.css";

// The palette's own tooltip (`VcPaletteTooltip`) cancels its timer on `diagram.destroy`, but
// diagram-js's hover tooltip, which comes with its palette, does not: a host that brings
// diagram-js's palette tooltip back gets its tooltip 300ms after the pointer enters an entry, and
// may destroy the modeler before that (#400).

const SHOW_DELAY_MS = 300;
const PAST_THE_DELAY_MS = SHOW_DELAY_MS + 300;

/** diagram-js's own palette tooltip, under a name of its own beside `VcPaletteTooltip`. */
const diagramJsPaletteTooltipModule: ModuleDeclaration = {
  __init__: ["diagramJsPaletteTooltip"],
  diagramJsPaletteTooltip: ["type", PaletteTooltip],
};

interface Mounted {
  modeler: Modeler;
  wrapper: HTMLElement;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { modeler, wrapper } of mounted.splice(0)) {
    modeler.destroy();
    wrapper.remove();
  }
});

function mount(): Mounted {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute;left:0;top:0;width:1024px;height:768px";
  const host = document.createElement("div");
  host.style.cssText = "width:100%;height:100%";
  wrapper.append(host);
  document.body.append(wrapper);
  const modeler = new Modeler({
    container: host,
    additionalModules: [diagramJsPaletteTooltipModule],
  });
  mounted.push({ modeler, wrapper });
  modeler.importDocument(createEmptyDocument("Palette tooltip"));
  return { modeler, wrapper };
}

function hoverPaletteEntry(wrapper: HTMLElement): void {
  const entry = wrapper.querySelector('.djs-palette-entries .entry[data-action="lasso-tool"]');
  if (!entry) throw new Error("the palette has no lasso entry");
  entry.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Errors that reach the window: a throw in a timer reaches no caller. */
function listenForWindowErrors(): { errors: string[]; stop(): void } {
  const errors: string[] = [];
  const onError = (event: ErrorEvent): void => {
    errors.push(String(event.error ?? event.message));
    event.preventDefault();
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    errors.push(String(event.reason));
    event.preventDefault();
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return {
    errors,
    stop: () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    },
  };
}

describe("diagram-js's hover tooltip on the palette", () => {
  it("shows a hovered entry's tooltip after the delay", async () => {
    const { wrapper } = mount();
    hoverPaletteEntry(wrapper);
    expect(wrapper.querySelector(".djs-hover-tooltip")).toBeNull();
    await vi.waitFor(() => expect(wrapper.querySelector(".djs-hover-tooltip")).not.toBeNull(), {
      timeout: 5000,
    });
  });

  it("lets the host destroy the modeler before the tooltip shows", async () => {
    const { modeler, wrapper } = mount();
    const watch = listenForWindowErrors();
    try {
      hoverPaletteEntry(wrapper);
      modeler.destroy();
      await wait(PAST_THE_DELAY_MS);
    } finally {
      watch.stop();
    }
    expect(watch.errors).toEqual([]);
  });
});
