import type { AggregateGroup, NamedStickies } from "@miragon/event-storming-schema-model";

/*
 * The rows of the "Aggregates…" dialog (issue #116) as data, so a host can show them in a dialog of
 * its own as well as through `renderAggregateTable`. One row per aggregate, in the board's reading
 * order: each line is a command, the aggregate it reaches, and the events that follow from there.
 */

export type AggregateEntryKind = "aggregate" | "command" | "event";

/** A name in the table, and the stickies a click on it selects. */
export interface AggregateTableEntry {
  readonly kind: AggregateEntryKind;
  /** The name as the table shows it: its preferred spelling, on one line. */
  readonly label: string;
  readonly elementIds: readonly string[];
}

/** A command and the events it leads to through the aggregate. */
export interface AggregateTableLine {
  /** None on the line of the events that no command leads to, and on an aggregate's only line. */
  readonly command: AggregateTableEntry | undefined;
  readonly events: readonly AggregateTableEntry[];
}

export interface AggregateTableRow {
  readonly aggregate: AggregateTableEntry;
  /** At least one. */
  readonly lines: readonly AggregateTableLine[];
}

const UNNAMED: Readonly<Record<AggregateEntryKind, string>> = {
  aggregate: "Unnamed aggregate",
  command: "Unnamed command",
  event: "Unnamed event",
};

function entry(kind: AggregateEntryKind, named: NamedStickies): AggregateTableEntry {
  const label = named.label.replace(/\s+/g, " ").trim();
  return { kind, label: label === "" ? UNNAMED[kind] : label, elementIds: named.elementIds };
}

/**
 * One row per group of `groupByAggregate`, in its order. Each command has a line of its own with
 * the events its pairs lead to; the events no command leads to share one last line; an aggregate
 * with neither has one empty line.
 */
export function aggregateTableRows(groups: readonly AggregateGroup[]): AggregateTableRow[] {
  return groups.map((group) => {
    const lines: AggregateTableLine[] = group.commands.map((command) => ({
      command: entry("command", command),
      events: group.pairs
        .filter((pair) => pair.command === command)
        .map((pair) => entry("event", pair.event)),
    }));
    const unpaired = group.events.filter((event) =>
      group.pairs.every((pair) => pair.event !== event),
    );
    if (unpaired.length > 0 || lines.length === 0) {
      lines.push({ command: undefined, events: unpaired.map((event) => entry("event", event)) });
    }
    return { aggregate: entry("aggregate", group.aggregate), lines };
  });
}
