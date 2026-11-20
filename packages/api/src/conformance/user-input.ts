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
      (error: unknown): BoundedOutcome => ({ rejected: String(error) }),
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
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  text: string,
  onResolve: () => void = doNothing,
): Promise<{ calls: number; importing: Promise<unknown>; outcome: BoundedOutcome }> {
  let importing: Promise<unknown> = Promise.resolve();
  let outcome: BoundedOutcome = {};
  const { calls } = await changeEvents(harness, modeler, async () => {
    importing = modeler.importText(text).then(onResolve);
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

export function watchInteraction(modeler: CollaborativeModeler): InteractionWatch | undefined {
  const interaction = modeler.interaction;
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
export function importedLegs(harness: ConformanceHarness): ImportedLeg[] {
  const second = harness.canonicalTexts[1];
  return [
    ...(second === undefined
      ? []
      : [{ text: second, what: "a different document (canonicalTexts[1])" }]),
    { text: firstText(harness), what: "the same document (canonicalTexts[0])" },
  ];
}

export const oneTextOnly = (harness: ConformanceHarness, what: string): string[] =>
  harness.canonicalTexts[1] === undefined
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
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  startGesture: GestureStarter,
  kind: GestureKind,
): Promise<void> {
  await importFirstText(harness, modeler);
  await settleOf(harness)();
  const doc = exportOrFail(modeler, "after importing canonicalTexts[0]");
  const held = await startGesture(modeler, kind);
  await held.drop();
  await settleOf(harness)();
  if (exportOrFail(modeler, `after startGesture(modeler, "${kind}") and its drop`) === doc) {
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
export function exportedNow(modeler: CollaborativeModeler): string | undefined {
  try {
    return modeler.exportText();
  } catch {
    return undefined;
  }
}

/**
 * `importText(text)` from a listener, its outcome caught at once: a rejection nobody awaits yet
 * would reach the window as an unhandled one
 */
export function importFromAListener(
  modeler: CollaborativeModeler,
  text: string,
  onSettled: () => void = doNothing,
): Promise<ListenerImportResult> {
  return modeler.importText(text).then(
    () => {
      onSettled();
      return { exported: exportedNow(modeler) };
    },
    (error: unknown) => {
      onSettled();
      return { rejected: String(error) };
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
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  after: string,
): Promise<string[]> {
  const settle = settleOf(harness);
  const before = exportedNow(modeler);
  if (before === undefined) return [`exportText() threw after ${after}`];
  let thrown: string | undefined;
  const next = await changeEvents(harness, modeler, async () => {
    thrown = await errorOf(() => harness.mutate(modeler));
  });
  if (thrown !== undefined) return [`the next mutate after ${after} threw ${thrown}`];
  if (next.calls === 0 || exportedNow(modeler) === before) {
    return [`the next mutate after ${after} did not apply (wedged)`];
  }
  const undo = harness.undo;
  if (!undo) return [];
  const undoThrown = await errorOf(() => undo(modeler));
  await settle();
  if (undoThrown !== undefined) {
    return [`an undo of the next mutate after ${after} threw ${undoThrown}`];
  }
  return exportedNow(modeler) === before
    ? []
    : [`an undo of the next mutate after ${after} did not bring the document back (wedged)`];
}

/**
 * the next `mutate` changes the document, where a throw of `mutate` or of `exportText()` fails the
 * case, as the gesture, the pan and the drop case hold it: `exportedAfter` names the step in the
 * failure, `after` in the finding
 */
export async function nextMutateAppliesOrFail(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  exportedAfter: string,
  after: string,
): Promise<string[]> {
  const before = exportOrFail(modeler, `before the next mutate after ${exportedAfter}`);
  const next = await changeEvents(harness, modeler, () => harness.mutate(modeler));
  return next.calls === 0 ||
    exportOrFail(modeler, `after the next mutate after ${exportedAfter}`) === before
    ? [`the next mutate after ${after} did not apply (wedged)`]
    : [];
}

export async function undoAfterTheImport(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  imported: string,
  after: string,
  what: string,
): Promise<string[]> {
  const undo = harness.undo;
  if (!undo) return [];
  const thrown = await errorOf(() => undo(modeler));
  await settleOf(harness)();
  if (thrown !== undefined) return [`an undo after ${after} threw ${thrown}`];
  return exportedNow(modeler) === imported
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
