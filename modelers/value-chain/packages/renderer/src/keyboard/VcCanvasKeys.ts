import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";

/** Ahead of every other key listener; diagram-js's own run at 1500 at most. */
const GUARD_PRIORITY = 10000;

const ENTRY_TRIGGERS = ["palette.trigger", "contextPad.trigger"];

/**
 * Keys stay on the canvas. diagram-js binds the keyboard to the canvas `<svg>`, so a key acts only
 * while the canvas holds the focus; on top of that the canvas leaves alone a key a host has handled
 * already, a key of an input method's composition and an event without a key.
 *
 * A pointer on a palette or context pad entry takes the focus off the canvas, onto the entry where
 * it is focusable (a palette toolbar) and else nowhere, and many actions leave it there (Delete,
 * switching a relation's type, connecting). The canvas takes it back before the action runs, so
 * the next key acts without another click, while a label editor or popup the action opens still
 * gets it. Enter or Space on an entry (a click without a pointer) leaves the focus where it is,
 * unless the action left it nowhere.
 */
export default class VcCanvasKeys {
  static $inject = ["eventBus", "canvas"];

  constructor(eventBus: EventBus, canvas: Canvas) {
    eventBus.on("keyboard.keydown", GUARD_PRIORITY, (event: { keyEvent: KeyboardEvent }) =>
      isCanvasKey(event.keyEvent, canvas.getContainer()) ? undefined : false,
    );
    eventBus.on(ENTRY_TRIGGERS, (event: { event?: Event }) => {
      const type = event.event?.type;
      const byPointer = type === "dragstart" || (type === "click" && isPointerClick(event.event));
      if (byPointer) canvas.focus();
      else if (type === "click") canvas.restoreFocus();
    });
  }
}

/**
 * A key inside an `inert` subtree or below an ancestor with `display: none` or `visibility: hidden`
 * stays the page's too: Chromium moves the focus off an element the host made inert or hid only at
 * its next rendering update, so until then the key still reaches the canvas.
 */
function isCanvasKey(event: KeyboardEvent, canvasContainer: HTMLElement): boolean {
  return (
    typeof event.key === "string" &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !liesInInertSubtree(event.target) &&
    isRendered(canvasContainer)
  );
}

function liesInInertSubtree(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[inert]") !== null;
}

/**
 * Whether a key reaches an element the host made inert or hid, before the browser moved the focus
 * off it. The diagram's own chrome (the label editor, the palette toolbar) leaves such a key to the
 * page, as the canvas does.
 */
export function isKeyOnHiddenTarget(event: Event): boolean {
  const target = event.target;
  return liesInInertSubtree(target) || (target instanceof Element && !isRendered(target));
}

/**
 * `opacity: 0` keeps the focus and the keys. Without `checkVisibility` (Safari before 17.4) the
 * browser's focus fixup alone has to do.
 */
function isRendered(element: Element): boolean {
  return (
    typeof element.checkVisibility !== "function" ||
    element.checkVisibility({ visibilityProperty: true })
  );
}

/** Enter or Space on an entry dispatches a click without a pointer, so its detail is 0. */
function isPointerClick(event: Event | undefined): boolean {
  return ((event as MouseEvent | undefined)?.detail ?? 0) > 0;
}
