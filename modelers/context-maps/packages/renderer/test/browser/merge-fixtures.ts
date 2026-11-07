import {
  emptyDocument,
  parseDocumentText,
  serializeDocumentText,
  type BoundedContext,
  type CmDocument,
  type Relationship,
} from "@miragon/context-maps-schema-model";
import type { MergeFixtures } from "@miragon/modeler-api/conformance";

const context = (id: string, label: string, x: number): BoundedContext => ({
  id,
  label,
  position: { x, y: 100 },
  size: { width: 220, height: 120 },
});
const ORDERS = context("ctx_orders", "Orders", 0);
const BILLING = context("ctx_billing", "Billing", 400);
const SHIPPING = context("ctx_shipping", "Shipping", 800);
const ORDERS_TO_BILLING: Relationship = {
  id: "rel_orders_billing",
  from: "ctx_orders",
  to: "ctx_billing",
  pattern: "customer-supplier",
};

function text(
  contexts: BoundedContext[],
  relationships: Relationship[] = [ORDERS_TO_BILLING],
  title = "Shop",
): string {
  const document: CmDocument = { ...emptyDocument(title), contexts, relationships };
  return serializeDocumentText(document);
}

/** The merge kit's fixtures for `.cm.json`: an agent writes the file while the user edits it. */
export const CONTEXT_MAP_MERGE_FIXTURES: MergeFixtures = {
  base: text([ORDERS, BILLING]),
  disjoint: [
    {
      name: "the agent adds a context, the user renames another",
      external: text([ORDERS, BILLING, SHIPPING]),
      draft: text([{ ...ORDERS, label: "Ordering" }, BILLING]),
      merged: text([{ ...ORDERS, label: "Ordering" }, BILLING, SHIPPING]),
    },
    {
      name: "the agent retitles the map, the user changes the relationship's pattern",
      external: text([ORDERS, BILLING], [ORDERS_TO_BILLING], "Shop 2026"),
      draft: text([ORDERS, BILLING], [{ ...ORDERS_TO_BILLING, pattern: "partnership" }]),
      merged: text(
        [ORDERS, BILLING],
        [{ ...ORDERS_TO_BILLING, pattern: "partnership" }],
        "Shop 2026",
      ),
    },
  ],
  conflicting: [
    {
      name: "both rename the same context",
      external: text([{ ...ORDERS, label: "Order intake" }, BILLING]),
      draft: text([{ ...ORDERS, label: "Ordering" }, BILLING]),
    },
    {
      name: "the agent removes a context the user's new relationship leads to",
      external: text([ORDERS], []),
      draft: text(
        [ORDERS, BILLING],
        [ORDERS_TO_BILLING, { ...ORDERS_TO_BILLING, id: "rel_2", pattern: "partnership" }],
      ),
    },
  ],
  invalidTexts: ['{ "version": 1, "contexts": ['],
  parse(text) {
    const parsed = parseDocumentText(text);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.document;
  },
};
