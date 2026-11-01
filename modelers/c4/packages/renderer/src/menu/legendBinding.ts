import type EventBus from "diagram-js/lib/core/EventBus";
import { legendRows } from "../legend/legendContent.js";
import { renderLegend } from "../legend/renderLegend.js";
import type { C4SceneService } from "../services.js";

/** The events after which the legend shows the view anew (SPEC 6.6). */
const LEGEND_EVENTS = ["import.done", "commandStack.changed", "c4.view.changed"];

export interface LegendBinding {
  /** Renders the rows of the view on the canvas now. */
  refresh(): void;
  destroy(): void;
}

/**
 * Keeps a live legend body (the shell's `legend.body`, whose `render` runs once) in step with the
 * view on the canvas: rendered at once and again after every import, command and view switch.
 * It stops with the diagram.
 */
export function connectLegend(
  body: HTMLElement,
  modeler: { readonly diagram: { get<T>(name: string): T } },
): LegendBinding {
  const eventBus = modeler.diagram.get<EventBus>("eventBus");
  const scenes = modeler.diagram.get<C4SceneService>("c4Scene");
  let destroyed = false;
  const refresh = () => {
    if (!destroyed) renderLegend(body, legendRows(scenes.current()));
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    eventBus.off(LEGEND_EVENTS, refresh);
    eventBus.off("diagram.destroy", destroy);
  };
  eventBus.on(LEGEND_EVENTS, refresh);
  eventBus.on("diagram.destroy", destroy);
  refresh();
  return { refresh, destroy };
}
