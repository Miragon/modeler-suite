import { wardleyMapSchema } from "./schema.js";
import { migrate, CURRENT_SCHEMA_VERSION } from "./migrations.js";
import { DEFAULT_MAP_TITLE, type MapConfig, type WardleyMap } from "./types.js";

/** Number of decimal places for coordinates in serialization (concept doc §7.1). */
const COORD_PRECISION = 3;

/**
 * The serializer writes an object or array that sits in several places at each of them. An object
 * that holds the level below twice would need memory doubling with every level, and a wide object
 * held a thousand times would need a thousand copies of it. So each time the serializer writes a
 * container again, it counts that container's entries; no real map repeats this many. A map that
 * shares nothing counts none, however large it is.
 */
const MAX_REPEATED_ENTRIES = 1_000_000;

function round(n: number, digits = COORD_PRECISION): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Validates arbitrary data against the schema plus additional cross-field invariants
 * (unique IDs, edge endpoints exist). Throws on violation.
 */
export function validateMap(data: unknown): WardleyMap {
  const parsed = wardleyMapSchema.parse(data);

  const ids = new Set<string>();
  for (const el of parsed.elements) {
    if (ids.has(el.id)) throw new Error(`Duplicate element id: ${el.id}`);
    ids.add(el.id);
  }

  // Shared ID namespace: diagram-js' ElementRegistry has only ONE namespace for
  // shapes and connections — an edge with an element ID would crash the import midway.
  const edgeIds = new Set<string>();
  for (const edge of parsed.edges) {
    if (edgeIds.has(edge.id)) throw new Error(`Duplicate edge id: ${edge.id}`);
    if (ids.has(edge.id)) throw new Error(`Edge id collides with element id: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!ids.has(edge.from)) {
      throw new Error(`Edge ${edge.id}: source "${edge.from}" references no element.`);
    }
    if (!ids.has(edge.to)) {
      throw new Error(`Edge ${edge.id}: target "${edge.to}" references no element.`);
    }
  }

  return parsed as unknown as WardleyMap;
}

export function loadMap(data: unknown): WardleyMap {
  return validateMap(migrate(data));
}

export function parseMapJSON(json: string): WardleyMap {
  return loadMap(JSON.parse(json) as unknown);
}

/**
 * Deterministic serialization: stable (alphabetical) key order, elements/edges sorted by `id`,
 * coordinates rounded to 3 decimal places. Produces clean Git diffs and reliable change
 * detection (concept doc §7.1). An object or array that sits in several places is written at
 * each of them, and its entries count at every place after the first: past 1,000,000 such
 * repeated entries it throws, and so does a value that contains itself. A map that shares
 * nothing has no such limit.
 */
export function serializeMap(map: WardleyMap): string {
  const path = new ContainerPath();
  return stableStringify(canonicalize(map, path), path);
}

function canonicalize(map: WardleyMap, path: ContainerPath): WardleyMap {
  const elements = [...map.elements]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((el) => roundNumbers(el, path) as WardleyMap["elements"][number]);
  const edges = [...map.edges].sort((a, b) => a.id.localeCompare(b.id));
  return {
    ...map,
    config: roundNumbers(map.config, path) as MapConfig,
    elements,
    edges,
  };
}

/**
 * The objects and arrays the serializer is inside of. One per serialization, shared by the rounded
 * copy and the sorted copy, so a value that sits in several places of the map counts at every
 * place, whichever copy writes it. Entering and leaving add no call to the walk's recursion, so a
 * map nests as deep as it did before the count.
 */
class ContainerPath {
  // Only the containers on the current path: one object in several places is no cycle.
  private readonly ancestors = new Set<object>();
  private readonly writtenContainers = new WeakSet<object>();
  private repeatedEntries = 0;

  enter(container: object): void {
    if (this.ancestors.has(container)) throw new Error("Cyclic reference in WardleyMap.");
    if (this.writtenContainers.has(container)) {
      this.repeatedEntries += Array.isArray(container)
        ? container.length
        : Object.keys(container).length;
      if (this.repeatedEntries > MAX_REPEATED_ENTRIES) {
        throw new Error(
          `Cannot serialize a map whose shared objects and arrays would repeat more than ${MAX_REPEATED_ENTRIES} entries.`,
        );
      }
    } else {
      this.writtenContainers.add(container);
    }
    this.ancestors.add(container);
  }

  leave(container: object): void {
    this.ancestors.delete(container);
  }
}

function roundNumbers<T>(value: T, path: ContainerPath): T {
  if (typeof value === "number") return round(value) as unknown as T;
  if (!value || typeof value !== "object") return value;
  path.enter(value);
  let out: unknown;
  if (Array.isArray(value)) {
    out = value.map((v) => roundNumbers(v, path));
  } else {
    const record: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      record[k] = roundNumbers(v, path);
    }
    out = record;
  }
  path.leave(value);
  return out as T;
}

function stableStringify(value: unknown, path: ContainerPath): string {
  const sortDeep = (v: unknown): unknown => {
    if (!v || typeof v !== "object") return v;
    path.enter(v);
    let out: unknown;
    if (Array.isArray(v)) {
      out = v.map(sortDeep);
    } else {
      const record: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        record[key] = sortDeep((v as Record<string, unknown>)[key]);
      }
      out = record;
    }
    path.leave(v);
    return out;
  };
  return JSON.stringify(sortDeep(value), null, 2) + "\n";
}

export function createEmptyMap(title = DEFAULT_MAP_TITLE): WardleyMap {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    config: { title },
    elements: [],
    edges: [],
  };
}
