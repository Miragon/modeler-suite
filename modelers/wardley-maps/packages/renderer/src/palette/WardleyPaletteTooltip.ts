import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type { PaletteEntries } from "diagram-js/lib/features/palette/PaletteProvider";

const ENTRY_SELECTOR = ".djs-palette-entries .entry";
const PRESS_KEYS = new Set(["Enter", " "]);
/** Guide §5.6: the hover delay, the gap to the palette and the distance to the container's sides. */
const SHOW_DELAY_MS = 300;
const PALETTE_GAP = 8;
const CONTAINER_EDGE = 12;
/** diagram-js's gap between an entry and its tooltip, for a palette a chrome skins. */
const ENTRY_GAP = 8;

let tooltipCount = 0;

interface Shown {
  entry: HTMLElement;
  element: HTMLElement;
  describedBy: string | null;
}

/**
 * The palette tooltip for a host without a chrome of its own; the Miragon modeler shell replaces it
 * with its own. diagram-js's `paletteTooltip` stands right of the entry, made for a vertical
 * palette, where it would cover the next tool of this horizontal one, and shows on hover only.
 * This one is the chrome's tooltip of guide §5.6: 8px below the palette, centred on its entry and
 * shifted to keep 12px from the sides of the canvas container, in the container's coordinates, so
 * a map in a part of a wide page shows it at its entry, also with the palette in the second row of
 * a narrow container (§5.15). It shows after 300ms of hover, at once on keyboard focus and at once
 * for a neighbour while one is shown, never for touch, and hides on a press (a click, or Enter or
 * Space on the focused entry), Escape, leaving and blur; `role="tooltip"`. A palette that scrolls
 * sideways (guide §5.15) takes it along with its entry, and an entry scrolled out of view takes it
 * away. Surface, type and key chip are §5.6 too (wardley.css). A palette a chrome skins
 * (`data-chrome="palette"`) keeps diagram-js's place right of the entry.
 */
export default class WardleyPaletteTooltip {
  static $inject = ["eventBus", "palette", "canvas"];

  private entries: PaletteEntries = {};
  private paletteContainer: HTMLElement | undefined;
  private readonly id = `wardley-palette-tooltip-${++tooltipCount}`;
  private shown: Shown | undefined;
  private pending: { entry: HTMLElement; timer: ReturnType<typeof setTimeout> } | undefined;
  private hovered: HTMLElement | undefined;
  // A pressed entry keeps its tooltip hidden until the pointer leaves it.
  private pressed: HTMLElement | undefined;
  // After a pointer leaves a shown tooltip's entry, the next entry shows at once (guide §5.6).
  private warmUntil = 0;

  constructor(
    eventBus: EventBus,
    private readonly palette: Palette,
    private readonly canvas: Canvas,
  ) {
    eventBus.on("palette.create", (event: { container: HTMLElement }) =>
      this.attachTo(event.container),
    );
    eventBus.on("palette.changed", () => {
      this.refreshEntries();
      if (this.shown && !this.shown.entry.isConnected) this.hide();
    });
    eventBus.on("diagram.destroy", () => this.detach());
  }

  private attachTo(paletteContainer: HTMLElement): void {
    this.paletteContainer = paletteContainer;
    this.refreshEntries();
    paletteContainer.addEventListener("pointerover", this.onPointerOver);
    paletteContainer.addEventListener("pointerout", this.onPointerOut);
    paletteContainer.addEventListener("focusin", this.onFocusIn);
    paletteContainer.addEventListener("focusout", this.onFocusOut);
    paletteContainer.addEventListener("pointerdown", this.onPress);
    paletteContainer.addEventListener("click", this.onPress);
    paletteContainer.addEventListener("scroll", this.onPaletteScroll);
    // Escape hides the tooltip wherever the focus is, and leaves the key to whoever handles it. The
    // capture phase also sees Enter and Space before the toolbar or the draw tool takes them.
    paletteContainer.ownerDocument.addEventListener("keydown", this.onKeydown, true);
  }

