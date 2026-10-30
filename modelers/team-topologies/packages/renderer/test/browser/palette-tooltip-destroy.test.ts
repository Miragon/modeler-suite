import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModuleDeclaration } from "didi";
import PaletteTooltip from "diagram-js/lib/features/palette/PaletteTooltip";
import { Modeler } from "@miragon/team-topologies-renderer";
import { SAMPLE_DOCUMENT } from "@miragon/team-topologies-schema-model";
import { ttPaletteModule } from "../../src/palette/index.js";
import { ttHoverTooltipTeardownModule } from "../../src/palette/TtHoverTooltipTeardown.js";

// The palette's own tooltip (`TtPaletteTooltip`) cancels its timer on `diagram.destroy`, but
// diagram-js's hover tooltip, which comes with its palette, does not: a host that brings
// diagram-js's palette tooltip back gets its tooltip 300ms after the pointer enters an entry, and
// may destroy the modeler before that (#400).

const SHOW_DELAY_MS = 300;
const PAST_THE_DELAY_MS = SHOW_DELAY_MS + 300;

/** A host that leaves out diagram-js's hover tooltip; `TtPaletteTooltip` does not use it. */
const WITHOUT_HOVER_TOOLTIP: ModuleDeclaration = {
  hoverTooltip: ["value", null],
};

function withDependencies(module: ModuleDeclaration): ModuleDeclaration[] {
  return [module, ...(module.__depends__ ?? []).flatMap(withDependencies)];
}

/** diagram-js's own palette tooltip, under a name of its own beside `TtPaletteTooltip`. */
const diagramJsPaletteTooltipModule: ModuleDeclaration = {
  __init__: ["diagramJsPaletteTooltip"],
  diagramJsPaletteTooltip: ["type", PaletteTooltip],
};

interface Mounted {
  modeler: Modeler;
  container: HTMLElement;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { modeler, container } of mounted.splice(0)) {
    modeler.destroy();
    container.remove();
  }
});

function mount(): Mounted {
  const container = document.createElement("div");
  container.style.cssText = "width: 1024px; height: 768px;";
  document.body.append(container);
  const modeler = new Modeler({ container, additionalModules: [diagramJsPaletteTooltipModule] });
  mounted.push({ modeler, container });
  modeler.importDocument(SAMPLE_DOCUMENT);
  return { modeler, container };
}

function hoverPaletteEntry(container: HTMLElement): void {
  const entry = container.querySelector('.djs-palette-entries .entry[data-action="lasso-tool"]');
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
    const { container } = mount();
    hoverPaletteEntry(container);
    expect(container.querySelector(".djs-hover-tooltip")).toBeNull();
    await vi.waitFor(() => expect(container.querySelector(".djs-hover-tooltip")).not.toBeNull(), {
      timeout: 5000,
    });
  });

  it("lets the host destroy the modeler before the tooltip shows", async () => {
    const { modeler, container } = mount();
    const watch = listenForWindowErrors();
    try {
      hoverPaletteEntry(container);
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
    expect(withDependencies(ttPaletteModule)).toContain(ttHoverTooltipTeardownModule);
  });
});
