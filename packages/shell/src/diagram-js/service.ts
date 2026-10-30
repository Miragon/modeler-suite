import { defaultMessages, isTextField, isUndoRedoKey, matchChromeKey } from "../core/index.js";
import type { ShellHandle } from "../dom/index.js";
import { PaletteSkin, type PaletteEntryLike } from "./palette-skin.js";
import type {
  CanvasLike,
  DiagramEventListener,
  EventBusLike,
  InjectorLike,
  KeyboardLike,
  PaletteLike,
} from "./types.js";

/** The didi name of the service `shellModule` registers. */
export const SHELL_SERVICE = "modelerShell";

/** Above `KeyboardBindings` and the modelers' keyboard modules (default priority 1000). */
export const KEYBOARD_PRIORITY = 2000;

/** Ahead of every default-priority `palette.trigger` listener, so the read-only veto comes first. */
const TRIGGER_PRIORITY = 2000;

/** A palette without a shell is editable. */
const EDITABLE = { locked: false, shown: false } as const;

/** What the shell sets on the canvas `<svg>` while a shell is attached, restored on detach. */
const CANVAS_ATTRIBUTES = ["role", "aria-label"] as const;

/** didi's injector, which resolves a missing service to `null` with `strict: false`. */
interface DidiInjectorLike {
  get(name: string, strict?: boolean): unknown;
}

interface KeyboardEventContext {
  keyEvent?: KeyboardEvent;
}

interface PaletteTriggerEvent {
  entry?: PaletteEntryLike;
  event?: Event;
}

/** diagram-js's `dragging`, as far as the shell reads it. */
interface DraggingLike {
  context(): { prefix?: string } | null;
}

/** diagram-js's `toolManager`, as far as the shell calls it. */
interface ToolManagerLike {
  isActive(tool: string): boolean;
  setActive(tool: string | null): void;
}

/** An armed tool whose drag went without a drop: put down unless another step arms a tool. */
interface DroppedTool {
  tool: string;
  prefix: string;
}

/**
 * The diagram-side half of `shellModule`: the palette skin, the chrome-key guard on the diagram-js
 * keyboard and the buffer that holds the palette until `connectDiagramJs` hands it to a shell.
 */
export class ShellDiagramService {
  static $inject = ["eventBus", "injector"];

  private svg: Element | undefined;
  /** The canvas `<svg>`'s own `role` and `aria-label` before the shell named it. */
  private canvasOriginals: Map<string, string | null> | undefined;
  private skin: PaletteSkin | undefined;
  private activeTool: string | null = null;
  /** The prefix of the drag that waits for the active tool's next press. */
  private armedPrefix: string | undefined;
  private droppedTool: DroppedTool | undefined;
  private shell: ShellHandle | undefined;
  private unregisterPalette: (() => void) | undefined;
  private readonly subscriptions: Array<readonly [string, DiagramEventListener]> = [];
  private destroyed = false;

  constructor(
    private readonly eventBus: EventBusLike,
    private readonly injector: DidiInjectorLike,
  ) {
    this.subscribe("canvas.init", (event: { svg?: Element }) => {
      this.svg = event.svg;
      this.nameCanvas();
    });
    this.subscribe("palette.create", (event: { container: HTMLElement }) =>
      this.onPaletteCreate(event.container),
    );
    this.subscribe("palette.changed", () => this.skin?.refresh());
    this.subscribe("tool-manager.update", (event: { tool?: string | null }) => {
      this.activeTool = event.tool ?? null;
      this.armedPrefix = this.activeTool === null ? undefined : this.dragPrefix();
      this.droppedTool = undefined;
      this.skin?.setActiveTool(this.activeTool);
    });
    this.subscribe("drag.cleanup", () => this.onDragCleanup());
    // The tool manager decides on the end of a drag itself; a press on another tool's entry ends
    // the armed drag on purpose and keeps the tool pressed until that entry's click arms the next.
    this.subscribe("drag.ended", () => {
      this.droppedTool = undefined;
    });
    this.subscribe("palette.trigger", this.onPaletteTrigger, TRIGGER_PRIORITY);
    this.subscribe("diagram.destroy", () => this.destroy());

    const keyboard = injector.get("keyboard", false) as KeyboardLike | null;
    if (keyboard) {
      keyboard.addListener(KEYBOARD_PRIORITY, this.onKeyboardKeydown);
      this.subscriptions.push(["keyboard.keydown", this.onKeyboardKeydown]);
    }
  }

  /**
   * Hands the palette (now or once diagram-js creates it) to `shell`; returns the detach
   * function. A later call replaces the earlier shell.
   */
  attachShell(shell: ShellHandle): () => void {
    this.detachShell();
    if (this.destroyed) return () => undefined;
    this.shell = shell;
    this.skin?.setLabel(shell.messages.tools);
    this.nameCanvas();
    this.registerPalette();
    return () => {
      if (this.shell === shell) this.detachShell();
    };
  }

  private registerPalette(): void {
    const { shell, skin } = this;
    if (!shell || !skin) return;
    this.unregisterPalette?.();
    this.unregisterPalette = shell.registerPalette({
      element: skin.element,
      entryTooltip: (entry) => skin.entryTooltip(entry),
      setReadOnly: (state) => skin.setReadOnly(state),
    });
  }

  private detachShell(): void {
    const unregister = this.unregisterPalette;
    this.unregisterPalette = undefined;
    this.shell = undefined;
    unregister?.();
    this.unnameCanvas();
    this.skin?.setReadOnly(EDITABLE);
    this.skin?.setLabel(defaultMessages.tools);
  }

