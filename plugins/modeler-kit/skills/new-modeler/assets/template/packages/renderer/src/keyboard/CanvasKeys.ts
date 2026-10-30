import type EventBus from 'diagram-js/lib/core/EventBus';

/** Ahead of every other key listener; diagram-js's own run at 1500 at most. */
const GUARD_PRIORITY = 10000;

/**
 * diagram-js binds the keyboard to the canvas `<svg>`, so a key acts only while the canvas holds
 * the focus. A canvas the host made `inert` keeps the focus until the browser's next rendering
 * update, where Chromium moves it off, so a key that comes before it still reaches the `<svg>`: it
 * stays the page's too.
 */
export default class CanvasKeys {
  static $inject = ['eventBus'];

  constructor(eventBus: EventBus) {
    eventBus.on('keyboard.keydown', GUARD_PRIORITY, (event: { keyEvent: KeyboardEvent }) =>
      liesInInertSubtree(event.keyEvent.target) ? false : undefined,
    );
  }
}

function liesInInertSubtree(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[inert]') !== null;
}
