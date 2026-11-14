import {
  CST,
  Lexer,
  Parser,
  isCollection,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  visit,
  type Document,
  type YAMLMap,
} from "yaml";
import {
  FORMAT_VERSION,
  isBlockId,
  isKnownColor,
  isStickyColumns,
  isUsableStickyId,
  type Attribute,
  type Block,
  type BlockId,
  type CanvasDocument,
  type JsonValue,
  type Note,
  type Sticky,
} from "@miragon/business-model-canvas-schema-model";
import {
  BLOCK_FIELDS,
  CANVAS_FIELDS,
  NOTE_FIELDS,
  ROOT_FIELDS,
  STICKY_FIELDS,
  type JsonObject,
} from "./fields.js";

/** Where in the file a finding is: the keys and list indexes from the root, `[]` for the text. */
export type JsonPath = (string | number)[];

/** Offsets into the text, the end excluded. */
export type TextRange = [start: number, end: number];

export interface Diagnostic {
  path: JsonPath;
  message: string;
  /** An error keeps the text from opening as a canvas; a warning is something kept as it is. */
  severity: "error" | "warning";
  /** What the finding is about in the text: the value at `path`, or a mark without a path. */
  range: TextRange;
}

export interface ParseResult {
  /** The canvas the text describes; empty when an error left no canvas to read. */
  document: CanvasDocument;
  diagnostics: Diagnostic[];
}

/** How deep a field the canvas does not know may nest: deeper ones would overflow the stack. */
const MAX_NESTING_DEPTH = 32;

/** Far above any canvas, and short enough that no text of this size stalls the YAML reader. */
export const MAX_TEXT_LENGTH = 1024 * 1024;

/** The findings a text reports at most, so a text of thousands of mistakes stays quick to show. */
const MAX_FINDINGS = 100;

const NESTING_ERROR = `Nests deeper than ${MAX_NESTING_DEPTH} levels.`;
const COMMENT_WARNING = "Comments are not kept when the canvas saves; write a note instead.";

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const NOTE_EXAMPLE = "{ text: … }";
const ITEM_EXAMPLE = "{ id: shop, text: Shop }";

/** `channels.items[2].id`, the way a person names a place in the file. */
function pathLabel(path: JsonPath): string {
  return path.reduce<string>(
    (label, key) =>
      typeof key === "number" ? `${label}[${key}]` : label ? `${label}.${key}` : key,
    "",
  );
}

export function describeDiagnostic({ path, message }: Diagnostic): string {
  return path.length > 0 ? `${pathLabel(path)}: ${message}` : message;
}

type Severity = Diagnostic["severity"];

/** A key as `toJS` names it: `1`, `true` and `~` become "1", "true" and "". */
const keyText = (key: unknown): string | undefined =>
  isScalar(key) ? String(key.value ?? "") : undefined;

type Ranged = { range?: [number, number, number] | null } | null | undefined;

/** The mark of a node: its value, at least one character. */
function markOf(node: Ranged): TextRange | undefined {
  const range = node?.range;
  return range ? [range[0], Math.max(range[1], range[0] + 1)] : undefined;
}

class Reader {
  readonly diagnostics: Diagnostic[] = [];
  private foundError = false;
  private readonly entriesOf = new WeakMap<YAMLMap, Map<string, unknown>>();

  constructor(private readonly yaml: Document) {}

  error(path: JsonPath, message: string): void {
    this.report(path, message, "error");
  }

  warn(path: JsonPath, message: string): void {
    this.report(path, message, "warning");
  }

  /** A finding at a mark of the text that has no path of its own, such as a comment. */
  reportAt(range: TextRange, message: string, severity: Severity): void {
    this.add(severity, () => ({ path: [], message, severity, range }));
  }

  get hasErrors(): boolean {
    return this.foundError;
  }

  private report(path: JsonPath, message: string, severity: Severity): void {
    this.add(severity, () => ({ path, message, severity, range: this.rangeOf(path) }));
  }

  private add(severity: Severity, finding: () => Diagnostic): void {
    if (severity === "error") this.foundError = true;
    if (this.diagnostics.length < MAX_FINDINGS) this.diagnostics.push(finding());
  }

  /** The node at `path`, a key found by its text, since `toJS` turns `1:` into the key "1". */
  private nodeAt(path: JsonPath): unknown {
    let node: unknown = this.yaml.contents;
    for (const key of path) {
      if (isSeq(node) && typeof key === "number") node = node.items[key];
      else if (isMap(node)) node = this.entries(node).get(String(key));
      else return undefined;
    }
    return node;
  }

