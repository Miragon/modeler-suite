import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';

/** Ahead of every other key listener; diagram-js's own run at 1500 at most. */
const GUARD_PRIORITY = 10000;

/**
 * diagram-js binds the keyboard to the canvas `<svg>`, so a key acts only while the canvas holds
 * the focus. On top of that the canvas leaves alone a key the host has handled already, a key an
 * input method composes, and a key that reaches a canvas the host has made `inert` or hidden with
 * `display: none`: Chromium moves the focus off it only at its next rendering update, so a key
 * that comes before it still reaches the `<svg>`.
 */
export default class CanvasKeys {
  static $inject = ['eventBus', 'canvas'];

  constructor(eventBus: EventBus, canvas: Canvas) {
    eventBus.on('keyboard.keydown', GUARD_PRIORITY, (event: { keyEvent: KeyboardEvent }) =>
      isCanvasKey(event.keyEvent, canvas.getContainer()) ? undefined : false,
    );
  }
}

function isCanvasKey(event: KeyboardEvent, canvasContainer: HTMLElement): boolean {
  return (
    !event.defaultPrevented &&
    !isImeCompositionKey(event) &&
    !liesInInertSubtree(event.target) &&
    isRendered(canvasContainer)
  );
}

/**
 * `isComposing` alone misses Safari: it sends the key that confirms a candidate after
 * `compositionend`, with `isComposing` false and the `keyCode` 229 every engine gives a key the
 * input method took.
 */
function isImeCompositionKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

function liesInInertSubtree(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[inert]') !== null;
}

/** Without `checkVisibility` (Safari before 17.4) the browser's focus fixup alone has to do. */
function isRendered(element: Element): boolean {
  return typeof element.checkVisibility !== 'function' || element.checkVisibility();
}
