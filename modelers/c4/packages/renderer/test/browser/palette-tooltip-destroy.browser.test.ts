import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModuleDeclaration } from "didi";
import { Modeler } from "../../src/Modeler.js";
import { paletteModule } from "../../src/palette/index.js";
import { hoverTooltipTeardownModule } from "../../src/palette/HoverTooltipTeardown.js";
import { createInteractionEngine } from "./support/interaction/engine.js";
import { destroyMounted, mountModeler, wait } from "./support/interaction/mount.js";

// diagram-js's hover tooltip shows a palette entry's tooltip 300ms after the pointer enters it; a
// host may destroy the modeler before that.

const SHOW_DELAY_MS = 300;
const PAST_THE_DELAY_MS = SHOW_DELAY_MS + 300;

/** A host that leaves out diagram-js's hover tooltip, and the palette tooltip that would use it. */
const WITHOUT_HOVER_TOOLTIP: ModuleDeclaration = {
  hoverTooltip: ["value", null],
  paletteTooltip: ["value", null],
};

function withDependencies(module: ModuleDeclaration): ModuleDeclaration[] {
  return [module, ...(module.__depends__ ?? []).flatMap(withDependencies)];
}

afterEach(() => destroyMounted());

function hoverPaletteEntry(host: HTMLElement): void {
  const entry = host.querySelector('.djs-palette-entries .entry[data-action="lasso-tool"]');
  if (!entry) throw new Error("the palette has no lasso entry");
  entry.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
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

describe("the palette's hover tooltip", () => {
  it("shows a hovered entry's tooltip after the delay", async () => {
    const { host } = await mountModeler();
    hoverPaletteEntry(host);
    expect(host.querySelector(".djs-hover-tooltip")).toBeNull();
    await vi.waitFor(() => expect(host.querySelector(".djs-hover-tooltip")).not.toBeNull(), {
      timeout: 5000,
    });
  });

  it("lets the host destroy the modeler before the tooltip shows", async () => {
    const { modeler, host } = await mountModeler();
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
    const modeler = new Modeler({
      container,
      additionalModules: [
        WITHOUT_HOVER_TOOLTIP,
        { c4Engine: ["value", createInteractionEngine()] },
      ],
    });
    try {
      modeler.get("canvas");
      expect(() => modeler.destroy()).not.toThrow();
    } finally {
      container.remove();
    }
  });

  it("comes with the palette module, for a host that builds its own modeler from it", () => {
    expect(withDependencies(paletteModule)).toContain(hoverTooltipTeardownModule);
  });
});
