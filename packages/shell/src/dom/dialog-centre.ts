import type { Size } from "../core/index.js";

/** A box in the window's coordinates, as `getBoundingClientRect` gives it. */
interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Guide §8 sizes a dialog at most `100% - 32px`: 16px of backdrop on each side. */
const BAND_PX = 16;

/** Layout rounds to fractions of a pixel: a dialog `100cqw - 32px` wide fits its container exactly. */
const ROUNDING_PX = 1;

/** The window a fixed element lies in, without scrollbars; `innerWidth` where the root reports none. */
function measureWindow(ownerDocument: Document): Size {
  const root = ownerDocument.documentElement;
  const view = ownerDocument.defaultView;
  return {
    width: root.clientWidth || (view?.innerWidth ?? 0),
    height: root.clientHeight || (view?.innerHeight ?? 0),
  };
}

function clipsOverflow(overflow: string): boolean {
  return overflow !== "" && overflow !== "visible";
}

function clipByOverflow(shown: Edges, element: Element, style: CSSStyleDeclaration): Edges {
  const clipX = clipsOverflow(style.overflowX);
  const clipY = clipsOverflow(style.overflowY);
  if (!clipX && !clipY) return shown;
  const rect = element.getBoundingClientRect();
  const left = rect.left + element.clientLeft;
  const top = rect.top + element.clientTop;
  return {
    left: clipX ? Math.max(shown.left, left) : shown.left,
    top: clipY ? Math.max(shown.top, top) : shown.top,
    right: clipX ? Math.min(shown.right, left + element.clientWidth) : shown.right,
    bottom: clipY ? Math.min(shown.bottom, top + element.clientHeight) : shown.bottom,
  };
}

const CONTAINING_BLOCK_PROPERTIES = [
  "transform",
  "translate",
  "rotate",
  "scale",
  "perspective",
  "filter",
  "backdrop-filter",
];

function isSet(value: string): boolean {
  return value !== "" && value !== "none";
}

/** Whether `style` makes its element the containing block of a descendant positioned `position`. */
function containsPositioned(style: CSSStyleDeclaration, position: "absolute" | "fixed"): boolean {
  const positioned =
    position === "absolute" && isSet(style.position) && style.position !== "static";
  return (
    positioned ||
    CONTAINING_BLOCK_PROPERTIES.some((property) => isSet(style.getPropertyValue(property))) ||
    /\b(layout|paint|strict|content)\b/.test(style.contain) ||
    /\b(transform|perspective|filter)\b/.test(style.willChange)
  );
}

/**
 * The part of `container` that shows: inside the window and inside every element that clips its
 * overflow and has the container in its containing-block chain (a scrolling side panel). An
 * absolutely positioned container escapes the clip of an unpositioned element around it, a fixed
 * one the clip of everything but a transformed element. `<body>` and `<html>` hand their overflow
 * to the window. `null` when nothing of it shows.
 */
function shownPart(container: HTMLElement, windowSize: Size): Edges | null {
  const ownerDocument = container.ownerDocument;
  const view = ownerDocument.defaultView;
  const own = container.getBoundingClientRect();
  let shown: Edges = {
    left: Math.max(own.left, 0),
    top: Math.max(own.top, 0),
    right: Math.min(own.right, windowSize.width),
    bottom: Math.min(own.bottom, windowSize.height),
  };
  const isRoot = (element: Element) =>
    element === ownerDocument.body || element === ownerDocument.documentElement;
  let element: Element = container;
  while (view) {
    const { position } = view.getComputedStyle(element);
    let around = element.parentElement;
    if (position === "absolute" || position === "fixed") {
      while (
        around &&
        !isRoot(around) &&
        !containsPositioned(view.getComputedStyle(around), position)
      ) {
        around = around.parentElement;
      }
    }
    if (!around || isRoot(around)) break;
    shown = clipByOverflow(shown, around, view.getComputedStyle(around));
    element = around;
  }
  return shown.right > shown.left && shown.bottom > shown.top ? shown : null;
}

/**
 * CSS `zoom` on the host's page scales the dialog's `translate` like its box, while the rects are
 * in window pixels: the rendered width over the laid-out one, to two decimals so rounding is no zoom.
 */
function zoomOf(dialog: HTMLElement, renderedWidth: number): number {
  const laidOutWidth = dialog.offsetWidth;
  const zoom = laidOutWidth > 0 ? Math.round((renderedWidth / laidOutWidth) * 100) / 100 : 1;
  return zoom > 0 ? zoom : 1;
}

/**
 * Centres an open modal `dialog` over the part of `container` that shows, as long as the dialog
 * fits there with the 16px band of guide §8 around it, and else leaves it in the centre of the
 * window, where `dialog.css` puts it. The top layer alone centres it in the window, which in an
 * embedding host (a widget, a side panel) can lie far from the modeler. The shift is a
 * `translate`, so the dialog's size never depends on its place, and its backdrop stays on the
 * whole window. It follows the container while the dialog is open: a resize of the container, the
 * dialog or the window, a change of the page's height (content inserted above the container), and
 * a scroll of the page or of an element around the container. Returns the function that stops
 * following.
 */
export function centreOverContainer(dialog: HTMLDialogElement, container: HTMLElement): () => void {
  const ownerDocument = dialog.ownerDocument;
  const view = ownerDocument.defaultView;

  function place(): void {
    const windowSize = measureWindow(ownerDocument);
    const shown = shownPart(container, windowSize);
    const { width, height } = dialog.getBoundingClientRect();
    const fits =
      shown !== null &&
      shown.right - shown.left + ROUNDING_PX >= width + 2 * BAND_PX &&
      shown.bottom - shown.top + ROUNDING_PX >= height + 2 * BAND_PX;
    const zoom = zoomOf(dialog, width);
    const x = fits ? Math.round((shown.left + shown.right - windowSize.width) / 2 / zoom) : 0;
    const y = fits ? Math.round((shown.top + shown.bottom - windowSize.height) / 2 / zoom) : 0;
    if (x === 0 && y === 0) {
      dialog.style.removeProperty("translate");
      return;
    }
    dialog.style.setProperty("translate", `${x}px ${y}px`);
  }

  // A scroll does not bubble, so the capture phase on the document hears the page's and every element's.
  const onScroll = (event: Event): void => {
    const target = event.target;
    if (target === ownerDocument || (target instanceof Node && target.contains(container))) {
      place();
    }
  };
  const ResizeObserverClass = globalThis.ResizeObserver;
  const resizeObserver = ResizeObserverClass ? new ResizeObserverClass(place) : undefined;

  ownerDocument.addEventListener("scroll", onScroll, { capture: true, passive: true });
  view?.addEventListener("resize", place);
  resizeObserver?.observe(container);
  resizeObserver?.observe(dialog);
  resizeObserver?.observe(ownerDocument.documentElement);
  place();

  return () => {
    ownerDocument.removeEventListener("scroll", onScroll, { capture: true });
    view?.removeEventListener("resize", place);
    resizeObserver?.disconnect();
  };
}
