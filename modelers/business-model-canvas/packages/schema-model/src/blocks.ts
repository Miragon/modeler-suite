/** The nine building blocks of the Business Model Canvas, in reading order of the canvas. */
export const BLOCK_IDS = [
  "key-partners",
  "key-activities",
  "key-resources",
  "value-propositions",
  "customer-relationships",
  "channels",
  "customer-segments",
  "cost-structure",
  "revenue-streams",
] as const;

export type BlockId = (typeof BLOCK_IDS)[number];

export const BLOCK_TITLES: Readonly<Record<BlockId, string>> = {
  "key-partners": "Key Partners",
  "key-activities": "Key Activities",
  "key-resources": "Key Resources",
  "value-propositions": "Value Propositions",
  "customer-relationships": "Customer Relationships",
  channels: "Channels",
  "customer-segments": "Customer Segments",
  "cost-structure": "Cost Structure",
  "revenue-streams": "Revenue Streams",
};

/**
 * The order the method fills the canvas in: customers first, then what they get, then what it
 * takes. A block the canvas adds to a file lands at its place in this order.
 */
export const METHOD_ORDER: readonly BlockId[] = [
  "customer-segments",
  "value-propositions",
  "channels",
  "customer-relationships",
  "revenue-streams",
  "key-resources",
  "key-activities",
  "key-partners",
  "cost-structure",
];

export function isBlockId(key: string): key is BlockId {
  return (BLOCK_IDS as readonly string[]).includes(key);
}
