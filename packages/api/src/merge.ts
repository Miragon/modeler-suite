/**
 * The three-way merge of a document's text (1.7). A host whose file can change under the user's
 * unsaved edits (an agent writing the file an IDE editor shows) calls it with the text both sides
 * started from, the outside text and the user's draft, and writes the result.
 *
 * Laws (the kit's merge cases check each one):
 *
 * - `merge(base, base, draft) === draft` and `merge(base, external, base) === external`;
 * - `merge(base, same, same) === same`;
 * - changes to different elements are all kept, in a text the modeler imports;
 * - two different changes to the same element (or a change on one side and a delete on the
 *   other) throw a {@link MergeConflictError}, so the host lets the person decide;
 * - a text that does not parse throws a {@link MergeConflictError} too;
 * - the result is deterministic: the same three texts give the same text.
 *
 * Every text it gets and returns is canonical (`exportText` output); the result is canonical too.
 */
export type ModelTextMerge = (
  lastSyncedText: string,
  externalText: string,
  draftText: string,
) => string;

const MERGE_CONFLICT = "MergeConflictError";

/** A merge that cannot keep both sides. `conflictingIds` names the elements both sides changed. */
export class MergeConflictError extends Error {
  override readonly name = MERGE_CONFLICT;
  readonly conflictingIds: readonly string[];

  constructor(conflictingIds: readonly string[], message?: string) {
    super(
      message ??
        (conflictingIds.length > 0
          ? `both sides changed ${conflictingIds.join(", ")}`
          : "the texts cannot be merged"),
    );
    this.conflictingIds = conflictingIds;
  }
}

/**
 * Whether `error` is a {@link MergeConflictError}, also one from another copy of this package
 * (a bundle that inlines it), where `instanceof` fails.
 */
export function isMergeConflict(error: unknown): error is MergeConflictError {
  return error instanceof Error && error.name === MERGE_CONFLICT;
}

export type MergeResult<T> =
  | { readonly merged: T; readonly conflictingIds?: undefined }
  | { readonly merged?: undefined; readonly conflictingIds: string[] };

export type SameItem<T> = (a: T, b: T) => boolean;

/** Structural equality of JSON-like values: what a parsed document holds. */
export function sameJsonValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameJsonValue(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const definedKeys = (record: Record<string, unknown>): string[] =>
    Object.keys(record).filter((key) => record[key] !== undefined);
  const leftKeys = definedKeys(left);
  return (
    leftKeys.length === definedKeys(right).length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && sameJsonValue(left[key], right[key]))
  );
}

function sameOrBothAbsent<T>(a: T | undefined, b: T | undefined, isSame: SameItem<T>): boolean {
  if (a === undefined || b === undefined) return a === b;
  return isSame(a, b);
}

/**
 * The three-way merge of one value: the side that changed it wins, both sides making the same
 * change agree, two different changes conflict. `undefined` stands for an absent value.
 */
export function mergeValue<T>(
  lastSynced: T | undefined,
  external: T | undefined,
  draft: T | undefined,
  isSame: SameItem<T> = sameJsonValue,
): { readonly merged: T | undefined } | { readonly conflict: true } {
  if (sameOrBothAbsent(external, lastSynced, isSame)) return { merged: draft };
  if (sameOrBothAbsent(draft, lastSynced, isSame)) return { merged: external };
  if (sameOrBothAbsent(external, draft, isSame)) return { merged: external };
  return { conflict: true };
}

export interface ItemsMergeOptions<T> {
  /** the item's key; default: its `id` */
  idOf?: ((item: T) => string) | undefined;
  /** whether two items with one key are the same; default: {@link sameJsonValue} */
  isSameItem?: SameItem<T> | undefined;
}

function indexById<T>(
  items: readonly T[],
  idOf: (item: T) => string,
): {
  readonly byId: Map<string, T>;
  readonly order: string[];
  readonly duplicates: Set<string>;
} {
  const byId = new Map<string, T>();
  const order: string[] = [];
  const duplicates = new Set<string>();
  for (const item of items) {
    const id = idOf(item);
    if (byId.has(id)) duplicates.add(id);
    else {
      byId.set(id, item);
      order.push(id);
    }
  }
  return { byId, order, duplicates };
}

function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * The order of the merged items: the order of the side that reordered (the draft when the outside
 * kept the order), with the other side's new items after the item that precedes them there.
 */
