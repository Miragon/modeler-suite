import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import type { FreeArea } from "@miragon/modeler-api";
import type { Box } from "@miragon/c4-schema-model";

/** Room kept between what is revealed and the host's chrome around the free area. */
const REVEAL_MARGIN = 24;
/** The context pad opens right of one selected element: it stays clear of the chrome too. */
const CONTEXT_PAD_ROOM = 48;
/** The least zoom a reveal zooms out to: the shell's zoom panel goes no lower. */
const REVEAL_ZOOM_MIN = 0.2;

interface ServiceGetter {
  get<T>(name: string, strict?: boolean): T;
}

interface PaletteConfig {
  readonly freeArea?: FreeArea | undefined;
}

function optional<T>(services: ServiceGetter, name: string): T | undefined {
  try {
    return services.get<T>(name, false) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Selects the canvas elements of `ids` the view shows and scrolls them into the area the host's
 * chrome leaves free, unless they are in it already; the selection first, since it may open the
 * inspector the area then leaves out. True when it selected something.
 */
export function selectAndReveal(services: ServiceGetter, ids: readonly string[]): boolean {
  const shapes = select(services, ids);
  reveal(services, shapes);
  return shapes.length > 0;
}

/** Selects the canvas elements of `ids` the view shows; the shapes it selected. */
export function select(services: ServiceGetter, ids: readonly string[]): Element[] {
  const registry = optional<ElementRegistry>(services, "elementRegistry");
  const selection = optional<Selection>(services, "selection");
  if (!registry || !selection) return [];
  const shapes = ids
    .map((id) => registry.get(id))
    .filter((shape): shape is Element => shape !== undefined);
  if (shapes.length > 0) selection.select(shapes);
  return shapes;
}

/**
 * Scrolls `shapes` into the free area, and zooms out (never in) where they do not fit it at the
 * current zoom: diagram-js's `scrollToElement` would align them top left and leave the rest out
 * of sight, as when Add existing element places elements on several sides of a pinned view.
 */
export function reveal(services: ServiceGetter, shapes: readonly Element[]): void {
  const canvas = optional<Canvas>(services, "canvas");
  if (!canvas || shapes.length === 0) return;
  const { width, height } = canvas.getSize();
  if (!(width > 0 && height > 0)) return;
  const insets = optional<PaletteConfig>(services, "config.palette")?.freeArea?.insets?.();
  const padding = {
    top: (insets?.top ?? 0) + REVEAL_MARGIN,
    right: (insets?.right ?? 0) + REVEAL_MARGIN + CONTEXT_PAD_ROOM,
    bottom: (insets?.bottom ?? 0) + REVEAL_MARGIN,
    left: (insets?.left ?? 0) + REVEAL_MARGIN,
  };
  const free = {
    width: width - padding.left - padding.right,
    height: height - padding.top - padding.bottom,
  };
  const bounds = boundsOf(shapes);
  const zoom = canvas.zoom();
  const fits = bounds.width * zoom <= free.width && bounds.height * zoom <= free.height;
  if (fits || !(free.width > 0 && free.height > 0 && bounds.width > 0 && bounds.height > 0)) {
    canvas.scrollToElement([...shapes], padding);
    return;
  }
  const fitted = Math.max(
    REVEAL_ZOOM_MIN,
    Math.min(zoom, free.width / bounds.width, free.height / bounds.height),
  );
  canvas.viewbox({
    x: bounds.x + bounds.width / 2 - (padding.left + free.width / 2) / fitted,
    y: bounds.y + bounds.height / 2 - (padding.top + free.height / 2) / fitted,
    width: width / fitted,
    height: height / fitted,
  });
}

function boundsOf(shapes: readonly Element[]): Box {
  const points = shapes.flatMap((shape) =>
    "waypoints" in shape && Array.isArray(shape.waypoints)
      ? shape.waypoints
      : [
          { x: shape.x, y: shape.y },
          { x: shape.x + shape.width, y: shape.y + shape.height },
        ],
  );
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
