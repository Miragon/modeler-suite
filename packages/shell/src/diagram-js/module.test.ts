import DiagramExport from "diagram-js";
import CommandExport from "diagram-js/lib/command/index.js";
import EditorActionsExport from "diagram-js/lib/features/editor-actions/index.js";
import HandToolExport from "diagram-js/lib/features/hand-tool/index.js";
import KeyboardExport from "diagram-js/lib/features/keyboard/index.js";
import LassoToolExport from "diagram-js/lib/features/lasso-tool/index.js";
import PaletteExport from "diagram-js/lib/features/palette/index.js";
import ZoomScrollExport from "diagram-js/lib/navigation/zoomscroll/index.js";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { defaultMessages, fitViewbox, type Bounds, type Insets, type Size } from "../core/index.js";
import { mountShell, type PaletteRegistration, type ShellHandle } from "../dom/index.js";
import { connectDiagramJs, type CollaborativeModelerLike } from "./connect.js";
import { shellModule } from "./module.js";
import type { ModuleDeclarationLike } from "./types.js";

interface Diagram {
  get<T>(name: string): T;
  destroy(): void;
}

type DiagramConstructor = new (options: {
  canvas: { container: HTMLElement };
  modules: ModuleDeclarationLike[];
}) => Diagram;

// diagram-js ships ESM without "type": "module": NodeNext types its default exports as CommonJS
// namespaces, while Vitest loads the real ES modules.
function esDefault<T>(module: unknown): T {
  return ((module as { default?: T }).default ?? module) as T;
}

const Diagram = esDefault<DiagramConstructor>(DiagramExport);
const CommandModule = esDefault<ModuleDeclarationLike>(CommandExport);
const EditorActionsModule = esDefault<ModuleDeclarationLike>(EditorActionsExport);
const HandToolModule = esDefault<ModuleDeclarationLike>(HandToolExport);
const KeyboardModule = esDefault<ModuleDeclarationLike>(KeyboardExport);
const LassoToolModule = esDefault<ModuleDeclarationLike>(LassoToolExport);
const PaletteModule = esDefault<ModuleDeclarationLike>(PaletteExport);
const ZoomScrollModule = esDefault<ModuleDeclarationLike>(ZoomScrollExport);

interface TestEntry {
  group?: string;
  title?: string;
  shortcut?: string;
  ariaKeyShortcuts?: string;
  separator?: boolean;
  action?: { click?: (event: Event) => void; dragstart?: (event: Event) => void };
}

interface EventBusService {
  fire(type: string, data?: object): unknown;
  on(type: string, priority: number, listener: (event: never) => unknown): void;
}

interface PaletteService {
  registerProvider(provider: { getPaletteEntries(): Record<string, TestEntry> }): void;
}

const clicks: string[] = [];

function action(name: string): NonNullable<TestEntry["action"]> {
  return {
    click: () => clicks.push(`click:${name}`),
    dragstart: () => clicks.push(`dragstart:${name}`),
  };
}

const ENTRIES: Record<string, TestEntry> = {
  "lasso-tool": { group: "tools", title: "Lasso", shortcut: "L", action: action("lasso") },
  "hand-tool": { group: "tools", title: "Hand", shortcut: "H", action: action("hand") },
  "create.box": { group: "shapes", title: "Box", action: action("box") },
  "create.circle": { group: "shapes", title: "Circle", shortcut: "C", action: action("circle") },
  "create.untitled": { action: action("untitled") },
};

function providerModule(entries: Record<string, TestEntry>): ModuleDeclarationLike {
  class TestPaletteProvider {
    static $inject = ["palette"];
    constructor(palette: PaletteService) {
      palette.registerProvider(this);
    }
    getPaletteEntries(): Record<string, TestEntry> {
      return entries;
    }
  }
  return { __init__: ["testPaletteProvider"], testPaletteProvider: ["type", TestPaletteProvider] };
}

const diagrams: Diagram[] = [];

function createDiagram(
  modules: ModuleDeclarationLike[] = [PaletteModule, providerModule(ENTRIES), shellModule],
): Diagram {
  const container = document.createElement("div");
  document.body.append(container);
  const diagram = new Diagram({ canvas: { container }, modules });
  diagrams.push(diagram);
  return diagram;
}

function paletteOf(diagram: Diagram): HTMLElement {
  const palette = diagram
    .get<{ getContainer(): HTMLElement }>("canvas")
    .getContainer()
    .querySelector(".djs-palette");
  if (!(palette instanceof HTMLElement)) throw new Error("no palette");
  return palette;
}