  /**
   * The focusable canvas is an application with a name (WCAG 4.1.2): screen readers switch to focus
   * mode, so the canvas's single-key commands reach it. A role or name the modeler set stays.
   */
  private nameCanvas(): void {
    const { svg, shell } = this;
    if (!svg || !shell || this.canvasOriginals) return;
    this.canvasOriginals = new Map(CANVAS_ATTRIBUTES.map((name) => [name, svg.getAttribute(name)]));
    if (!svg.hasAttribute("role")) svg.setAttribute("role", "application");
    if (!svg.hasAttribute("aria-label") && !svg.hasAttribute("aria-labelledby")) {
      svg.setAttribute("aria-label", shell.messages.canvas);
    }
  }

  private unnameCanvas(): void {
    const { svg, canvasOriginals } = this;
    this.canvasOriginals = undefined;
    if (!svg || !canvasOriginals) return;
    for (const [name, value] of canvasOriginals) {
      if (value === null) svg.removeAttribute(name);
      else svg.setAttribute(name, value);
    }
  }

  private onPaletteCreate(container: HTMLElement): void {
    this.skin?.destroy();
    const palette = this.injector.get("palette", false) as PaletteLike | null;
    const skin = new PaletteSkin(container, () => palette?.getEntries() ?? {});
    this.skin = skin;
    skin.setActiveTool(this.activeTool);
    if (this.shell) skin.setLabel(this.shell.messages.tools);
    this.moveBeforeCanvas(container);
    this.registerPalette();
  }

  // Palette#_init appends the palette after the <svg>; in front of it the palette comes first in
  // the tab order (guide §5.14).
  private moveBeforeCanvas(container: HTMLElement): void {
    const parent = container.parentElement ?? this.canvasContainer();
    if (!parent) return;
    const svg =
      this.svg?.parentNode === parent
        ? this.svg
        : Array.from(parent.children).find((child) => child.localName === "svg");
    if (svg) parent.insertBefore(container, svg);
  }

  private canvasContainer(): HTMLElement | undefined {
    const canvas = this.injector.get("canvas", false) as CanvasLike | null;
    return canvas?.getContainer();
  }

  private dragPrefix(): string | undefined {
    const dragging = this.injector.get("dragging", false) as DraggingLike | null;
    return dragging?.context()?.prefix;
  }

  /**
   * diagram-js's tool manager puts a tool down when its drag ends, but on a cancel only for a drag
   * the pointer has moved and not from the palette's tools group: Escape on a tool the palette armed
   * before the pointer moved left it pressed (guide §5.5: pressed only while armed). The armed drag
   * also goes when another tool's drag replaces it, whose init follows in the same task, so the
   * decision waits until that task is over.
   */
  private onDragCleanup(): void {
    const prefix = this.dragPrefix();
    const tool = this.activeTool;
    if (prefix === undefined || prefix !== this.armedPrefix || tool === null) return;
    const dropped: DroppedTool = { tool, prefix };
    this.droppedTool = dropped;
    queueMicrotask(() => {
      if (this.droppedTool !== dropped) return;
      this.droppedTool = undefined;
      const toolManager = this.injector.get("toolManager", false) as ToolManagerLike | null;
      // A tool that arms itself again while active (`reactivate`) brings no `tool-manager.update`.
      if (!toolManager?.isActive(tool) || this.dragPrefix() === prefix) return;
      toolManager.setActive(null);
    });
  }

  private readonly onPaletteTrigger = (event: PaletteTriggerEvent): false | undefined => {
    if (!event.entry || !this.skin?.vetoes(event.entry, event.event)) return undefined;
    // A vetoed dragstart would otherwise still start the browser's native drag of the entry.
    event.event?.preventDefault();
    return false;
  };

  /**
   * `true` stops the diagram-js keyboard (and makes it call `preventDefault`), `false` stops it
   * without: a chrome key in a text field inside the `<svg>` stays the field's (Shift+1 types "!"),
   * and in the IDE host undo and redo stay the document's (guide §13.5), so they reach VS Code
   * instead of the canvas `commandStack`.
   */
  private readonly onKeyboardKeydown = (context: KeyboardEventContext): boolean | undefined => {
    const event = context.keyEvent;
    if (!event) return undefined;
    // `false` keeps every other diagram-js listener off the key without preventing it: in a text
    // field the field keeps it, behind the web app's start screen the browser zooms the page.
    if (matchChromeKey(event))
      return !isTextField(event.target) && this.shell?.isEmptyStateShown?.() !== true;
    if (this.shell?.host === "ide" && isUndoRedoKey(event)) return false;
    return undefined;
  };

  private subscribe<E>(name: string, listener: (event: E) => unknown, priority?: number): void {
    const handler = listener as DiagramEventListener;
    if (priority === undefined) this.eventBus.on(name, handler);
    else this.eventBus.on(name, priority, handler);
    this.subscriptions.push([name, handler]);
  }

  private destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.detachShell();
    this.skin?.destroy();
    this.skin = undefined;
    this.svg = undefined;
    this.droppedTool = undefined;
    for (const [name, listener] of this.subscriptions.splice(0)) this.eventBus.off(name, listener);
  }
}

/** The service of `shellModule` in `diagram`; throws when the modeler was built without it. */
export function shellServiceOf(diagram: InjectorLike): ShellDiagramService {
  let service: unknown;
  try {
    service = diagram.get<unknown>(SHELL_SERVICE);
  } catch {
    service = undefined;
  }
  if (!isShellService(service)) {
    throw new Error(
      "@miragon/modeler-shell: connectDiagramJs needs shellModule in the modeler's modules (additionalModules: [shellModule])",
    );
  }
  return service;
}

// Duck-typed rather than `instanceof`, so a shellModule from the CJS build connects to the ESM one.
function isShellService(value: unknown): value is ShellDiagramService {
  return typeof (value as Partial<ShellDiagramService> | null)?.attachShell === "function";
}
