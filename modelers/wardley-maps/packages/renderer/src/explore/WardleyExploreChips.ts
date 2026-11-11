import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Overlays from "diagram-js/lib/features/overlays/Overlays";
import type { Element } from "diagram-js/lib/model/Types";
import { focusCanvasWithoutRing, isKeyOnHiddenTarget } from "../a11y/index.js";
import { chromeIcon, type LucideIconName } from "../draw/lucide.js";
import type { WardleyShape } from "../model/di-types.js";
import type { ExploreDirection } from "./explore-graph.js";
import { EXPLORE_CHROME_PRIORITY, isKeyboardClick, nameOf } from "./explore-chrome.js";
import { EXPLORE_CHANGED, EXPLORE_OVERLAY_TYPE } from "./WardleyExplore.js";
import type WardleyExplore from "./WardleyExplore.js";

export const EXPLORE_CHIP_CLASS = "wardley-explore-chip";

interface ChipSpec {
  readonly direction: ExploreDirection;
  readonly icon: LucideIconName;
  /** Above the component: what needs it lies higher on the map. */
  readonly above: boolean;
  readonly one: string;
  readonly many: string;
}

const CHIPS: readonly ChipSpec[] = [
  {
    direction: "dependents",
    icon: "chevron-up",
    above: true,
    one: "dependent",
    many: "dependents",
  },
  {
    direction: "dependencies",
    icon: "chevron-down",
    above: false,
    one: "dependency",
    many: "dependencies",
  },
];

/**
 * The chips of explore mode (guide §8): on each component that shows, how many of the components
 * next to it are hidden, the dependents above it and the dependencies below it; a click reveals
 * them. They are diagram-js overlays the same size at every zoom, HTML outside the `<svg>`, so no
 * export carries them, and they leave the tab order to the context pad, the keyboard's way to the
 * same steps.
 */
export default class WardleyExploreChips {
  static $inject = ["eventBus", "canvas", "overlays", "wardleyExplore"];

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly overlays: Overlays,
    private readonly explore: WardleyExplore,
  ) {
    eventBus.on(EXPLORE_CHANGED, EXPLORE_CHROME_PRIORITY, () => this.render());
  }

  private render(): void {
    this.overlays.remove({ type: EXPLORE_OVERLAY_TYPE });
    if (!this.explore.isActive()) return;
    for (const node of this.explore.visibleNodes()) {
      for (const chip of CHIPS) {
        const count = this.explore.hiddenCount(node.id, chip.direction);
        if (count === 0) continue;
        this.overlays.add(node as unknown as Element, EXPLORE_OVERLAY_TYPE, {
          position: { top: chip.above ? 0 : node.height, left: node.width / 2 },
          html: this.chipFor(node, chip, count),
          scale: false,
        });
      }
    }
  }

  private chipFor(node: WardleyShape, chip: ChipSpec, count: number): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = EXPLORE_CHIP_CLASS;
    button.dataset["direction"] = chip.direction;
    button.dataset["elementId"] = node.id;
    button.tabIndex = -1;
    button.setAttribute(
      "aria-label",
      `Show ${count} ${count === 1 ? chip.one : chip.many} of ${nameOf(node)}`,
    );
    button.innerHTML = `${chromeIcon(chip.icon)}<span>${count}</span>`;
    // As on the context pad: the press is the chip's, not the start of a pan or a lasso.
    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => this.reveal(event, node.id, chip.direction));
    return button;
  }

  private reveal(event: MouseEvent, nodeId: string, direction: ExploreDirection): void {
    if (isKeyOnHiddenTarget(event)) return;
    this.explore.revealNeighbours(nodeId, direction);
    if (!isKeyboardClick(event)) {
      focusCanvasWithoutRing(this.canvas);
      return;
    }
    const chip = this.chipOf(nodeId, direction);
    if (chip) chip.focus();
    else this.canvas.focus();
  }

  private chipOf(nodeId: string, direction: ExploreDirection): HTMLElement | undefined {
    return [
      ...this.canvas
        .getContainer()
        .querySelectorAll<HTMLElement>(`.${EXPLORE_CHIP_CLASS}[data-direction="${direction}"]`),
    ].find((chip) => chip.dataset["elementId"] === nodeId);
  }
}
