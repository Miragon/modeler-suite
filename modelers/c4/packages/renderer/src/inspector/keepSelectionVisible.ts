/*
 * Keeps the selected element (with its context pad) clear of the inspector that edits it, by
 * gliding the canvas out from under the side panel or the bottom sheet (Team Topologies'
 * `keepSelectionVisible`, in plain DOM).
 */
import type Canvas from "diagram-js/lib/core/Canvas";
import type { Element } from "diagram-js/lib/model/Types";

/** `--cd-shell-einpassen-seite`: from the container's sides and from the side panel. */
const FREE_AREA_SIDE = 24;
/** `--cd-shell-einpassen-oben-schmal`: up to 760px the palette takes the second row. */
const NARROW_FREE_AREA_TOP = 140;
/** Above the bottom sheet: the fit inset is its top edge plus 12. */
const SHEET_GAP = 12;
/** diagram-js places the pad with a rounded zoom; a pad a pixel past the edge would flip. */
const ROUNDING_SLACK = 1;
/** diagram-js places the context pad this many diagram units to the right of the element. */
const CONTEXT_PAD_MARGIN = 8;
const CONTEXT_PAD_FALLBACK_WIDTH = 40;
/** Matches --cd-motion-base. */
const PAN_DURATION_MS = 250;

interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function prefersReducedMotion(view: Window): boolean {
  try {
    return view.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The shift that moves [start, end] inside [min, max]; when it can't fit, the start stays visible. */
export function shiftInto(start: number, end: number, min: number, max: number): number {
  if (end > max) return Math.max(max - end, min - start);
  if (start < min) return Math.min(min - start, max - end);
  return 0;
}

function selectionWithPad(canvas: Canvas, selected: readonly Element[]): ScreenBox | undefined {
  let box: ScreenBox | undefined;
  for (const element of selected) {
    const graphics = canvas.getGraphics(element.id) as SVGElement | undefined;
    if (!graphics) continue;
    const { left, top, right, bottom } = graphics.getBoundingClientRect();
    box = box
      ? {
          left: Math.min(box.left, left),
          top: Math.min(box.top, top),
          right: Math.max(box.right, right),
          bottom: Math.max(box.bottom, bottom),
        }
      : { left, top, right, bottom };
  }
  if (!box) return undefined;
  const pad = canvas.getContainer().querySelector<HTMLElement>(".djs-context-pad.open");
  const padWidth = pad?.offsetWidth || CONTEXT_PAD_FALLBACK_WIDTH;
  const padLeft = box.right + CONTEXT_PAD_MARGIN * canvas.viewbox().scale;
  return { ...box, right: Math.max(box.right, padLeft + padWidth) };
}

/** The panel's box once its entrance animation, a translation (guide §5.11), has ended. */
function restingBox(panel: HTMLElement): DOMRect {
  const box = panel.getBoundingClientRect();
  const transform = getComputedStyle(panel).transform;
  if (!transform || transform === "none" || typeof DOMMatrixReadOnly === "undefined") return box;
  const { m41: translateX, m42: translateY } = new DOMMatrixReadOnly(transform);
  return new DOMRect(box.x - translateX, box.y - translateY, box.width, box.height);
}

function panOutFromUnder(
  canvas: Canvas,
  selected: readonly Element[],
  panel: HTMLElement,
): { dx: number; dy: number } {
  const container = canvas.getContainer().getBoundingClientRect();
  const panelRect = restingBox(panel);
  const box = selectionWithPad(canvas, selected);
  if (!box || panelRect.width === 0) return { dx: 0, dy: 0 };
  const freeLeft = container.left + FREE_AREA_SIDE;
  if (panelRect.width > container.width * 0.6) {
    const freeRight = container.right - FREE_AREA_SIDE;
    return {
      dx: shiftInto(box.left, box.right, freeLeft + ROUNDING_SLACK, freeRight - ROUNDING_SLACK),
      dy: shiftInto(
        box.top,
        box.bottom,
        container.top + NARROW_FREE_AREA_TOP + ROUNDING_SLACK,
        panelRect.top - SHEET_GAP - ROUNDING_SLACK,
      ),
    };
  }
  const freeRight = panelRect.left - FREE_AREA_SIDE;
  const reachesPanel =
    box.right > freeRight &&
    box.left < panelRect.right &&
    box.bottom > panelRect.top &&
    box.top < panelRect.bottom;
  if (!reachesPanel) return { dx: 0, dy: 0 };
  const dx = shiftInto(box.left, box.right, freeLeft + ROUNDING_SLACK, freeRight - ROUNDING_SLACK);
  return { dx: Math.min(0, dx), dy: 0 };
}

function glide(canvas: Canvas, dx: number, dy: number, view: Window): () => void {
  if (prefersReducedMotion(view)) {
    canvas.scroll({ dx, dy });
    return () => undefined;
  }
  const start = view.performance.now();
  let moved = { x: 0, y: 0 };
  let frame = 0;
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / PAN_DURATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    const next = { x: dx * eased, y: dy * eased };
    canvas.scroll({ dx: next.x - moved.x, dy: next.y - moved.y });
    moved = next;
    if (progress < 1) frame = view.requestAnimationFrame(step);
  };
  frame = view.requestAnimationFrame(step);
  return () => view.cancelAnimationFrame(frame);
}

export interface SelectionKeeper {
  /** A new selection shows in the panel: bring it out from under the panel once it settled. */
  keepVisible(selected: readonly Element[]): void;
  /** The panel closed: a pan for what it showed would move the canvas for nothing. */
  forget(): void;
  destroy(): void;
}

/**
 * Waits until the pointer is released, so a press that starts a drag never moves the canvas under
 * the cursor, and while the label editor is open, since a pan would commit it.
 */
export function selectionKeeper(
  canvas: Canvas,
  panel: HTMLElement,
  isDragging: () => boolean,
): SelectionKeeper {
  const view = panel.ownerDocument.defaultView ?? window;
  let pointerDown = false;
  let frame = 0;
  let stopGlide: () => void = () => undefined;
  let pending: readonly Element[] | undefined;
  const press = () => {
    pointerDown = true;
    stopGlide();
  };
  const release = () => {
    pointerDown = false;
    if (pending) schedule();
  };
  const schedule = () => {
    view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(() => {
      const selected = pending;
      if (!selected || pointerDown || isDragging()) return;
      if (canvas.getContainer().querySelector(".diagram-label-editor")) return;
      pending = undefined;
      const { dx, dy } = panOutFromUnder(canvas, selected, panel);
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) stopGlide = glide(canvas, dx, dy, view);
    });
  };
  const forget = () => {
    pending = undefined;
    view.cancelAnimationFrame(frame);
    stopGlide();
  };
  view.addEventListener("pointerdown", press, true);
  view.addEventListener("pointerup", release, true);
  view.addEventListener("pointercancel", release, true);
  return {
    keepVisible(selected) {
      // The new pan starts from where the canvas is: the rest of an earlier glide would add to it.
      forget();
      pending = selected;
      if (!pointerDown) schedule();
    },
    forget,
    destroy() {
      forget();
      view.removeEventListener("pointerdown", press, true);
      view.removeEventListener("pointerup", release, true);
      view.removeEventListener("pointercancel", release, true);
    },
  };
}
