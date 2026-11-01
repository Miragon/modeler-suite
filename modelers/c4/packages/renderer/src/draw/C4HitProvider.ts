import type { Injector } from "didi";
import type EventBus from "diagram-js/lib/core/EventBus";
import type InteractionEvents from "diagram-js/lib/features/interaction-events/InteractionEvents";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import { c4ReferenceOf } from "../scene/types.js";
import {
  boundaryTextLayout,
  elementTextLayout,
  relationshipLabelLayout,
} from "../text/elementTextLayout.js";
import type { TextBands } from "../text/types.js";
import { BOUNDARY_CAPTION } from "../text/typography.js";
import { DRILL_CLASS, drillBadgeLayout } from "./drillBadge.js";
import type SceneLookup from "./SceneLookup.js";

function isShape(element: Element): element is Shape {
  return "width" in element && "height" in element && "x" in element && "y" in element;
}

interface HitEvent {
  readonly element?: Element;
  readonly gfx?: SVGElement;
}

/**
 * Hit areas the default box hit gets wrong (the Wardley and Event Storming precedent):
 *
 * - a boundary takes clicks on its outline and its caption band only, so a click inside reaches
 *   the canvas and the members (SPEC 6.5);
 * - a drill badge gets a hit of its own above the shape's, carrying `c4-drill`, so a click
 *   listener tells it from a click on the element (the visual takes no pointer events);
 * - a relationship's label takes clicks as its line does;
 * - a band of text cut short gets a hit of its own, carrying `c4-cut-band`, titled with the whole
 *   text, so the pointer shows what the ellipsis left out (the visual takes no pointer events,
 *   and the export drops every hit).
 *
 * Answers before diagram-js's default (low priority) and stops it by returning false.
 */
export default class C4HitProvider {
  static $inject = ["eventBus", "injector", "c4SceneLookup"];

  constructor(
    eventBus: EventBus,
    private readonly injector: Injector,
    private readonly lookup: SceneLookup,
  ) {
    eventBus.on("interactionEvents.createHit", (event: HitEvent) => this.createHits(event, false));
    eventBus.on("interactionEvents.updateHit", (event: HitEvent) => this.createHits(event, true));
  }

  private createHits({ element, gfx }: HitEvent, replace: boolean): false | undefined {
    const reference = c4ReferenceOf(element);
    const interactionEvents = this.injector.get<InteractionEvents>("interactionEvents", false);
    if (!element || !gfx || !reference || !interactionEvents) return undefined;
    if (replace) interactionEvents.removeHits(gfx);
    if (reference.role === "relationship") {
      const waypoints = "waypoints" in element ? element.waypoints : undefined;
      interactionEvents.createWaypointsHit(gfx, waypoints ?? []);
      const relationship = this.lookup.relationship(element);
      const label = relationship && relationshipLabelLayout(relationship);
      if (label?.backing) interactionEvents.createBoxHit(gfx, "all", { ...label.backing });
      if (label) cutBandHits(interactionEvents, gfx, label, { x: 0, y: 0 });
      return false;
    }
    if (!isShape(element)) return undefined;
    const { width, height } = element;
    if (reference.role === "boundary") {
      interactionEvents.createBoxHit(gfx, "stroke", { width, height });
      const boundary = this.lookup.boundary(element);
      const band = boundary
        ? boundaryTextLayout(boundary).area.height
        : Math.min(BOUNDARY_CAPTION.band, height);
      interactionEvents.createBoxHit(gfx, "all", { y: height - band, width, height: band });
      if (boundary) cutBandHits(interactionEvents, gfx, boundaryTextLayout(boundary), boundary.box);
      return false;
    }
    interactionEvents.createBoxHit(gfx, "all", { width, height });
    const sceneElement = reference.role === "element" ? this.lookup.element(element) : undefined;
    if (sceneElement) {
      cutBandHits(interactionEvents, gfx, elementTextLayout(sceneElement), sceneElement.box);
    }
    const badge = sceneElement && drillBadgeLayout(sceneElement);
    if (sceneElement && badge) {
      const hit = interactionEvents.createBoxHit(gfx, "all", {
        x: badge.box.x - sceneElement.box.x,
        y: badge.box.y - sceneElement.box.y,
        width: badge.box.width,
        height: badge.box.height,
      });
      hit.classList.add(DRILL_CLASS);
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = badge.title;
      hit.appendChild(title);
    }
    return false;
  }
}

/** A band's tooltip carries the class that tells it from the element's own hit. */
export const CUT_BAND_CLASS = "c4-cut-band";

/** One titled hit per band of `layout` that was cut short; `origin` is the gfx's corner. */
function cutBandHits(
  interactionEvents: InteractionEvents,
  gfx: SVGElement,
  layout: TextBands,
  origin: { readonly x: number; readonly y: number },
): void {
  for (const band of layout.bands) {
    if (band.fullText === undefined) continue;
    const hit = interactionEvents.createBoxHit(gfx, "all", {
      x: band.box.x - origin.x,
      y: band.box.y - origin.y,
      width: band.box.width,
      height: band.box.height,
    });
    hit.classList.add(CUT_BAND_CLASS);
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = band.fullText;
    hit.appendChild(title);
  }
}
