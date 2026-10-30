import { ariaKeyShortcutsFromLabel, defaultMessages } from "../core/index.js";
import type { PaletteReadOnlyState, TooltipContent } from "../dom/index.js";

/** The diagram-js palette group of the tools (`Palette#updateToolHighlight` looks for it). */
export const TOOLS_GROUP = "tools";

/**
 * The entries that stay active on a read-only canvas (guide §13.5: Lasso and Hand). Every other
 * entry changes the diagram, also tools such as drawing, space or connect.
 */
export const READ_ONLY_ACTIONS: ReadonlySet<string> = new Set(["lasso-tool", "hand-tool"]);

const TOOL_ACTION_SUFFIX = "-tool";
const ENTRIES_SELECTOR = ".djs-palette-entries";
const ENTRY_SELECTOR = ".entry";

/** One entry of `palette.getEntries()`, as far as the skin reads it. */
export interface PaletteEntryLike {
  title?: string | undefined;
  shortcut?: string | undefined;
  /** `aria-keyshortcuts` (WAI-ARIA names); default `ariaKeyShortcutsFromLabel(shortcut)`. */
  ariaKeyShortcuts?: string | undefined;
  group?: string | undefined;
}

/**
 * The shell's additions to the diagram-js palette container (guide §5.5): `data-chrome`, the
 * toolbar semantics of the entries, the roving tab stop with its keys, `aria-pressed` for the
 * active tool and `aria-disabled` in read-only. diagram-js clears and rebuilds every entry on each
 * change, so `refresh()` re-applies all of it after every `palette.changed`.
 */
export class PaletteSkin {
  private label = defaultMessages.tools;
  private activeTool: string | null = null;
  /** The veto of a read-only canvas, at once with the invalid import. */
  private locked = false;
  /** The `aria-disabled` marks of a read-only canvas, once the shell's delay has passed. */
  private readOnlyShown = false;
  private entries: Readonly<Record<string, PaletteEntryLike>> = {};
  private rovingAction: string | undefined;
  private focusedEntry: HTMLElement | undefined;
  /** The `aria-disabled` an entry had before read-only marked it (`null`: none). */
  private readonly disabledEntries = new WeakMap<Element, string | null>();

  constructor(
    readonly element: HTMLElement,
    private readonly readEntries: () => Readonly<Record<string, PaletteEntryLike>>,
  ) {
    element.setAttribute("data-chrome", "palette");
    element.addEventListener("keydown", this.onKeydown);
    element.addEventListener("focusin", this.onFocusIn);
    element.addEventListener("focusout", this.onFocusOut);
    this.refresh();
  }

  setLabel(label: string): void {
    this.label = label;
    this.apply();
  }

  setActiveTool(tool: string | null): void {
    this.activeTool = tool;
    this.apply();
  }

  setReadOnly(state: PaletteReadOnlyState): void {
    this.locked = state.locked;
    this.readOnlyShown = state.locked && state.shown;
    this.apply();
  }

  /**
   * Whether `palette.trigger` must refuse `entry`: on a locked canvas every entry but Lasso and
   * Hand, also before their marks show. `palette.trigger` carries the entry definition without its
   * id, so the entry element is found through the DOM event; without one, only the tools group
   * passes.
   */
  vetoes(entry: PaletteEntryLike, event: Event | undefined): boolean {
    if (!this.locked) return false;
    const element = this.entryOf(
      (event as { delegateTarget?: EventTarget } | undefined)?.delegateTarget ??
        event?.target ??
        null,
    );
    if (element) return !staysActive(element);
    return entry.group !== TOOLS_GROUP;
  }

  /** After `palette.changed`: re-read the entries and re-apply every attribute. */
  refresh(): void {
    this.entries = this.readEntries();
    this.apply();
  }

  entryTooltip(entry: HTMLElement): TooltipContent | null {
    const action = entry.getAttribute("data-action");
    const definition = action === null ? undefined : this.entries[action];
    if (!definition?.title) return null;
    return definition.shortcut
      ? { label: definition.title, shortcut: definition.shortcut }
      : { label: definition.title };
  }

  destroy(): void {
    this.element.removeEventListener("keydown", this.onKeydown);
    this.element.removeEventListener("focusin", this.onFocusIn);
    this.element.removeEventListener("focusout", this.onFocusOut);
    this.focusedEntry = undefined;
  }

