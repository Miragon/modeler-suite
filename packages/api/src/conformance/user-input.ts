import type { CollaborativeModeler } from "../index.js";
import type { ConformanceHarness, GestureKind } from "./harness.js";
import {
  changeEvents,
  errorOf,
  exportOrFail,
  fail,
  firstText,
  importFirstText,
  raceTheBound,
  settleOf,
} from "./support.js";

export const GESTURE_KINDS: readonly GestureKind[] = ["move", "create", "createOffCanvas"];

/**
 * a modeler may let an import wait while the user holds something or acts: without a bound, a
 * missed recommendation would hang the run instead of advising
 */
export const HELD_IMPORT_BOUND_MS = 2000;

type BoundedOutcome =
  { unsettled: true; rejected?: undefined } | { unsettled?: undefined; rejected?: string };

export const settledWithin = (promise: Promise<unknown>): Promise<BoundedOutcome> =>
  raceTheBound(
    promise.then(
      (): BoundedOutcome => ({}),
      (e: unknown): BoundedOutcome => ({ rejected: String(e) }),
    ),
    { unsettled: true },
    HELD_IMPORT_BOUND_MS,
  );

export interface LegFindings {
  findings: string[];
  /**
   * the leg's import waited for the user: the case advises on it and runs no further leg, whose
   * imports would queue behind one that may never settle
   */
  stop?: true;
}

const doNothing = (): void => undefined;

export async function importWhileHeld(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  text: string,
  onResolve: () => void = doNothing,
): Promise<{ calls: number; importing: Promise<unknown>; outcome: BoundedOutcome }> {
  let importing: Promise<unknown> = Promise.resolve();
  let outcome: BoundedOutcome = {};
  const { calls } = await changeEvents(h, m, async () => {
    importing = m.importText(text).then(onResolve);
    outcome = await settledWithin(importing);
  });
  return { calls, importing, outcome };
}

/** errors that reached the window while the kit listened: a throw in a pointer listener reaches no caller */
interface WindowErrors {
  readonly errors: string[];
  /** one finding per error, `around` saying when the errors came */
  findings(around: string): string[];
  stop(): void;
}

export function listenForWindowErrors(
  view: Window | undefined = typeof window === "undefined" ? undefined : window,
): WindowErrors {
  const errors: string[] = [];
  const findings = (around: string): string[] =>
    errors.map((error) => `an error reached the window ${around}: ${error}`);
  if (view === undefined) return { errors, findings, stop: doNothing };
  const onError = (event: ErrorEvent): void => {
    errors.push(String(event.error ?? event.message));
    event.preventDefault();
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    errors.push(String(event.reason));
    event.preventDefault();
  };
  view.addEventListener("error", onError);
  view.addEventListener("unhandledrejection", onRejection);
  return {
    errors,
    findings,
    stop: () => {
      view.removeEventListener("error", onError);
      view.removeEventListener("unhandledrejection", onRejection);
    },
  };
}

export interface InteractionWatch {
  readonly delivered: boolean[];
  /** deliveries during which `active()` returned another value than the listener got */
  mismatches: number;
  stop(): void;
}

export function watchInteraction(m: CollaborativeModeler): InteractionWatch | undefined {
  const interaction = m.interaction;
  if (!interaction) return undefined;
  const watch: InteractionWatch = { delivered: [], mismatches: 0, stop: doNothing };
  watch.stop = interaction.onChange((active) => {
    watch.delivered.push(active);
    if (interaction.active() !== active) watch.mismatches += 1;
  });
  return watch;
}

export interface ImportedLeg {
  text: string;
  what: string;
}

/** a different document, which usually removes what the user holds, then the same one again */
export function importedLegs(h: ConformanceHarness): ImportedLeg[] {
  const second = h.canonicalTexts[1];
  return [
    ...(second === undefined
      ? []
      : [{ text: second, what: "a different document (canonicalTexts[1])" }]),
    { text: firstText(h), what: "the same document (canonicalTexts[0])" },
  ];
}

export const oneTextOnly = (h: ConformanceHarness, what: string): string[] =>
  h.canonicalTexts[1] === undefined
    ? [
        `canonicalTexts holds one text — ${what} of a DIFFERENT document was not checked (add a second canonical text)`,
      ]
    : [];