function entry(diagram: Diagram, actionName: string): HTMLElement {
  const element = paletteOf(diagram).querySelector(`[data-action="${actionName}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`no entry ${actionName}`);
  return element;
}

function entries(diagram: Diagram): HTMLElement[] {
  return Array.from(
    paletteOf(diagram).querySelectorAll<HTMLElement>(".djs-palette-entries .entry"),
  );
}

function eventBus(diagram: Diagram): EventBusService {
  return diagram.get<EventBusService>("eventBus");
}

function rebuild(diagram: Diagram): void {
  eventBus(diagram).fire("i18n.changed");
}

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

const READ_ONLY = { locked: true, shown: true } as const;
const EDITABLE = { locked: false, shown: false } as const;

interface FakeShell {
  handle: ShellHandle;
  registrations: PaletteRegistration[];
  unregister: ReturnType<typeof vi.fn>;
  setZoomTarget: ReturnType<typeof vi.fn>;
  setEmptyHint: ReturnType<typeof vi.fn>;
}

function fakeShell(tools = "Werkzeuge", host: ShellHandle["host"] = "ide"): FakeShell {
  const registrations: PaletteRegistration[] = [];
  const unregister = vi.fn();
  const setZoomTarget = vi.fn();
  const setEmptyHint = vi.fn();
  const insets: Insets = { top: 88, right: 24, bottom: 64, left: 24 };
  const handle = {
    host,
    messages: { ...defaultMessages, tools, canvas: "Event Storming board" },
    fitInsets: () => insets,
    setZoomTarget,
    setEmptyHint,
    registerPalette(registration: PaletteRegistration) {
      registrations.push(registration);
      registration.setReadOnly(EDITABLE);
      return unregister;
    },
  } as unknown as ShellHandle;
  return { handle, registrations, unregister, setZoomTarget, setEmptyHint };
}

function connect(diagram: Diagram, shell: FakeShell = fakeShell()) {
  return connectDiagramJs(shell.handle, diagram, { contentBounds: () => undefined });
}

function svgOf(diagram: Diagram): SVGElement {
  return diagram
    .get<{ getContainer(): HTMLElement }>("canvas")
    .getContainer()
    .querySelector("svg") as SVGElement;
}

afterEach(() => {
  for (const diagram of diagrams.splice(0)) diagram.destroy();
  clicks.length = 0;
  document.body.replaceChildren();
});

describe("palette skin", () => {
  it("marks the palette as chrome and moves it in front of the canvas <svg>", () => {
    const diagram = createDiagram();
    const container = diagram.get<{ getContainer(): HTMLElement }>("canvas").getContainer();
    const palette = paletteOf(diagram);
    expect(palette.getAttribute("data-chrome")).toBe("palette");
    const children = Array.from(container.children);
    const svg = children.find((child) => child.localName === "svg");
    expect(svg).toBeDefined();
    expect(children.indexOf(palette)).toBeLessThan(children.indexOf(svg as Element));
    expect(palette.nextElementSibling).toBe(svg);
  });

  it("gives the entries toolbar semantics, a roving tab stop and the default label", () => {
    const diagram = createDiagram();
    const toolbar = paletteOf(diagram).querySelector(".djs-palette-entries");
    expect(toolbar?.getAttribute("role")).toBe("toolbar");
    expect(toolbar?.getAttribute("aria-label")).toBe("Tools");
    expect(entries(diagram).map((element) => element.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    expect(entries(diagram).every((element) => element.getAttribute("role") === "button")).toBe(
      true,
    );
    expect(entry(diagram, "lasso-tool").getAttribute("aria-pressed")).toBe("false");
    expect(entry(diagram, "create.box").hasAttribute("aria-pressed")).toBe(false);
  });

  it("re-applies role, label, tab stop and aria-pressed from the last tool-manager.update after a rebuild", () => {
    const diagram = createDiagram();
    connect(diagram, fakeShell("Werkzeuge"));
    eventBus(diagram).fire("tool-manager.update", { tool: "hand" });
    expect(entry(diagram, "hand-tool").getAttribute("aria-pressed")).toBe("true");
    entry(diagram, "create.box").focus();
    const before = entry(diagram, "hand-tool");

    rebuild(diagram);

    const hand = entry(diagram, "hand-tool");
    expect(hand).not.toBe(before);
    expect(hand.getAttribute("aria-pressed")).toBe("true");
    expect(entry(diagram, "lasso-tool").getAttribute("aria-pressed")).toBe("false");
    expect(
      paletteOf(diagram).querySelector(".djs-palette-entries")?.getAttribute("aria-label"),
    ).toBe("Werkzeuge");
    expect(entries(diagram).filter((element) => element.tabIndex === 0)).toEqual([
      entry(diagram, "create.box"),
    ]);
    expect(document.activeElement).toBe(entry(diagram, "create.box"));

    // diagram-js's own highlight still points at the detached tools group; the shell does not.
    eventBus(diagram).fire("tool-manager.update", { tool: "lasso" });
    expect(entry(diagram, "lasso-tool").getAttribute("aria-pressed")).toBe("true");
    expect(entry(diagram, "hand-tool").getAttribute("aria-pressed")).toBe("false");
    eventBus(diagram).fire("tool-manager.update", { tool: null });
    expect(
      entries(diagram).filter((element) => element.getAttribute("aria-pressed") === "true"),
    ).toEqual([]);
  });

  it("keeps the focus in the palette across a rebuild whose removal reports a focusout first, as Chromium's does (#461)", () => {
    const diagram = createDiagram();
    const box = entry(diagram, "create.box");
    box.focus();
    eventBus(diagram).on("i18n.changed", 1500, () => {
      box.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    rebuild(diagram);

    expect(entry(diagram, "create.box")).not.toBe(box);
    expect(document.activeElement).toBe(entry(diagram, "create.box"));
  });

  it("hands the focus to the tab stop when the rebuild no longer offers the focused entry", () => {
    const offered: Record<string, TestEntry> = { ...ENTRIES };
    const diagram = createDiagram([PaletteModule, providerModule(offered), shellModule]);
    const circle = entry(diagram, "create.circle");
    circle.focus();
    eventBus(diagram).on("i18n.changed", 1500, () => {
      circle.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    Reflect.deleteProperty(offered, "create.circle");

    rebuild(diagram);

    expect(paletteOf(diagram).querySelector('[data-action="create.circle"]')).toBeNull();
    expect(document.activeElement).toBe(entry(diagram, "lasso-tool"));
    expect(entries(diagram).filter((element) => element.tabIndex === 0)).toEqual([
      entry(diagram, "lasso-tool"),
    ]);
  });

  it("leaves a focus that left the palette where it went when the palette rebuilds later", async () => {
    const diagram = createDiagram();
    const box = entry(diagram, "create.box");
    box.focus();
    box.blur();
    await Promise.resolve();

    rebuild(diagram);

    expect(document.activeElement).toBe(document.body);
    expect(entries(diagram).filter((element) => element.tabIndex === 0)).toEqual([
      entry(diagram, "create.box"),
    ]);
  });

  it("moves the tab stop with ← → Home End and wraps", () => {
    const diagram = createDiagram();
    const all = entries(diagram);
    all[0]?.focus();
    const right = press(all[0] as HTMLElement, "ArrowRight");
    expect(right.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(all[1]);
    expect(all.map((element) => element.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
    press(all[1] as HTMLElement, "End");
    expect(document.activeElement).toBe(all[4]);
    press(all[4] as HTMLElement, "ArrowRight");
    expect(document.activeElement).toBe(all[0]);
    press(all[0] as HTMLElement, "ArrowLeft");
    expect(document.activeElement).toBe(all[4]);
    press(all[4] as HTMLElement, "Home");
    expect(document.activeElement).toBe(all[0]);
    expect(all.map((element) => element.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it("leaves modified keys and other keys alone", () => {
    const diagram = createDiagram();
    const first = entries(diagram)[0] as HTMLElement;
    first.focus();
    expect(press(first, "ArrowRight", { metaKey: true }).defaultPrevented).toBe(false);
    expect(press(first, "ArrowRight", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(press(first, "a").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);
  });

  it("triggers the focused entry with Enter and Space, once per press", () => {
    const diagram = createDiagram();
    const box = entry(diagram, "create.box");
    box.focus();
    expect(press(box, "Enter").defaultPrevented).toBe(true);
    expect(press(box, " ").defaultPrevented).toBe(true);
    press(box, "Enter", { repeat: true });
    expect(clicks).toEqual(["click:box", "click:box"]);
  });

  it.each([
    {
      how: "made it inert",
      hide: (container: HTMLElement) => container.setAttribute("inert", ""),
      show: (container: HTMLElement) => container.removeAttribute("inert"),
    },
    {
      how: "hid it with display: none",
      hide: (container: HTMLElement) => (container.style.display = "none"),
      show: (container: HTMLElement) => container.style.removeProperty("display"),
    },
    {
      how: "hid it with visibility: hidden",
      hide: (container: HTMLElement) => container.style.setProperty("visibility", "hidden"),
      show: (container: HTMLElement) => container.style.removeProperty("visibility"),
    },
  ])(
    "leaves the keys of an entry to the page once the host $how, before the focus moves off it",
    ({ hide, show }) => {
      const diagram = createDiagram();
      const box = entry(diagram, "create.box");
      box.focus();
      const container = diagram.get<{ getContainer(): HTMLElement }>("canvas").getContainer();
      hide(container);
      for (const key of ["Enter", " ", "ArrowRight", "ArrowLeft", "Home", "End"]) {
        expect(press(box, key).defaultPrevented, key).toBe(false);
      }
      expect(clicks).toEqual([]);
      expect(entries(diagram).filter((element) => element.tabIndex === 0)).toEqual([box]);

      show(container);
      expect(press(box, "Enter").defaultPrevented).toBe(true);
      expect(clicks).toEqual(["click:box"]);
    },
  );

  it("takes the keys of an entry the host made transparent with opacity: 0", () => {
    const diagram = createDiagram();
    const box = entry(diagram, "create.box");
    box.focus();
    diagram
      .get<{ getContainer(): HTMLElement }>("canvas")
      .getContainer()
      .style.setProperty("opacity", "0");
    expect(press(box, "Enter").defaultPrevented).toBe(true);
    expect(clicks).toEqual(["click:box"]);
  });

  it("activates with a synthetic click: detail 0, at the centre of the entry (guide §5.5)", () => {
    const received: MouseEvent[] = [];
    const diagram = createDiagram([
      PaletteModule,
      providerModule({
        "create.box": {
          group: "shapes",
          title: "Box",
          action: { click: (event) => received.push(event as MouseEvent) },
        },
      }),
      shellModule,
    ]);
    const box = entry(diagram, "create.box");
    vi.spyOn(box, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 600, y: 12, width: 32, height: 32 }),
    );
    box.focus();
    press(box, "Enter");
    box.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    expect(received.map((event) => [event.detail, event.clientX, event.clientY])).toEqual([
      [0, 616, 28],
      [1, 0, 0],
    ]);
  });

  it("keeps a stopped key from reaching document listeners", () => {
    const diagram = createDiagram();
    const listener = vi.fn();
    document.addEventListener("keydown", listener);
    entry(diagram, "lasso-tool").focus();
    press(entry(diagram, "lasso-tool"), "ArrowRight");
    press(entry(diagram, "hand-tool"), "Escape");
    document.removeEventListener("keydown", listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as KeyboardEvent).key).toBe("Escape");
  });

  it("names each entry's shortcut in aria-keyshortcuts (guide §5.6)", () => {
    const diagram = createDiagram([
      PaletteModule,
      providerModule({
        ...ENTRIES,
        "create.note": { group: "shapes", title: "Note", shortcut: "⇧N", action: action("note") },
        "create.hotspot": {
          group: "shapes",
          title: "Hotspot",
          shortcut: "H then S",
          ariaKeyShortcuts: "H",
          action: action("hotspot"),
        },
      }),
      shellModule,
    ]);
    expect(entry(diagram, "lasso-tool").getAttribute("aria-keyshortcuts")).toBe("L");
    expect(entry(diagram, "create.circle").getAttribute("aria-keyshortcuts")).toBe("C");
    expect(entry(diagram, "create.note").getAttribute("aria-keyshortcuts")).toBe("Shift+N");
    expect(entry(diagram, "create.hotspot").getAttribute("aria-keyshortcuts")).toBe("H");
    expect(entry(diagram, "create.box").hasAttribute("aria-keyshortcuts")).toBe(false);
    rebuild(diagram);
    expect(entry(diagram, "lasso-tool").getAttribute("aria-keyshortcuts")).toBe("L");
  });

  it("provides tooltip contents from palette.getEntries()", () => {
    const diagram = createDiagram();
    const shell = fakeShell();
    connect(diagram, shell);
    const registration = shell.registrations[0];
    expect(registration?.element).toBe(paletteOf(diagram));
    expect(registration?.entryTooltip(entry(diagram, "lasso-tool"))).toEqual({
      label: "Lasso",
      shortcut: "L",
    });
    expect(registration?.entryTooltip(entry(diagram, "create.box"))).toEqual({ label: "Box" });
    expect(registration?.entryTooltip(entry(diagram, "create.untitled"))).toBeNull();
  });
});

describe("armed tools (#458)", () => {
  interface ToolManagerService {
    isActive(tool: string): boolean;
  }

  interface ToolOptions {
    autoActivate?: boolean;
    reactivate?: boolean;
  }

  function toolsDiagram({ autoActivate = false, reactivate = false }: ToolOptions = {}): Diagram {
    class ToolPaletteProvider {
      static $inject = ["palette", "lassoTool", "handTool"];
      constructor(
        palette: PaletteService,
        private readonly lassoTool: {
          activateSelection(event: Event, autoActivate?: boolean): void;
        },
        private readonly handTool: {
          activateHand(event: Event, autoActivate?: boolean, reactivate?: boolean): void;
        },
      ) {
        palette.registerProvider(this);
      }
      getPaletteEntries(): Record<string, TestEntry> {
        return {
          "lasso-tool": {
            group: "tools",
            title: "Lasso",
            action: { click: (event) => this.lassoTool.activateSelection(event, autoActivate) },
          },
          "hand-tool": {
            group: "tools",
            title: "Hand",
            action: {
              click: (event) => this.handTool.activateHand(event, autoActivate, reactivate),
            },
          },
          "create.box": { group: "shapes", title: "Box", action: action("box") },
        };
      }
    }
    const diagram = createDiagram([
      PaletteModule,
      LassoToolModule,
      HandToolModule,
      {
        __init__: ["toolPaletteProvider"],
        toolPaletteProvider: ["type", ToolPaletteProvider],
      },
      shellModule,
    ]);
    // A drag maps the pointer through `canvas.viewbox()`, which reads an SVG transform list that
    // happy-dom does not implement.
    vi.spyOn(diagram.get<{ viewbox(): unknown }>("canvas"), "viewbox").mockReturnValue({
      x: 0,
      y: 0,
      scale: 1,
    });
    return diagram;
  }

  function updates(diagram: Diagram): Array<string | null> {
    const tools: Array<string | null> = [];
    eventBus(diagram).on("tool-manager.update", 500, (event: { tool: string | null }) => {
      tools.push(event.tool);
    });
    return tools;
  }

  function arm(diagram: Diagram, actionName: string): HTMLElement {
    const element = entry(diagram, actionName);
    element.focus();
    press(element, "Enter");
    return element;
  }

  function escape(): void {
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
  }

  function mouse(type: string, target: EventTarget, at = { x: 0, y: 0 }): void {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }),
    );
  }

  it.each([
    { tool: "lasso", autoActivate: false },
    { tool: "lasso", autoActivate: true },
    { tool: "hand", autoActivate: false },
    { tool: "hand", autoActivate: true },
  ])(
    "puts down the $tool the palette armed (autoActivate $autoActivate) when Escape cancels it before the pointer moves",
    async ({ tool, autoActivate }) => {
      const diagram = toolsDiagram({ autoActivate });
      const toolManager = diagram.get<ToolManagerService>("toolManager");
      const element = arm(diagram, `${tool}-tool`);
      expect(element.getAttribute("aria-pressed")).toBe("true");
      expect(toolManager.isActive(tool)).toBe(true);

      escape();
      await Promise.resolve();

      expect(diagram.get<{ context(): unknown }>("dragging").context()).toBeNull();
      expect(toolManager.isActive(tool)).toBe(false);
      expect(element.getAttribute("aria-pressed")).toBe("false");
      expect(element.classList.contains("highlighted-entry")).toBe(false);
    },
  );

  it("switches to the next tool by keys without putting the first down in between", async () => {
    const diagram = toolsDiagram();
    const tools = updates(diagram);
    arm(diagram, "lasso-tool");
    arm(diagram, "hand-tool");
    await Promise.resolve();

    expect(tools).toEqual(["lasso", "hand"]);
    expect(entry(diagram, "hand-tool").getAttribute("aria-pressed")).toBe("true");
    expect(entry(diagram, "lasso-tool").getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the armed tool pressed from the press on the next tool's entry until its click", async () => {
    const diagram = toolsDiagram();
    const tools = updates(diagram);
    const lasso = entry(diagram, "lasso-tool");
    const hand = entry(diagram, "hand-tool");
    lasso.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    mouse("mousemove", hand, { x: 40, y: 0 });

    mouse("mousedown", hand, { x: 40, y: 0 });
    await Promise.resolve();
    expect(lasso.getAttribute("aria-pressed")).toBe("true");

    mouse("mouseup", hand, { x: 40, y: 0 });
    hand.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    await Promise.resolve();
    expect(tools).toEqual(["lasso", "hand"]);
    expect(hand.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps a tool pressed that arms itself again, and puts it down on Escape after that", async () => {
    const diagram = toolsDiagram({ reactivate: true });
    const toolManager = diagram.get<ToolManagerService>("toolManager");
    const hand = arm(diagram, "hand-tool");
    press(hand, "Enter");
    await Promise.resolve();
    expect(toolManager.isActive("hand")).toBe(true);
    expect(hand.getAttribute("aria-pressed")).toBe("true");

    escape();
    await Promise.resolve();
    expect(toolManager.isActive("hand")).toBe(false);
    expect(hand.getAttribute("aria-pressed")).toBe("false");
  });

  it("leaves the tool manager alone once the diagram is destroyed", async () => {
    const diagram = toolsDiagram();
    const toolManager = diagram.get<ToolManagerService & { setActive(tool: null): void }>(
      "toolManager",
    );
    arm(diagram, "lasso-tool");
    const setActive = vi.spyOn(toolManager, "setActive");
    escape();
    diagram.destroy();
    diagrams.splice(diagrams.indexOf(diagram), 1);
    await Promise.resolve();

    expect(setActive).not.toHaveBeenCalled();
  });
});

describe("read-only", () => {
  it("keeps Lasso and Hand active, marks every other entry aria-disabled and vetoes it on palette.trigger", () => {
    const diagram = createDiagram([
      PaletteModule,
      providerModule({
        ...ENTRIES,
        "draw-tool": { group: "tools", title: "Draw", action: action("draw") },
      }),
      shellModule,
    ]);
    const shell = fakeShell();
    connect(diagram, shell);
    shell.registrations[0]?.setReadOnly(READ_ONLY);

    expect(entry(diagram, "create.box").getAttribute("aria-disabled")).toBe("true");
    expect(entry(diagram, "create.untitled").getAttribute("aria-disabled")).toBe("true");
    expect(entry(diagram, "draw-tool").getAttribute("aria-disabled")).toBe("true");
    expect(entry(diagram, "lasso-tool").hasAttribute("aria-disabled")).toBe(false);
    expect(entry(diagram, "hand-tool").hasAttribute("aria-disabled")).toBe(false);

    entry(diagram, "create.box").click();
    entry(diagram, "draw-tool").click();
    entry(diagram, "hand-tool").click();
    const drag = new Event("dragstart", { bubbles: true, cancelable: true });
    entry(diagram, "create.circle").dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(true);
    entry(diagram, "create.circle").focus();
    press(entry(diagram, "create.circle"), "Enter");
    expect(clicks).toEqual(["click:hand"]);

    rebuild(diagram);
    expect(entry(diagram, "create.box").getAttribute("aria-disabled")).toBe("true");

    shell.registrations[0]?.setReadOnly(EDITABLE);
    expect(entries(diagram).some((element) => element.hasAttribute("aria-disabled"))).toBe(false);
    entry(diagram, "create.box").click();
    expect(clicks).toEqual(["click:hand", "click:box"]);
  });

  it("vetoes at once while the marks still wait for the shell's delay", () => {
    const diagram = createDiagram();
    const shell = fakeShell();
    connect(diagram, shell);
    shell.registrations[0]?.setReadOnly({ locked: true, shown: false });
    expect(entries(diagram).some((element) => element.hasAttribute("aria-disabled"))).toBe(false);
    entry(diagram, "create.box").click();
    entry(diagram, "hand-tool").click();
    expect(clicks).toEqual(["click:hand"]);

    shell.registrations[0]?.setReadOnly(READ_ONLY);
    expect(entry(diagram, "create.box").getAttribute("aria-disabled")).toBe("true");
    shell.registrations[0]?.setReadOnly({ locked: false, shown: true });
    expect(entries(diagram).some((element) => element.hasAttribute("aria-disabled"))).toBe(false);
  });

  it("vetoes by group when palette.trigger comes without an entry element", () => {
    const diagram = createDiagram();
    const shell = fakeShell();
    connect(diagram, shell);
    const bus = eventBus(diagram);
    const trigger = (group: string) =>
      bus.fire("palette.trigger", { entry: { group }, event: new Event("click") });
    expect(trigger("shapes")).toBeUndefined();
    shell.registrations[0]?.setReadOnly(READ_ONLY);
    expect(trigger("shapes")).toBe(false);
    expect(trigger("tools")).toBeUndefined();
  });

  it("leaves an entry's own aria-disabled alone", () => {
    const diagram = createDiagram([
      PaletteModule,
      providerModule({
        ...ENTRIES,
        "create.locked": { group: "shapes", title: "Locked", action: action("locked") },
      }),
      shellModule,
    ]);
    entry(diagram, "create.locked").setAttribute("aria-disabled", "true");
    const shell = fakeShell();
    connect(diagram, shell);
    shell.registrations[0]?.setReadOnly(READ_ONLY);
    shell.registrations[0]?.setReadOnly(EDITABLE);
    expect(entry(diagram, "create.locked").getAttribute("aria-disabled")).toBe("true");
    expect(entry(diagram, "create.box").hasAttribute("aria-disabled")).toBe(false);
  });
});

describe("keyboard", () => {
  it("registers at priority 2000 and returns true only for chrome keys", () => {
    const addListener = vi.fn();
    createDiagram([{ keyboard: ["value", { addListener }] }, shellModule]);
    expect(addListener).toHaveBeenCalledTimes(1);
    const [priority, listener] = addListener.mock.calls[0] as [
      number,
      (context: { keyEvent: object }) => unknown,
    ];
    expect(priority).toBe(2000);
    const key = (init: Partial<KeyboardEvent>) => ({
      keyEvent: {
        key: "",
        code: "",
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        ...init,
      },
    });
    expect(listener(key({ key: "+", ctrlKey: true }))).toBe(true);
    expect(listener(key({ key: "=", metaKey: true }))).toBe(true);
    expect(listener(key({ key: "_", ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(listener(key({ key: "Insert", code: "Numpad0", metaKey: true }))).toBe(true);
    expect(listener(key({ key: "!", code: "Digit1", shiftKey: true }))).toBe(true);
    expect(listener(key({ key: "+" }))).toBeUndefined();
    expect(listener(key({ key: "a", ctrlKey: true }))).toBeUndefined();
    expect(listener(key({ key: "z", metaKey: true }))).toBeUndefined();
    expect(listener(key({ key: "=", ctrlKey: true, altKey: true }))).toBeUndefined();
  });

  it("keeps diagram-js's keyboard bindings from acting on chrome keys", () => {
    const withShell = createDiagram([
      ZoomScrollModule,
      KeyboardModule,
      EditorActionsModule,
      shellModule,
    ]);
    const withoutShell = createDiagram([ZoomScrollModule, KeyboardModule, EditorActionsModule]);
    const spies = [withShell, withoutShell].map((diagram) =>
      vi
        .spyOn(diagram.get<{ stepZoom(delta: number): void }>("zoomScroll"), "stepZoom")
        .mockImplementation(() => {}),
    );
    const svgOf = (diagram: Diagram) =>
      diagram
        .get<{ getContainer(): HTMLElement }>("canvas")
        .getContainer()
        .querySelector("svg") as SVGElement;

    const handled = new KeyboardEvent("keydown", {
      key: "+",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    svgOf(withShell).dispatchEvent(handled);
    svgOf(withoutShell).dispatchEvent(
      new KeyboardEvent("keydown", { key: "+", ctrlKey: true, bubbles: true }),
    );

    expect(spies[0]).not.toHaveBeenCalled();
    expect(handled.defaultPrevented).toBe(true);
    expect(spies[1]).toHaveBeenCalledWith(1);
  });

  it("leaves a chrome key in a text field inside the <svg> to the field: stopped, not prevented", () => {
    const diagram = createDiagram([KeyboardModule, shellModule]);
    const field = document.createElement("textarea");
    svgOf(diagram).append(field);
    const typed = new KeyboardEvent("keydown", {
      key: "!",
      code: "Digit1",
      shiftKey: true,
      bubbles: true,
    });
    Object.defineProperty(typed, "target", { value: field });
    expect(eventBus(diagram).fire("keyboard.keydown", { keyEvent: typed })).toBe(false);
    const native = new KeyboardEvent("keydown", {
      key: "!",
      code: "Digit1",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(native);
    expect(native.defaultPrevented).toBe(false);
  });

  it("leaves the chrome keys in an EditContext or Monaco editor inside the <svg> to the editor", () => {
    const diagram = createDiagram([KeyboardModule, shellModule]);
    // happy-dom has no EditContext: the property is set as Chromium sets it
    const editContextEditor = document.createElement("div");
    Object.defineProperty(editContextEditor, "editContext", { value: {} });
    const monaco = document.createElement("div");
    monaco.className = "monaco-editor";
    const insideMonaco = monaco.appendChild(document.createElement("div"));
    svgOf(diagram).append(editContextEditor, monaco);
    for (const editor of [editContextEditor, insideMonaco]) {
      for (const init of [
        { key: "!", code: "Digit1", shiftKey: true },
        { key: "=", code: "Equal", ctrlKey: true },
        { key: "-", code: "Minus", metaKey: true },
      ]) {
        const native = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
        editor.dispatchEvent(native);
        expect(native.defaultPrevented, `${init.code} in ${editor.outerHTML}`).toBe(false);
      }
    }
  });

  it("behind the web app's start screen leaves a chrome key to the browser: no zoom, not prevented", () => {
    const diagram = createDiagram([
      ZoomScrollModule,
      KeyboardModule,
      EditorActionsModule,
      shellModule,
    ]);
    const shell = fakeShell("Tools", "web");
    let startScreen = true;
    Object.assign(shell.handle, { isEmptyStateShown: () => startScreen });
    connect(diagram, shell);
    const stepZoom = vi
      .spyOn(diagram.get<{ stepZoom(delta: number): void }>("zoomScroll"), "stepZoom")
      .mockImplementation(() => {});
    const press = () => {
      const event = new KeyboardEvent("keydown", {
        key: "+",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      svgOf(diagram).dispatchEvent(event);
      return event;
    };
    expect(press().defaultPrevented).toBe(false);
    expect(stepZoom).not.toHaveBeenCalled();
    startScreen = false;
    expect(press().defaultPrevented).toBe(true);
    expect(stepZoom).not.toHaveBeenCalled();
  });

  it("in the IDE host leaves undo and redo to VS Code: no commandStack, not prevented (guide §13.5)", () => {
    const modules = [CommandModule, KeyboardModule, EditorActionsModule, shellModule];
    const undo = (diagram: Diagram) =>
      vi.spyOn(diagram.get<{ undo(): void; redo(): void }>("commandStack"), "undo");
    const presses = [
      { key: "z", ctrlKey: true },
      { key: "z", metaKey: true },
    ];

    const ide = createDiagram(modules);
    connect(ide, fakeShell("Tools", "ide"));
    const ideUndo = undo(ide);
    for (const init of presses) {
      const event = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
      svgOf(ide).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(ideUndo).not.toHaveBeenCalled();

    const web = createDiagram(modules);
    connect(web, fakeShell("Tools", "web"));
    const webUndo = undo(web);
    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    svgOf(web).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(webUndo).toHaveBeenCalledTimes(1);
  });

  it("is a no-op without a keyboard service (viewer)", () => {
    expect(() =>
      createDiagram([PaletteModule, providerModule(ENTRIES), shellModule]),
    ).not.toThrow();
  });
});

describe("module", () => {
  it("resolves paletteTooltip to null, even when an earlier module defines one", () => {
    class OwnPaletteTooltip {}
    const diagram = createDiagram([
      PaletteModule,
      { paletteTooltip: ["type", OwnPaletteTooltip] },
      providerModule(ENTRIES),
      shellModule,
    ]);
    expect(diagram.get("paletteTooltip")).toBeNull();
  });

  it("buffers the palette until connectDiagramJs hands it to the shell", () => {
    const diagram = createDiagram();
    expect(
      paletteOf(diagram).querySelector(".djs-palette-entries")?.getAttribute("aria-label"),
    ).toBe("Tools");
    const shell = fakeShell("Werkzeuge");
    connect(diagram, shell);
    expect(shell.registrations).toHaveLength(1);
    expect(shell.registrations[0]?.element).toBe(paletteOf(diagram));
    expect(
      paletteOf(diagram).querySelector(".djs-palette-entries")?.getAttribute("aria-label"),
    ).toBe("Werkzeuge");
  });

  it("registers a palette diagram-js creates after the connection", () => {
    const diagram = createDiagram([PaletteModule, shellModule]);
    const shell = fakeShell();
    connect(diagram, shell);
    expect(shell.registrations).toHaveLength(0);
    diagram.get<PaletteService>("palette").registerProvider({ getPaletteEntries: () => ENTRIES });
    expect(shell.registrations).toHaveLength(1);
    expect(paletteOf(diagram).getAttribute("data-chrome")).toBe("palette");
  });

  it("cleans up on diagram.destroy", () => {
    const diagram = createDiagram([
      KeyboardModule,
      PaletteModule,
      providerModule(ENTRIES),
      shellModule,
    ]);
    const shell = fakeShell();
    connect(diagram, shell);
    const bus = eventBus(diagram);
    diagram.destroy();
    diagrams.splice(diagrams.indexOf(diagram), 1);
    expect(shell.unregister).toHaveBeenCalledTimes(1);
    const chromeKey = new KeyboardEvent("keydown", { key: "+", ctrlKey: true });
    expect(bus.fire("keyboard.keydown", { keyEvent: chromeKey })).toBeUndefined();
    expect(
      bus.fire("palette.trigger", { entry: ENTRIES["create.box"], event: new Event("click") }),
    ).toBeUndefined();
  });
});

describe("connectDiagramJs", () => {
  it("names the canvas as an application while connected and restores it on destroy", () => {
    const diagram = createDiagram();
    const svg = svgOf(diagram);
    expect(svg.hasAttribute("role")).toBe(false);
    const connection = connect(diagram);
    expect(svg.getAttribute("role")).toBe("application");
    expect(svg.getAttribute("aria-label")).toBe("Event Storming board");
    connection.destroy();
    expect(svg.hasAttribute("role")).toBe(false);
    expect(svg.hasAttribute("aria-label")).toBe(false);

    svg.setAttribute("aria-label", "Board of the modeler");
    connect(diagram);
    expect(svg.getAttribute("aria-label")).toBe("Board of the modeler");
  });

  it("keeps the empty-file hint in sync with the diagram after imports and canvas changes", () => {
    const diagram = createDiagram();
    const shell = fakeShell();
    let empty = true;
    connectDiagramJs(shell.handle, diagram, {
      contentBounds: () => undefined,
      isEmpty: () => empty,
    });
    expect(shell.setEmptyHint).not.toHaveBeenCalled();
    eventBus(diagram).fire("import.done", {});
    expect(shell.setEmptyHint).toHaveBeenLastCalledWith(true);
    empty = false;
    eventBus(diagram).fire("elements.changed", { elements: [] });
    expect(shell.setEmptyHint).toHaveBeenLastCalledWith(false);
  });

  it("derives emptiness from the content bounds by default", () => {
    const diagram = createDiagram();
    const shell = fakeShell();
    let bounds: { x: number; y: number; width: number; height: number } | undefined;
    connectDiagramJs(shell.handle, diagram, { contentBounds: () => bounds });
    eventBus(diagram).fire("import.done", {});
    expect(shell.setEmptyHint).toHaveBeenLastCalledWith(true);
    bounds = { x: 0, y: 0, width: 120, height: 80 };
    eventBus(diagram).fire("elements.changed", { elements: [] });
    expect(shell.setEmptyHint).toHaveBeenLastCalledWith(false);
  });

  it("fits to the contentBounds() of the contract instance in options.modeler by default (@miragon/modeler-api 1.3)", () => {
    const diagram = createDiagram();
    const shell = fakeShell();
    const canvas = diagram.get<{ getSize(): Size; viewbox(box?: Bounds): unknown }>("canvas");
    const size = { width: 800, height: 600 };
    vi.spyOn(canvas, "getSize").mockReturnValue(size);
    // happy-dom has no SVG transform list, which the viewbox getter reads.
    const viewbox = vi
      .spyOn(canvas, "viewbox")
      .mockImplementation((box?: Bounds) => (box ? undefined : { x: 0, y: 0, scale: 1 }));
    // a class, so the method only works when the shell calls it on the instance
    class ContractInstance {
      box: Bounds | undefined;
      contentBounds(): Bounds | undefined {
        return this.box;
      }
    }
    const modeler = new ContractInstance();
    const connection = connectDiagramJs(shell.handle, diagram, { modeler });
    eventBus(diagram).fire("import.done", {});
    expect(shell.setEmptyHint).toHaveBeenLastCalledWith(true);

    modeler.box = { x: 100, y: 50, width: 400, height: 300 };
    eventBus(diagram).fire("elements.changed", { elements: [] });
    expect(shell.setEmptyHint).toHaveBeenLastCalledWith(false);
    viewbox.mockClear();
    connection.viewport.fit({ animate: false });
    const fitted = fitViewbox(modeler.box, size, shell.handle.fitInsets());
    expect(fitted).toBeDefined();
    expect(viewbox).toHaveBeenLastCalledWith({
      x: fitted?.x,
      y: fitted?.y,
      width: fitted?.width,
      height: fitted?.height,
    });
  });

  it("takes an explicit contentBounds over the contract instance's", () => {
    const diagram = createDiagram();
    const shell = fakeShell();
    const modeler = { contentBounds: vi.fn(() => ({ x: 0, y: 0, width: 120, height: 80 })) };
    const connection = connectDiagramJs(shell.handle, diagram, {
      modeler,
      contentBounds: () => undefined,
    });
    eventBus(diagram).fire("import.done", {});
    expect(shell.setEmptyHint).toHaveBeenLastCalledWith(true);
    expect(connection.viewport.canFit()).toBe(false);
    expect(modeler.contentBounds).not.toHaveBeenCalled();
  });

  it("takes a contract instance from before 1.3 next to the host's own contentBounds, and fits to those", () => {
    // what a renderer on contract 1.2 returns: no contentBounds, no member a 1.3 one would add
    class ContractInstanceBefore13 {
      importText(_text: string): Promise<{ warnings: string[] }> {
        return Promise.resolve({ warnings: [] });
      }
      exportText(): string {
        return "";
      }
      destroy(): void {}
    }
    expectTypeOf<ContractInstanceBefore13>().toExtend<CollaborativeModelerLike>();
    const diagram = createDiagram();
    const shell = fakeShell();
    const hostBounds = vi.fn(() => ({ x: 0, y: 0, width: 120, height: 80 }));
    const modeler = new ContractInstanceBefore13();
    const connection = connectDiagramJs(shell.handle, diagram, {
      modeler,
      contentBounds: hostBounds,
    });
    eventBus(diagram).fire("import.done", {});
    expect(hostBounds).toHaveBeenCalled();
    expect(shell.setEmptyHint).toHaveBeenLastCalledWith(false);
    expect(connection.viewport.canFit()).toBe(true);
    expect(() => connectDiagramJs(fakeShell().handle, createDiagram(), { modeler })).toThrow(
      /needs the content bounds/,
    );
  });

  it("throws, binding nothing, without contentBounds and without a contract instance that reports them", () => {
    const diagram = createDiagram();
    const shell = fakeShell();
    const message =
      /needs the content bounds: pass options\.contentBounds, or options\.modeler with contentBounds\(\) \(@miragon\/modeler-api 1\.3\)/;
    expect(() => connectDiagramJs(shell.handle, diagram, {})).toThrow(message);
    expect(() => connectDiagramJs(shell.handle, diagram, { modeler: {} })).toThrow(message);
    expect(shell.setZoomTarget).not.toHaveBeenCalled();
    expect(shell.registrations).toHaveLength(0);
  });

  it("unbinds itself on diagram.destroy", () => {
    const diagram = createDiagram();
    const shell = fakeShell();
    const connection = connect(diagram, shell);
    diagram.destroy();
    diagrams.splice(diagrams.indexOf(diagram), 1);
    expect(shell.setZoomTarget).toHaveBeenLastCalledWith(null);
    expect(() => connection.viewport.zoom()).not.toThrow();
    connection.destroy();
    expect(shell.setZoomTarget).toHaveBeenCalledTimes(2);
  });

  it("throws without shellModule", () => {
    const diagram = createDiagram([PaletteModule, providerModule(ENTRIES)]);
    expect(() => connect(diagram)).toThrow(/shellModule/);
  });

  it("binds the viewport as zoom target, calls canvas.resized and unbinds on destroy", () => {
    const diagram = createDiagram();
    const resized = vi.fn();
    eventBus(diagram).on("canvas.resized", 1500, resized);
    const shell = fakeShell();
    const connection = connect(diagram, shell);
    expect(shell.setZoomTarget).toHaveBeenCalledWith(connection.viewport);
    expect(resized).toHaveBeenCalledTimes(1);

    shell.registrations[0]?.setReadOnly(READ_ONLY);
    connection.destroy();
    connection.destroy();
    expect(shell.unregister).toHaveBeenCalledTimes(1);
    expect(shell.setZoomTarget).toHaveBeenLastCalledWith(null);
    expect(
      paletteOf(diagram).querySelector(".djs-palette-entries")?.getAttribute("aria-label"),
    ).toBe("Tools");
    expect(entry(diagram, "create.box").hasAttribute("aria-disabled")).toBe(false);
  });

  it("hands the palette to the newest shell only", () => {
    const diagram = createDiagram();
    const first = fakeShell("Eins");
    const second = fakeShell("Zwei");
    const firstConnection = connect(diagram, first);
    connect(diagram, second);
    expect(first.unregister).toHaveBeenCalledTimes(1);
    expect(second.registrations).toHaveLength(1);
    firstConnection.destroy();
    expect(second.unregister).not.toHaveBeenCalled();
    expect(
      paletteOf(diagram).querySelector(".djs-palette-entries")?.getAttribute("aria-label"),
    ).toBe("Zwei");
  });
});

describe("focus after a pointer click (guide §5.8), with a mounted shell", () => {
  const shells: ShellHandle[] = [];
  afterEach(() => {
    for (const shell of shells.splice(0)) shell.destroy();
  });

  function mounted() {
    const diagram = createDiagram([
      ZoomScrollModule,
      PaletteModule,
      providerModule(ENTRIES),
      shellModule,
    ]);
    const canvas = diagram.get<{ getContainer(): HTMLElement; zoom(): number }>("canvas");
    // happy-dom has no SVG transform list, which the zoom getter reads.
    vi.spyOn(canvas, "zoom").mockReturnValue(1);
    const container = canvas.getContainer().parentElement!;
    const root = document.createElement("div");
    document.body.append(root);
    const shell = mountShell(root, { host: "ide", platform: "mac", lang: "en", canvas: container });
    shells.push(shell);
    const connection = connectDiagramJs(shell, diagram, { contentBounds: () => undefined });
    vi.spyOn(
      diagram.get<{ stepZoom(delta: number): void }>("zoomScroll"),
      "stepZoom",
    ).mockImplementation(() => {});
    const zoomIn = root.querySelector<HTMLButtonElement>('[data-zoom="in"]')!;
    return { diagram, shell, connection, svg: svgOf(diagram), zoomIn };
  }
  const click = (target: HTMLElement, detail: number) =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));

  it("puts it on the canvas <svg> through canvas.focus() after a click on zoom in or a palette entry", () => {
    const { diagram, svg, zoomIn } = mounted();
    const focus = vi.spyOn(diagram.get<{ focus(): void }>("canvas"), "focus");
    zoomIn.focus();
    click(zoomIn, 1);
    expect(document.activeElement).toBe(svg);

    entry(diagram, "hand-tool").focus();
    click(entry(diagram, "hand-tool"), 1);
    expect(clicks).toEqual(["click:hand"]);
    expect(document.activeElement).toBe(svg);
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it("leaves it on the control after Enter, and on a vetoed entry's click hands it over all the same", () => {
    const { diagram, shell, svg, zoomIn } = mounted();
    zoomIn.focus();
    click(zoomIn, 0);
    expect(document.activeElement).toBe(zoomIn);
    const lasso = entry(diagram, "lasso-tool");
    lasso.focus();
    press(lasso, "Enter");
    expect(clicks).toEqual(["click:lasso"]);
    expect(document.activeElement).toBe(lasso);

    shell.setReadOnly(true);
    entry(diagram, "create.box").focus();
    click(entry(diagram, "create.box"), 1);
    expect(clicks).toEqual(["click:lasso"]);
    expect(document.activeElement).toBe(svg);
  });

  it("stops once the connection is gone: the shell keeps no zoom target to focus", () => {
    const { connection, zoomIn } = mounted();
    connection.destroy();
    zoomIn.focus();
    click(zoomIn, 1);
    expect(document.activeElement).toBe(zoomIn);
  });
});