  private apply(): void {
    const container = this.element.querySelector<HTMLElement>(ENTRIES_SELECTOR);
    if (container) {
      container.setAttribute("role", "toolbar");
      container.setAttribute("aria-label", this.label);
    }
    const entries = this.entryElements();
    for (const entry of entries) {
      if (!entry.hasAttribute("role")) entry.setAttribute("role", "button");
      this.applyKeyShortcuts(entry);
      this.applyPressed(entry);
      this.applyDisabled(entry);
    }
    this.applyTabStops(entries);
    this.restoreFocus(entries);
  }

  // Guide §5.6: a button with a shortcut names it for assistive technology, not only in the chip.
  private applyKeyShortcuts(entry: HTMLElement): void {
    const action = actionOf(entry);
    const definition = action === undefined ? undefined : this.entries[action];
    const keyShortcuts =
      definition?.ariaKeyShortcuts ??
      (definition?.shortcut ? ariaKeyShortcutsFromLabel(definition.shortcut) : undefined);
    if (keyShortcuts) entry.setAttribute("aria-keyshortcuts", keyShortcuts);
  }

  private applyPressed(entry: HTMLElement): void {
    const action = actionOf(entry);
    if (groupOf(entry) !== TOOLS_GROUP || !action?.endsWith(TOOL_ACTION_SUFFIX)) return;
    const tool = action.slice(0, -TOOL_ACTION_SUFFIX.length);
    entry.setAttribute("aria-pressed", String(tool === this.activeTool));
  }

  private applyDisabled(entry: HTMLElement): void {
    if (this.readOnlyShown && !staysActive(entry)) {
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

  private applyTabStops(entries: readonly HTMLElement[]): void {
    const stop = entries.find((entry) => actionOf(entry) === this.rovingAction) ?? entries[0];
    for (const entry of entries) entry.tabIndex = entry === stop ? 0 : -1;
  }

  // A rebuild removes the focused entry; without this the focus would fall back to <body>.
  private restoreFocus(entries: readonly HTMLElement[]): void {
    const lost = this.focusedEntry;
    if (!lost || lost.isConnected) return;
    this.focusedEntry = undefined;
    const replacement = entries.find((entry) => actionOf(entry) === actionOf(lost));
    const active = this.element.ownerDocument.activeElement;
    const focusIsNowhere = !active || active === this.element.ownerDocument.body;
    if (replacement && focusIsNowhere) replacement.focus();
  }

  private entryElements(): HTMLElement[] {
    const container = this.element.querySelector(ENTRIES_SELECTOR);
    return container ? Array.from(container.querySelectorAll<HTMLElement>(ENTRY_SELECTOR)) : [];
  }

  private entryOf(target: EventTarget | null): HTMLElement | undefined {
    if (!(target instanceof Element)) return undefined;
    const entry = target.closest<HTMLElement>(ENTRY_SELECTOR);
    return entry && this.element.contains(entry) ? entry : undefined;
  }

  private readonly onFocusIn = (event: FocusEvent): void => {
    const entry = this.entryOf(event.target);
    if (!entry) return;
    this.focusedEntry = entry;
    this.rovingAction = actionOf(entry);
    this.applyTabStops(this.entryElements());
  };

  private readonly onFocusOut = (event: FocusEvent): void => {
    const entry = this.entryOf(event.target);
    if (!entry || entry !== this.focusedEntry || !entry.isConnected) return;
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !this.element.contains(next)) this.focusedEntry = undefined;
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const entry = this.entryOf(event.target);
    // The page's key: the browser sends it to an entry the host made inert until its next
    // rendering update, and a draw tool leaves Enter there alone, so activating it would throw
    // away the line the tool holds.
    if (!entry || entry.closest("[inert]")) return;
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
}

function actionOf(entry: Element): string | undefined {
  return entry.getAttribute("data-action") ?? undefined;
}

function staysActive(entry: Element): boolean {
  const action = actionOf(entry);
  return action !== undefined && READ_ONLY_ACTIONS.has(action);
}

function groupOf(entry: Element): string | undefined {
  return entry.closest(".group")?.getAttribute("data-group") ?? undefined;
}

// Enter and Space activate an entry with a synthetic click: `detail` 0, clientX/Y at the entry's
// centre. A creating entry tells it from a pointer click (`detail` ≥ 1) by that and places its
// element at `viewport.freeRectCenter()` (guide §5.5). diagram-js handles entry clicks through a
// delegate on the palette container, so it goes through `palette.trigger` and its read-only veto
// exactly like a pointer click.
function activate(entry: HTMLElement): void {
  const bounds = entry.getBoundingClientRect();
  entry.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    }),
  );
}
