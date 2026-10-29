/**
 * The copy of the fields a document carries that this modeler does not know, in canonical form.
 * Not part of the package's API: `foreign.ts` copies with a new copier on every call, the
 * serializer with one copier for the whole document, so a value the document shares counts at
 * every place.
 */

/**
 * A copy holds an object or array that sits in several places at each of them. An object that
 * holds the level below twice would need memory doubling with every level, and a wide object held
 * a thousand times would need a thousand copies of it. So each time a copier copies a container
 * again, it counts that container's entries; no real document repeats this many. A document that
 * shares nothing counts none, however large it is.
 */
const MAX_REPEATED_ENTRIES = 1_000_000;

/** Copies one value into canonical form. */
export type CanonicalCopy = (value: unknown) => unknown;

/**
 * A copier for one document. JSON objects have no key order, so nested keys are sorted too: equal
 * data, equal bytes. A value that sits in several places is copied at each of them, and its
 * entries count at every place after the first: past {@link MAX_REPEATED_ENTRIES} such repeated
 * entries it throws, and so does a value that contains itself.
 */
export function canonicalCopier(): CanonicalCopy {
  // Only the containers on the current path: one object in several places is no cycle.
  const ancestors = new Set<object>();
  const copiedContainers = new WeakSet<object>();
  let repeatedEntries = 0;
  const copy = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (ancestors.has(value)) throw new Error("Cannot serialize a cyclic document.");
    if (copiedContainers.has(value)) {
      repeatedEntries += Array.isArray(value) ? value.length : Object.keys(value).length;
      if (repeatedEntries > MAX_REPEATED_ENTRIES) {
        throw new Error(
          `Cannot serialize a document whose shared objects and arrays would repeat more than ${MAX_REPEATED_ENTRIES} entries.`,
        );
      }
    } else {
      copiedContainers.add(value);
    }
    ancestors.add(value);
    const record = value as Record<string, unknown>;
    const copied = Array.isArray(value)
      ? value.map(copy)
      : Object.fromEntries(
          Object.keys(record)
            .filter((key) => record[key] !== undefined)
            .sort()
            .map((key) => [key, copy(record[key])]),
        );
    ancestors.delete(value);
    return copied;
  };
  return copy;
}

/** The fields of `value` outside `knownFields`, copied by `copy`, or undefined when there are none. */
export function copyForeignFields(
  value: object,
  knownFields: readonly string[],
  copy: CanonicalCopy,
): Readonly<Record<string, unknown>> | undefined {
  const record = value as Record<string, unknown>;
  const names = Object.keys(record)
    .filter((name) => !knownFields.includes(name) && record[name] !== undefined)
    .sort();
  if (names.length === 0) return undefined;
  return Object.fromEntries(names.map((name) => [name, copy(record[name])]));
}

/**
 * `known` followed by the foreign fields of `source`, copied by `copy`. Built from entries, never
 * by assignment, so a field named `__proto__` stays a field instead of replacing the prototype.
 */
export function appendForeignFields<T extends object>(
  known: T,
  source: object | undefined,
  knownFields: readonly string[],
  copy: CanonicalCopy,
): T {
  const foreign = source ? copyForeignFields(source, knownFields, copy) : undefined;
  if (!foreign) return known;
  return Object.fromEntries([...Object.entries(known), ...Object.entries(foreign)]) as T;
}
