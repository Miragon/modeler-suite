import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModuleDeclaration } from "didi";
import PaletteTooltip from "diagram-js/lib/features/palette/PaletteTooltip";
import { attachedHost } from "@miragon/modeler-api/conformance";
import {
  Modeler,
  createCollaborativeModeler,
  type CollaborativeWardleyModeler,
} from "../../src/index.js";
import teaShop from "./fixtures/tea-shop.wmap?raw";
import "../../src/assets/wardley.css";
import { wardleyPaletteModule } from "../../src/palette/index.js";
import { wardleyHoverTooltipTeardownModule } from "../../src/palette/WardleyHoverTooltipTeardown.js";

// A palette entry's tooltip shows 300ms after the pointer enters it; a host may destroy the modeler
// before that (#400). The palette's own tooltip (`WardleyPaletteTooltip`) cancels its timer on
// `diagram.destroy`, but diagram-js's hover tooltip, which comes with its palette, does not, and a
// host may bring diagram-js's palette tooltip back.

const SHOW_DELAY_MS = 300;
const PAST_THE_DELAY_MS = SHOW_DELAY_MS + 300;

/** A host that leaves out diagram-js's hover tooltip, and the palette tooltip. */
const WITHOUT_HOVER_TOOLTIP: ModuleDeclaration = {
  hoverTooltip: ["value", null],
  paletteTooltip: ["value", null],
};

/** diagram-js's own palette tooltip, under a name of its own beside `WardleyPaletteTooltip`. */
const DIAGRAM_JS_PALETTE_TOOLTIP: ModuleDeclaration = {
  __init__: ["diagramJsPaletteTooltip"],
  diagramJsPaletteTooltip: ["type", PaletteTooltip],
};

function withDependencies(module: ModuleDeclaration): ModuleDeclaration[] {
  return [module, ...(module.__depends__ ?? []).flatMap(withDependencies)];
}

interface Mounted {
  modeler: CollaborativeWardleyModeler;
  host: HTMLElement;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { modeler, host } of mounted.splice(0)) {
    modeler.destroy();
    host.parentElement?.remove();
  }
});

async function mount(additionalModules: ModuleDeclaration[] = []): Promise<Mounted> {
  const modeler = createCollaborativeModeler({ additionalModules });
  const host = attachedHost();
  modeler.attachTo(host);
  mounted.push({ modeler, host });
  await modeler.importText(teaShop);
  return { modeler, host };
}

function lassoEntry(host: HTMLElement): Element {
  const entry = host.querySelector('.djs-palette-entries .entry[data-action="lasso-tool"]');
  if (!entry) throw new Error("the palette has no lasso entry");
  return entry;
}

/** The renderer's tooltip follows the pointer events, which tell a mouse from a touch. */
function pointPaletteEntry(host: HTMLElement): void {
  lassoEntry(host).dispatchEvent(
    new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }),
  );
}

/** diagram-js's tooltip follows `mouseover`. */
function mousePaletteEntry(host: HTMLElement): void {
  lassoEntry(host).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
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

describe.each([
  { name: "the palette's own tooltip", modules: [], hover: pointPaletteEntry },
  {
    name: "diagram-js's hover tooltip, which a host brings back",
    modules: [DIAGRAM_JS_PALETTE_TOOLTIP],
    hover: mousePaletteEntry,
  },
])("$name", ({ modules, hover }) => {
  it("shows a hovered entry's tooltip after the delay", async () => {
    const { host } = await mount(modules);
    hover(host);
    expect(host.querySelector(".djs-hover-tooltip")).toBeNull();
    await vi.waitFor(() => expect(host.querySelector(".djs-hover-tooltip")).not.toBeNull(), {
      timeout: 5000,
    });
  });

  it("lets the host destroy the modeler before the tooltip shows", async () => {
    const { modeler, host } = await mount(modules);
    const watch = listenForWindowErrors();
    try {
      hover(host);
      modeler.destroy();
      await wait(PAST_THE_DELAY_MS);
    } finally {
      watch.stop();
    }
    expect(watch.errors).toEqual([]);
  });
});

describe("the palette's hover tooltip teardown", () => {
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
    expect(withDependencies(wardleyPaletteModule)).toContain(wardleyHoverTooltipTeardownModule);
  });
});
