import type { ModuleDeclaration } from "didi";
import SelectionModule from "diagram-js/lib/features/selection";
import EventStormingAggregates from "./EventStormingAggregates.js";

/** The board's aggregates with their commands and events, and the "Aggregates…" dialog. */
export const eventStormingAggregatesModule: ModuleDeclaration = {
  __depends__: [SelectionModule],
  __init__: ["eventStormingAggregates"],
  eventStormingAggregates: ["type", EventStormingAggregates],
};

export {
  default as EventStormingAggregates,
  AGGREGATES_DIALOG_CLASS,
  AGGREGATES_DIALOG_TITLE,
} from "./EventStormingAggregates.js";
export type {
  AggregatesDialog,
  AggregatesDialogChrome,
  AggregatesDialogOptions,
} from "./EventStormingAggregates.js";
export { aggregateTableRows } from "./rows.js";
export type {
  AggregateEntryKind,
  AggregateTableEntry,
  AggregateTableLine,
  AggregateTableRow,
} from "./rows.js";
export { AGGREGATES_TABLE_LABEL, renderAggregateTable } from "./table.js";
export type { AggregateTableOptions } from "./table.js";
