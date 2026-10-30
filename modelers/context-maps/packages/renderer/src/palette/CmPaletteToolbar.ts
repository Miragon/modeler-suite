import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Palette from "diagram-js/lib/features/palette/Palette";
import { isKeyOnHiddenTarget } from "../keyboard/CmKeyboard.js";
import { READ_ONLY_CHANGED_EVENT, type CmReadOnly } from "../read-only/index.js";

const TOOLBAR_LABEL = "Tools";
const TOOLS_GROUP = "tools";
const TOOL_ACTION_SUFFIX = "-tool";
const ENTRIES_SELECTOR = ".djs-palette-entries";
const ENTRY_SELECTOR = ".entry";
/** A shortcut on one letter or digit names the same key on every layout (guide §5.6). */
const SINGLE_KEY_SHORTCUT = /^[a-z0-9]$/i;
/** The entries that stay active under the read-only lock (guide §13.5: Lasso and Hand). */
const READ_ONLY_ACTIONS: ReadonlySet<string> = new Set(["lasso-tool", "hand-tool"]);
/** Ahead of every default-priority `palette.trigger` listener, so the lock's veto comes first. */
const TRIGGER_PRIORITY = 2000;

interface PaletteEntryLike {
  shortcut?: string;
  group?: string;
}

interface PaletteTriggerEvent {
  entry?: PaletteEntryLike;
  event?: Event & { delegateTarget?: EventTarget };
}

interface OptionalInjector {
  get(name: string, strict?: boolean): unknown;
}

type EditLock = Pick<CmReadOnly, "isReadOnly" | "isReadOnlyShown">;

/**
 * The palette as a toolbar (guide §5.5) for a host that mounts the renderer without a chrome that
 * skins it: `role="toolbar"` named "Tools", one tab stop that roves with ← → Home End, Enter or
 * Space as a click without a pointer (a creating entry then places its context in the free area,
 * `CmPaletteProvider`), `aria-pressed` on the tools, `aria-keyshortcuts` on the entries with a key,
 * the entries the read-only lock refuses doing nothing while it holds and `aria-disabled` while its
 * marks show (guide §13.5: at once, or after the lock's `delayMs`; they stay focusable), and the
 * palette ahead of the canvas in the tab order (guide §5.14). The Miragon modeler shell brings all
 * of this itself, and a palette any chrome skins (`data-chrome="palette"`) is left to it.
 */
export default class CmPaletteToolbar {
  static $inject = ["eventBus", "palette", "canvas", "injector"];

  private container: HTMLElement | undefined;
  private activeTool: string | null = null;
  private rovingAction: string | undefined;
  private readonly readOnly: EditLock | undefined;
  /** The `aria-disabled` an entry had before the lock marked it (`null`: none). */
  private readonly disabledEntries = new WeakMap<Element, string | null>();

  constructor(
    eventBus: EventBus,
    private readonly palette: Palette,
    private readonly canvas: Canvas,
    injector: OptionalInjector,
  ) {
    // The shell's palette skin adds the same keys; a second handler would create every context twice.
    if (injector.get("modelerShell", false)) return;
    this.readOnly = injector.get("cmReadOnly", false) as EditLock | undefined;
    eventBus.on("palette.create", (event: { container: HTMLElement }) =>
      this.attach(event.container),
    );
    eventBus.on("palette.changed", () => this.apply());
    eventBus.on(READ_ONLY_CHANGED_EVENT, () => this.apply());
    eventBus.on("palette.trigger", TRIGGER_PRIORITY, this.onTrigger);
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

  // diagram-js clears and rebuilds every entry on a change, so all of it is applied again each time.
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
      this.applyDisabled(entry);
    }
    this.applyTabStops(entries);
  }

  private locked(): boolean {
    return this.readOnly?.isReadOnly() === true;
  }

  private lockShown(): boolean {
    return this.readOnly?.isReadOnlyShown() === true;
  }

  private applyDisabled(entry: HTMLElement): void {
    if (this.lockShown() && !staysActive(entry)) {
      if (!this.disabledEntries.has(entry)) {
        this.disabledEntries.set(entry, entry.getAttribute("aria-disabled"));
      }
      entry.setAttribute("aria-disabled", "true");
      return;
    }
    if (!this.disabledEntries.has(entry)) return;
    const previous = this.disabledEntries.get(entry);
    this.disabledEntries.delete(entry);
    if (previous === null || previous === undefined) entry.removeAttribute("aria-disabled");
    else entry.setAttribute("aria-disabled", previous);
  }

  // The provider refuses a context only once it would change the map, so a pointer on a disabled
  // entry would still start a create preview, and a host's entry would run its action.
  private readonly onTrigger = (event: PaletteTriggerEvent): false | undefined => {
    if (!this.locked() || !this.container || this.skinnedByChrome() || !event.entry) {
      return undefined;
    }
    const element = this.entryOf(event.event?.delegateTarget ?? event.event?.target ?? null);
    const vetoed = element ? !staysActive(element) : event.entry.group !== TOOLS_GROUP;
    if (!vetoed) return undefined;
    // A vetoed dragstart would otherwise still start the browser's native drag of the entry.
    event.event?.preventDefault();
    return false;
  };

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
    next.focus();
  };

  // A press on the island's padding or on a separator would leave the focus on the page, where no
  // key reaches the canvas (guide §5.8). A press on an entry is its action's (`handFocusToCanvas`).
  private readonly onMouseDown = (event: MouseEvent): void => {
    if (this.skinnedByChrome() || this.entryOf(event.target)) return;
    event.preventDefault();
    this.canvas.focus();
  };
}

function actionOf(entry: Element): string | undefined {
  return entry.getAttribute("data-action") ?? undefined;
}

function staysActive(entry: Element): boolean {
  const action = actionOf(entry);
  return action !== undefined && READ_ONLY_ACTIONS.has(action);
}

function isTool(entry: Element, action: string | undefined): action is string {
  return (
    action?.endsWith(TOOL_ACTION_SUFFIX) === true &&
    entry.closest(".group")?.getAttribute("data-group") === TOOLS_GROUP
  );
}

// A click without a pointer (`detail` 0) at the entry's centre, through diagram-js's own click
// delegate, so it runs exactly like a pointer click; `CmPaletteProvider` tells the two apart.
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
