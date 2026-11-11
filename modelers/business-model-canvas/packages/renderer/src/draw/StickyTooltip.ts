import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Injector } from "didi";
import { isStickyShape } from "../model/di-types.js";
import { NOTES_CARD_CLASS, notesCardHtml } from "../notes-panel/notesCard.js";

const POINTER_OFFSET = { x: 14, y: 18 };
const EDGE_MARGIN = 12;

/**
 * A sticky's full text and its notes, on hover over a sticky whose text ends in an ellipsis or
 * that has notes: the canvas's own tooltip in the chrome's style, as
 * Context Maps has it, not the browser's native one. A selected sticky shows none: its context
 * pad sits where the tooltip would.
 */
export default class StickyTooltip {
  static $inject = ["eventBus", "canvas", "elementRegistry", "injector"];

  constructor(
    eventBus: EventBus,
    canvas: Canvas,
    elementRegistry: ElementRegistry,
    injector: Injector,
  ) {
    const selection = injector.get<Selection | null>("selection", false);
    const container = canvas.getContainer();
    const tooltip = document.createElement("div");
    tooltip.className = NOTES_CARD_CLASS;
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    container.append(tooltip);

    const place = (event: MouseEvent): void => {
      const bounds = container.getBoundingClientRect();
      const left = Math.min(
        event.clientX - bounds.left + POINTER_OFFSET.x,
        bounds.width - tooltip.offsetWidth - EDGE_MARGIN,
      );
      tooltip.style.left = `${Math.max(EDGE_MARGIN, left)}px`;
      tooltip.style.top = `${event.clientY - bounds.top + POINTER_OFFSET.y}px`;
    };
    const hide = (): void => {
      tooltip.hidden = true;
      container.removeEventListener("mousemove", place);
    };

    eventBus.on("element.hover", (event: { element?: unknown; originalEvent?: MouseEvent }) => {
      const { element } = event;
      if (!isStickyShape(element) || selection?.isSelected(element)) return hide();
      const visual = elementRegistry.getGraphics(element)?.querySelector(".djs-visual");
      if (visual?.getAttribute("data-bmc-tooltip") !== "true") return hide();
      tooltip.innerHTML = notesCardHtml(element.sticky.text, element.sticky.notes);
      tooltip.hidden = false;
      if (event.originalEvent) place(event.originalEvent);
      container.addEventListener("mousemove", place);
    });
    eventBus.on(["element.out", "drag.init", "canvas.viewbox.changing", "diagram.clear"], hide);
    eventBus.on("diagram.destroy", () => {
      hide();
      tooltip.remove();
    });
  }
}