  private detach(): void {
    this.hide();
    const container = this.paletteContainer;
    if (!container) return;
    container.removeEventListener("pointerover", this.onPointerOver);
    container.removeEventListener("pointerout", this.onPointerOut);
    container.removeEventListener("focusin", this.onFocusIn);
    container.removeEventListener("focusout", this.onFocusOut);
    container.removeEventListener("pointerdown", this.onPress);
    container.removeEventListener("click", this.onPress);
    container.removeEventListener("scroll", this.onPaletteScroll);
    container.ownerDocument.removeEventListener("keydown", this.onKeydown, true);
    this.paletteContainer = undefined;
    this.hovered = undefined;
    this.pressed = undefined;
  }

  private refreshEntries(): void {
    this.entries = this.palette.getEntries();
  }

  private entryOf(target: EventTarget | null): HTMLElement | undefined {
    if (!(target instanceof Element)) return undefined;
    const entry = target.closest<HTMLElement>(ENTRY_SELECTOR);
    return entry && this.paletteContainer?.contains(entry) ? entry : undefined;
  }

  private readonly onPointerOver = (event: PointerEvent): void => {
    const entry = this.entryOf(event.target);
    if (entry === this.hovered) return;
    if (this.hovered) this.leave(this.hovered);
    this.hovered = entry;
    if (entry) this.enter(entry, event);
  };

  private readonly onPointerOut = (event: PointerEvent): void => {
    if (!this.hovered || this.entryOf(event.relatedTarget) === this.hovered) return;
    this.leave(this.hovered);
    this.hovered = undefined;
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    const entry = this.entryOf(event.target);
    if (entry?.matches(":focus-visible")) this.show(entry);
  };

  private readonly onFocusOut = (event: FocusEvent): void => {
    const entry = this.entryOf(event.target);
    if (!entry) return;
    if (this.pending?.entry === entry) this.cancelPending();
    if (this.shown?.entry === entry) this.hide();
  };

  private readonly onPress = (event: Event): void => {
    const entry = this.entryOf(event.target);
    if (!entry) return;
    if (event.type === "pointerdown") this.pressed = entry;
    this.hide();
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" || this.pressesEntry(event)) this.hide();
  };

  // A palette that scrolls sideways (guide §5.15) carries the entries away under a shown tooltip,
  // which would then name an entry it no longer stands below.
  private readonly onPaletteScroll = (): void => {
    const shown = this.shown;
    const palette = this.paletteContainer;
    if (!shown || !palette) return;
    if (liesOutside(shown.entry, palette)) this.hide();
    else this.place(shown.element, shown.entry);
  };

  // Enter and Space press the focused entry as a click does (guide §5.5, §5.6), but the toolbar and
  // the draw tool act on them without dispatching a click, so the click listener never sees them.
  private pressesEntry(event: KeyboardEvent): boolean {
    return (
      PRESS_KEYS.has(event.key) &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      this.entryOf(event.target) !== undefined
    );
  }

  private enter(entry: HTMLElement, event: PointerEvent): void {
    if (event.pointerType === "touch" || this.pressed === entry) return;
    if (this.shown || Date.now() < this.warmUntil) {
      this.show(entry);
      return;
    }
    this.cancelPending();
    this.pending = { entry, timer: setTimeout(() => this.show(entry), SHOW_DELAY_MS) };
  }

  private leave(entry: HTMLElement): void {
    if (this.pressed === entry) this.pressed = undefined;
    if (this.pending?.entry === entry) this.cancelPending();
    if (this.shown?.entry === entry) {
      this.hide();
      this.warmUntil = Date.now() + SHOW_DELAY_MS;
    }
  }

  private cancelPending(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = undefined;
  }

