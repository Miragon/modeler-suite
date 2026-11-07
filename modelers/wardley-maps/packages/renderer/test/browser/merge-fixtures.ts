import { parseDSLWithDiagnostics } from "@miragon/wardley-dsl";
import type { MergeFixtures } from "@miragon/modeler-api/conformance";

const lines = (...text: string[]): string => `${text.join("\n")}\n`;

const TITLE = "title Tea Shop";
const BUSINESS = "anchor Business [0.95, 0.63]";
const CUP = "component Cup of Tea [0.79, 0.61]";
const TEA = "component Tea [0.63, 0.81]";
const WATER = "component Hot Water [0.52, 0.8]";
const TO_CUP = "Business -> Cup of Tea";
const TO_TEA = "Cup of Tea -> Tea";
const TO_WATER = "Cup of Tea -> Hot Water";

/**
 * The merge kit's fixtures for OWM: an agent writes the file while the user edits the map. Every
 * text is canonical (`serializeDSL` of its own parse).
 */
export const OWM_MERGE_FIXTURES: MergeFixtures = {
  base: lines(TITLE, BUSINESS, CUP, TEA, WATER, TO_CUP, TO_TEA, TO_WATER),
  disjoint: [
    {
      name: "the agent adds a kettle, the user moves the tea",
      external: lines(
        TITLE,
        BUSINESS,
        CUP,
        TEA,
        WATER,
        "component Kettle [0.43, 0.35]",
        TO_CUP,
        TO_TEA,
        TO_WATER,
        "Hot Water -> Kettle",
      ),
      draft: lines(
        TITLE,
        BUSINESS,
        CUP,
        "component Tea [0.63, 0.75]",
        WATER,
        TO_CUP,
        TO_TEA,
        TO_WATER,
      ),
      merged: lines(
        TITLE,
        BUSINESS,
        CUP,
        "component Tea [0.63, 0.75]",
        WATER,
        "component Kettle [0.43, 0.35]",
        TO_CUP,
        TO_TEA,
        TO_WATER,
        "Hot Water -> Kettle",
      ),
    },
    {
      name: "the agent retitles the map, the user removes the hot water",
      external: lines("title Tea Shop 2026", BUSINESS, CUP, TEA, WATER, TO_CUP, TO_TEA, TO_WATER),
      draft: lines(TITLE, BUSINESS, CUP, TEA, TO_CUP, TO_TEA),
      merged: lines("title Tea Shop 2026", BUSINESS, CUP, TEA, TO_CUP, TO_TEA),
    },
  ],
  conflicting: [
    {
      name: "both move the tea",
      external: lines(
        TITLE,
        BUSINESS,
        CUP,
        "component Tea [0.63, 0.5]",
        WATER,
        TO_CUP,
        TO_TEA,
        TO_WATER,
      ),
      draft: lines(
        TITLE,
        BUSINESS,
        CUP,
        "component Tea [0.7, 0.81]",
        WATER,
        TO_CUP,
        TO_TEA,
        TO_WATER,
      ),
    },
    {
      name: "the agent moves the tea the user renamed",
      external: lines(
        TITLE,
        BUSINESS,
        CUP,
        "component Tea [0.63, 0.5]",
        WATER,
        TO_CUP,
        TO_TEA,
        TO_WATER,
      ),
      draft: lines(
        TITLE,
        BUSINESS,
        CUP,
        "component Green Tea [0.63, 0.81]",
        WATER,
        TO_CUP,
        "Cup of Tea -> Green Tea",
        TO_WATER,
      ),
    },
    {
      name: "the agent removes the hot water the user draws a new dependency to",
      external: lines(TITLE, BUSINESS, CUP, TEA, TO_CUP, TO_TEA),
      draft: lines(TITLE, BUSINESS, CUP, TEA, WATER, TO_CUP, TO_TEA, TO_WATER, "Tea -> Hot Water"),
    },
  ],
  invalidTexts: [],
  parse(text) {
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    if (diagnostics.length > 0) throw new Error(diagnostics.map((d) => d.message).join("; "));
    return map;
  },
};
