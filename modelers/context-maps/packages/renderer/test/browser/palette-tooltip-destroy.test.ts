import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModuleDeclaration } from "didi";
import PaletteTooltip from "diagram-js/lib/features/palette/PaletteTooltip";
import { attachedHost } from "@miragon/modeler-api/conformance";
import {
  Modeler,
  createCollaborativeModeler,
  type CollaborativeContextMapsModeler,
} from "@miragon/context-maps-renderer";
import orderFulfilment from "./fixtures/order-fulfilment.cm?raw";
import { cmPaletteModule } from "../../src/palette/index.js";
import { cmPaletteHoverTooltipTeardownModule } from "../../src/palette/CmPaletteHoverTooltipTeardown.js";

// The palette's own tooltip (`CmPaletteTooltip`) cancels its timer on `diagram.destroy`, but
// diagram-js's hover tooltip, which comes with its palette, does not: a host that brings
// diagram-js's palette tooltip back gets its tooltip 300ms after the pointer enters an entry, and
// may destroy the modeler before that (#400).

const SHOW_DELAY_MS = 300;
const PAST_THE_DELAY_MS = SHOW_DELAY_MS + 300;

/** A host that leaves out diagram-js's hover tooltip; `CmPaletteTooltip` does not use it. */
const WITHOUT_HOVER_TOOLTIP: ModuleDeclaration = {
  hoverTooltip: ["value", null],
};

/** diagram-js's own palette tooltip, under a name of its own beside `CmPaletteTooltip`. */
const diagramJsPaletteTooltipModule: ModuleDeclaration = {
  __init__: ["diagramJsPaletteTooltip"],
  diagramJsPaletteTooltip: ["type", PaletteTooltip],
};

function withDependencies(module: ModuleDeclaration): ModuleDeclaration[] {
  return [module, ...(module.__depends__ ?? []).flatMap(withDependencies)];
}

interface Mounted {
  modeler: CollaborativeContextMapsModeler;
  host: HTMLElement;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { modeler, host } of mounted.splice(0)) {
    modeler.destroy();
    host.parentElement?.remove();
  }
});

async function mount(): Promise<Mounted> {
  const modeler = createCollaborativeModeler({
    additionalModules: [diagramJsPaletteTooltipModule],
  });
  const host = attachedHost();
  modeler.attachTo(host);
  mounted.push({ modeler, host });
  await modeler.importText(orderFulfilment);
  return { modeler, host };
}

function hoverPaletteEntry(host: HTMLElement): void {
  const entry = host.querySelector('.djs-palette-entries .entry[data-action="lasso-tool"]');
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
    const { host } = await mount();
    hoverPaletteEntry(host);
    expect(host.querySelector(".djs-hover-tooltip")).toBeNull();
    await vi.waitFor(() => expect(host.querySelector(".djs-hover-tooltip")).not.toBeNull(), {
      timeout: 5000,
    });
  });

  it("lets the host destroy the modeler before the tooltip shows", async () => {
    const { modeler, host } = await mount();
    const watch = listenForWindowErrors();
    try {
      hoverPaletteEntry(host);
      modeler.destroy();
      await wait(PAST_THE_DELAY_MS);
    } finally {
      watch.stop();
    }
    expect(watch.errors).toEqual([]);
  });

  it("lets a host that leaves out diagram-js's hover tooltip destroy the modeler", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const modeler = new Modeler({ container, additionalModules: [WITHOUT_HOVER_TOOLTIP] });
    try {
      modeler.get("canvas");
      expect(() => modeler.destroy()).not.toThrow();
    } finally {
      container.remove();
    }
  });

  it("comes with the palette module, for a host that builds its own modeler from it", () => {
    expect(withDependencies(cmPaletteModule)).toContain(cmPaletteHoverTooltipTeardownModule);
  });
});