  private show(entry: HTMLElement): void {
    this.cancelPending();
    const paletteEntry = this.entries[entry.getAttribute("data-action") ?? ""];
    if (!paletteEntry?.title || !entry.isConnected) {
      if (this.shown?.entry === entry) this.hide();
      return;
    }
    this.hide();
    const element = tooltipElement(
      entry.ownerDocument,
      this.id,
      isSkinned(entry),
      paletteEntry.title,
      paletteEntry.shortcut,
    );
    this.canvas.getContainer().append(element);
    const describedBy = entry.getAttribute("aria-describedby");
    this.shown = { entry, element, describedBy };
    if (saysMoreThanName(entry, paletteEntry.title, paletteEntry.shortcut)) {
      entry.setAttribute("aria-describedby", [describedBy, this.id].filter(Boolean).join(" "));
    }
    this.place(element, entry);
  }

  private place(element: HTMLElement, entry: HTMLElement): void {
    if (isSkinned(entry)) placeRightOfEntry(element, entry);
    else this.placeBelowPalette(element, entry);
  }

  private hide(): void {
    this.cancelPending();
    if (!this.shown) return;
    const { entry, element, describedBy } = this.shown;
    this.shown = undefined;
    element.remove();
    if (describedBy === null) entry.removeAttribute("aria-describedby");
    else entry.setAttribute("aria-describedby", describedBy);
  }

  /** The middle of the tooltip's top edge in px from the canvas container's top left. */
  private placeBelowPalette(element: HTMLElement, entry: HTMLElement): void {
    const containerBox = this.canvas.getContainer().getBoundingClientRect();
    const entryBox = entry.getBoundingClientRect();
    const paletteBox = (entry.closest(".djs-palette") ?? entry).getBoundingClientRect();
    const halfWidth = element.getBoundingClientRect().width / 2;
    const centre = entryBox.left + entryBox.width / 2 - containerBox.left;
    // In a container narrower than the tooltip plus both edges, the left edge wins.
    const kept = Math.max(
      CONTAINER_EDGE + halfWidth,
      Math.min(centre, containerBox.width - CONTAINER_EDGE - halfWidth),
    );
    element.style.left = `${kept}px`;
    element.style.top = `${paletteBox.bottom + PALETTE_GAP - containerBox.top}px`;
  }
}

function tooltipElement(
  ownerDocument: Document,
  id: string,
  skinned: boolean,
  title: string,
  shortcut: string | undefined,
): HTMLElement {
  const element = ownerDocument.createElement("div");
  element.id = id;
  element.setAttribute("role", "tooltip");
  element.className = `djs-hover-tooltip djs-hover-tooltip--${skinned ? "right" : "bottom"}`;
  const label = ownerDocument.createElement("span");
  label.className = "djs-palette-tooltip-label";
  label.textContent = title;
  element.append(label);
  if (shortcut) {
    const chip = ownerDocument.createElement("kbd");
    chip.className = "djs-palette-tooltip-shortcut";
    chip.textContent = shortcut;
    element.append(chip);
  }
  return element;
}

function isSkinned(entry: HTMLElement): boolean {
  return entry.closest(".djs-palette")?.getAttribute("data-chrome") === "palette";
}

/** Whether no part of `entry` lies in the visible part of the palette that scrolls it. */
function liesOutside(entry: HTMLElement, palette: HTMLElement): boolean {
  const view = palette.getBoundingClientRect();
  const start = view.left + palette.clientLeft;
  const box = entry.getBoundingClientRect();
  return box.right <= start || box.left >= start + palette.clientWidth;
}

// diagram-js's own place, in page coordinates: its stylesheet fixes the tooltip to the viewport.
function placeRightOfEntry(element: HTMLElement, entry: HTMLElement): void {
  const box = entry.getBoundingClientRect();
  element.style.left = `${box.right + ENTRY_GAP}px`;
  element.style.top = `${box.top + box.height / 2}px`;
}

// Only a tooltip that says more than the entry's name describes it (guide §5.6); a key chip does,
// unless the entry names its keys in aria-keyshortcuts.
function saysMoreThanName(
  entry: HTMLElement,
  title: string,
  shortcut: string | undefined,
): boolean {
  const name = entry.getAttribute("aria-label") ?? entry.textContent ?? "";
  return !name.includes(title) || (Boolean(shortcut) && !entry.hasAttribute("aria-keyshortcuts"));
}
