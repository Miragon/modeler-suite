import type EventBus from "diagram-js/lib/core/EventBus";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type { PaletteEntries } from "diagram-js/lib/features/palette/PaletteProvider";
import type HoverTooltip from "diagram-js/lib/features/hover-tooltip/HoverTooltip";
import type { HoverTooltipPosition } from "diagram-js/lib/features/hover-tooltip/HoverTooltip";
import PaletteTooltipComponent from "diagram-js/lib/features/palette/PaletteTooltipComponent";
import { html } from "diagram-js/lib/ui";

const PALETTE_ENTRY_SELECTOR = ".djs-palette-entries .entry";
const ISLAND_SELECTOR = '.djs-palette:not([data-chrome="palette"])';

export const PALETTE_TOOLTIP_GAP = 8;
export const PALETTE_TOOLTIP_PLACEMENT = "bottom";

/**
 * Replaces diagram-js' stock `paletteTooltip`, which places the tooltip to the RIGHT of an entry
 * (made for its vertical palette). Our palette is a horizontal bar, so a right-hand tooltip covers
 * the neighbouring entry: this one hangs BELOW the palette, centred on the hovered entry.
 */
export default class EventStormingPaletteTooltip {
  static $inject = ["eventBus", "palette", "hoverTooltip"];

  private entries: PaletteEntries = {};

  constructor(
    eventBus: EventBus,
    private readonly palette: Palette,
    private readonly hoverTooltip: HoverTooltip,
  ) {
    eventBus.on("palette.create", (event: { container: HTMLElement }) =>
      this.attachTo(event.container),
    );
    eventBus.on("palette.changed", () => this.refreshEntries());
  }

  private attachTo(container: HTMLElement): void {
    this.refreshEntries();
    this.hoverTooltip.add({
      container,
      selector: PALETTE_ENTRY_SELECTOR,
      getContent: (target) => this.contentFor(target),
      getPosition: (target) => positionBelow(target),
    });
  }

  private refreshEntries(): void {
    this.entries = this.palette.getEntries();
  }

  private contentFor(target: HTMLElement) {
    const entry = this.entries[target.getAttribute("data-action") ?? ""];
    if (!entry?.title) return null;
    return html`<${PaletteTooltipComponent} title=${entry.title} shortcut=${entry.shortcut} />`;
  }
}

/**
 * Centred on the entry, 8px below the horizontal island (guide §5.6), not below the entry, which
 * ends 4px above the island's edge. A palette a chrome skins keeps its own layout, so the tooltip
 * keeps to its entry there.
 */
export function positionBelow(target: HTMLElement): HoverTooltipPosition {
  const bounds = target.getBoundingClientRect();
  const island = target.closest(ISLAND_SELECTOR)?.getBoundingClientRect() ?? bounds;
  return {
    x: bounds.left + bounds.width / 2,
    y: island.bottom + PALETTE_TOOLTIP_GAP,
    placement: PALETTE_TOOLTIP_PLACEMENT,
  };
}
