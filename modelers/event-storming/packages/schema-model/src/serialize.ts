import { eventStormingBoardSchema } from "./schema.js";
import { migrate, CURRENT_SCHEMA_VERSION } from "./migrations.js";
import { HOST_STICKY_KINDS } from "./attachments.js";
import { assertElementsDrawable } from "./drawable.js";
import { compareCodeUnits } from "./order.js";
import type { BoardConfig, EventStormingBoard } from "./types.js";

/** Number of decimal places for coordinates in serialization. */
const COORD_PRECISION = 3;

/**
 * The serializer writes an object or array that sits in several places at each of them. An object
 * that holds the level below twice would need memory doubling with every level, and a wide object
 * held a thousand times would need a thousand copies of it. So each time the serializer writes a
 * container again, it counts that container's entries; no real board repeats this many. A board
 * that shares nothing counts none, however large it is.
 */
const MAX_REPEATED_ENTRIES = 1_000_000;

// The 8 sticky kinds — the only legal arrow endpoints. Notes/drawings are annotations; the
// renderer's connection rules forbid them and the DSL cannot reference them, so accepting
// such edges here would mean silent loss on the next DSL round-trip.
const CONNECTABLE_TYPES: ReadonlySet<string> = new Set([
  "event",
  "command",
  "actor",
  "aggregate",
  "policy",
  "readmodel",
  "external",
  "hotspot",
]);

const HOST_TYPES: ReadonlySet<string> = new Set(HOST_STICKY_KINDS);

function withArticle(elementType: string | undefined): string {
  return `${/^[aeiou]/.test(elementType ?? "") ? "an" : "a"} ${elementType}`;
}

function round(n: number, digits = COORD_PRECISION): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Validates arbitrary data against the schema plus additional cross-field invariants
 * (unique IDs, edge endpoints exist and are sticky kinds). Throws on violation.
 */
export function validateBoard(data: unknown): EventStormingBoard {
  const parsed = eventStormingBoardSchema.parse(data);

  const ids = new Set<string>();
  const typeById = new Map<string, string>();
  for (const el of parsed.elements) {
    if (ids.has(el.id)) throw new Error(`Duplicate element id: ${el.id}`);
    ids.add(el.id);
    typeById.set(el.id, el.elementType);
  }

  // Pinning: the host must exist and be of a host kind — actor/hotspot/note/drawing are never
  // hosts (no attach chains), which also rules out self-attachment.
  for (const el of parsed.elements) {
    if (!("attachedTo" in el) || el.attachedTo === undefined) continue;
    if (!ids.has(el.attachedTo)) {
      throw new Error(`Element ${el.id}: attachedTo "${el.attachedTo}" references no element.`);
    }
    if (!HOST_TYPES.has(typeById.get(el.attachedTo)!)) {
      throw new Error(
        `Element ${el.id}: attachedTo "${el.attachedTo}" is ${withArticle(typeById.get(el.attachedTo))}, but actors/hotspots/notes may only attach to host stickies.`,
      );
    }
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
    if (!CONNECTABLE_TYPES.has(typeById.get(edge.from)!)) {
      throw new Error(
        `Edge ${edge.id}: source "${edge.from}" is ${withArticle(typeById.get(edge.from))}, but arrows may only connect stickies.`,
      );
    }
    if (!CONNECTABLE_TYPES.has(typeById.get(edge.to)!)) {
      throw new Error(
        `Edge ${edge.id}: target "${edge.to}" is ${withArticle(typeById.get(edge.to))}, but arrows may only connect stickies.`,
      );
    }
  }

  return parsed as unknown as EventStormingBoard;
}

/**
 * Reads a stored board (JSON): migrates and validates it, and refuses one with a coordinate or size
 * beyond ±1e38, which the canvas could not draw and would stop importing half-way through.
 */
export function loadBoard(data: unknown): EventStormingBoard {
  const migrated = migrate(data);
  // Ahead of the schema: a JSON number too large for a double (1e400) reads as Infinity, which the
  // schema refuses without saying that the board lies beyond the canvas.
  assertElementsDrawable(migrated["elements"]);
  return validateBoard(migrated);
}

export function parseBoardJSON(json: string): EventStormingBoard {
  return loadBoard(JSON.parse(json) as unknown);
}

/**
 * Deterministic serialization: stable (alphabetical) key order, elements/edges sorted by `id` (by
 * UTF-16 code unit, not by locale, so in the same order on every machine), coordinates rounded to
 * 3 decimal places. Produces clean Git diffs and reliable change detection. An object or array
 * that sits in several places is written at each of them, and its entries count at every place
 * after the first: past 1,000,000 such repeated entries it throws, and so does a value that
 * contains itself. A board that shares nothing has no such limit.
 */
export function serializeBoard(board: EventStormingBoard): string {
  const path = new ContainerPath();
  return stableStringify(canonicalize(board, path), path);
}

function canonicalize(board: EventStormingBoard, path: ContainerPath): EventStormingBoard {
  const elements = [...board.elements]
    .sort((a, b) => compareCodeUnits(a.id, b.id))
    .map((el) => roundNumbers(el, path) as EventStormingBoard["elements"][number]);
  const edges = [...board.edges].sort((a, b) => compareCodeUnits(a.id, b.id));
  return {
    ...board,
    config: roundNumbers(board.config, path) as BoardConfig,
    elements,
    edges,
  };
}

/**
 * The objects and arrays the serializer is inside of. One per serialization, shared by the rounded
 * copy and the sorted copy, so a value that sits in several places of the board counts at every
 * place, whichever copy writes it. Entering and leaving add no call to the walk's recursion, so a
 * board nests as deep as it did before the count.
 */
class ContainerPath {
  // Only the containers on the current path: one object in several places is no cycle.
  private readonly ancestors = new Set<object>();
  private readonly writtenContainers = new WeakSet<object>();
  private repeatedEntries = 0;

  enter(container: object): void {
    if (this.ancestors.has(container)) throw new Error("Cyclic reference in EventStormingBoard.");
    if (this.writtenContainers.has(container)) {
      this.repeatedEntries += Array.isArray(container)
        ? container.length
        : Object.keys(container).length;
      if (this.repeatedEntries > MAX_REPEATED_ENTRIES) {
        throw new Error(
          `Cannot serialize a board whose shared objects and arrays would repeat more than ${MAX_REPEATED_ENTRIES} entries.`,
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

export function createEmptyBoard(title = "Untitled Board"): EventStormingBoard {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    config: { title },
    elements: [],
    edges: [],
  };
}
