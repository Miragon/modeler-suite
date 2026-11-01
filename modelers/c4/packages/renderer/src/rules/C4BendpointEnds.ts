import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element } from "diagram-js/lib/model/Types";
import type SceneLookup from "../draw/SceneLookup.js";

/** The handles at a relationship's ends, which c4.css hides: reconnecting is not in v1. */
export const BENDPOINT_END_CLASS = "c4-bendpoint-end";
/**
 * The handle on the bend that fans a line out of its pair, which c4.css hides: the layout draws
 * that bend and the label on it, the user placed no vertex there. The floating handle carries it
 * too while it snaps to that bend under the pointer.
 */
export const BENDPOINT_FAN_CLASS = "c4-bendpoint-fan";

/** After diagram-js's Bendpoints (1000), which draws the handles anew on these events. */
const AFTER_THE_HANDLES = 500;

interface ElementEvent {
  element?: Element;
  newSelection?: Element[];
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Tags the first and the last handle of a relationship, and the handle on a fan's bend.
 * diagram-js draws a handle on every waypoint, the docked ends included, and pressing an end
 * starts a reconnect the rules refuse: an inert handle that covers the chevron. A fan's bend is a
 * waypoint the layout adds (the scene's `route` while the relationship stores no vertex), with the
 * label centred on it, so the floating handle that follows the pointer along the line snaps to it
 * whenever the pointer rests on the label's middle.
 */
export default class C4BendpointEnds {
  static $inject = ["eventBus", "canvas", "c4SceneLookup"];

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly lookup: SceneLookup,
  ) {
    eventBus.on(
      ["element.hover", "element.marker.update", "connection.changed"],
      AFTER_THE_HANDLES,
      ({ element }: ElementEvent) => this.tag(element),
    );
    eventBus.on("selection.changed", AFTER_THE_HANDLES, ({ newSelection }: ElementEvent) =>
      this.tag(newSelection?.[0]),
    );
    eventBus.on("element.mousemove", AFTER_THE_HANDLES, ({ element }: ElementEvent) =>
      this.tagFloating(element),
    );
  }

  private handlesOf(element: Element): SVGGElement | null {
    return this.canvas
      .getLayer("overlays")
      .querySelector<SVGGElement>(`.djs-bendpoints[data-element-id="${CSS.escape(element.id)}"]`);
  }

  private tag(element: Element | undefined): void {
    if (!element || !("waypoints" in element)) return;
    const group = this.handlesOf(element);
    if (!group) return;
    const waypoints = element.waypoints as readonly Point[];
    const bends = this.fanBends(element);
    const handles = [...group.querySelectorAll(":scope > .djs-bendpoint:not(.floating)")];
    handles.forEach((handle, index) => {
      const end = index === 0 || index === handles.length - 1;
      const point = waypoints[index];
      handle.classList.toggle(BENDPOINT_END_CLASS, end);
      handle.classList.toggle(
        BENDPOINT_FAN_CLASS,
        !end && point !== undefined && bends.some(({ x, y }) => x === point.x && y === point.y),
      );
    });
  }

  private tagFloating(element: Element | undefined): void {
    if (!element || !("waypoints" in element)) return;
    const floating = this.handlesOf(element)?.querySelector<SVGGElement>(
      ":scope > .djs-bendpoint.floating",
    );
    if (!floating) return;
    const at = floating.transform.baseVal.consolidate()?.matrix;
    floating.classList.toggle(
      BENDPOINT_FAN_CLASS,
      at !== undefined && this.fanBends(element).some(({ x, y }) => x === at.e && y === at.f),
    );
  }

  private fanBends(element: Element): readonly Point[] {
    const relationship = this.lookup.relationship(element);
    return relationship && relationship.vertices.length === 0 ? relationship.route : [];
  }
}
