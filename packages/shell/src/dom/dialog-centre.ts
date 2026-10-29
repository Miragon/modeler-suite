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

/** Layout rounds to fractions of a pixel: a dialog 32px smaller than its container fits it exactly. */
const ROUNDING_PX = 1;

/** The container's content box, which `dialog.css` sizes the dialog from. */
const CONTAINER_WIDTH_PROPERTY = "--modeler-shell-container-width";
const CONTAINER_HEIGHT_PROPERTY = "--modeler-shell-container-height";

/**
 * The window a fixed element lies in, without scrollbars: `<html>` reports it, in quirks mode
 * `<body>` (there `<html>` reports its own box); `innerWidth` where neither reports one.
 */
function measureWindow(ownerDocument: Document): Size {
  const viewportElement =
    ownerDocument.compatMode === "BackCompat" ? ownerDocument.body : ownerDocument.documentElement;
  const view = ownerDocument.defaultView;
  return {
    width: viewportElement?.clientWidth || (view?.innerWidth ?? 0),
    height: viewportElement?.clientHeight || (view?.innerHeight ?? 0),
  };
}

/**
 * The content box of `container`, what `cqw` and `cqh` measure on a size container such as the
 * shell root; `null` for an element without a box (`display: none` or `contents`).
 */
function contentSize(container: HTMLElement, style: CSSStyleDeclaration): Size | null {
  const { clientWidth, clientHeight } = container;
  if (clientWidth === 0 && clientHeight === 0) return null;
  const padding = (side: "Left" | "Right" | "Top" | "Bottom") =>
    parseFloat(style[`padding${side}`]) || 0;
  return {
    width: Math.max(0, clientWidth - padding("Left") - padding("Right")),
    height: Math.max(0, clientHeight - padding("Top") - padding("Bottom")),
  };
}

/** Writes an inline property only when it changes, so a frame that changes nothing writes nothing. */
function setInline(element: HTMLElement, property: string, value: string | null): void {
  const current = element.style.getPropertyValue(property);
  if (value === null) {
    if (current !== "") element.style.removeProperty(property);
    return;
  }
  if (current !== value) element.style.setProperty(property, value);
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
 * embedding host (a widget, a side panel) can lie far from the modeler. It also hands
 * `dialog.css` the container's content box, so the dialog's sizes refer to the container in every
 * host (guide §5.1), not only inside a size container. The shift is a `translate`, so the dialog's
 * size never depends on its place, and its backdrop stays on the whole window. It follows the
 * container while the dialog is open and connected, measuring once per animation frame: nothing
 * reports a move of the container or a resize of an element around it that clips it. Returns the
 * function that stops following.
 */
export function centreOverContainer(dialog: HTMLDialogElement, container: HTMLElement): () => void {
  const ownerDocument = dialog.ownerDocument;
  const view = ownerDocument.defaultView;

  function size(): void {
    const room = view ? contentSize(container, view.getComputedStyle(container)) : null;
    setInline(dialog, CONTAINER_WIDTH_PROPERTY, room ? `${room.width}px` : null);
    setInline(dialog, CONTAINER_HEIGHT_PROPERTY, room ? `${room.height}px` : null);
  }

  function place(): void {
    size();
    const windowSize = measureWindow(ownerDocument);
    const shown = shownPart(container, windowSize);
    const { width, height } = dialog.getBoundingClientRect();
    // The band is 16px of the dialog's own CSS pixels, which CSS zoom scales like its box.
    const zoom = zoomOf(dialog, width);
    const band = 2 * BAND_PX * zoom;
    const fits =
      shown !== null &&
      shown.right - shown.left + ROUNDING_PX >= width + band &&
      shown.bottom - shown.top + ROUNDING_PX >= height + band;
    const x = fits ? Math.round((shown.left + shown.right - windowSize.width) / 2 / zoom) : 0;
    const y = fits ? Math.round((shown.top + shown.bottom - windowSize.height) / 2 / zoom) : 0;
    setInline(dialog, "translate", x === 0 && y === 0 ? null : `${x}px ${y}px`);
  }

  let following = true;
  let frame: number | undefined;

  function follow(): void {
    frame = undefined;
    if (!following || !dialog.isConnected) return;
    place();
    frame = requestAnimationFrame(follow);
  }

  place();
  if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(follow);

  return () => {
    following = false;
    if (frame !== undefined && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frame);
    }
    frame = undefined;
  };
}
