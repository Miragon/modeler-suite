/**
 * Whether a key press belongs to an IME composition. `isComposing` alone misses Safari: it sends
 * the keydown of the Enter that confirms a composition after `compositionend`, with `isComposing`
 * false and the `keyCode` 229 that every engine gives a key the IME took.
 */
export function isImeCompositionKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}