  /** A map's values by their key's text, found once per map. */
  private entries(map: YAMLMap): Map<string, unknown> {
    let entries = this.entriesOf.get(map);
    if (!entries) {
      entries = new Map(map.items.map((pair) => [keyText(pair.key) ?? "", pair.value]));
      this.entriesOf.set(map, entries);
    }
    return entries;
  }

  /** The value at `path`; for a missing one, the first mark of the map or list that lacks it. */
  private rangeOf(path: JsonPath): TextRange {
    for (let depth = path.length; depth >= 0; depth -= 1) {
      const node = this.nodeAt(path.slice(0, depth));
      const mark = markOf(node as Ranged);
      if (!mark) continue;
      return depth < path.length && isCollection(node) ? [mark[0], mark[0] + 1] : mark;
    }
    return [0, 1];
  }

  /**
   * A field the format reads as text. YAML reads `2`, `1.50` or `true` as a number or a boolean,
   * so those take the scalar as it was written: `version: 1.50` stays "1.50".
   */
  textOf(value: JsonValue | undefined, path: JsonPath): string | undefined {
    if (typeof value === "string") return value;
    if (typeof value !== "number" && typeof value !== "boolean") return undefined;
    const node = this.nodeAt(path);
    return isScalar(node) && typeof node.source === "string" ? node.source : String(value);
  }

  /**
   * Reports the first place in a value the canvas keeps that it could not write back as it was:
   * a number such as `.inf`, or a nesting deep enough to overflow the stack.
   */
  checkKept(value: JsonValue, path: JsonPath): boolean {
    if (path.length > MAX_NESTING_DEPTH) {
      this.error(path, NESTING_ERROR);
      return true;
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      this.error(path, "A number the canvas cannot keep, such as .inf or .nan.");
      return true;
    }
    if (Array.isArray(value)) {
      return value.some((entry, index) => this.checkKept(entry, [...path, index]));
    }
    if (isObject(value)) {
      return Object.entries(value).some(([key, entry]) => this.checkKept(entry, [...path, key]));
    }
    return false;
  }

  /** The fields of `object` outside `known`, in the order of the text. */
  foreignFields(object: JsonObject, known: readonly string[], path: JsonPath): Attribute[] {
    return Object.entries(object)
      .filter(([key]) => !known.includes(key))
      .map(([key, value]) => {
        this.checkKept(value, [...path, key]);
        return { key, value };
      });
  }
}

/** The `canvas` map: its title, the notes on the canvas as a whole and fields of its own. */
function readCanvas(reader: Reader, value: JsonValue): Pick<CanvasDocument, "header" | "notes"> {
  const path = ["canvas"];
  if (!isObject(value)) {
    reader.error(path, "A map with the canvas's title and notes, such as title: Shop.");
    return { header: [], notes: [] };
  }
  const title = "title" in value ? reader.textOf(value["title"], [...path, "title"]) : undefined;
  if ("title" in value && title === undefined) reader.error([...path, "title"], "Text: title: ….");
  const columns = value["columns"];
  const knownColumns = isStickyColumns(columns) ? columns : undefined;
  if ("columns" in value && knownColumns === undefined) {
    reader.error([...path, "columns"], "2, 3 or 4 stickies side by side: columns: 3.");
  }
  return {
    header: [
      ...(title === undefined ? [] : [{ key: "title", value: title }]),
      ...(knownColumns === undefined ? [] : [{ key: "columns", value: knownColumns }]),
      ...reader.foreignFields(value, CANVAS_FIELDS, path),
    ],
    notes: readNotes(reader, value["notes"], [...path, "notes"]),
  };
}

function readNotes(reader: Reader, value: JsonValue | undefined, path: JsonPath): Note[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    reader.error(path, `A list of notes: [${NOTE_EXAMPLE}].`);
    return [];
  }
  return value.flatMap((entry, index): Note[] => {
    const notePath = [...path, index];
    const text = isObject(entry) ? reader.textOf(entry["text"], [...notePath, "text"]) : undefined;
    if (!isObject(entry) || text === undefined) {
      reader.error(notePath, `A note is ${NOTE_EXAMPLE}.`);
      return [];
    }
    return [{ text, attributes: reader.foreignFields(entry, NOTE_FIELDS, notePath) }];
  });
}

