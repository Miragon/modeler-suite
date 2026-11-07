import {
  createEmptyDocument,
  parseDocumentJSON,
  serializeDocument,
  type ChainConnection,
  type DiagramElement,
  type ValueChainDocument,
} from "@miragon/value-chain-schema-model";
import type { MergeFixtures } from "@miragon/modeler-api/conformance";

const step = (id: string, name: string, x: number): DiagramElement => ({
  id,
  elementType: "step",
  name,
  bounds: { x, y: 0, width: 160, height: 60 },
});
const SALES: DiagramElement = {
  id: "unit_sales",
  elementType: "orgUnit",
  name: "Sales",
  bounds: { x: 0, y: 120, width: 130, height: 60 },
};
const ORDER = step("step_order", "Order", 0);
const SHIP = step("step_ship", "Ship", 200);
const FLOW: ChainConnection = {
  id: "flow_1",
  connectionType: "sequence",
  source: "step_order",
  target: "step_ship",
  waypoints: [
    { x: 160, y: 30 },
    { x: 200, y: 30 },
  ],
};

function text(
  elements: readonly DiagramElement[],
  connections: readonly ChainConnection[] = [FLOW],
  name = "Order to cash",
): string {
  const document: ValueChainDocument = { ...createEmptyDocument(name), elements, connections };
  return serializeDocument(document);
}

/** The merge kit's fixtures for `.vc.json`: an agent writes the file while the user edits it. */
export const VALUE_CHAIN_MERGE_FIXTURES: MergeFixtures = {
  base: text([ORDER, SHIP, SALES]),
  disjoint: [
    {
      name: "the agent adds a step, the user renames another",
      external: text([ORDER, SHIP, SALES, step("step_invoice", "Invoice", 400)]),
      draft: text([{ ...ORDER, name: "Take order" }, SHIP, SALES]),
      merged: text([
        { ...ORDER, name: "Take order" },
        SHIP,
        SALES,
        step("step_invoice", "Invoice", 400),
      ]),
    },
    {
      name: "the agent renames the diagram, the user removes the org unit",
      external: text([ORDER, SHIP, SALES], [FLOW], "Order to cash, 2026"),
      draft: text([ORDER, SHIP]),
      merged: text([ORDER, SHIP], [FLOW], "Order to cash, 2026"),
    },
  ],
  conflicting: [
    {
      name: "both rename the same step",
      external: text([{ ...ORDER, name: "Receive order" }, SHIP, SALES]),
      draft: text([{ ...ORDER, name: "Take order" }, SHIP, SALES]),
    },
    {
      name: "the agent removes a step the user's connection leads to",
      external: text([ORDER, SALES], []),
      draft: text(
        [ORDER, SHIP, SALES],
        [FLOW, { ...FLOW, id: "flow_2", connectionType: "assignment", source: "unit_sales" }],
      ),
    },
  ],
  invalidTexts: ['{ "elements": [ }'],
  parse: parseDocumentJSON,
};
