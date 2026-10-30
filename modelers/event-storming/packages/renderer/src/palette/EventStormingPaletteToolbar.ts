import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Palette from "diagram-js/lib/features/palette/Palette";
import { focusCanvasWithoutRing, isKeyOnHiddenTarget } from "../keyboard/index.js";

const TOOLBAR_LABEL = "Tools";
const TOOLS_GROUP = "tools";
const TOOL_ACTION_SUFFIX = "-tool";
const ENTRIES_SELECTOR = ".djs-palette-entries";
const ENTRY_SELECTOR = ".entry";
/** A shortcut on one letter or digit names the same key on every layout (guide §5.6). */
const SINGLE_KEY_SHORTCUT = /^[a-z0-9]$/i;

interface PaletteEntryLike {
  shortcut?: string;
}

interface OptionalInjector {
  get(name: string, strict?: boolean): unknown;
}

/**
 * The palette as a toolbar (guide §5.5) for a host that mounts the renderer without a chrome that
 * skins it: `role="toolbar"` named "Tools", one tab stop that roves with ← → Home End, Enter or
 * Space as a click without a pointer (a creating entry then places its sticky in the free area,
 * `EventStormingPaletteProvider`), `aria-pressed` on the tools (the lasso and the draw tool),
 * `aria-keyshortcuts` on the entries with a key, and the palette ahead of the canvas in the tab
 * order (guide §5.14). A key on an entry the host made inert or hid stays the page's. The Miragon
 * modeler shell brings all of this itself, and a palette any chrome skins (`data-chrome="palette"`)
 * is left to it.
 */
export default class EventStormingPaletteToolbar {
  static $inject = ["eventBus", "palette", "canvas", "injector"];

  private container: HTMLElement | undefined;
  private activeTool: string | null = null;
  private rovingAction: string | undefined;

  constructor(
    eventBus: EventBus,
    private readonly palette: Palette,
    private readonly canvas: Canvas,
    injector: OptionalInjector,
  ) {
    // The shell's palette skin adds the same keys; a second handler would create every sticky twice.
    if (injector.get("modelerShell", false)) return;
    eventBus.on("palette.create", (event: { container: HTMLElement }) =>
      this.attach(event.container),
    );
    eventBus.on("palette.changed", () => this.apply());
    eventBus.on("tool-manager.update", (event: { tool?: string | null }) => {
      this.activeTool = event.tool ?? null;
      this.apply();
    });
  }

  // diagram-js builds the entries after `palette.create`, and a chrome marks the palette in its own
  // listener of it, so everything else waits for the `palette.changed` that follows.
  private attach(container: HTMLElement): void {
    this.container = container;
    container.addEventListener("keydown", this.onKeydown);
    container.addEventListener("focusin", this.onFocusIn);
    container.addEventListener("mousedown", this.onMouseDown);
    this.canvas.getContainer().addEventListener("scroll", this.onCanvasScroll);
  }

  // diagram-js appends the palette after the canvas <svg>, so Tab would reach the canvas first.
  // Moved only while it is still there: a move takes the focus off a focused entry.
  private moveBeforeCanvas(container: HTMLElement): void {
    const parent = container.parentElement;
    const svg = parent && Array.from(parent.children).find((child) => child.localName === "svg");
    if (
      parent &&
      svg &&
      container.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_PRECEDING
    ) {
      parent.insertBefore(container, svg);
    }
  }

  private skinnedByChrome(): boolean {
    return this.container?.getAttribute("data-chrome") === "palette";
  }

