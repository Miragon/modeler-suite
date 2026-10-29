import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { getBBox } from "diagram-js/lib/util/Elements";
import {
  AGGREGATES_DIALOG_CLASS,
  AGGREGATES_DIALOG_TITLE,
  Modeler,
  NavigatedViewer,
  boardMenu,
  type AggregatesDialogChrome,
  type AggregatesDialogOptions,
  type BoardLevels,
  type EventStormingAggregates,
  type EventStormingModeling,
  type EventStormingReadOnly,
  type EventStormingShape,
  type TypeCaptions,
} from "../../src/index.js";
import "../../src/assets/event-storming.css";

/** Two steps of a checkout with "Order" repeated (and spelled two ways), and a far-off aggregate. */
const BOARD = `title Aggregates
command Place Order [150, 200] (id cmd_place)
aggregate Order [350, 200] (id agg_order_1)
event Order Placed [550, 200] (id evt_placed)
command Ship Order [750, 200] (id cmd_ship)
aggregate Orders [950, 200] (id agg_order_2)
event Order Shipped [1150, 200] (id evt_shipped)
aggregate Payment [4150, 900] (id agg_payment)
policy Bill it [550, 450] (id pol_bill)

#cmd_place -> #agg_order_1
#agg_order_1 -> #evt_placed
#cmd_ship -> #agg_order_2
#agg_order_2 -> #evt_shipped
#evt_placed -> #pol_bill`;

/**
 * A board whose aggregates still carry the placeholders new stickies get, "Aggregate" and
 * "Aggregate 2", with a command and an event at the first.
 */
const PLACEHOLDER_BOARD = `title Placeholders
command Place Order [150, 200] (id cmd_place)
aggregate Aggregate [350, 200] (id agg_new)
event Order Placed [550, 200] (id evt_placed)
aggregate Aggregate 2 [350, 450] (id agg_next)

#cmd_place -> #agg_new
#agg_new -> #evt_placed`;

/** What the shell's chrome covers: the menu row on top, a legend on the left. */
const INSETS = { top: 64, right: 12, bottom: 64, left: 240 };

/**
 * A dialog of guide §8 as the shell's `openShellDialog` opens it, reduced to what the service
 * relies on: a modal <dialog> whose body `render` fills once, `onClose` after it closed.
 */
function dialogChrome(container: HTMLElement): AggregatesDialogChrome & { opened: number } {
  const chrome = {
    container,
    opened: 0,
    openDialog(options: AggregatesDialogOptions) {
      chrome.opened += 1;
      const dialog = document.createElement("dialog");
      dialog.className = `cd-shell-dialog ${options.className}`;
      dialog.setAttribute("aria-label", options.title);
      const body = document.createElement("div");
      body.className = "cd-shell-dialog-body";
      options.render(body);
      dialog.append(body);
      options.container.append(dialog);
      dialog.showModal();
      let open = true;
      const finish = (): void => {
        if (!open) return;
        open = false;
        if (dialog.open) dialog.close();
        dialog.remove();
        options.onClose();
      };
      dialog.addEventListener("close", finish);
      return { isOpen: () => open, close: finish };
    },
  };
  return chrome;
}

let container: HTMLElement | undefined;
let modeler: Modeler | NavigatedViewer | undefined;

async function mount(
  options: { viewer?: boolean; insets?: typeof INSETS; board?: string } = {},
): Promise<Modeler> {
  container = document.createElement("div");
  document.body.appendChild(container);
  const viewerOptions = {
    container,
    width: "1280px",
    height: "720px",
    ...(options.insets ? { freeArea: { insets: () => options.insets! } } : {}),
  };
  modeler = options.viewer ? new NavigatedViewer(viewerOptions) : new Modeler(viewerOptions);
  await modeler.importDSL(options.board ?? BOARD);
  return modeler as Modeler;
}

afterEach(() => {
  modeler?.destroy();
  container?.remove();
  modeler = undefined;
  container = undefined;
});

