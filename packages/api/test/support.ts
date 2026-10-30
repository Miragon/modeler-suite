/**
 * What the kit's two suites share: the reference harness, the case names the saboteur tables pin,
 * and runners that report what every case did. The node suite (conformance.test.ts) runs the cases
 * at once; the jsdom suite (keys.conformance.test.ts) runs them one after the other, because there
 * every modeler listens to the one document the keys case aims its keys at.
 */
import {
  attachedHost,
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
    startGesture: (m, kind) => (m as ReferenceModeler).holdGesture(kind),
    armTool: (m) => (m as ReferenceModeler).armLasso(),
    startPan: (m) => (m as ReferenceModeler).holdPan(),
    exportImage: (m) => (m as ReferenceModeler).exportSvg(),
    ...overrides,
  };
}

/** the reference harness, the modeler and the viewer mounted into attachedHost() (a DOM only) */
export function mounted(
  flaws: Flaws = {},
  overrides: Partial<ConformanceHarness> = {},
): ConformanceHarness {
  return harness(flaws, {
    create: async () => {
      const m = createReferenceModeler(flaws);
      m.attachTo(attachedHost());
      return m;
    },
    createReadonly: async () => {
      const viewer = createReferenceModeler(flaws, false);
      viewer.attachTo(attachedHost());
      return viewer;
    },
    ...overrides,
  });
}

export const CASE = {
  meta: "meta declares the notation, editability and a compatible apiVersion",
  preImport: "calls before the first import never wedge the instance",
  l1Fresh: "L1: importText is silent (no change events, for canonical, loose and foreign inputs)",
  l1History: "L1: importText over EXISTING undo history is silent too",
  l1Interaction: "L1: an interaction open during importText never commits",
  l1Gesture:
    "L1 (recommended, 1.5): an accepted import cancels a running gesture, its release included, and a rejected one leaves it running",
  drop: "drop (recommended, 1.6): an import from the change listener of a drop waits until the drop has ended, and its Promise settles after the import",
  userAction:
    "user action (recommended, 1.6): an import from the selection listener of a delete, an undo or a redo waits until the command has finished, and imports keep their call order",
  dragStart:
    "drag start (recommended, 1.6): an import from the selection listener at the start of a move or a palette create runs once the drag has started, and then ends it",
  pan: "pan (recommended, 1.6): a pan is no gesture, and it runs on through an import from the current view, the one the import left or the one the host restores",
  interaction:
    "interaction (when present, 1.5): active() follows every gesture to its drop and its cancel, never an armed tool, and onChange reports each change once",
  destroyFromListener:
    "destroy from a listener (recommended, 1.6): a host may destroy the modeler from its listener at a drag's start, a drop, an Escape, a reveal() or an import, nothing throws, no listener is called afterwards and that import rejects, and a listener unsubscribed during a delivery is not called",
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
  appearance:
    "appearance (when present, 1.5): a theme is view state, and a theme the modeler does not list draws themes[0], whatever mode the page shows",
  keys: "keys (recommended): a key aimed at the host's controls and editors or at <body> is left alone, a keydown or keyup without a key throws nothing, a key on the focused canvas acts",
  destroy: "destroy is safe to call twice",
};

/** the appearance case's skip without a DOM */
export const APPEARANCE_WITHOUT_DOM =
  "no DOM — the computed colours were not compared (run the kit in a browser, the modeler mounted into attachedHost())";

/** the user-action case's skip without a DOM: its delete presses a key on the canvas */
export const USER_ACTION_WITHOUT_DOM =
  "no DOM — a delete and the redo of a delete were not checked (both press Delete on the focused canvas: run the kit in a browser, the modeler mounted into attachedHost())";

/** whether the keys case, the colour half of the appearance case or the delete of the user-action
 *  case skipped for want of a DOM — what they do in the node suite */
export const skippedWithoutDom = (name: string, reason: string): boolean =>
  (name === CASE.keys && reason.startsWith("no DOM")) ||
  (name === CASE.appearance && reason === APPEARANCE_WITHOUT_DOM) ||
  (name === CASE.userAction && reason === USER_ACTION_WITHOUT_DOM);

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
