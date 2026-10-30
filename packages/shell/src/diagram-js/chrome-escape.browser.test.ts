import "diagram-js/assets/diagram-js.css";
import "../../fixtures/tokens/cd-tokens.generated.css";
import "../shell.css";
import DiagramExport from "diagram-js";
import HandToolExport from "diagram-js/lib/features/hand-tool/index.js";
import LassoToolExport from "diagram-js/lib/features/lasso-tool/index.js";
import PaletteExport from "diagram-js/lib/features/palette/index.js";
import { afterEach, describe, expect, it } from "vitest";
import { server, userEvent } from "vitest/browser";
import type { ShellHost } from "../core/index.js";
import { mountShell } from "../dom/mount.js";
import type { ShellHandle } from "../dom/types.js";
import { connectDiagramJs } from "./connect.js";
import { shellModule } from "./module.js";
import type { ModuleDeclarationLike } from "./types.js";

/**
 * An Escape that closes a layer of the chrome is the chrome's (guide §5.4, #482): diagram-js's
 * dragging cancels the drag a palette tool waits with on any Escape `keyup` on the document, so
 * only real keys in a real browser show whether the `keyup` still reaches it.
 */

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
const HandToolModule = esDefault<ModuleDeclarationLike>(HandToolExport);
const LassoToolModule = esDefault<ModuleDeclarationLike>(LassoToolExport);
const PaletteModule = esDefault<ModuleDeclarationLike>(PaletteExport);

class ToolPaletteProvider {
  static $inject = ["palette", "lassoTool", "handTool"];
  constructor(
    palette: PaletteService,
    private readonly lassoTool: { activateSelection(event: Event): void },
    private readonly handTool: { activateHand(event: Event): void },
  ) {
    palette.registerProvider(this);
  }
  getPaletteEntries(): Record<string, unknown> {
    return {
      "lasso-tool": {
        group: "tools",
        title: "Lasso",
        action: { click: (event: Event) => this.lassoTool.activateSelection(event) },
      },
      "hand-tool": {
        group: "tools",
        title: "Hand",
        action: { click: (event: Event) => this.handTool.activateHand(event) },
      },
      "create.box": { group: "shapes", title: "Box", action: { click: () => undefined } },
    };
  }
}

const mounted: Array<{ diagram: Diagram; shell: ShellHandle; root: HTMLElement }> = [];

afterEach(() => {
  for (const { diagram, shell, root } of mounted.splice(0)) {
    diagram.destroy();
    shell.destroy();
    root.remove();
  }
});

function mountModeler(
  host: ShellHost,
  keyScope?: "document" | "root",
): { diagram: Diagram; shell: ShellHandle } {
  const root = document.createElement("div");
  root.style.cssText = "position:absolute;left:0;top:0;width:1000px;height:700px";
  document.body.append(root);
  const shell = mountShell(root, {
    host,
    keyScope,
    menu: { export: [{ kind: "action", id: "png", label: "Export as PNG", onSelect() {} }] },
    problems: {},
  });
  const diagram = new Diagram({
    canvas: { container: shell.canvas },
    modules: [
      PaletteModule,
      LassoToolModule,
      HandToolModule,
      { __init__: ["toolPaletteProvider"], toolPaletteProvider: ["type", ToolPaletteProvider] },
      shellModule,
    ],
  });
  connectDiagramJs(shell, diagram, { contentBounds: () => undefined });
  mounted.push({ diagram, shell, root });
  return { diagram, shell };
}

function lassoEntry(shell: ShellHandle): HTMLElement {
  const element = shell.root.querySelector('.djs-palette [data-action="lasso-tool"]');
  if (!(element instanceof HTMLElement)) throw new Error("no lasso entry");
  return element;
}

/** `aria-pressed` of the lasso's entry, the tool manager's lasso and the drag that waits. */
function lasso(diagram: Diagram, shell: ShellHandle): [string | null, boolean, string | null] {
  return [
    lassoEntry(shell).getAttribute("aria-pressed"),
    diagram.get<{ isActive(tool: string): boolean }>("toolManager").isActive("lasso"),
    diagram.get<{ context(): { prefix: string } | null }>("dragging").context()?.prefix ?? null,
  ];
}

const ARMED = ["true", true, "lasso.selection"];
const PUT_DOWN = ["false", false, null];

