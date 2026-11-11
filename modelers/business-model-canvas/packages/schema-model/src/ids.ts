const STICKY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** diagram-js keeps its elements in a plain object, so these names can never be element ids. */
const RESERVED_IDS: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(Object.prototype));

export function isUsableStickyId(id: string): boolean {
  return STICKY_ID_PATTERN.test(id) && !RESERVED_IDS.has(id);
}
