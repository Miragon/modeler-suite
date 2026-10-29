/**
 * Enter and Escape that confirm or cancel an IME candidate belong to the composition. `isComposing`
 * alone misses Safari: it sends the confirming Enter after `compositionend`, with `isComposing`
 * false and the `keyCode` 229 that every engine gives a key the IME took.
 */
export function isImeCompositionKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}