const aggregatesOf = (diagram: Modeler) =>
  diagram.get<EventStormingAggregates>("eventStormingAggregates");
const selectedIds = (diagram: Modeler) =>
  diagram
    .get<Selection>("selection")
    .get()
    .map((element) => element.id);
const dialog = () => document.querySelector<HTMLDialogElement>(`dialog.${AGGREGATES_DIALOG_CLASS}`);
const entry = (name: string): HTMLButtonElement => {
  const found = [
    ...(dialog()?.querySelectorAll<HTMLButtonElement>(".event-storming-aggregates-entry") ?? []),
  ].find((button) => button.textContent === name);
  if (!found) throw new Error(`no entry "${name}" in the dialog`);
  return found;
};
const canvasSvg = () => container!.querySelector<SVGSVGElement>("svg[tabindex]");
const rename = (diagram: Modeler, id: string, label: string) =>
  diagram.get<EventStormingModeling>("eventStormingModeling").updateLabels([
    {
      element: diagram.get<ElementRegistry>("elementRegistry").get(id) as EventStormingShape,
      label,
    },
  ]);

/** The ids of the Model group as an app builds it after an import or a command. */
function modelGroupIds(diagram: Modeler): string[] {
  const aggregates = aggregatesOf(diagram);
  return boardMenu({
    levels: diagram.get<BoardLevels>("eventStormingModeling"),
    typeCaptions: diagram.get<TypeCaptions>("eventStormingViewOptions"),
    aggregates: {
      hasAggregates: () => aggregates.hasAggregates(),
      showAggregates: () => aggregates.showDialog(dialogChrome(container!)),
    },
    exports: { png: { onSelect: () => undefined }, svg: { onSelect: () => undefined } },
    showKeyboardShortcuts: () => undefined,
  }).model.map((entry) => entry.id);
}

/**
 * Where a sticky stands on the screen, against the container's box minus the chrome's insets: its
 * shape's box (the hit rectangle), without the selection outline around it.
 */
function onScreen(diagram: Modeler, id: string, insets = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const box = diagram
    .get<ElementRegistry>("elementRegistry")
    .getGraphics(id)
    .querySelector(".djs-hit")!
    .getBoundingClientRect();
  const frame = container!.getBoundingClientRect();
  return (
    box.left >= frame.left + insets.left - 0.5 &&
    box.right <= frame.right - insets.right + 0.5 &&
    box.top >= frame.top + insets.top - 0.5 &&
    box.bottom <= frame.bottom - insets.bottom + 0.5
  );
}

