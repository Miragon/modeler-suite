/**
 * What the kit's two suites share: the reference harness, the case names the saboteur tables pin,
 * and runners that report what every case did. The node suite (conformance.test.ts) runs the cases
 * at once; the jsdom suite (keys.conformance.test.ts) runs them one after the other, because there
 * every modeler listens to the one document the keys case aims its keys at.
 */
import {
  type CaseOutcome,
  type ConformanceHarness,
  conformanceCases,
  registerConformance,
} from "../src/conformance.js";
import { createReferenceModeler, type Flaws, type ReferenceModeler } from "./reference-modeler.js";

export function harness(
  flaws: Flaws = {},
  overrides: Partial<ConformanceHarness> = {},
): ConformanceHarness {
  let counter = 0;
  return {
    create: async () => createReferenceModeler(flaws),
    createReadonly: async () => createReferenceModeler(flaws, false),
    canonicalTexts: ["alpha\nbeta\ngamma\n", "delta\n", "title: Tea\nalpha\n"],
    looseTexts: ["  beta \n\nalpha\ngamma\n\n"],
    invalidTexts: ["!boom\nalpha\n"],
    foreignTexts: [{ text: "% vendor: keep-me\nalpha\n", mustSurvive: ["% vendor: keep-me"] }],
    viewState: { zoom: 2, scrollX: 40 },
    mutate: (m) => (m as ReferenceModeler).addLine(`zz-${counter++}`),
    configMutations: [
      { name: "title", run: (m) => (m as ReferenceModeler).setTitle(`T${counter++}`) },
    ],
    undo: (m) => (m as ReferenceModeler).undoCommand(),
    redo: (m) => (m as ReferenceModeler).redoCommand(),
    moveElement: (m) => {
      const elementId = m.elements?.list()[0]?.id;
      if (elementId === undefined) throw new Error("the harness needs an element to move");
      (m as ReferenceModeler).moveLine(elementId, 40, 24);
      return elementId;
    },
    // a rejecting probe, so the conforming reference walks the rejection path too
    probeTexts: ["alpha\n!be"],
    openInteraction: (m) => {
      const elementId = m.elements?.list()[0]?.id;
      if (elementId === undefined) throw new Error("the harness needs an element to edit");
      (m as ReferenceModeler).editLabel(elementId, "typed, not committed");
    },
    interactionState: (m) => (m as ReferenceModeler).openLabelEditor(),
    commitInteraction: (m) => (m as ReferenceModeler).commitLabel(),
    ...overrides,
  };
}

export const CASE = {
  meta: "meta declares the notation, editability and a compatible apiVersion",
  preImport: "calls before the first import never wedge the instance",
  l1Fresh: "L1: importText is silent (no change events, for canonical, loose and foreign inputs)",
  l1History: "L1: importText over EXISTING undo history is silent too",
  l1Interaction: "L1: an interaction open during importText never commits",
  l2Fixpoint: "L2: canonical texts are byte fixpoints of import → export",
  l2Idempotent: "L2: canonicalization of loose input is idempotent",
  l3Mutation:
    "L3: a scripted user mutation fires onContentChanged, and the export already reflects it inside the listener",
  l3Config: "L3: config/axis edits fire onContentChanged too, with the export already updated",
  l3Unsubscribe: "L3: unsubscribe stops delivery",
  l3Undo: "L3: undo and redo fire onContentChanged and restore the export",
  l4: "L4: undo directly after an import is a no-op",
  l5Fresh: "L5: getViewState never throws before the first import",
  l5RoundTrip:
    "L5: view state round-trips across a re-import, an import fits the view — and none of it is document content",
  l5Interaction: "L5: a host's view change never commits an open interaction",
  elements:
    "elements (when present): stable ids across re-imports and unrelated edits, reveal and selection semantics",
  elementsRoundTrip:
    "elements (when present): ids and names survive export → import, in this and in a fresh instance",
  elementsCollision:
    "elements (when present, recommended): ids created on two peers at the same time do not collide",
  bounds:
    "elements.bounds (when present): a finite box in diagram coordinates for every listed id, undefined for an unknown one, live after a new element and a move",
  contentBounds:
    "contentBounds (when present): a finite box in diagram coordinates around every listed element, live after a new element, unchanged by zoom and scroll",
  l6Total: "L6: export is total after imports, user mutations and undo",
  l6Foreign: "L6: foreign content survives an import → export round-trip",
  l7NoTrace: "L7: a rejected import leaves no trace",
  l7Usable: "L7: the modeler stays usable after a rejected import",
  l7Probes: "L7: every rejection of a derived probe leaves no trace",
  viewer:
    "viewer (when shipped): read-only, silent, canonical, fits, reveals, keeps foreign content, unshaken by a rejected import",
  keys: "keys (recommended): a key aimed at the host's controls and editors or at <body> is left alone, a keydown without a key throws nothing, a key on the focused canvas acts",
  destroy: "destroy is safe to call twice",
};

/** whether the keys case skipped for want of a DOM — what it does in the node suite */
export const skippedWithoutDom = (name: string, reason: string): boolean =>
  name === CASE.keys && reason.startsWith("no DOM");

/** all at once (node), or one after the other (jsdom) */
export type Order = "concurrent" | "sequential";

async function inOrder<T>(tasks: Array<() => Promise<T>>, order: Order): Promise<T[]> {
  if (order === "concurrent") return Promise.all(tasks.map((task) => task()));
  const results: T[] = [];
  for (const task of tasks) results.push(await task());
  return results;
}

/** run every case against a harness; per case whether it failed and what it resolved with */
export async function runCases(
  h: ConformanceHarness,
  order: Order = "concurrent",
): Promise<Array<{ name: string; failed: boolean; outcome: CaseOutcome | undefined }>> {
  return inOrder(
    conformanceCases().map((c) => async () => {
      try {
        return { name: c.name, failed: false, outcome: (await c.run(h)) ?? undefined };
      } catch {
        return { name: c.name, failed: true, outcome: undefined };
      }
    }),
    order,
  );
}

/** run every case against a harness; the names of the failing ones */
export async function failingCases(
  h: ConformanceHarness,
  order: Order = "concurrent",
): Promise<string[]> {
  return (await runCases(h, order)).filter((r) => r.failed).map((r) => r.name);
}

/** run every case against a harness; one [case name, advice] pair per advisory */
export async function advisories(
  h: ConformanceHarness,
  order: Order = "concurrent",
): Promise<Array<[string, string]>> {
  return (await runCases(h, order)).flatMap((r) =>
    (r.outcome?.advisories ?? []).map((advice): [string, string] => [r.name, advice]),
  );
}

/** register against a fake runner that runs every case now; the skipped names, without the keys
 *  case's skip for want of a DOM (the jsdom suite runs that case) */
export async function skippedCases(
  h: ConformanceHarness,
  order: Order = "concurrent",
): Promise<{ ran: number; skipped: string[] }> {
  const skipped: string[] = [];
  const pending: Array<() => Promise<void>> = [];
  registerConformance(h, (_name, fn) => pending.push(fn), {
    onSkip: (name, reason) => {
      if (!skippedWithoutDom(name, reason)) skipped.push(name);
    },
  });
  await inOrder(pending, order);
  return { ran: pending.length, skipped: skipped.sort() };
}
