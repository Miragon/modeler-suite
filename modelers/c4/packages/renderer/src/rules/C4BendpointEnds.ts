import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element } from "diagram-js/lib/model/Types";

/** The handles at a relationship's ends, which c4.css hides: reconnecting is not in v1. */
export const BENDPOINT_END_CLASS = "c4-bendpoint-end";

/** After diagram-js's Bendpoints (1000), which draws the handles anew on these events. */
const AFTER_THE_HANDLES = 500;

interface ElementEvent {
  element?: Element;
  newSelection?: Element[];
}

/**
 * Tags the first and the last handle of a relationship. diagram-js draws a handle on every
 * waypoint, the docked ends included, and pressing an end starts a reconnect the rules refuse:
 * an inert handle that covers the chevron.
 */
export default class C4BendpointEnds {
  static $inject = ["eventBus", "canvas"];

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
  ) {
    eventBus.on(
      ["element.hover", "element.marker.update", "connection.changed"],
      AFTER_THE_HANDLES,
      ({ element }: ElementEvent) => this.tag(element),
    );
    eventBus.on("selection.changed", AFTER_THE_HANDLES, ({ newSelection }: ElementEvent) =>
      this.tag(newSelection?.[0]),
    );
  }

  private tag(element: Element | undefined): void {
    if (!element || !("waypoints" in element)) return;
    const group = this.canvas
      .getLayer("overlays")
      .querySelector(`.djs-bendpoints[data-element-id="${CSS.escape(element.id)}"]`);
    if (!group) return;
    const handles = [...group.querySelectorAll(":scope > .djs-bendpoint:not(.floating)")];
    handles.forEach((handle, index) => {
      handle.classList.toggle(BENDPOINT_END_CLASS, index === 0 || index === handles.length - 1);
    });
  }
}
