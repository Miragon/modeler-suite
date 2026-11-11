import type { BlockId } from "@miragon/business-model-canvas-schema-model";

/**
 * What an empty block asks, in Miragon's own words: the canvas's licence covers its layout, not
 * the official guiding questions.
 */
export const BLOCK_HINTS: Readonly<Record<BlockId, string>> = {
  "key-partners": "Who helps you deliver: suppliers, alliances, work you hand out?",
  "key-activities": "What must you do well so the offer works?",
  "key-resources": "What does the model rely on: people, technology, rights, money?",
  "value-propositions": "What do you offer each segment, and which problem goes away?",
  "customer-relationships": "How do you win, keep and grow each segment?",
  channels: "How do segments hear of you, buy from you and get help?",
  "customer-segments": "Which groups of people or organisations is this for? One sticky per group.",
  "cost-structure": "What costs the most, and which activities and resources drive it?",
  "revenue-streams": "What does each segment pay for, and how?",
};
