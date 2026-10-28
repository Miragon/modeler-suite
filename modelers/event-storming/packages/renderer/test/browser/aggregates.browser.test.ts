import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import {
  AGGREGATES_DIALOG_CLASS,
  AGGREGATES_DIALOG_TITLE,
  Modeler,
  NavigatedViewer,
  type AggregatesDialogChrome,
  type AggregatesDialogOptions,
  type EventStormingAggregates,
  type EventStormingModeling,
  type EventStormingReadOnly,
  type EventStormingShape,
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

/** Where a sticky stands on the screen, against the container's box minus the chrome's insets. */
function onScreen(diagram: Modeler, id: string, insets = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const box = diagram
    .get<ElementRegistry>("elementRegistry")
    .getGraphics(id)
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
    expect(shown.querySelector(".event-storming-aggregates-hint")?.textContent).toBe(
      "Choose a name to select its stickies on the board.",
    );
  });

  it("opens one dialog at a time", async () => {
    const diagram = await mount();
    const chrome = dialogChrome(container!);

    const first = aggregatesOf(diagram).showDialog(chrome);
    const second = aggregatesOf(diagram).showDialog(chrome);

    expect(second).toBe(first);
    expect(chrome.opened).toBe(1);
  });

  it("draws the table in 13px with names as 28px ghost buttons in the text role", async () => {
    const diagram = await mount();
    aggregatesOf(diagram).showDialog(dialogChrome(container!));

    const table = getComputedStyle(dialog()!.querySelector("table")!);
    expect([table.fontSize, table.borderCollapse]).toEqual(["13px", "collapse"]);
    const button = getComputedStyle(entry("Place Order"));
    expect(button.minHeight).toBe("28px");
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

  it("says so in body text when the board under the open dialog loses its last aggregate", async () => {
    const diagram = await mount();
    aggregatesOf(diagram).showDialog(dialogChrome(container!));

    await diagram.importDSL("title Plain\ncommand Place Order [100, 100]");

    const empty = dialog()!.querySelector<HTMLElement>(".event-storming-aggregates-empty")!;
    expect(empty.textContent).toBe("The board has no aggregates.");
    expect(dialog()!.querySelector("table")).toBeNull();
    expect([getComputedStyle(empty).fontSize, getComputedStyle(empty).lineHeight]).toEqual([
      "16px",
      "25.6px",
    ]);
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
