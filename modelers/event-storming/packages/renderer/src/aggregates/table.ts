import type { AggregateTableEntry, AggregateTableLine, AggregateTableRow } from "./rows.js";

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

/** Keeps the header ids of every table drawn unique in the document. */
let drawnTables = 0;

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

interface RowGroupContext {
  readonly ownerDocument: Document;
  readonly options: AggregateTableOptions;
  /** The aggregate's label and how many rows with that label came before, such as unnamed ones. */
  readonly rowKey: string;
  readonly commandsHeaderId: string;
  readonly eventsHeaderId: string;
  readonly aggregateHeaderId: string;
}

function entryButton(
  context: RowGroupContext,
  entry: AggregateTableEntry,
  line: AggregateTableLine | undefined,
): HTMLButtonElement {
  const button = element(
    context.ownerDocument,
    "button",
    "event-storming-aggregates-entry",
    entry.label,
  );
  button.type = "button";
  button.dataset["entryKind"] = entry.kind;
  // An event stands on the line of every command that leads to it, so its line is part of its key.
  const lineKey = entry.kind === "event" ? (line?.command?.label ?? "") : "";
  entryKeys.set(button, [context.rowKey, entry.kind, lineKey, entry.label].join("\u0000"));
  button.addEventListener("click", (event) => context.options.onSelect(entry, event));
  return button;
}

/*
 * The aggregate's header cell stands between the commands and the events, and the HTML table model
 * gives a row group header only to the cells from its own column on: each data cell names its
 * column and its aggregate in `headers`, so the commands are announced with their aggregate too.
 */
function dataCell(
  context: RowGroupContext,
  className: string,
  columnHeaderId: string,
): HTMLTableCellElement {
  const cell = element(context.ownerDocument, "td", `event-storming-aggregates-cell ${className}`);
  cell.headers = `${columnHeaderId} ${context.aggregateHeaderId}`;
  return cell;
}

function rowGroup(table: HTMLTableElement, row: AggregateTableRow, context: RowGroupContext): void {
  const group = table.createTBody();
  group.className = "event-storming-aggregates-group";
  row.lines.forEach((line, index) => {
    const tableRow = group.insertRow();
    const commandCell = dataCell(
      context,
      "event-storming-aggregates-commands",
      context.commandsHeaderId,
    );
    if (line.command) commandCell.append(entryButton(context, line.command, line));
    tableRow.append(commandCell);
    if (index === 0) {
      const aggregateCell = element(
        context.ownerDocument,
        "th",
        "event-storming-aggregates-cell event-storming-aggregates-aggregate",
        entryButton(context, row.aggregate, undefined),
      );
      aggregateCell.id = context.aggregateHeaderId;
      aggregateCell.scope = "rowgroup";
      aggregateCell.rowSpan = row.lines.length;
      tableRow.append(aggregateCell);
    }
    const eventsCell = dataCell(
      context,
      "event-storming-aggregates-events",
      context.eventsHeaderId,
    );
    if (line.events.length > 0) {
      eventsCell.append(
        element(
          context.ownerDocument,
          "ul",
          "event-storming-aggregates-list",
          ...line.events.map((event) =>
            element(
              context.ownerDocument,
              "li",
              "event-storming-aggregates-item",
              entryButton(context, event, line),
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
 * changed under it), it gives the focus back to the name that had it, else to the first name; once
 * the board has no aggregate left, to the sentence that says so, so the focus stays in the dialog
 * and a screen reader reads the change.
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
    const empty = element(ownerDocument, "p", "event-storming-aggregates-empty", EMPTY);
    body.replaceChildren(empty);
    if (hadFocus) {
      empty.tabIndex = -1;
      empty.focus({ preventScroll: true });
    }
    return;
  }

  drawnTables += 1;
  const idPrefix = `event-storming-aggregates-${drawnTables}`;
  const table = element(ownerDocument, "table", "event-storming-aggregates-table");
  table.setAttribute("aria-label", AGGREGATES_TABLE_LABEL);
  table.createCaption().replaceChildren(HINT);
  table.caption!.className = "event-storming-aggregates-hint";
  const head = table.createTHead().insertRow();
  const [commandsHeaderId, , eventsHeaderId] = COLUMN_TITLES.map((title, column) => {
    const heading = element(ownerDocument, "th", "event-storming-aggregates-heading", title);
    heading.id = `${idPrefix}-column-${column}`;
    heading.scope = "col";
    head.append(heading);
    return heading.id;
  });
  const rowsBefore = new Map<string, number>();
  rows.forEach((row, rowIndex) => {
    const occurrence = rowsBefore.get(row.aggregate.label) ?? 0;
    rowsBefore.set(row.aggregate.label, occurrence + 1);
    rowGroup(table, row, {
      ownerDocument,
      options,
      rowKey: `${row.aggregate.label}\u0000${occurrence}`,
      commandsHeaderId: commandsHeaderId!,
      eventsHeaderId: eventsHeaderId!,
      aggregateHeaderId: `${idPrefix}-row-${rowIndex}`,
    });
  });
  body.replaceChildren(table);

  if (!hadFocus) return;
  const buttons = [...body.querySelectorAll<HTMLButtonElement>(".event-storming-aggregates-entry")];
  (buttons.find((button) => entryKeys.get(button) === focusedKey) ?? buttons[0])?.focus();
}
