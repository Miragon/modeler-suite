/**
 * Where the armed editor takes input, whatever the strategy: the armed node's body, the overlay
 * layer (it holds armed hosts only) and the body-level popup host of `counter`. A press inside an
 * embed frame never reaches this document, so `iframe` has no held press here.
 */
export const ARMED_EDITOR =
  '.board-node[data-armed="true"] > .board-node__body, .board-overlay-layer, .board-popup-host';
export const inArmedEditor = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(ARMED_EDITOR) !== null;