function readSticky(
  reader: Reader,
  entry: JsonValue,
  path: JsonPath,
  seen: Map<string, JsonPath>,
): Sticky | undefined {
  if (!isObject(entry)) {
    reader.error(path, `An item is a map: ${ITEM_EXAMPLE}.`);
    return undefined;
  }
  const { color } = entry;
  const id = reader.textOf(entry["id"], [...path, "id"]);
  const text = reader.textOf(entry["text"], [...path, "text"]);
  const sticky: Sticky = {
    id: id ?? "",
    text: text ?? "",
    attributes: reader.foreignFields(entry, STICKY_FIELDS, path),
    notes: readNotes(reader, entry["notes"], [...path, "notes"]),
  };
  if (id === undefined) reader.error(path, "An item needs an id as text: id: shop.");
  else if (!isUsableStickyId(id)) {
    reader.error([...path, "id"], `"${id}" is no usable id: letters, digits, - and _.`);
  } else if (seen.has(id)) {
    reader.error(
      [...path, "id"],
      `Duplicate sticky id "${id}", also at ${pathLabel(seen.get(id)!)}.`,
    );
  } else seen.set(id, path);
  if (text === undefined) reader.error(path, "An item needs a text: text: ….");
  if (typeof color === "string" && isKnownColor(color)) sticky.color = color;
  else if (color === null) {
    reader.warn(
      [...path, "color"],
      'No colour. A hex colour needs quotes, # starts a comment: color: "#RRGGBB".',
    );
  } else if (color !== undefined) {
    reader.warn(
      [...path, "color"],
      `${JSON.stringify(color)} is no palette colour, #RGB or #RRGGBB; kept as it is.`,
    );
    sticky.attributes.push({ key: "color", value: color });
  }
  return sticky;
}

function readBlock(
  reader: Reader,
  blockId: BlockId,
  value: JsonValue,
  seen: Map<string, JsonPath>,
): Block | undefined {
  if (!isObject(value)) {
    reader.error([blockId], `A block is a map: { items: [${ITEM_EXAMPLE}] }.`);
    return undefined;
  }
  const { items } = value;
  if (items !== undefined && !Array.isArray(items)) {
    reader.error([blockId, "items"], `A list of items: [${ITEM_EXAMPLE}].`);
  }
  const block: Block = {
    blockId,
    items: Array.isArray(items)
      ? items.flatMap(
          (entry, index) => readSticky(reader, entry, [blockId, "items", index], seen) ?? [],
        )
      : [],
    notes: readNotes(reader, value["notes"], [blockId, "notes"]),
    attributes: reader.foreignFields(value, BLOCK_FIELDS, [blockId]),
  };
  for (const { key } of block.attributes) {
    reader.warn([blockId, key], "No field of a block (items, notes); kept as it is.");
  }
  return block;
}

function readRoot(reader: Reader, root: JsonObject): CanvasDocument {
  const document: CanvasDocument = { header: [], notes: [], blocks: [], extras: [] };
  const seen = new Map<string, JsonPath>();
  if (root["version"] !== undefined && root["version"] !== FORMAT_VERSION) {
    reader.error(
      ["version"],
      `The modeler reads version: ${FORMAT_VERSION}, not ${JSON.stringify(root["version"])}.`,
    );
  }
  if (root["canvas"] !== undefined) Object.assign(document, readCanvas(reader, root["canvas"]));
  for (const [key, value] of Object.entries(root)) {
    if (isBlockId(key)) {
      const block = readBlock(reader, key, value, seen);
      if (block) document.blocks.push(block);
    }
  }
  const extras = Object.entries(root).filter(([key]) => !isBlockId(key));
  document.extras = reader.foreignFields(Object.fromEntries(extras), ROOT_FIELDS, []);
  for (const { key } of document.extras) {
    reader.warn([key], "No building block of the canvas; kept as it is.");
  }
  return document;
}

/**
 * YAML that plain data has no use for: anchors, aliases, tags, keys that are maps or lists, and a
 * key written twice in one map, also as `1` and `"1"`, which `toJS` would merge into one. Stops at
 * the first, since the text cannot open anyway.
 */
function rejectWhatTheFormatHasNot(reader: Reader, yaml: Document): void {
  const error = (node: Ranged, message: string) => {
    reader.reportAt(markOf(node) ?? [0, 1], message, "error");
    return visit.BREAK;
  };
  /** A key written twice in one map, also as `1` and `"1"`, which `toJS` would merge. */
  const repeatedKey = (map: YAMLMap) => {
    const keys = new Set<string>();
    for (const pair of map.items) {
      if (isCollection(pair.key)) return error(pair.key, "A key is a word, not a list or a map.");
      const key = keyText(pair.key);
      if (key === undefined) continue;
      if (keys.has(key)) return error(pair.key as Ranged, `The key "${key}" is written twice.`);
      keys.add(key);
    }
    return undefined;
  };
  visit(yaml, {
    Alias(_, alias) {
      return error(alias, `Aliases such as *${alias.source} are no part of the format.`);
    },
    Node(_, node) {
      if (node.anchor) {
        return error(node, `Anchors such as &${node.anchor} are no part of the format.`);
      }
      if (node.tag) return error(node, `Tags such as ${node.tag} are no part of the format.`);
      return isMap(node) ? repeatedKey(node) : undefined;
    },
  });
}

