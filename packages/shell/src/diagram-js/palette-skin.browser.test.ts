import "diagram-js/assets/diagram-js.css";
import DiagramExport from "diagram-js";
import HandToolExport from "diagram-js/lib/features/hand-tool/index.js";
import LassoToolExport from "diagram-js/lib/features/lasso-tool/index.js";
import PaletteExport from "diagram-js/lib/features/palette/index.js";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { shellModule } from "./module.js";
import type { ModuleDeclarationLike } from "./types.js";

/**
 * The palette skin in a real browser: Chromium reports the removal of the focused entry as a
 * focusout while the entry is still in the document, and diagram-js's drags listen to the real
 * pointer and keys on the document.
 */

interface Diagram {
  get<T>(name: string): T;
  destroy(): void;
}

type DiagramConstructor = new (options: {
  canvas: { container: HTMLElement };
  modules: ModuleDeclarationLike[];
}) => Diagram;

interface EventBusService {
  fire(type: string, data?: object): unknown;
  on(type: string, priority: number, listener: (event: never) => unknown): void;
}

interface ToolManagerService {
  isActive(tool: string): boolean;
}

interface DraggingService {
  context(): { prefix: string } | null;
}

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

/** The actions the provider stops offering, as a level or mode switch of a modeler does. */
const withdrawn = new Set<string>();

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
    const entries: Record<string, unknown> = {
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
    return Object.fromEntries(
      Object.entries(entries).filter(([actionName]) => !withdrawn.has(actionName)),
    );
  }
}

const mounted: Array<{ diagram: Diagram; container: HTMLElement }> = [];

afterEach(() => {
  for (const { diagram, container } of mounted.splice(0)) {
    diagram.destroy();
    container.remove();
  }
  withdrawn.clear();
});

function createDiagram(): Diagram {
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:0;top:0;width:800px;height:600px";
  document.body.append(container);
  const diagram = new Diagram({
    canvas: { container },
    modules: [
      PaletteModule,
      LassoToolModule,
      HandToolModule,
      { __init__: ["toolPaletteProvider"], toolPaletteProvider: ["type", ToolPaletteProvider] },
      shellModule,
    ],
  });
  mounted.push({ diagram, container });
  return diagram;
}

function entry(diagram: Diagram, actionName: string): HTMLElement {
  const container = diagram.get<{ getContainer(): HTMLElement }>("canvas").getContainer();
  const element = container.querySelector(`.djs-palette [data-action="${actionName}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`no entry ${actionName}`);
  return element;
}

function rebuild(diagram: Diagram): void {
  diagram.get<EventBusService>("eventBus").fire("i18n.changed");
}

function toolUpdates(diagram: Diagram): Array<string | null> {
  const tools: Array<string | null> = [];
  diagram
    .get<EventBusService>("eventBus")
    .on("tool-manager.update", 500, (event: { tool: string | null }) => {
      tools.push(event.tool);
    });
  return tools;
}

describe("focus across a rebuild (#461)", () => {
  it("brings the keyboard focus back to the entry the rebuild replaced", async () => {
    const diagram = createDiagram();
    entry(diagram, "lasso-tool").focus();
    await userEvent.keyboard("{ArrowRight}");
    const hand = entry(diagram, "hand-tool");
    expect(document.activeElement).toBe(hand);

    rebuild(diagram);

    expect(entry(diagram, "hand-tool")).not.toBe(hand);
    expect(document.activeElement).toBe(entry(diagram, "hand-tool"));
    expect(entry(diagram, "hand-tool").tabIndex).toBe(0);
  });

  it("hands the keyboard focus to the tab stop when the rebuild no longer offers the focused entry", async () => {
    const diagram = createDiagram();
    entry(diagram, "lasso-tool").focus();
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(entry(diagram, "create.box"));
    withdrawn.add("create.box");

    rebuild(diagram);

    expect(document.querySelector('.djs-palette [data-action="create.box"]')).toBeNull();
    expect(document.activeElement).toBe(entry(diagram, "lasso-tool"));
    expect(entry(diagram, "lasso-tool").tabIndex).toBe(0);
  });

  it("leaves a focus that left the palette on the page when the palette rebuilds later", async () => {
    const diagram = createDiagram();
    const before = document.createElement("button");
    document.body.prepend(before);
    entry(diagram, "lasso-tool").focus();
    before.focus();
    before.remove();
    await Promise.resolve();

    rebuild(diagram);

    expect(document.activeElement).toBe(document.body);
  });
});

describe("a tool armed from the palette (#458)", () => {
  function state(diagram: Diagram, tool: string): [string | null, boolean, string | null] {
    return [
      entry(diagram, `${tool}-tool`).getAttribute("aria-pressed"),
      diagram.get<ToolManagerService>("toolManager").isActive(tool),
      diagram.get<DraggingService>("dragging").context()?.prefix ?? null,
    ];
  }

  it.each([
    { tool: "lasso", prefix: "lasso.selection" },
    { tool: "hand", prefix: "hand" },
  ])("is put down when Escape cancels the $tool armed by Space", async ({ tool, prefix }) => {
    const diagram = createDiagram();
    entry(diagram, `${tool}-tool`).focus();

    await userEvent.keyboard(" ");
    expect(state(diagram, tool)).toEqual(["true", true, prefix]);

    await userEvent.keyboard("{Escape}");
    expect(state(diagram, tool)).toEqual(["false", false, null]);
    expect(entry(diagram, `${tool}-tool`).classList.contains("highlighted-entry")).toBe(false);
  });

  it("is put down when Escape cancels the lasso a click armed, before the pointer moves", async () => {
    const diagram = createDiagram();

    await userEvent.click(entry(diagram, "lasso-tool"));
    expect(state(diagram, "lasso")).toEqual(["true", true, "lasso.selection"]);

    await userEvent.keyboard("{Escape}");
    expect(state(diagram, "lasso")).toEqual(["false", false, null]);
  });

  it("stays pressed until a click on the next tool's entry has armed that tool", async () => {
    const diagram = createDiagram();
    const tools = toolUpdates(diagram);

    await userEvent.click(entry(diagram, "lasso-tool"));
    await userEvent.click(entry(diagram, "hand-tool"));

    expect(tools).toEqual(["lasso", "hand"]);
    expect(state(diagram, "hand")).toEqual(["true", true, "hand"]);
    expect(entry(diagram, "lasso-tool").getAttribute("aria-pressed")).toBe("false");
  });
});
