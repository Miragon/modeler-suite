import { Document } from "yaml";
import {
  FORMAT_VERSION,
  METHOD_ORDER,
  type Attribute,
  type Block,
  type CanvasDocument,
  type JsonValue,
  type Note,
  type Sticky,
} from "@miragon/business-model-canvas-schema-model";
import { BLOCK_FIELDS, CANVAS_FIELDS, NOTE_FIELDS, ROOT_FIELDS, STICKY_FIELDS } from "./fields.js";

/** What becomes the YAML: plain values, and maps that keep their entries in the order given. */
type Written = JsonValue | Written[] | Map<string, Written>;
type Values = Partial<Record<string, Written | undefined>>;

const byKey = (first: Attribute, second: Attribute): number =>
  first.key < second.key ? -1 : first.key > second.key ? 1 : 0;

/**
 * The `known` fields in their order, then the `foreign` ones sorted by name. A foreign field named
 * like a known one, such as a colour the parser did not know, takes that field's place when the
 * known value is not set, and gives way to it when it is. A `Map`, never an object: an object
 * would put a key such as `"2"` first and turn a field named `__proto__` into its prototype.
 */
function objectOf(known: readonly string[], values: Values, foreign: readonly Attribute[]) {
  const foreignByKey = new Map(foreign.map((field) => [field.key, field.value]));
  const fields = known.flatMap((key): [string, Written][] => {
    const value = values[key] ?? foreignByKey.get(key);
    return value === undefined ? [] : [[key, value]];
  });
  const others = foreign
    .filter(({ key }) => !known.includes(key))
    .sort(byKey)
    .map(({ key, value }): [string, Written] => [key, value]);
  return new Map([...fields, ...others]);
}

const listOf = <T>(values: readonly T[], write: (value: T) => Written) =>
  values.length > 0 ? values.map(write) : undefined;

const noteOf = (note: Note): Written => objectOf(NOTE_FIELDS, { text: note.text }, note.attributes);

const stickyOf = (sticky: Sticky): Written =>
  objectOf(
    STICKY_FIELDS,
    {
      id: sticky.id,
      text: sticky.text,
      color: sticky.color,
      notes: listOf(sticky.notes, noteOf),
    },
    sticky.attributes,
  );

const blockOf = (block: Block): Written =>
  objectOf(
    BLOCK_FIELDS,
    { items: listOf(block.items, stickyOf), notes: listOf(block.notes, noteOf) },
    block.attributes,
  );

const canvasOf = ({ header, notes }: CanvasDocument): Written | undefined =>
  header.length > 0 || notes.length > 0
    ? objectOf(CANVAS_FIELDS, { notes: listOf(notes, noteOf) }, header)
    : undefined;

const isEmpty = (document: CanvasDocument): boolean =>
  canvasOf(document) === undefined && document.blocks.length === 0 && document.extras.length === 0;

/**
 * The canonical text: `version`, `canvas`, the blocks in the method's order, then the fields the
 * canvas does not know, each map with its known fields in a fixed order and the others sorted
 * after them, two spaces of indentation, no line folded and a final line break. A fixpoint of the
 * parser, so opening a canonical file never rewrites it. An empty canvas is an empty text.
 */
export function serializeText(document: CanvasDocument): string {
  if (isEmpty(document)) return "";
  const blocks = new Map(document.blocks.map((block) => [block.blockId, blockOf(block)]));
  const root = objectOf(
    [...ROOT_FIELDS, ...METHOD_ORDER],
    { version: FORMAT_VERSION, canvas: canvasOf(document), ...Object.fromEntries(blocks) },
    document.extras,
  );
  const yaml = new Document(root);
  return yaml.toString({ indent: 2, lineWidth: 0, flowCollectionPadding: false });
}
