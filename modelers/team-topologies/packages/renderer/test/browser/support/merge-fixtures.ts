import {
  emptyDocument,
  serializeDocument,
  type InteractionShape,
  type TeamNode,
  type TextAnnotation,
  type TtDocument,
} from "@miragon/team-topologies-schema-model";
import type { MergeFixtures } from "@miragon/modeler-api/conformance";
import { parseDocumentText } from "@miragon/team-topologies-renderer";

const team = (id: string, label: string, x: number): TeamNode => ({
  id,
  type: "stream-aligned",
  label,
  position: { x, y: 100 },
  size: { width: 300, height: 80 },
});
const CHECKOUT = team("team_checkout", "Checkout", 0);
const PAYMENTS = team("team_payments", "Payments", 400);
const COLLABORATION: InteractionShape = {
  id: "interaction_1",
  mode: "collaboration",
  position: { x: 300, y: 100 },
  size: { width: 100, height: 80 },
};
const NOTE: TextAnnotation = {
  id: "note_1",
  text: "Owns the cart",
  position: { x: 0, y: 220 },
  size: { width: 200, height: 40 },
  attachedTo: "team_checkout",
};

function text(
  nodes: TeamNode[],
  annotations: TextAnnotation[] = [NOTE],
  title = "Online shop",
): string {
  const document: TtDocument = {
    ...emptyDocument(title),
    nodes,
    interactions: [COLLABORATION],
    annotations,
  };
  return serializeDocument(document);
}

/** The merge kit's fixtures for `.tt`: an agent writes the file while the user edits it. */
export const TEAM_TOPOLOGIES_MERGE_FIXTURES: MergeFixtures = {
  base: text([CHECKOUT, PAYMENTS]),
  disjoint: [
    {
      name: "the agent adds a platform team, the user renames a stream-aligned one",
      external: text([
        CHECKOUT,
        PAYMENTS,
        { ...team("team_platform", "Platform", 800), type: "platform" },
      ]),
      draft: text([{ ...CHECKOUT, label: "Checkout and cart" }, PAYMENTS]),
      merged: text([
        { ...CHECKOUT, label: "Checkout and cart" },
        PAYMENTS,
        { ...team("team_platform", "Platform", 800), type: "platform" },
      ]),
    },
    {
      name: "the agent retitles the diagram, the user removes the annotation",
      external: text([CHECKOUT, PAYMENTS], [NOTE], "Online shop 2026"),
      draft: text([CHECKOUT, PAYMENTS], []),
      merged: text([CHECKOUT, PAYMENTS], [], "Online shop 2026"),
    },
  ],
  conflicting: [
    {
      name: "both move the same team",
      external: text([{ ...CHECKOUT, position: { x: 0, y: 300 } }, PAYMENTS]),
      draft: text([{ ...CHECKOUT, position: { x: 50, y: 100 } }, PAYMENTS]),
    },
    {
      name: "the agent removes the team the user pins a new annotation to",
      external: text([CHECKOUT], [NOTE]),
      draft: text(
        [CHECKOUT, PAYMENTS],
        [NOTE, { ...NOTE, id: "note_2", text: "Runs the PSP", attachedTo: "team_payments" }],
      ),
    },
  ],
  invalidTexts: ['{ "version": 3, "nodes": ['],
  parse: parseDocumentText,
};
