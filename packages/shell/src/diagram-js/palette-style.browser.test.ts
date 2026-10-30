import "diagram-js/assets/diagram-js.css";
import "../../fixtures/tokens/cd-tokens.generated.css";
import "../shell.css";
import DiagramExport from "diagram-js";
import PaletteExport from "diagram-js/lib/features/palette/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";
import { PALETTE_TOOL_ICON, iconMarkup } from "../dom/icons.js";
import { mountShell } from "../dom/mount.js";
import type { ShellHandle } from "../dom/types.js";
import { connectDiagramJs } from "./connect.js";
import { shellModule } from "./module.js";
import type { ModuleDeclarationLike } from "./types.js";

/** The palette skin's look, which only a browser's cascade and forced colours show. */

interface Diagram {
  get<T>(name: string): T;
  destroy(): void;
}

type DiagramConstructor = new (options: {
  canvas: { container: HTMLElement };
  modules: ModuleDeclarationLike[];
}) => Diagram;

interface PaletteService {
  registerProvider(provider: { getPaletteEntries(): Record<string, unknown> }): void;
}

function esDefault<T>(module: unknown): T {
  return ((module as { default?: T }).default ?? module) as T;
}

const Diagram = esDefault<DiagramConstructor>(DiagramExport);
const PaletteModule = esDefault<ModuleDeclarationLike>(PaletteExport);

/** A tool that changes the diagram, so the read-only lock disables it (guide §13.5). */
class SpaceToolPaletteProvider {
  static $inject = ["palette"];
  constructor(palette: PaletteService) {
    palette.registerProvider(this);
  }
  getPaletteEntries(): Record<string, unknown> {
    return {
      "space-tool": {
        group: "tools",
        title: "Space",
        html: `<div class="entry">${iconMarkup("hand", PALETTE_TOOL_ICON)}</div>`,
        action: { click: () => undefined },
      },
    };
  }
}

const mounted: Array<{ diagram: Diagram; shell: ShellHandle; root: HTMLElement }> = [];

afterEach(async () => {
  if (server.browser === "chromium") {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  }
  for (const { diagram, shell, root } of mounted.splice(0)) {
    diagram.destroy();
    shell.destroy();
    root.remove();
  }
});

function mountReadOnly(): { shell: ShellHandle; space: HTMLElement } {
  const root = document.createElement("div");
  root.style.cssText = "position:absolute;left:0;top:0;width:1000px;height:700px";
  document.body.append(root);
  const shell = mountShell(root, { host: "ide" });
  const diagram = new Diagram({
    canvas: { container: shell.canvas },
    modules: [
      PaletteModule,
      {
        __init__: ["spaceToolPaletteProvider"],
        spaceToolPaletteProvider: ["type", SpaceToolPaletteProvider],
      },
      shellModule,
    ],
  });
  connectDiagramJs(shell, diagram, { contentBounds: () => undefined });
  mounted.push({ diagram, shell, root });
  shell.setReadOnly(true);
  const space = shell.root.querySelector<HTMLElement>('.djs-palette [data-action="space-tool"]');
  if (!space) throw new Error("no space entry");
  expect(space.getAttribute("aria-disabled")).toBe("true");
  return { shell, space };
}

/**
 * What `color: value` computes to inside `container`. The probe keeps its own colours under forced
 * colours, so a system colour resolves as itself.
 */
function resolvedColor(container: HTMLElement, value: string): string {
  const probe = document.createElement("div");
  probe.style.forcedColorAdjust = "none";
  probe.style.color = value;
  container.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/** The colours of the entry and its tool icon once their transitions have ended. */
async function iconColors(entry: HTMLElement): Promise<[string, string]> {
  const icon = entry.querySelector("svg")!;
  await Promise.all(
    [...entry.getAnimations(), ...icon.getAnimations()].map((animation) => animation.finished),
  );
  return [getComputedStyle(entry).color, getComputedStyle(icon).color];
}

describe.runIf(server.browser === "chromium")("a disabled entry in forced colours (#480)", () => {
  // Chromium keeps a system colour the stylesheet sets and forces any other to CanvasText, which
  // the muted role turns into: the hover rule outside forced colours is just as specific.
  it("keeps its tool icon GrayText, also under the pointer", async () => {
    const { shell, space } = mountReadOnly();
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }],
    });
    const grayText = resolvedColor(shell.root, "GrayText");
    expect(grayText).not.toBe(resolvedColor(shell.root, "CanvasText"));
    expect(getComputedStyle(space).forcedColorAdjust).not.toBe("none");

    expect(await iconColors(space)).toEqual([grayText, grayText]);
    await userEvent.hover(space);
    await vi.waitFor(async () => {
      expect(space.matches(":hover")).toBe(true);
      expect(await iconColors(space)).toEqual([grayText, grayText]);
    });
  });

  it("keeps it GrayText while diagram-js still marks it as the active tool", async () => {
    const { shell, space } = mountReadOnly();
    space.classList.add("highlighted-entry");
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }],
    });
    const grayText = resolvedColor(shell.root, "GrayText");

    expect(await iconColors(space)).toEqual([grayText, grayText]);
    await userEvent.hover(space);
    await vi.waitFor(async () => {
      expect(space.matches(":hover")).toBe(true);
      expect(await iconColors(space)).toEqual([grayText, grayText]);
    });
  });
});