async function armLassoBySpace(diagram: Diagram, shell: ShellHandle): Promise<void> {
  lassoEntry(shell).focus();
  await userEvent.keyboard(" ");
  expect(lasso(diagram, shell)).toEqual(ARMED);
}

async function shiftTabToMenuTrigger(shell: ShellHandle): Promise<void> {
  // WebKit's Tab passes over buttons unless the user turned on "Press Tab to highlight each item".
  if (server.browser === "webkit") shell.menu.trigger.focus();
  else await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(document.activeElement).toBe(shell.menu.trigger);
}

describe("a tool armed from the palette, when Escape closes a layer of the chrome (#482)", () => {
  it.each<ShellHost>(["ide", "web", "embedded"])(
    "stays armed when Escape closes the menu (%s host), and goes down on the next Escape on its entry",
    async (host) => {
      const { diagram, shell } = mountModeler(host);
      await armLassoBySpace(diagram, shell);

      await shiftTabToMenuTrigger(shell);
      await userEvent.keyboard("{Enter}");
      expect(shell.menu.isOpen()).toBe(true);
      await userEvent.keyboard("{Escape}");

      expect(shell.menu.isOpen()).toBe(false);
      expect(document.activeElement).toBe(shell.menu.trigger);
      expect(lasso(diagram, shell)).toEqual(ARMED);

      lassoEntry(shell).focus();
      await userEvent.keyboard("{Escape}");
      expect(lasso(diagram, shell)).toEqual(PUT_DOWN);
    },
  );

  it.each<ShellHost>(["web", "embedded"])(
    "stays armed when Escape closes the problems popover (%s host)",
    async (host) => {
      const { diagram, shell } = mountModeler(host);
      shell.setProblems({
        count: 1,
        errors: 1,
        items: [{ severity: "error", message: "Unknown box type." }],
      });
      await armLassoBySpace(diagram, shell);

      const pill = shell.root.querySelector<HTMLElement>(".cd-shell-problems")!;
      pill.focus();
      await userEvent.keyboard("{Enter}");
      const popover = shell.root.querySelector<HTMLElement>('[data-chrome="problems-popover"]')!;
      expect(popover.hidden).toBe(false);
      await userEvent.keyboard("{Escape}");

      expect(popover.hidden).toBe(true);
      expect(document.activeElement).toBe(pill);
      expect(lasso(diagram, shell)).toEqual(ARMED);
    },
  );

  it.each<[ShellHost, "document" | "root" | undefined]>([
    ["ide", undefined],
    ["web", undefined],
    ["embedded", undefined],
    ["ide", "root"],
  ])(
    "stays armed when Escape closes a dialog (%s host, key scope %s), and goes down on the next Escape",
    async (host, keyScope) => {
      const { diagram, shell } = mountModeler(host, keyScope);
      await armLassoBySpace(diagram, shell);

      const dialog = shell.showShortcutsDialog([]);
      expect(dialog.isOpen()).toBe(true);
      await userEvent.keyboard("{Escape}");

      await expect.poll(() => dialog.isOpen()).toBe(false);
      expect(document.activeElement).toBe(lassoEntry(shell));
      expect(lasso(diagram, shell)).toEqual(ARMED);

      await userEvent.keyboard("{Escape}");
      expect(lasso(diagram, shell)).toEqual(PUT_DOWN);
    },
  );

  // As Team Topologies' "Diagram title…" and Context Maps' and Wardley Maps' "Map title…" are: a
  // native modal <dialog> in the root that leaves Escape to the browser.
  it.each<ShellHost>(["ide", "web", "embedded"])(
    "stays armed when Escape closes a modeler's own dialog (%s host)",
    async (host) => {
      const { diagram, shell } = mountModeler(host);
      await armLassoBySpace(diagram, shell);

      const dialog = document.createElement("dialog");
      const field = dialog.appendChild(document.createElement("input"));
      shell.root.append(dialog);
      dialog.showModal();
      field.focus();
      await userEvent.keyboard("{Escape}");

      await expect.poll(() => dialog.open).toBe(false);
      expect(lasso(diagram, shell)).toEqual(ARMED);

      lassoEntry(shell).focus();
      await userEvent.keyboard("{Escape}");
      expect(lasso(diagram, shell)).toEqual(PUT_DOWN);
    },
  );
});
