import type EventBus from "diagram-js/lib/core/EventBus";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type { Injector } from "didi";
import { isKeyAimedAt } from "../a11y/index.js";
import type WardleyPaletteProvider from "./WardleyPaletteProvider.js";

const ENTRY_SELECTOR = ".djs-palette-entries .entry";

const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);
const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const ACTIVATE_KEYS = new Set(["Enter", " "]);

/**
 * Makes the palette a keyboard-operable toolbar (WAI-ARIA toolbar pattern): one Tab stop with a
 * roving tabindex, arrow keys / Home / End move between tools, Enter or Space activates the focused
 * one. A create tool has no pointer position to attach the new element to, so it is placed at the
 * centre of the free rectangle instead (see `WardleyPaletteProvider.createAtFreeCenter`). The
 * palette comes before the canvas in the tab order, and a rebuild of the entries (explore mode
 * swaps them) gives the focus back to the entry of the same action. Only for hosts without the
 * Miragon modeler shell, which brings these keys, that order and that focus itself.
 */
export default class WardleyPaletteKeyboard {
  static $inject = ["eventBus", "palette", "wardleyPaletteProvider", "injector"];

  private container: HTMLElement | undefined;
  private activeAction: string | undefined;
  private focusedEntry: HTMLElement | undefined;

  constructor(
    eventBus: EventBus,
    private readonly palette: Palette,
    private readonly provider: WardleyPaletteProvider,
    injector: Injector,
  ) {
    // The Miragon modeler shell skins the palette and brings the same keys; a second roving tab
    // stop and a second Enter handler would create every element twice.
    if (injector.get("modelerShell", false)) return;
    eventBus.on("palette.create", (event: { container: HTMLElement }) =>
      this.attach(event.container),
    );
    eventBus.on("palette.changed", () => {
      this.moveBeforeCanvas();
      this.updateTabStops();
      this.restoreFocus();
    });
    const existing = (palette as unknown as { _container?: HTMLElement })._container;
    if (existing) {
      this.attach(existing);
      this.moveBeforeCanvas();
    }
  }

  // diagram-js appends the palette after the canvas <svg>, so Tab would reach the canvas first
  // (guide §5.5, §5.14). Moved only while it lies there: a move takes the focus off a focused
  // entry. A chrome marks a palette it skins in its own listener of `palette.create`, so the move
  // waits for the `palette.changed` that follows and leaves such a palette to that chrome.
  private moveBeforeCanvas(): void {
    const container = this.container;
    if (!container || container.getAttribute("data-chrome") === "palette") return;
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

  private attach(container: HTMLElement): void {
    if (this.container === container) return;
    this.container = container;
    // Scopes the toolbar styling to this palette, not every diagram-js palette on the page.
    container.classList.add("wardley-palette");
    container.setAttribute("role", "toolbar");
    container.setAttribute("aria-label", "Tools");
    container.setAttribute("aria-orientation", "horizontal");
    container.addEventListener("keydown", (event) => this.onKeydown(event));
    container.addEventListener("focusin", (event) => {
      const entry = this.entryOf(event.target);
      if (!entry) return;
      this.focusedEntry = entry;
      this.activeAction = entry.getAttribute("data-action") ?? undefined;
      this.updateTabStops();
    });
    container.addEventListener("focusout", (event) => this.onFocusOut(event));
    this.updateTabStops();
  }

  // A focus that leaves the palette is not brought back by a later rebuild. Chromium reports the
  // removal of the focused entry as a focusout too, while the entry is still in the document, and
  // the rebuild's `palette.changed` follows in the same task: so the entry counts as left only once
  // that task is over and the focus has not come back to it.
  private onFocusOut(event: FocusEvent): void {
    const entry = this.entryOf(event.target);
    if (!entry || entry !== this.focusedEntry) return;
    const next = event.relatedTarget;
    if (next instanceof Node && this.container?.contains(next)) return;
    queueMicrotask(() => {
      if (this.focusedEntry === entry && entry.ownerDocument.activeElement !== entry) {
        this.focusedEntry = undefined;
      }
    });
  }

  // A rebuild removes the focused entry, which would drop the focus onto <body>: it goes to the
  // entry of the same action, or to the tab stop where the rebuilt palette no longer offers it.
  private restoreFocus(): void {
    const lost = this.focusedEntry;
    if (!lost || lost.isConnected) return;
    this.focusedEntry = undefined;
    const entries = this.entries();
    const action = lost.getAttribute("data-action");
    const replacement =
      entries.find((entry) => entry.getAttribute("data-action") === action) ??
      entries.find((entry) => entry.tabIndex === 0);
    const active = lost.ownerDocument.activeElement;
    if (replacement && (!active || active === lost.ownerDocument.body)) replacement.focus();
  }

  private entries(): HTMLElement[] {
    return this.container
      ? Array.from(this.container.querySelectorAll<HTMLElement>(ENTRY_SELECTOR))
      : [];
  }

  private entryOf(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element) || !this.container) return null;
    const entry = target.closest<HTMLElement>(".entry");
    return entry && this.container.contains(entry) ? entry : null;
  }

  private updateTabStops(): void {
    const entries = this.entries();
    if (!entries.length) return;
    const active =
      entries.find((entry) => entry.getAttribute("data-action") === this.activeAction) ??
      entries[0]!;
    for (const entry of entries) entry.tabIndex = entry === active ? 0 : -1;
  }

  private onKeydown(event: KeyboardEvent): void {
    const entry = this.entryOf(event.target);
    if (!entry || event.altKey || event.ctrlKey || event.metaKey) return;
    // The draw tool's check on its entry: a key it leaves to the page (Chromium sends it to an entry
    // the host made inert or hid until its next rendering update) would otherwise activate the draw
    // entry and throw away the line the tool holds.
    if (!isKeyAimedAt(event, entry)) return;
    const entries = this.entries();
    const index = entries.indexOf(entry);

    let next: HTMLElement | undefined;
    if (PREVIOUS_KEYS.has(event.key)) next = entries[(index - 1 + entries.length) % entries.length];
    else if (NEXT_KEYS.has(event.key)) next = entries[(index + 1) % entries.length];
    else if (event.key === "Home") next = entries[0];
    else if (event.key === "End") next = entries[entries.length - 1];

    if (next) {
      // The toolbar's own keys: no listener further up acts on them too.
      event.preventDefault();
      event.stopPropagation();
      next.focus();
      return;
    }

    if (ACTIVATE_KEYS.has(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      this.activate(entry);
    }
  }

  private activate(entry: HTMLElement): void {
    const action = entry.getAttribute("data-action");
    if (!action || entry.getAttribute("aria-disabled") === "true") return;
    if (this.provider.createAtFreeCenter(action)) return;
    const bounds = entry.getBoundingClientRect();
    const click = new MouseEvent("click", {
      bubbles: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    });
    this.palette.triggerEntry(action, "click", click);
  }
}
