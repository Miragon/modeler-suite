import type { ModuleDeclaration } from "didi";
import type EventBus from "diagram-js/lib/core/EventBus";
import HoverTooltipModule from "diagram-js/lib/features/hover-tooltip";
import type HoverTooltip from "diagram-js/lib/features/hover-tooltip/HoverTooltip";

/** The private fields in which diagram-js's HoverTooltip keeps a tooltip it is about to show. */
interface PendingTooltip {
  _showTimer: ReturnType<typeof setTimeout> | null;
  _current: unknown;
}

/** Ahead of the canvas's own `diagram.destroy` listener (500), which removes its container. */
const BEFORE_CANVAS_TEARDOWN = 1500;

/**
 * diagram-js's hover tooltip (15.28.1, its latest release) shows a palette entry's tooltip 300ms
 * after the pointer enters the entry and cancels that only when the pointer leaves, never on
 * `diagram.destroy`: the timer then renders into the destroyed canvas and throws a TypeError in the
 * host's page. HoverTooltip has no public way to cancel a show, so this clears its timer and
 * the content it would render.
 */
export default class WardleyHoverTooltipTeardown {
  static $inject = ["eventBus", "hoverTooltip"];

  constructor(eventBus: EventBus, hoverTooltip: HoverTooltip) {
    eventBus.on("diagram.destroy", BEFORE_CANVAS_TEARDOWN, () => {
      const pending = hoverTooltip as unknown as PendingTooltip;
      clearTimeout(pending._showTimer ?? undefined);
      pending._showTimer = null;
      pending._current = null;
    });
  }
}

/** Cancels the palette tooltip that waits to show when the modeler is destroyed. */
export const wardleyHoverTooltipTeardownModule: ModuleDeclaration = {
  __depends__: [HoverTooltipModule],
  __init__: ["wardleyHoverTooltipTeardown"],
  wardleyHoverTooltipTeardown: ["type", WardleyHoverTooltipTeardown],
};