export type GestureStarter = NonNullable<ConformanceHarness["startGesture"]>;

/**
 * the proof the gesture cases stand on: a drop the modeler still runs changes the document. Without
 * it, a drop after an import that applied nothing could be a gesture the import cancelled as well
 * as a harness whose drop never lands
 */
export async function expectDropApplies(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  startGesture: GestureStarter,
  kind: GestureKind,
): Promise<void> {
  await importFirstText(h, m);
  await settleOf(h)();
  const doc = exportOrFail(m, "after importing canonicalTexts[0]");
  const held = await startGesture(m, kind);
  await held.drop();
  await settleOf(h)();
  if (exportOrFail(m, `after startGesture(modeler, "${kind}") and its drop`) === doc) {
    fail(
      `startGesture(modeler, "${kind}") and drop() left the document as it was — the case proves nothing (drop() releases the gesture where it applies, so a drop the modeler still runs changes the document)`,
    );
  }
}

export interface ListenerImportResult {
  exported?: string;
  rejected?: string;
  unsettled?: true;
}

export const withinTheBound = (
  result: Promise<ListenerImportResult>,
): Promise<ListenerImportResult> => raceTheBound(result, { unsettled: true }, HELD_IMPORT_BOUND_MS);

/**
 * `exportText()`, or `undefined` where it throws: read in a Promise's callback, where a throw
 * would reach no case
 */
export function exportedNow(m: CollaborativeModeler): string | undefined {
  try {
    return m.exportText();
  } catch {
    return undefined;
  }
}

/**
 * `importText(text)` from a listener, its outcome caught at once: a rejection nobody awaits yet
 * would reach the window as an unhandled one
 */
export function importFromAListener(
  m: CollaborativeModeler,
  text: string,
  onSettled: () => void = doNothing,
): Promise<ListenerImportResult> {
  return m.importText(text).then(
    () => {
      onSettled();
      return { exported: exportedNow(m) };
    },
    (e: unknown) => {
      onSettled();
      return { rejected: String(e) };
    },
  );
}

/** an unsubscribe that runs at most once: the contract does not say that a second call is harmless */
export function once(unsubscribe: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    unsubscribe();
  };
}

export interface ActionLegFindings extends LegFindings {
  unverified?: string;
}

/**
 * the next `mutate` changes the document, and an undo brings it back: no action left anything
 * half done
 */
export async function nextMutateApplies(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  after: string,
): Promise<string[]> {
  const settle = settleOf(h);
  const before = exportedNow(m);
  if (before === undefined) return [`exportText() threw after ${after}`];
  let thrown: string | undefined;
  const next = await changeEvents(h, m, async () => {
    thrown = await errorOf(() => h.mutate(m));
  });
  if (thrown !== undefined) return [`the next mutate after ${after} threw ${thrown}`];
  if (next.calls === 0 || exportedNow(m) === before) {
    return [`the next mutate after ${after} did not apply (wedged)`];
  }
  const undo = h.undo;
  if (!undo) return [];
  const undoThrown = await errorOf(() => undo(m));
  await settle();
  if (undoThrown !== undefined) {
    return [`an undo of the next mutate after ${after} threw ${undoThrown}`];
  }
  return exportedNow(m) === before
    ? []
    : [`an undo of the next mutate after ${after} did not bring the document back (wedged)`];
}

export async function undoAfterTheImport(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  imported: string,
  after: string,
  what: string,
): Promise<string[]> {
  const undo = h.undo;
  if (!undo) return [];
  const thrown = await errorOf(() => undo(m));
  await settleOf(h)();
  if (thrown !== undefined) return [`an undo after ${after} threw ${thrown}`];
  return exportedNow(m) === imported
    ? []
    : [
        `an undo after ${after} changed the document — ${what} stayed on the fresh undo history (L4)`,
      ];
}

/**
 * the gestures whose start the drag-start case imports at: diagram-js activates a move once the
 * press has passed the drag threshold, a palette create at once
 */
export const DRAG_START_KINDS: readonly GestureKind[] = ["move", "create"];