  // diagram-js clears and rebuilds every entry on a change (an import, a level switch), so all of it
  // is applied again each time.
  private apply(): void {
    if (!this.container || this.skinnedByChrome()) return;
    this.moveBeforeCanvas(this.container);
    const toolbar = this.container.querySelector<HTMLElement>(ENTRIES_SELECTOR);
    toolbar?.setAttribute("role", "toolbar");
    toolbar?.setAttribute("aria-label", TOOLBAR_LABEL);
    const definitions = this.palette.getEntries() as Record<string, PaletteEntryLike | undefined>;
    const entries = this.entryElements();
    for (const entry of entries) {
      const action = actionOf(entry);
      if (!entry.hasAttribute("role")) entry.setAttribute("role", "button");
      const shortcut = action === undefined ? undefined : definitions[action]?.shortcut;
      if (shortcut && SINGLE_KEY_SHORTCUT.test(shortcut)) {
        entry.setAttribute("aria-keyshortcuts", shortcut.toUpperCase());
      }
      if (isTool(entry, action)) {
        const tool = action.slice(0, -TOOL_ACTION_SUFFIX.length);
        entry.setAttribute("aria-pressed", String(tool === this.activeTool));
      }
    }
    this.applyTabStops(entries);
  }

  private applyTabStops(entries: readonly HTMLElement[]): void {
    const stop = entries.find((entry) => actionOf(entry) === this.rovingAction) ?? entries[0];
    for (const entry of entries) entry.tabIndex = entry === stop ? 0 : -1;
  }

  private entryElements(): HTMLElement[] {
    const toolbar = this.container?.querySelector(ENTRIES_SELECTOR);
    return toolbar ? Array.from(toolbar.querySelectorAll<HTMLElement>(ENTRY_SELECTOR)) : [];
  }

  private entryOf(target: EventTarget | null): HTMLElement | undefined {
    if (!(target instanceof Element)) return undefined;
    const entry = target.closest<HTMLElement>(ENTRY_SELECTOR);
    return entry && this.container?.contains(entry) ? entry : undefined;
  }

  private readonly onFocusIn = (event: FocusEvent): void => {
    const entry = this.entryOf(event.target);
    if (!entry || this.skinnedByChrome()) return;
    this.rovingAction = actionOf(entry);
    this.applyTabStops(this.entryElements());
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const entry = this.entryOf(event.target);
    if (!entry || this.skinnedByChrome() || isKeyOnHiddenTarget(event)) return;
    const entries = this.entryElements();
    const index = entries.indexOf(entry);
    const last = entries.length - 1;
    let next: HTMLElement | undefined;
    switch (event.key) {
      case "ArrowLeft":
        next = entries[index <= 0 ? last : index - 1];
        break;
      case "ArrowRight":
        next = entries[index >= last ? 0 : index + 1];
        break;
      case "Home":
        next = entries[0];
        break;
      case "End":
        next = entries[last];
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) activate(entry);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!next) return;
    this.rovingAction = actionOf(next);
    this.applyTabStops(entries);
    next.focus({ preventScroll: true });
  };

  // diagram-js maps the pointer from the canvas container's box and never scrolls it, but the
  // browser scrolls it to show a focused entry past the side of a container narrower than the
  // palette (Tab back to such a tab stop), and the board would then lie off the pointer.
  private readonly onCanvasScroll = (event: Event): void => {
    const canvasContainer = event.currentTarget as HTMLElement;
    const focused = canvasContainer.ownerDocument.activeElement;
    if (this.skinnedByChrome() || !this.entryOf(focused)) return;
    canvasContainer.scrollLeft = 0;
    canvasContainer.scrollTop = 0;
  };

  // A press on the island's padding or on a separator would leave the focus on the page, where no
  // key reaches the canvas (guide §5.8). A press on an entry is `EventStormingPaletteProvider`'s.
  private readonly onMouseDown = (event: MouseEvent): void => {
    if (this.skinnedByChrome() || this.entryOf(event.target)) return;
    event.preventDefault();
    focusCanvasWithoutRing(this.canvas);
  };
}

function actionOf(entry: Element): string | undefined {
  return entry.getAttribute("data-action") ?? undefined;
}

function isTool(entry: Element, action: string | undefined): action is string {
  return (
    action?.endsWith(TOOL_ACTION_SUFFIX) === true &&
    entry.closest(".group")?.getAttribute("data-group") === TOOLS_GROUP
  );
}

// A click without a pointer (`detail` 0) at the entry's centre, through diagram-js's own click
// delegate, so it runs exactly like a pointer click; `EventStormingPaletteProvider` tells the two
// apart.
function activate(entry: HTMLElement): void {
  const box = entry.getBoundingClientRect();
  entry.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    }),
  );
}
