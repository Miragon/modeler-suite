/**
 * The board file: one JSON header line, then one JSON line per element sorted by id, a trailing
 * newline. A change of one element changes one line, so a Git diff, a review and a merge read
 * element by element.
 *
 *     {"format":"structured-model","meta":{"title":"Workshop","version":1},"version":1}
 *     {"id":"e_1","kind":"edge","source":"n_a","target":"n_b"}
 *     {"height":160,"id":"n_a","kind":"node","text":"A note","type":"text","width":240,"x":0,"y":0,"z":"a"}
 *
 * The format is designIQ's house format for element-wise documents; the two implementations write
 * the same bytes for the same board.
 */
import type { BoardSnapshot } from "./types.js";

/** the header's format tag: persisted in every board file, never renamed */
export const BOARD_FORMAT = "structured-model";
/** the format version this build reads and writes */
export const BOARD_FORMAT_VERSION = 1;
const HEADER_KEYS: ReadonlySet<string> = new Set(["format", "version", "meta"]);

/** object keys sorted at every depth, so that the same value always serializes to the same text */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * The canonical text of a board: the same snapshot gives the same bytes, whatever the order its
 * elements and attributes were put in.
 */
export function encodeBoard(snapshot: BoardSnapshot): string {
  const lines = [
    JSON.stringify(
      canonicalize({ format: BOARD_FORMAT, version: BOARD_FORMAT_VERSION, meta: snapshot.meta }),
    ),
  ];
  for (const id of Object.keys(snapshot.elements).sort()) {
    // the map key is the element's id: an attribute named "id" never re-keys it
    lines.push(JSON.stringify(canonicalize({ ...snapshot.elements[id], id })));
  }
  return `${lines.join("\n")}\n`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Any text as a board, never a failure: a line that is no element and no header is skipped. For a
 * reader that must not stop (a listing, a seed). Whoever edits the board and writes it back reads
 * with `parseBoardText` instead, since what this skips the next `encodeBoard` drops.
 */
export function decodeBoard(text: string): BoardSnapshot {
  // null prototype: an element id like "constructor" is an own key, never an inherited member
  const elements = Object.create(null) as BoardSnapshot["elements"];
  let meta: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObject(parsed)) continue;
    // a header never carries an id
    if (parsed.format === BOARD_FORMAT && typeof parsed.id !== "string") {
      if (isObject(parsed.meta)) meta = parsed.meta;
      continue;
    }
    if (typeof parsed.id === "string" && parsed.id.length > 0) {
      const { id, ...attrs } = parsed;
      elements[id] = attrs;
    }
  }
  return { elements: { ...elements }, meta };
}

export type ParsedBoard = { ok: true; snapshot: BoardSnapshot } | { ok: false; reason: string };

/**
 * The snapshot of a board text, or why it is refused. Accepted: an empty text (a new board), and
 * a text with exactly one header and any number of element lines in any order, each a JSON object
 * with a non-empty string `id` that no other line has. Attributes and element kinds this build
 * does not know are kept. Refused as a whole: a text holding anything `encodeBoard` would not
 * write back (a line that is no JSON, a second header, a repeated id, a header of another
 * version), so that an editor keeps the board it shows instead of losing a part of it.
 */
export function parseBoardText(text: string): ParsedBoard {
  const refuse = (line: number, why: string): ParsedBoard => ({
    ok: false,
    reason: `line ${line} ${why}`,
  });
  const elements = Object.create(null) as BoardSnapshot["elements"];
  let meta: Record<string, unknown> | undefined;
  let rows = 0;
  let number = 0;
  for (const line of text.split("\n")) {
    number++;
    if (line.trim() === "") continue;
    rows++;
    // assigned as a prototype by plain-object readers and lost: it would not be written back
    if (line.includes('"__proto__"')) return refuse(number, "has a key named __proto__");
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return refuse(number, "is no JSON");
    }
    if (!isObject(parsed)) return refuse(number, "is no JSON object");
    if (typeof parsed.id === "string" && parsed.id.length > 0) {
      if (Object.hasOwn(elements, parsed.id)) {
        return refuse(number, `repeats the element id ${parsed.id}`);
      }
      const { id, ...attrs } = parsed;
      elements[id] = attrs;
      continue;
    }
    if (parsed.format !== BOARD_FORMAT) {
      return refuse(number, "is neither the header nor an element with an id");
    }
    if (meta !== undefined) return refuse(number, "is a second header");
    if (parsed.version !== BOARD_FORMAT_VERSION) {
      return refuse(
        number,
        `has the format version ${JSON.stringify(parsed.version)}, this board reads ${BOARD_FORMAT_VERSION}`,
      );
    }
    const unknown = Object.keys(parsed).filter((key) => !HEADER_KEYS.has(key));
    if (unknown.length > 0) {
      return refuse(
        number,
        `has header keys the board would not write back: ${unknown.join(", ")}`,
      );
    }
    if (!isObject(parsed.meta)) return refuse(number, "has a header without a meta object");
    meta = parsed.meta;
  }
  // elements without a header: some other tool's JSON lines, not a board
  if (rows > 0 && meta === undefined) {
    return { ok: false, reason: "the text has no header line: not a board file" };
  }
  return { ok: true, snapshot: { elements: { ...elements }, meta: meta ?? {} } };
}

/** the text of a new, empty board with this title */
export function newBoardText(title: string): string {
  // one line: a title is a label, not a paragraph
  const oneLine = title.replace(/\s+/g, " ").trim();
  return encodeBoard({ elements: {}, meta: { title: oneLine, version: 1 } });
}
