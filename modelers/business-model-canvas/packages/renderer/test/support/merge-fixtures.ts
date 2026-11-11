import { readText, serializeText } from "@miragon/business-model-canvas-dsl";
import type { MergeFixtures } from "@miragon/modeler-api/conformance";

export type Item = { id: string; text: string } & Record<string, unknown>;
type BlockJson = {
  items?: Item[];
  notes?: ({ text: string } & Record<string, unknown>)[];
};

export const item = (id: string, text: string, extra: Record<string, unknown> = {}): Item => ({
  id,
  text,
  ...extra,
});

/** A block's JSON: its items and, when given, its notes. */
export const block = (items: Item[] = [], notes?: BlockJson["notes"]): BlockJson => ({
  ...(items.length > 0 ? { items } : {}),
  ...(notes ? { notes } : {}),
});

/** The canonical text of a canvas with these blocks and canvas fields. */
export function canvas(blocks: Record<string, BlockJson>, header?: Record<string, string>): string {
  const text = JSON.stringify({ version: 1, ...(header ? { canvas: header } : {}), ...blocks });
  return serializeText(readText(text).document);
}

const HEADER = { title: "Shop" };
const SHOPPERS = item("online", "Shoppers", { color: "sky" });
const FAST = item("fast", "Fast delivery", { color: "sky" });
const FAIR = item("fair", "Fair prices");
const WEB_SHOP = item("web-shop", "Web shop", { color: "sky" });
const NEWSLETTER = item("newsletter", "Newsletter", { color: "peach" });
const REVIEW = [{ text: "Is fast enough to switch?" }];

const shop = (blocks: Record<string, BlockJson>, header: Record<string, string> = HEADER) =>
  canvas(
    {
      "customer-segments": block([SHOPPERS]),
      "value-propositions": block([FAST, FAIR]),
      channels: block([WEB_SHOP]),
      ...blocks,
    },
    header,
  );

/**
 * The merge kit's fixtures for `.bmc`: an agent writes the file while the user edits the canvas.
 * Every text is canonical (`serializeText` of its own parse).
 */
export const CANVAS_MERGE_FIXTURES: MergeFixtures = {
  base: shop({}),
  disjoint: [
    {
      name: "the agent adds a channel, the user gives a proposition a colour",
      external: shop({ channels: block([WEB_SHOP, NEWSLETTER]) }),
      draft: shop({ "value-propositions": block([{ ...FAST, color: "sun" }, FAIR]) }),
      merged: shop({
        "value-propositions": block([{ ...FAST, color: "sun" }, FAIR]),
        channels: block([WEB_SHOP, NEWSLETTER]),
      }),
    },
    {
      name: "the agent renames the canvas and adds a review note, the user moves a sticky to another block",
      external: shop(
        { "value-propositions": block([FAST, FAIR], REVIEW) },
        { title: "Online shop" },
      ),
      draft: shop({ "value-propositions": block([FAST]), "revenue-streams": block([FAIR]) }),
      merged: shop(
        { "value-propositions": block([FAST], REVIEW), "revenue-streams": block([FAIR]) },
        { title: "Online shop" },
      ),
    },
  ],
  conflicting: [
    {
      name: "the agent renames a sticky, the user gives it another colour",
      external: shop({ "customer-segments": block([{ ...SHOPPERS, text: "Online shoppers" }]) }),
      draft: shop({ "customer-segments": block([{ ...SHOPPERS, color: "peach" }]) }),
    },
    {
      name: "the agent colours a proposition, the user deletes it",
      external: shop({ "value-propositions": block([FAST, { ...FAIR, color: "lilac" }]) }),
      draft: shop({ "value-propositions": block([FAST]) }),
    },
    {
      name: "both move the same sticky, to different blocks",
      external: shop({ "value-propositions": block([FAST]), channels: block([WEB_SHOP, FAIR]) }),
      draft: shop({ "value-propositions": block([FAST]), "revenue-streams": block([FAIR]) }),
    },
  ],
  invalidTexts: [
    JSON.stringify({ channels: { items: [item("web", "Web"), item("web", "Shop")] } }),
    JSON.stringify({ channels: { items: [{ text: "No id" }] } }),
    '{ "channels": [',
  ],
  parse: (text) => readText(text).document,
};
