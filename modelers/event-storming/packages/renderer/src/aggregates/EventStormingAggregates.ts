import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { getBBox } from "diagram-js/lib/util/Elements";
import {
  groupByAggregate,
  type AggregateBoard,
  type AggregateGroup,
  type ArrowEnds,
  type PlacedSticky,
} from "@miragon/event-storming-schema-model";
import { focusCanvasWithoutRing } from "../keyboard/index.js";
import {
  isEventStormingConnection,
  isEventStormingShape,
  type EventStormingShape,
} from "../model/di-types.js";
import type { EventStormingPaletteConfig } from "../palette/EventStormingPaletteProvider.js";
import { aggregateTableRows, type AggregateTableEntry, type AggregateTableRow } from "./rows.js";
import { renderAggregateTable } from "./table.js";

/** The dialog's title; the menu entry is "Aggregates…". */
export const AGGREGATES_DIALOG_TITLE = "Aggregates";

/** The class next to the dialog's own, which the table's rules in event-storming.css hang on. */
export const AGGREGATES_DIALOG_CLASS = "event-storming-aggregates";

/** What a dialog of guide §8 takes to open: the shell's `ShellDialogOptions`, structurally. */
export interface AggregatesDialogOptions {
  readonly container: HTMLElement;
  readonly title: string;
  readonly className: string;
  render(body: HTMLElement): void;
  onClose(): void;
  focusFallback(): void;
}

/** An open dialog: the shell's `ShellDialog`, structurally. */
export interface AggregatesDialog {
  isOpen(): boolean;
  close(): void;
}

/**
 * Where the dialog opens: `{ container: shell.root, openDialog: openShellDialog }` with a mounted
 * shell, the modeler's element instead of `shell.root` in an embedding host without one.
 */
export interface AggregatesDialogChrome {
  readonly container: HTMLElement;
  openDialog(options: AggregatesDialogOptions): AggregatesDialog;
}

/** What a reveal keeps free inside the chrome's insets: the fit's margin at the sides (guide §5.9). */
const REVEAL_MARGIN = 24;

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

const CLOSED: AggregatesDialog = { isOpen: () => false, close: () => undefined };

interface OpenDialog {
  dialog: AggregatesDialog;
  body: HTMLElement | undefined;
}

/**
 * The board's aggregates with their commands and events (issue #116), read from the canvas through
 * `groupByAggregate`, and the "Aggregates…" dialog that shows them. A name in the dialog closes it,
 * then selects its stickies and brings them into view: a selection and a view change, never a
 * command, so neither the undo history nor the document changes, also under the read-only lock.
 * The open dialog follows every import and every command.
 */
export default class EventStormingAggregates {
  static $inject = [
    "eventBus",
    "canvas",
    "elementRegistry",
    "selection",
    "config.eventStormingPalette",
  ];

  private open: OpenDialog | undefined;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
    private readonly selection: Selection,
    private readonly config: EventStormingPaletteConfig | undefined,
  ) {
    eventBus.on(["import.done", "elements.changed"], () => this.redraw());
    eventBus.on("diagram.destroy", () => this.open?.dialog.close());
  }

  /** Whether the board holds an aggregate: the menu shows "Aggregates…" only then. */
  hasAggregates(): boolean {
    return this.elementRegistry
      .getAll()
      .some(
        (element) =>
          isEventStormingShape(element) &&
          !element.provisional &&
          element.eventStormingType === "aggregate",
      );
  }

  groups(): AggregateGroup[] {
    return groupByAggregate(this.board());
  }

  rows(): AggregateTableRow[] {
    return aggregateTableRows(this.groups());
  }

  /**
   * Selects the stickies of `elementIds` that are on the canvas and brings them into the part of
   * the view the chrome leaves free (`freeArea.insets`): scrolled just far enough when they fit at
   * the current zoom, else zoomed out until they fit, centred. It never zooms in.
   */
  reveal(elementIds: readonly string[]): EventStormingShape[] {
    const shapes = [...new Set(elementIds)]
      .map((id) => this.elementRegistry.get(id))
      .filter(isEventStormingShape);
    if (shapes.length === 0) return [];
    this.selection.select(shapes);
    this.bringIntoView(shapes);
    return shapes;
  }

  /** Opens the dialog, or gives back the one already open. */
  showDialog(chrome: AggregatesDialogChrome): AggregatesDialog {
    if (this.open?.dialog.isOpen()) return this.open.dialog;
    const opened: OpenDialog = { dialog: CLOSED, body: undefined };
    this.open = opened;
    try {
      opened.dialog = chrome.openDialog({
        container: chrome.container,
        title: AGGREGATES_DIALOG_TITLE,
        className: AGGREGATES_DIALOG_CLASS,
        render: (body) => {
          opened.body = body;
          this.draw(body);
        },
        onClose: () => {
          if (this.open === opened) this.open = undefined;
        },
        focusFallback: () => this.canvas.focus(),
      });
    } catch (error) {
      this.open = undefined;
      throw error;
    }
    return opened.dialog;
  }

  private board(): AggregateBoard {
    const elements: PlacedSticky[] = [];
    const edges: ArrowEnds[] = [];
    for (const element of this.elementRegistry.getAll()) {
      if (isEventStormingConnection(element)) {
        if (element.source && element.target) {
          edges.push({ from: element.source.id, to: element.target.id });
        }
      } else if (isEventStormingShape(element) && !element.provisional) {
        elements.push({
          id: element.id,
          elementType: element.eventStormingType,
          label: element.eventStormingLabel,
          position: { x: element.x + element.width / 2, y: element.y + element.height / 2 },
        });
      }
    }
    return { elements, edges };
  }

  private draw(body: HTMLElement): void {
    renderAggregateTable(body, this.rows(), {
      onSelect: (entry, event) => this.select(entry, event),
    });
  }

  private redraw(): void {
    const body = this.open?.body;
    if (body && this.open?.dialog.isOpen()) this.draw(body);
  }

  /** The dialog is modal: it closes first, so the canvas shows the selection and takes the keys. */
  private select(entry: AggregateTableEntry, event: MouseEvent): void {
    this.open?.dialog.close();
    this.reveal(entry.elementIds);
    if (event.detail === 0) this.canvas.focus();
    else focusCanvasWithoutRing(this.canvas);
  }

  private bringIntoView(shapes: readonly EventStormingShape[]): void {
    const insets = this.config?.freeArea?.insets?.() ?? NO_INSETS;
    const padding = {
      top: insets.top + REVEAL_MARGIN,
      right: insets.right + REVEAL_MARGIN,
      bottom: insets.bottom + REVEAL_MARGIN,
      left: insets.left + REVEAL_MARGIN,
    };
    const { outer, scale } = this.canvas.viewbox();
    const freeWidth = outer.width - padding.left - padding.right;
    const freeHeight = outer.height - padding.top - padding.bottom;
    if (freeWidth <= 0 || freeHeight <= 0) return;
    const box = getBBox([...shapes]);
    if (box.width * scale <= freeWidth && box.height * scale <= freeHeight) {
      this.canvas.scrollToElement([...shapes], padding);
      return;
    }
    const zoom = Math.min(freeWidth / box.width, freeHeight / box.height);
    this.canvas.viewbox({
      x: box.x + box.width / 2 - (padding.left + freeWidth / 2) / zoom,
      y: box.y + box.height / 2 - (padding.top + freeHeight / 2) / zoom,
      width: outer.width / zoom,
      height: outer.height / zoom,
    });
  }
}