function mergedOrder(
  lastSynced: readonly string[],
  external: readonly string[],
  draft: readonly string[],
  kept: ReadonlySet<string>,
): string[] {
  const externalKeptTheOrder = sameSequence(lastSynced, external);
  const leading = externalKeptTheOrder ? draft : external;
  const following = externalKeptTheOrder ? external : draft;
  const order = leading.filter((id) => kept.has(id));
  const placed = new Set(order);
  let previous: string | undefined;
  for (const id of following) {
    if (kept.has(id) && !placed.has(id)) {
      const at = previous === undefined ? 0 : order.indexOf(previous) + 1;
      order.splice(at, 0, id);
      placed.add(id);
    }
    if (placed.has(id)) previous = id;
  }
  return order;
}

/**
 * The three-way merge of a list of keyed items, the elements of a document: per key, the side
 * that changed, added or removed the item wins (see {@link mergeValue}); two different changes,
 * a change against a removal, or a key that occurs twice in one list conflict. Without a conflict
 * `merged` holds the items in a deterministic order; otherwise `conflictingIds` names the keys,
 * in the order they first occur.
 */
export function mergeItemsById<T extends { readonly id: string }>(
  lastSynced: readonly T[],
  external: readonly T[],
  draft: readonly T[],
  options?: Omit<ItemsMergeOptions<T>, "idOf">,
): MergeResult<T[]>;
export function mergeItemsById<T>(
  lastSynced: readonly T[],
  external: readonly T[],
  draft: readonly T[],
  options: ItemsMergeOptions<T> & { idOf: (item: T) => string },
): MergeResult<T[]>;
export function mergeItemsById<T>(
  lastSynced: readonly T[],
  external: readonly T[],
  draft: readonly T[],
  options: ItemsMergeOptions<T> = {},
): MergeResult<T[]> {
  const idOf = options.idOf ?? ((item: T) => (item as { readonly id: string }).id);
  const isSameItem = options.isSameItem ?? sameJsonValue;
  const sides = [lastSynced, external, draft].map((items) => indexById(items, idOf));
  const [base, outside, mine] = sides as [
    ReturnType<typeof indexById<T>>,
    ReturnType<typeof indexById<T>>,
    ReturnType<typeof indexById<T>>,
  ];
  const allIds = [...new Set([...base.order, ...outside.order, ...mine.order])];
  const conflictingIds: string[] = [];
  const mergedById = new Map<string, T>();
  for (const id of allIds) {
    if (sides.some((side) => side.duplicates.has(id))) {
      conflictingIds.push(id);
      continue;
    }
    const result = mergeValue(
      base.byId.get(id),
      outside.byId.get(id),
      mine.byId.get(id),
      isSameItem,
    );
    if ("conflict" in result) conflictingIds.push(id);
    else if (result.merged !== undefined) mergedById.set(id, result.merged);
  }
  if (conflictingIds.length > 0) return { conflictingIds };
  const order = mergedOrder(base.order, outside.order, mine.order, new Set(mergedById.keys()));
  return { merged: order.map((id) => mergedById.get(id) as T) };
}

export interface RecordMergeOptions<T> {
  /** Fields that hold lists of elements with an `id`, merged by `mergeItemsById`. */
  keyedLists?: ReadonlyArray<keyof T & string> | undefined;
}

/**
 * The three-way merge of a JSON document: each field of `keyedLists` by element id
 * (`mergeItemsById`), every other field, known or foreign, as one value (`mergeValue`). The
 * conflicts name the elements' ids and the other fields' names.
 */
export function mergeRecord<T extends object>(
  lastSynced: T,
  external: T,
  draft: T,
  options: RecordMergeOptions<T> = {},
): MergeResult<T> {
  const [base, outside, mine] = [lastSynced, external, draft] as unknown as Array<
    Record<string, unknown>
  >;
  const lists = new Set<string>(options.keyedLists ?? []);
  const keys = new Set([...Object.keys(base!), ...Object.keys(outside!), ...Object.keys(mine!)]);
  const merged: Record<string, unknown> = {};
  const conflictingIds: string[] = [];
  for (const key of keys) {
    if (lists.has(key)) {
      const asList = (value: unknown) =>
        (Array.isArray(value) ? value : []) as Array<{ id: string }>;
      const result = mergeItemsById(asList(base![key]), asList(outside![key]), asList(mine![key]));
      if (result.conflictingIds) conflictingIds.push(...result.conflictingIds);
      else merged[key] = result.merged;
      continue;
    }
    const result = mergeValue(base![key], outside![key], mine![key]);
    if ("conflict" in result) conflictingIds.push(key);
    else if (result.merged !== undefined) merged[key] = result.merged;
  }
  return conflictingIds.length > 0 ? { conflictingIds } : { merged: merged as T };
}