/** Whether flow lists and maps open deeper than the limit, found by the lexer before any parse. */
function flowNestsTooDeep(text: string): boolean {
  let depth = 0;
  for (const token of new Lexer().lex(text)) {
    const type = CST.tokenType(token);
    if (type === "flow-seq-start" || type === "flow-map-start") depth += 1;
    else if (type === "flow-seq-end" || type === "flow-map-end") depth -= 1;
    if (depth > MAX_NESTING_DEPTH) return true;
  }
  return false;
}

/** The comments of the text, found in its syntax tree, so a `#` inside a text is none. */
function commentsOf(text: string): TextRange[] {
  const comments: TextRange[] = [];
  const walk = (token: unknown): void => {
    if (Array.isArray(token)) return token.forEach(walk);
    if (typeof token !== "object" || token === null) return;
    const { type, offset, source } = token as {
      type?: unknown;
      offset?: unknown;
      source?: unknown;
    };
    if (type === "comment" && typeof offset === "number" && typeof source === "string") {
      comments.push([offset, offset + source.length]);
      return;
    }
    Object.values(token).forEach(walk);
  };
  walk([...new Parser().parse(text)]);
  return comments;
}

const emptyResult = (diagnostics: Diagnostic[]): ParseResult => ({
  document: { header: [], notes: [], blocks: [], extras: [] },
  diagnostics,
});

/**
 * Reads a `.bmc` text, a YAML map: `version`, `canvas` (its fields and the notes on the canvas as
 * a whole) and one field per building block holding its `items` and `notes`. A field it does not know stays and comes back on export. A blank text is
 * an empty canvas, and JSON, being YAML too, reads as well. A key written twice in one map is an
 * error, so are anchors, aliases and tags; a comment warns, since nothing keeps it. Each finding
 * names its place as a path into the file and as offsets into the text.
 */
export function parseText(text: string): ParseResult {
  // trim() takes a byte order mark too.
  if (text.trim() === "") return emptyResult([]);
  const whole = (message: string): ParseResult =>
    emptyResult([{ path: [], message, severity: "error", range: [0, 1] }]);
  if (text.length > MAX_TEXT_LENGTH) {
    return whole(`A canvas text is at most ${MAX_TEXT_LENGTH.toLocaleString("en")} characters.`);
  }
  // YAML 1.2 reads a lone carriage return as a line break, the yaml library does not.
  const lines = text.replace(/\r(?!\n)/g, "\n");
  if (flowNestsTooDeep(lines)) return whole(NESTING_ERROR);
  try {
    return readYaml(lines);
  } catch (error) {
    // The YAML reader descends one call per level: a text nested thousands deep overflows it.
    if (!(error instanceof RangeError)) throw error;
    return whole(NESTING_ERROR);
  }
}

function readYaml(text: string): ParseResult {
  const yaml = parseDocument(text, { schema: "core", prettyErrors: false, uniqueKeys: false });
  const reader = new Reader(yaml);
  const [syntaxError] = yaml.errors;
  if (syntaxError) {
    const [start, end] = syntaxError.pos;
    const message =
      syntaxError.code === "RESOURCE_EXHAUSTION"
        ? NESTING_ERROR
        : `The text is no YAML: ${syntaxError.message}`;
    reader.reportAt([start, Math.max(end, start + 1)], message, "error");
    return emptyResult(reader.diagnostics);
  }
  rejectWhatTheFormatHasNot(reader, yaml);
  if (reader.hasErrors) return emptyResult(reader.diagnostics);
  const root = yaml.toJS() as JsonValue;
  if (!isObject(root)) {
    reader.error(
      [],
      `A canvas is a YAML map: version: ${FORMAT_VERSION}, canvas: { … }, then the building blocks.`,
    );
    return emptyResult(reader.diagnostics);
  }
  const document = readRoot(reader, root);
  if (text.includes("#")) {
    for (const range of commentsOf(text)) reader.reportAt(range, COMMENT_WARNING, "warning");
  }
  return reader.hasErrors
    ? emptyResult(reader.diagnostics)
    : { document, diagnostics: reader.diagnostics };
}

/** A text that is a canvas, with its warnings; throws with every error when it is none. */
export function readText(text: string): ParseResult {
  const result = parseText(text);
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) throw new Error(errors.map(describeDiagnostic).join(" "));
  return result;
}
