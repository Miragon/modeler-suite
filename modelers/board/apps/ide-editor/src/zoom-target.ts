/**
 * The board as the shell's zoom target: what the zoom panel and the four chrome keys act on.
 * It is written on the board's public calls alone (the view state and the content's box), so
 * the board takes each step as a view its host set, and its arm rules decide what that means
 * for a model that is being edited.
 */
import {
  canZoomIn,
  canZoomOut,
  fitViewbox,
  freeRectCenter,
  ZOOM_MAX,
  ZOOM_MIN,
  type Bounds,
  type Insets,
  type Size,
  type ZoomTarget,
} from "@miragon/modeler-shell/core";

/** A board's view state: where its origin stands in the box, in px, and the scale. */
export interface BoardView {
  x: number;
  y: number;
  zoom: number;
}

/** What the view code needs of a board. A `CollaborativeBoard` fits. */
export interface ViewedBoard {
  getViewState(): unknown;
  setViewState(state: unknown): void;
  contentBounds(): Bounds | undefined;
}

/** The element a board is attached to, as far as its view is computed from it. */
export type ViewBox = Pick<HTMLElement, "clientWidth" | "clientHeight">;

/** The board holds its zoom between 10 % and 400 % and takes any other one for the nearer end. */
export const BOARD_MIN_ZOOM = 0.1;
export const BOARD_MAX_ZOOM = 4;

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** A board's view state as numbers; a board without one stands at its origin, at 100 %. */
export function viewOf(board: Pick<ViewedBoard, "getViewState">): BoardView {
  const state = board.getViewState();
  if (state !== null && typeof state === "object") {
    const { x, y, zoom } = state as Record<string, unknown>;
    if (isNumber(x) && isNumber(y) && isNumber(zoom) && zoom > 0) return { x, y, zoom };
  }
  return { x: 0, y: 0, zoom: 1 };
}

export const sameView = (a: BoardView, b: BoardView): boolean =>
  a.x === b.x && a.y === b.y && a.zoom === b.zoom;

export const sizeOf = (box: ViewBox): Size => ({
  width: box.clientWidth,
  height: box.clientHeight,
});

// The raster of diagram-js's ZoomScroll, on which the shell's own viewport steps every other
// modeler: ten steps over the shell's range, in log space.
const ZOOM_STEP = Math.log10(ZOOM_MAX / ZOOM_MIN) / 10;

/** The next zoom on the shell's raster: from 100 % one step up is 135 %. */
export function stepOnRaster(zoom: number, direction: 1 | -1): number {
  const level = Math.round(Math.log10(zoom) / ZOOM_STEP) * ZOOM_STEP + ZOOM_STEP * direction;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, 10 ** level));
}

/**
 * The view that shows the content in the middle of the box minus the insets, at the largest
 * scale that fits and at most at 100 %: the shell's rule, with the insets as the only margin.
 * Undefined where there is nothing to fit or no box to fit into.
 */
export function fittedView(
  bounds: Bounds | undefined,
  size: Size,
  insets: Insets,
): BoardView | undefined {
  const box = bounds ? fitViewbox(bounds, size, insets) : undefined;
  const centre = freeRectCenter(size, insets);
  if (!bounds || !box || !centre) return undefined;
  // content too large for the board's smallest zoom stays centred and is cut at its edges
  const zoom = Math.max(BOARD_MIN_ZOOM, box.scale);
  return {
    x: centre.x - (bounds.x + bounds.width / 2) * zoom,
    y: centre.y - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  };
}

/** The same zoom around the middle of the box: what is there stays there. */
export function zoomedAbout(view: BoardView, zoom: number, size: Size): BoardView {
  const centre = { x: size.width / 2, y: size.height / 2 };
  const factor = zoom / view.zoom;
  return {
    x: centre.x - (centre.x - view.x) * factor,
    y: centre.y - (centre.y - view.y) * factor,
    zoom,
  };
}

export interface ZoomTargetOptions {
  /** the board */
  modeler: ViewedBoard;
  /** the element the board is attached to */
  slot: ViewBox & Pick<HTMLElement, "querySelector">;
  /** the shell's insets for what is open at the moment of a fit */
  insets(): Insets;
  /** a view the board changed by itself: a wheel, a pan, the move to a model that is armed */
  onView(listener: () => void): () => void;
  /** a change of the content, after which there may be something to fit, or nothing any more */
  onContent(listener: () => void): () => void;
}

export function boardZoomTarget(options: ZoomTargetOptions): ZoomTarget {
  const { modeler, slot } = options;
  const listeners = new Set<() => void>();
  let stopListening: (() => void) | undefined;
  const tell = (): void => {
    for (const listener of [...listeners]) listener();
  };
  const show = (view: BoardView): void => {
    modeler.setViewState(view);
    // the readout follows in this frame, whatever tells of the board's own view changes
    tell();
  };
  const hasExtent = (bounds: Bounds | undefined): boolean =>
    bounds !== undefined && (bounds.width > 0 || bounds.height > 0);
  return {
    zoom: () => Math.round(viewOf(modeler).zoom * 1000) / 1000,
    stepZoom(direction) {
      const now = viewOf(modeler);
      // Below the shell's range a step out would be held at 20 %, which zooms in.
      if (direction < 0 ? !canZoomOut(now.zoom) : !canZoomIn(now.zoom)) return;
      show(zoomedAbout(now, stepOnRaster(now.zoom, direction), sizeOf(slot)));
    },
    zoomToActual: () => show(zoomedAbout(viewOf(modeler), 1, sizeOf(slot))),
    fit() {
      const fitted = fittedView(modeler.contentBounds(), sizeOf(slot), options.insets());
      if (fitted) show(fitted);
    },
    canFit: () => hasExtent(modeler.contentBounds()),
    onChange(listener) {
      listeners.add(listener);
      if (!stopListening) {
        const stops = [options.onView(tell), options.onContent(tell)];
        stopListening = () => stops.forEach((stop) => stop());
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        stopListening?.();
        stopListening = undefined;
      };
    },
    // The pane takes the board's keys. The shell's own search for a canvas would find the svg of
    // a model's editor, inside a preview that takes no focus.
    focus: () =>
      slot.querySelector<HTMLElement>(".react-flow__pane")?.focus({ preventScroll: true }),
  };
}
