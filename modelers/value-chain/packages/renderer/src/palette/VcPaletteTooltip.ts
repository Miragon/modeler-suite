import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type HoverTooltip from "diagram-js/lib/features/hover-tooltip/HoverTooltip";
import type { HoverTooltipPosition } from "diagram-js/lib/features/hover-tooltip/HoverTooltip";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type { PaletteEntries } from "diagram-js/lib/features/palette/PaletteProvider";
import PaletteTooltipComponent from "diagram-js/lib/features/palette/PaletteTooltipComponent";
import { html } from "diagram-js/lib/ui";

const PALETTE_ENTRY_SELECTOR = ".djs-palette-entries .entry";
const TOOLTIP_SELECTOR = ".djs-hover-tooltip";
/** Guide §5.6, position: the gap to the palette and the distance to the container's sides. */
const PALETTE_GAP = 8;
const CONTAINER_EDGE = 12;

/**
 * The palette tooltip for a host without a chrome of its own; the modeler shell replaces it with
 * its own. diagram-js's `paletteTooltip` stands right of the entry, made for a vertical palette,
 * where it would cover the neighbouring entry of this horizontal one. This one stands where guide
 * §5.6 puts the chrome's tooltip: 8px below the palette, centred on its entry and shifted to keep
 * 12px from the sides of the canvas container, in the container's coordinates, so a modeler in a
 * part of a wide page shows it at its entry. Surface, type and key chip are guide §5.6 too
 * (value-chain.css); the timing and the hover-only trigger stay diagram-js's.
 */
export default class VcPaletteTooltip {
  static $inject = ["eventBus", "palette", "hoverTooltip", "canvas"];

  private entries: PaletteEntries = {};

  constructor(
    eventBus: EventBus,
    private readonly palette: Palette,
    private readonly hoverTooltip: HoverTooltip,
    private readonly canvas: Canvas,
  ) {
    eventBus.on("palette.create", (event: { container: HTMLElement }) =>
      this.attachTo(event.container),
    );
    eventBus.on("palette.changed", () => this.refreshEntries());
    // diagram-js keeps the tooltip's show timer across a destroy, which then throws on the removed
    // canvas container.
    eventBus.on("diagram.destroy", () =>
      (this.hoverTooltip as unknown as { _hide?: () => void })._hide?.(),
    );
  }

  private attachTo(paletteContainer: HTMLElement): void {
    this.refreshEntries();
    this.hoverTooltip.add({
      container: paletteContainer,
      selector: PALETTE_ENTRY_SELECTOR,
      getContent: (entry) => this.contentFor(entry),
      getPosition: (entry) => this.positionBelowPalette(entry),
    });
  }

  private refreshEntries(): void {
    this.entries = this.palette.getEntries();
  }

  private contentFor(entry: HTMLElement) {
    const paletteEntry = this.entries[entry.getAttribute("data-action") ?? ""];
    if (!paletteEntry?.title) return null;
    return html`<${PaletteTooltipComponent}
      title=${paletteEntry.title}
      shortcut=${paletteEntry.shortcut}
    />`;
  }

  /** The middle of the tooltip's top edge in px from the container's top left. */
  private positionBelowPalette(entry: HTMLElement): HoverTooltipPosition {
    const containerBox = this.canvas.getContainer().getBoundingClientRect();
    const entryBox = entry.getBoundingClientRect();
    const paletteBox = (entry.closest(".djs-palette") ?? entry).getBoundingClientRect();
    // diagram-js renders the tooltip right after asking for its position; only then is its width
    // known, which keeping it inside the container needs.
    queueMicrotask(() => this.keepInsideContainer());
    return {
      x: entryBox.left + entryBox.width / 2 - containerBox.left,
      y: paletteBox.bottom + PALETTE_GAP - containerBox.top,
      placement: "bottom",
    };
  }

  private keepInsideContainer(): void {
    const container = this.canvas.getContainer();
    const tooltip = container.querySelector<HTMLElement>(TOOLTIP_SELECTOR);
    if (!tooltip) return;
    const containerBox = container.getBoundingClientRect();
    const tooltipBox = tooltip.getBoundingClientRect();
    const pastLeft = containerBox.left + CONTAINER_EDGE - tooltipBox.left;
    const pastRight = tooltipBox.right - (containerBox.right - CONTAINER_EDGE);
    // In a container narrower than the tooltip plus both edges, the left edge wins.
    const shift = Math.max(pastLeft, Math.min(0, -pastRight));
    if (shift === 0) return;
    tooltip.style.left = `${parseFloat(tooltip.style.left) + shift}px`;
  }
}
