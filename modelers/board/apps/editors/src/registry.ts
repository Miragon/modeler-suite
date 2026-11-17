import type { EditorEntry, Insets } from "@miragon/board-host";
import { SUITE_SUFFIXES } from "./suffixes.js";

// The palette of these two is a column at the left of the canvas, where the others have a row at
// its top: the first fit leaves its room there.
const PALETTE_AT_THE_LEFT: Insets = { top: 24, right: 24, bottom: 24, left: 80 };

const INSETS: Readonly<Record<string, Insets>> = {
  c4: PALETTE_AT_THE_LEFT,
  "business-model-canvas": PALETTE_AT_THE_LEFT,
};

// One literal import per notation: a bundler splits a chunk for each, and a board that shows no
// Wardley map never loads the Wardley renderer.
const LOADERS: Readonly<Record<string, EditorEntry["load"]>> = {
  wardley: () => import("./notations/wardley.js"),
  "event-storming": () => import("./notations/event-storming.js"),
  "team-topologies": () => import("./notations/team-topologies.js"),
  "context-maps": () => import("./notations/context-maps.js"),
  "value-chain": () => import("./notations/value-chain.js"),
  c4: () => import("./notations/c4.js"),
  "business-model-canvas": () => import("./notations/business-model-canvas.js"),
  bpmn: () => import("./notations/bpmn.js"),
};

function entryOf({ notation, kind, suffixes }: (typeof SUITE_SUFFIXES)[number]): EditorEntry {
  const load = LOADERS[notation];
  if (!load) throw new Error(`no editor module for the notation '${notation}'`);
  const insets = INSETS[notation];
  return { notation, kind, suffixes, load, ...(insets ? { insets } : {}) };
}

/** The seven modelers of the suite and Miragon's BPMN modeler as the editors of a board's model nodes. */
export const SUITE_EDITORS: readonly EditorEntry[] = SUITE_SUFFIXES.map(entryOf);
