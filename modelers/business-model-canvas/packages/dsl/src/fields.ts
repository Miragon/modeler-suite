import type { JsonValue } from "@miragon/business-model-canvas-schema-model";

/** The known fields of each object of a `.bmc` file, in the order the file writes them. */
export const ROOT_FIELDS = ["version", "canvas"] as const;
/** The `canvas` map: its title, its columns, then the notes on the canvas as a whole. */
export const CANVAS_FIELDS = ["title", "columns", "notes"] as const;
export const BLOCK_FIELDS = ["items", "notes"] as const;
export const STICKY_FIELDS = ["id", "text", "color", "notes"] as const;
export const NOTE_FIELDS = ["text"] as const;

export type JsonObject = { [key: string]: JsonValue };
