import type { BlockId } from "./blocks.js";

/** Any value JSON can hold: what a field the canvas does not know may carry. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A field this version does not know, kept with its value; written after the known ones. */
export interface Attribute {
  key: string;
  value: JsonValue;
}

/** A remark on the canvas, a block or a sticky: its text, and any field of its own. */
export interface Note {
  text: string;
  attributes: Attribute[];
}

export interface Sticky {
  id: string;
  text: string;
  /** Its tape: a palette colour by name (`sky`), or a `#RGB` / `#RRGGBB` of the person's own. */
  color?: string | undefined;
  attributes: Attribute[];
  notes: Note[];
}

export interface Block {
  blockId: BlockId;
  items: Sticky[];
  /** The notes on the block as a whole. */
  notes: Note[];
  attributes: Attribute[];
}

export interface CanvasDocument {
  /** The fields of the file's `canvas`: the known ones as text, any other with its value. */
  header: Attribute[];
  /** The notes on the canvas as a whole, written as `canvas.notes`. */
  notes: Note[];
  blocks: Block[];
  /** Root fields that name no building block. */
  extras: Attribute[];
}

/** The `version` every file is written with. */
export const FORMAT_VERSION = 1;
