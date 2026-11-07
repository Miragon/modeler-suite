import { parseDSLWithDiagnostics } from "@miragon/event-storming-dsl";
import type { MergeFixtures } from "@miragon/modeler-api/conformance";

const lines = (...text: string[]): string => `${text.join("\n")}\n`;

const TITLE = "title Checkout";
const PLACE_ORDER = "command Place Order [240, 300]";
const ORDER_PLACED = "event Order Placed [620, 300]";
const KICKOFF = "note Kickoff [80, 80]";
const ARROW = "Place Order -> Order Placed";

/**
 * The merge kit's fixtures for `.storm`: an agent writes the file while the user edits the board.
 * Every text is canonical (`serializeDSL` of its own parse).
 */
export const STORM_MERGE_FIXTURES: MergeFixtures = {
  base: lines(TITLE, PLACE_ORDER, ORDER_PLACED, KICKOFF, ARROW),
  disjoint: [
    {
      name: "the agent appends a policy, the user moves a command and sets the level",
      external: lines(
        TITLE,
        PLACE_ORDER,
        ORDER_PLACED,
        KICKOFF,
        "policy Ship it [800, 300]",
        ARROW,
        "Order Placed -> Ship it",
      ),
      draft: lines(
        TITLE,
        "level design",
        "command Place Order [240, 340]",
        ORDER_PLACED,
        KICKOFF,
        ARROW,
      ),
      merged: lines(
        TITLE,
        "level design",
        "command Place Order [240, 340]",
        ORDER_PLACED,
        KICKOFF,
        "policy Ship it [800, 300]",
        ARROW,
        "Order Placed -> Ship it",
      ),
    },
    {
      name: "the agent rewrites the note, the user adds an event of the canvas and its arrow",
      external: lines(TITLE, PLACE_ORDER, ORDER_PLACED, "note Kick-off on Monday [80, 80]", ARROW),
      draft: lines(
        TITLE,
        PLACE_ORDER,
        ORDER_PLACED,
        "event Order Shipped [980, 300] (id event_k3x9q2ab)",
        KICKOFF,
        ARROW,
        "Order Placed -> Order Shipped",
      ),
      merged: lines(
        TITLE,
        PLACE_ORDER,
        ORDER_PLACED,
        "event Order Shipped [980, 300] (id event_k3x9q2ab)",
        "note Kick-off on Monday [80, 80]",
        ARROW,
        "Order Placed -> Order Shipped",
      ),
    },
    {
      name: "the user edits the note on the canvas, which keeps its id, the agent annotates the arrow",
      external: lines(
        TITLE,
        PLACE_ORDER,
        ORDER_PLACED,
        KICKOFF,
        "Place Order -> Order Placed; async",
      ),
      draft: lines(
        TITLE,
        PLACE_ORDER,
        ORDER_PLACED,
        "note Kickoff at ten [80, 80] (id note_kickoff)",
        ARROW,
      ),
      merged: lines(
        TITLE,
        PLACE_ORDER,
        ORDER_PLACED,
        "note Kickoff at ten [80, 80] (id note_kickoff)",
        "Place Order -> Order Placed; async",
      ),
    },
  ],
  conflicting: [
    {
      name: "both move the same command",
      external: lines(TITLE, "command Place Order [240, 500]", ORDER_PLACED, KICKOFF, ARROW),
      draft: lines(TITLE, "command Place Order [400, 300]", ORDER_PLACED, KICKOFF, ARROW),
    },
    {
      name: "the agent removes an event the user renamed",
      external: lines(TITLE, PLACE_ORDER, KICKOFF),
      draft: lines(
        TITLE,
        PLACE_ORDER,
        "event Order Confirmed [620, 300] (id event_order_placed)",
        KICKOFF,
        "Place Order -> Order Confirmed",
      ),
    },
    {
      name: "the agent removes an event the user draws a new arrow from",
      external: lines(TITLE, PLACE_ORDER, KICKOFF),
      draft: lines(
        TITLE,
        PLACE_ORDER,
        ORDER_PLACED,
        "policy Notify [800, 300]",
        KICKOFF,
        ARROW,
        "Order Placed -> Notify",
      ),
    },
    {
      name: "both retitle the board",
      external: lines("title Checkout v2", PLACE_ORDER, ORDER_PLACED, KICKOFF, ARROW),
      draft: lines("title Order checkout", PLACE_ORDER, ORDER_PLACED, KICKOFF, ARROW),
    },
  ],
  invalidTexts: [],
  parse(text) {
    const { board, diagnostics } = parseDSLWithDiagnostics(text);
    if (diagnostics.length > 0) throw new Error(diagnostics.map((d) => d.message).join("; "));
    return board;
  },
};