describe("the board's aggregates on the canvas (issue #116, real browser DOM)", () => {
  it("groups the canvas by aggregate, the spelling variants together", async () => {
    const diagram = await mount();
    const aggregates = aggregatesOf(diagram);

    expect(aggregates.hasAggregates()).toBe(true);
    expect(aggregates.rows()).toEqual([
      {
        aggregate: {
          kind: "aggregate",
          label: "Order",
          elementIds: ["agg_order_1", "agg_order_2"],
        },
        lines: [
          {
            command: { kind: "command", label: "Place Order", elementIds: ["cmd_place"] },
            events: [{ kind: "event", label: "Order Placed", elementIds: ["evt_placed"] }],
          },
          {
            command: { kind: "command", label: "Ship Order", elementIds: ["cmd_ship"] },
            events: [{ kind: "event", label: "Order Shipped", elementIds: ["evt_shipped"] }],
          },
        ],
      },
      {
        aggregate: { kind: "aggregate", label: "Payment", elementIds: ["agg_payment"] },
        lines: [{ command: undefined, events: [] }],
      },
    ]);
  });

  it("knows a board without aggregates, and one whose last aggregate went", async () => {
    const diagram = await mount({ board: "title Empty\ncommand Place Order [100, 100]" });
    expect(aggregatesOf(diagram).hasAggregates()).toBe(false);
    expect(aggregatesOf(diagram).rows()).toEqual([]);

    await diagram.importDSL("title One\naggregate Order [100, 100] (id agg)");
    expect(aggregatesOf(diagram).hasAggregates()).toBe(true);
    const modeling = diagram.get<{ removeElements(elements: unknown[]): void }>("modeling");
    modeling.removeElements([diagram.get<ElementRegistry>("elementRegistry").get("agg")]);
    expect(aggregatesOf(diagram).hasAggregates()).toBe(false);
  });

  it("counts no aggregate whose label is a placeholder, and counts it once it is renamed", async () => {
    const diagram = await mount({ board: PLACEHOLDER_BOARD });
    const aggregates = aggregatesOf(diagram);
    expect(aggregates.hasAggregates()).toBe(false);
    expect(aggregates.rows()).toEqual([]);

    rename(diagram, "agg_new", "Order");

    expect(aggregates.hasAggregates()).toBe(true);
    expect(aggregates.rows()).toEqual([
      {
        aggregate: { kind: "aggregate", label: "Order", elementIds: ["agg_new"] },
        lines: [
          {
            command: { kind: "command", label: "Place Order", elementIds: ["cmd_place"] },
            events: [{ kind: "event", label: "Order Placed", elementIds: ["evt_placed"] }],
          },
        ],
      },
    ]);
  });

  it("counts an emptied aggregate as the placeholder it is saved as, before and after a reopen", async () => {
    const diagram = await mount({ board: "title One\naggregate Order [100, 100] (id agg)" });
    const aggregates = aggregatesOf(diagram);
    expect(aggregates.hasAggregates()).toBe(true);

    rename(diagram, "agg", "");
    expect(aggregates.hasAggregates()).toBe(false);
    expect(aggregates.rows()).toEqual([]);

    const text = diagram.exportDSL();
    expect(text).toContain("aggregate Aggregate [100, 100]");
    await diagram.importDSL(text);
    expect(aggregates.hasAggregates()).toBe(false);
    expect(aggregates.rows()).toEqual([]);
  });

  it('leaves "Aggregates…" out while every aggregate carries a placeholder, and adds it once one is renamed', async () => {
    const diagram = await mount({ board: PLACEHOLDER_BOARD });
    expect(modelGroupIds(diagram)).toEqual(["level", "type-captions"]);

    rename(diagram, "agg_next", "Payment");
    expect(modelGroupIds(diagram)).toEqual(["level", "type-captions", "aggregates"]);

    diagram.get<CommandStack>("commandStack").undo();
    expect(modelGroupIds(diagram)).toEqual(["level", "type-captions"]);

    rename(diagram, "agg_next", "Aggregate 3");
    expect(modelGroupIds(diagram)).toEqual(["level", "type-captions"]);
  });

  it("shows a table with a row group per aggregate whose header spans its lines", async () => {
    const diagram = await mount();
    const chrome = dialogChrome(container!);

    aggregatesOf(diagram).showDialog(chrome);

    const shown = dialog()!;
    expect(shown.open).toBe(true);
    expect(shown.getAttribute("aria-label")).toBe(AGGREGATES_DIALOG_TITLE);
    const table = shown.querySelector("table")!;
    expect(table.getAttribute("aria-label")).toBe("Commands and events by aggregate");
    expect(
      [...table.querySelectorAll("thead th")].map((th) => [
        th.textContent,
        th.getAttribute("scope"),
      ]),
    ).toEqual([
      ["Commands", "col"],
      ["Aggregate", "col"],
      ["Events", "col"],
    ]);
    const groups = [...table.tBodies];
    expect(groups).toHaveLength(2);
    const header = groups[0]!.querySelector("th")!;
    expect([header.textContent, header.getAttribute("scope"), header.rowSpan]).toEqual([
      "Order",
      "rowgroup",
      2,
    ]);
    expect(
      [...groups[0]!.rows].map((row) => [...row.cells].map((cell) => cell.textContent)),
    ).toEqual([
      ["Place Order", "Order", "Order Placed"],
      ["Ship Order", "Order Shipped"],
    ]);
    expect([...groups[1]!.rows[0]!.cells].map((cell) => cell.textContent)).toEqual([
      "",
      "Payment",
      "",
    ]);
    expect(table.caption?.className).toBe("event-storming-aggregates-hint");
    expect(table.caption?.textContent).toBe("Choose a name to select its stickies on the board.");
  });

  it("names every cell's column and aggregate, the commands left of the aggregate too", async () => {
    const diagram = await mount();
    aggregatesOf(diagram).showDialog(dialogChrome(container!));

    const table = dialog()!.querySelector("table")!;
    const headersOf = (cell: Element) =>
      (cell.getAttribute("headers") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent);
    const [commandsHeading, aggregateHeading, eventsHeading] = [
      ...table.querySelectorAll("thead th"),
    ];
    expect(aggregateHeading!.id).not.toBe("");
    const [order, payment] = [...table.tBodies];
    for (const row of order!.rows) {
      const commandCell = row.querySelector("td.event-storming-aggregates-commands")!;
      const eventsCell = row.querySelector("td.event-storming-aggregates-events")!;
      expect(headersOf(commandCell)).toEqual(["Commands", "Order"]);
      expect(headersOf(eventsCell)).toEqual(["Events", "Order"]);
      expect(commandCell.getAttribute("headers")).toContain(commandsHeading!.id);
      expect(eventsCell.getAttribute("headers")).toContain(eventsHeading!.id);
    }
    expect(headersOf(payment!.querySelector("td")!)).toEqual(["Commands", "Payment"]);
    const ids = [...dialog()!.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("opens one dialog at a time", async () => {
    const diagram = await mount();
    const chrome = dialogChrome(container!);

    const first = aggregatesOf(diagram).showDialog(chrome);
    const second = aggregatesOf(diagram).showDialog(chrome);

    expect(second).toBe(first);
    expect(chrome.opened).toBe(1);
  });

  it("draws the table and its caption in 13px with names as 36px ghost buttons in the text role", async () => {
    const diagram = await mount();
    aggregatesOf(diagram).showDialog(dialogChrome(container!));

    const table = getComputedStyle(dialog()!.querySelector("table")!);
    expect([table.fontSize, table.borderCollapse]).toEqual(["13px", "collapse"]);
    expect(getComputedStyle(dialog()!.querySelector("caption")!).fontSize).toBe("13px");
    const button = getComputedStyle(entry("Place Order"));
    expect([button.minHeight, button.paddingTop, button.paddingLeft]).toEqual([
      "36px",
      "8px",
      "12px",
    ]);
    expect(entry("Place Order").getBoundingClientRect().height).toBeGreaterThanOrEqual(36);
    expect(button.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(entry("Order")).fontWeight).toBe("600");
    const heading = getComputedStyle(dialog()!.querySelector("thead th")!);
    expect(heading.borderBottomWidth).toBe("1px");
  });

  it("a click on a name closes the dialog, selects its stickies and changes neither history nor text", async () => {
    const diagram = await mount();
    const text = diagram.exportDSL();
    const commandStack = diagram.get<CommandStack>("commandStack");
    const handle = aggregatesOf(diagram).showDialog(dialogChrome(container!));

    await userEvent.click(entry("Order"));

    expect(handle.isOpen()).toBe(false);
    expect(dialog()).toBeNull();
    expect(selectedIds(diagram)).toEqual(["agg_order_1", "agg_order_2"]);
    expect(commandStack.canUndo()).toBe(false);
    expect(diagram.exportDSL()).toBe(text);
    expect(document.activeElement).toBe(canvasSvg());
  });

  it("a double click on a name keeps the selection it made and opens no label editor", async () => {
    const diagram = await mount();
    const text = diagram.exportDSL();
    aggregatesOf(diagram).showDialog(dialogChrome(container!));

    await userEvent.dblClick(entry("Order"));

    expect(dialog()).toBeNull();
    expect(selectedIds(diagram)).toEqual(["agg_order_1", "agg_order_2"]);
    expect(container!.querySelector(".event-storming-label-input")).toBeNull();
    expect(diagram.exportDSL()).toBe(text);

    const shipOrder = diagram.get<ElementRegistry>("elementRegistry").getGraphics("cmd_ship");
    await userEvent.click(shipOrder.querySelector(".djs-hit")!);
    expect(selectedIds(diagram)).toEqual(["cmd_ship"]);
  });

  it("Enter on a name does the same and hands the focus to the canvas", async () => {
    const diagram = await mount();
    aggregatesOf(diagram).showDialog(dialogChrome(container!));

    entry("Order Shipped").focus();
    await userEvent.keyboard("{Enter}");

    expect(dialog()).toBeNull();
    expect(selectedIds(diagram)).toEqual(["evt_shipped"]);
    expect(document.activeElement).toBe(canvasSvg());
  });

  it("selects on a read-only canvas too", async () => {
    const diagram = await mount();
    const text = diagram.exportDSL();
    diagram.get<EventStormingReadOnly>("eventStormingReadOnly").setReadOnly(true);
    aggregatesOf(diagram).showDialog(dialogChrome(container!));

    await userEvent.click(entry("Place Order"));

    expect(selectedIds(diagram)).toEqual(["cmd_place"]);
    expect(diagram.exportDSL()).toBe(text);
  });

  it("selects in the navigated viewer", async () => {
    const viewer = await mount({ viewer: true });
    aggregatesOf(viewer).showDialog(dialogChrome(container!));
    await userEvent.click(entry("Payment"));
    expect(selectedIds(viewer)).toEqual(["agg_payment"]);
  });

  it("scrolls stickies that fit into the free area without changing the zoom", async () => {
    const diagram = await mount({ insets: INSETS });
    const canvas = diagram.get<Canvas>("canvas");
    canvas.zoom(1);
    canvas.viewbox({ x: 2000, y: 2000, width: 1280, height: 720 });

    const revealed = aggregatesOf(diagram).reveal(["agg_order_1", "agg_order_2"]);

    expect(revealed.map((shape: EventStormingShape) => shape.id)).toEqual([
      "agg_order_1",
      "agg_order_2",
    ]);
    expect(canvas.zoom()).toBeCloseTo(1, 5);
    expect(onScreen(diagram, "agg_order_1", INSETS)).toBe(true);
    expect(onScreen(diagram, "agg_order_2", INSETS)).toBe(true);
  });

  it("zooms out until stickies far apart fit the free area, and never zooms in", async () => {
    const diagram = await mount({ insets: INSETS });
    const canvas = diagram.get<Canvas>("canvas");
    canvas.zoom(1);

    aggregatesOf(diagram).reveal(["cmd_place", "agg_payment"]);

    expect(canvas.zoom()).toBeLessThan(1);
    expect(onScreen(diagram, "cmd_place", INSETS)).toBe(true);
    expect(onScreen(diagram, "agg_payment", INSETS)).toBe(true);

    canvas.zoom(0.3);
    aggregatesOf(diagram).reveal(["cmd_place"]);
    expect(canvas.zoom()).toBeCloseTo(0.3, 5);
  });

  it("fits into the host's free rectangle as it is, its insets already holding the fit margins", async () => {
    const diagram = await mount({ insets: INSETS });
    const canvas = diagram.get<Canvas>("canvas");
    canvas.zoom(1);
    const registry = diagram.get<ElementRegistry>("elementRegistry");
    const box = getBBox(
      ["cmd_place", "agg_payment"].map((id) => registry.get(id) as EventStormingShape),
    );

    aggregatesOf(diagram).reveal(["cmd_place", "agg_payment"]);

    const freeWidth = 1280 - INSETS.left - INSETS.right;
    const freeHeight = 720 - INSETS.top - INSETS.bottom;
    expect(canvas.zoom()).toBeCloseTo(Math.min(freeWidth / box.width, freeHeight / box.height), 2);
  });

  it("scrolls a sticky up to the edge of the free rectangle, also where an inset is 0", async () => {
    const diagram = await mount({ insets: { top: 64, right: 0, bottom: 0, left: 0 } });
    const canvas = diagram.get<Canvas>("canvas");
    canvas.viewbox({ x: 5000, y: 0, width: 1280, height: 720 });

    aggregatesOf(diagram).reveal(["cmd_place"]);

    const hit = diagram
      .get<ElementRegistry>("elementRegistry")
      .getGraphics("cmd_place")
      .querySelector(".djs-hit")!
      .getBoundingClientRect();
    expect(canvas.zoom()).toBeCloseTo(1, 5);
    expect(hit.left - container!.getBoundingClientRect().left).toBeCloseTo(0, 0);
  });

  it("keeps the fit's side margin on every edge when no host gives insets", async () => {
    const diagram = await mount();
    const canvas = diagram.get<Canvas>("canvas");
    canvas.zoom(1);
    const registry = diagram.get<ElementRegistry>("elementRegistry");
    const box = getBBox(
      ["cmd_place", "agg_payment"].map((id) => registry.get(id) as EventStormingShape),
    );

    aggregatesOf(diagram).reveal(["cmd_place", "agg_payment"]);

    expect(canvas.zoom()).toBeCloseTo(
      Math.min((1280 - 48) / box.width, (720 - 48) / box.height),
      2,
    );
    const margin = { top: 24, right: 24, bottom: 24, left: 24 };
    expect(onScreen(diagram, "cmd_place", margin)).toBe(true);
    expect(onScreen(diagram, "agg_payment", margin)).toBe(true);
  });

  it("leaves out ids that are not on the canvas", async () => {
    const diagram = await mount();

    expect(aggregatesOf(diagram).reveal(["gone"])).toEqual([]);
    expect(
      aggregatesOf(diagram)
        .reveal(["gone", "cmd_ship"])
        .map((shape) => shape.id),
    ).toEqual(["cmd_ship"]);
    expect(selectedIds(diagram)).toEqual(["cmd_ship"]);
  });

  it("follows the board while it is open and keeps the focus on the same name", async () => {
    const diagram = await mount();
    aggregatesOf(diagram).showDialog(dialogChrome(container!));
    entry("Ship Order").focus();

    const payment = diagram.get<ElementRegistry>("elementRegistry").get("agg_payment");
    diagram
      .get<EventStormingModeling>("eventStormingModeling")
      .updateLabels([{ element: payment as EventStormingShape, label: "Invoice" }]);

    expect(entry("Invoice")).toBeDefined();
    expect(document.activeElement).toBe(entry("Ship Order"));

    await diagram.importDSL("title Other\naggregate Stock [100, 100]");
    expect(dialog()?.querySelector("tbody th")?.textContent).toBe("Stock");
    expect(document.activeElement).toBe(entry("Stock"));
  });

  it("keeps the focus on the same line's event when one event follows two commands", async () => {
    const diagram = await mount({
      board: [
        "title Shared event",
        "command Place Order [150, 200] (id cmd_place)",
        "command Book Order [150, 400] (id cmd_book)",
        "aggregate Order [350, 300] (id agg_order)",
        "event Order Placed [550, 300] (id evt_placed)",
        "aggregate ? [350, 700] (id agg_open_1)",
        "aggregate ? [550, 700] (id agg_open_2)",
        "command Wait [150, 700] (id cmd_wait)",
        "",
        "#cmd_place -> #agg_order",
        "#cmd_book -> #agg_order",
        "#agg_order -> #evt_placed",
        "#cmd_wait -> #agg_open_2",
      ].join("\n"),
    });
    aggregatesOf(diagram).showDialog(dialogChrome(container!));
    const named = (name: string) =>
      [
        ...(dialog()?.querySelectorAll<HTMLButtonElement>(".event-storming-aggregates-entry") ??
          []),
      ].filter((button) => button.textContent === name);
    const wait = diagram.get<ElementRegistry>("elementRegistry").get("cmd_wait");
    const renameWait = (label: string) =>
      diagram
        .get<EventStormingModeling>("eventStormingModeling")
        .updateLabels([{ element: wait as EventStormingShape, label }]);

    expect(named("Order Placed")).toHaveLength(2);
    named("Order Placed")[1]!.focus();
    renameWait("Wait longer");
    expect(document.activeElement).toBe(named("Order Placed")[1]);

    expect(named("?")).toHaveLength(2);
    named("?")[1]!.focus();
    renameWait("Wait");
    expect(document.activeElement).toBe(named("?")[1]);
  });

  it("keeps the focus on the same one of two wordless commands and their events", async () => {
    const diagram = await mount({
      board: [
        "title Wordless commands",
        "command ? [150, 200] (id cmd_open_1)",
        "command ? [150, 400] (id cmd_open_2)",
        "aggregate Order [350, 300] (id agg_order)",
        "event Order Placed [550, 300] (id evt_placed)",
        "command Wait [150, 700] (id cmd_wait)",
        "aggregate Stock [350, 700] (id agg_stock)",
        "",
        "#cmd_open_1 -> #agg_order",
        "#cmd_open_2 -> #agg_order",
        "#agg_order -> #evt_placed",
        "#cmd_wait -> #agg_stock",
      ].join("\n"),
    });
    aggregatesOf(diagram).showDialog(dialogChrome(container!));
    const named = (name: string) =>
      [
        ...(dialog()?.querySelectorAll<HTMLButtonElement>(".event-storming-aggregates-entry") ??
          []),
      ].filter((button) => button.textContent === name);
    const wait = diagram.get<ElementRegistry>("elementRegistry").get("cmd_wait");
    const renameWait = (label: string) =>
      diagram
        .get<EventStormingModeling>("eventStormingModeling")
        .updateLabels([{ element: wait as EventStormingShape, label }]);

    expect(named("?")).toHaveLength(2);
    named("?")[1]!.focus();
    renameWait("Wait longer");
    expect(document.activeElement).toBe(named("?")[1]);

    expect(named("Order Placed")).toHaveLength(2);
    named("Order Placed")[1]!.focus();
    renameWait("Wait");
    expect(document.activeElement).toBe(named("Order Placed")[1]);
  });

  it("says so in body text when the board under the open dialog loses its last aggregate", async () => {
    const diagram = await mount();
    aggregatesOf(diagram).showDialog(dialogChrome(container!));

    await diagram.importDSL("title Plain\ncommand Place Order [100, 100]");

    const empty = dialog()!.querySelector<HTMLElement>(".event-storming-aggregates-empty")!;
    expect(empty.textContent).toBe("The board has no named aggregates.");
    expect(dialog()!.querySelector("table")).toBeNull();
    expect([getComputedStyle(empty).fontSize, getComputedStyle(empty).lineHeight]).toEqual([
      "16px",
      "25.6px",
    ]);
  });

  it("says the same once the last named aggregate goes and only placeholders stay", async () => {
    const diagram = await mount();
    aggregatesOf(diagram).showDialog(dialogChrome(container!));

    await diagram.importDSL(PLACEHOLDER_BOARD);

    const empty = dialog()!.querySelector<HTMLElement>(".event-storming-aggregates-empty")!;
    expect(empty.textContent).toBe("The board has no named aggregates.");
    expect(dialog()!.querySelector("table")).toBeNull();
  });

  it("keeps the focus in the dialog, on that sentence, when a name had it", async () => {
    const diagram = await mount();
    aggregatesOf(diagram).showDialog(dialogChrome(container!));
    entry("Ship Order").focus();

    await diagram.importDSL("title Plain\ncommand Place Order [100, 100]");

    const empty = dialog()!.querySelector<HTMLElement>(".event-storming-aggregates-empty")!;
    expect(document.activeElement).toBe(empty);
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    expect(empty.tabIndex).toBe(-1);
  });

  it("closes with the diagram", async () => {
    const diagram = await mount();
    const handle = aggregatesOf(diagram).showDialog(dialogChrome(container!));

    diagram.destroy();
    modeler = undefined;

    expect(handle.isOpen()).toBe(false);
    expect(dialog()).toBeNull();
  });
});
