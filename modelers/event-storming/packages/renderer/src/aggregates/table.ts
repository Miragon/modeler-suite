import type { AggregateTableEntry, AggregateTableRow } from "./rows.js";

/*
 * The table of the "Aggregates…" dialog (guide §8: tables 13px), drawn into a dialog body such as
 * the shell's. A row group per aggregate whose header cell spans its lines, so each line reads like
 * the board: command, aggregate, events. Every name is a button that selects its stickies; the
 * rules in event-storming.css (`.event-storming-aggregates`) give it the look of a ghost button.
 */

export const AGGREGATES_TABLE_LABEL = "Commands and events by aggregate";

const COLUMN_TITLES = ["Commands", "Aggregate", "Events"] as const;
const HINT = "Choose a name to select its stickies on the board.";
const EMPTY = "The board has no aggregates.";

export interface AggregateTableOptions {
  /** A click on a name, also Enter or Space on it (`detail` 0). */
  onSelect(entry: AggregateTableEntry, event: MouseEvent): void;
}

/** Which name a button shows, so a redraw can give the focus back to the same name. */
const entryKeys = new WeakMap<Element, string>();

function element<K extends keyof HTMLElementTagNameMap>(
  ownerDocument: Document,
  tag: K,
  className: string,
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const created = ownerDocument.createElement(tag);
  created.className = className;
  created.append(...children);
  return created;
}

function entryButton(
  ownerDocument: Document,
  aggregate: AggregateTableEntry,
  entry: AggregateTableEntry,
  options: AggregateTableOptions,
): HTMLButtonElement {
  const button = element(ownerDocument, "button", "event-storming-aggregates-entry", entry.label);
  button.type = "button";
  button.dataset["entryKind"] = entry.kind;
  entryKeys.set(button, [aggregate.label, entry.kind, entry.label].join("\u0000"));
  button.addEventListener("click", (event) => options.onSelect(entry, event));
  return button;
}

function rowGroup(
  ownerDocument: Document,
  table: HTMLTableElement,
  row: AggregateTableRow,
  options: AggregateTableOptions,
): void {
  const group = table.createTBody();
  group.className = "event-storming-aggregates-group";
  row.lines.forEach((line, index) => {
    const tableRow = group.insertRow();
    const commandCell = element(
      ownerDocument,
      "td",
      "event-storming-aggregates-cell event-storming-aggregates-commands",
    );
    if (line.command) {
      commandCell.append(entryButton(ownerDocument, row.aggregate, line.command, options));
    }
    tableRow.append(commandCell);
    if (index === 0) {
      const aggregateCell = element(
        ownerDocument,
        "th",
        "event-storming-aggregates-cell event-storming-aggregates-aggregate",
        entryButton(ownerDocument, row.aggregate, row.aggregate, options),
      );
      aggregateCell.scope = "rowgroup";
      aggregateCell.rowSpan = row.lines.length;
      tableRow.append(aggregateCell);
    }
    const eventsCell = element(
      ownerDocument,
      "td",
      "event-storming-aggregates-cell event-storming-aggregates-events",
    );
    if (line.events.length > 0) {
      eventsCell.append(
        element(
          ownerDocument,
          "ul",
          "event-storming-aggregates-list",
          ...line.events.map((event) =>
            element(
              ownerDocument,
              "li",
              "event-storming-aggregates-item",
              entryButton(ownerDocument, row.aggregate, event, options),
            ),
          ),
        ),
      );
    }
    tableRow.append(eventsCell);
  });
}

/**
 * Fills `body` with the rows, replacing what it held. Called again on an open dialog (the board
 * changed under it), it gives the focus back to the name that had it, else to the first name, so
 * the focus stays among the names while the board has one.
 */
export function renderAggregateTable(
  body: HTMLElement,
  rows: readonly AggregateTableRow[],
  options: AggregateTableOptions,
): void {
  const ownerDocument = body.ownerDocument;
  const active = ownerDocument.activeElement;
  const hadFocus = active !== null && active !== body && body.contains(active);
  const focusedKey = active ? entryKeys.get(active) : undefined;

  if (rows.length === 0) {
    body.replaceChildren(element(ownerDocument, "p", "event-storming-aggregates-empty", EMPTY));
    return;
  }
  const table = element(ownerDocument, "table", "event-storming-aggregates-table");
  table.setAttribute("aria-label", AGGREGATES_TABLE_LABEL);
  const head = table.createTHead().insertRow();
  for (const title of COLUMN_TITLES) {
    const heading = element(ownerDocument, "th", "event-storming-aggregates-heading", title);
    heading.scope = "col";
    head.append(heading);
  }
  for (const row of rows) rowGroup(ownerDocument, table, row, options);
  body.replaceChildren(element(ownerDocument, "p", "event-storming-aggregates-hint", HINT), table);

  if (!hadFocus) return;
  const buttons = [...body.querySelectorAll<HTMLButtonElement>(".event-storming-aggregates-entry")];
  (buttons.find((button) => entryKeys.get(button) === focusedKey) ?? buttons[0])?.focus();
}
