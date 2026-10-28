import { describeCanvas, sameCanvas, similarCanvas } from "./canvas-facts.js";
import type { PlatformKeys } from "./launch.js";
import type { VsCodeSmokeHistoryResult, VsCodeSmokeHistoryView } from "./result.js";
import { delay, pollUntil } from "./wait.js";
import type { CanvasFacts, ViewFacts } from "./webview.js";

/** diagram-js rounds a zoom to three decimals. */
const SCALE_TOLERANCE = 0.001;
/** A viewbox the modeler restores after an import lands within a pixel of the one it kept. */
const TRANSLATION_TOLERANCE_PX = 1;
const LISTED_IDS = 3;

/** What the history step reads and does in a running VS Code. */
export interface HistorySession {
  keys: PlatformKeys;
  /** A Playwright chord, its key last as a `KeyboardEvent.code` (`Control+Equal`) or a letter (`Control+z`). */
  press(chord: string): Promise<void>;
  /** Clears the webview's text selection and focuses the canvas `<svg>`; whether it holds the focus then. */
  focusCanvas(): Promise<boolean>;
  canvas(): Promise<CanvasFacts>;
  view(): Promise<ViewFacts>;
  /** The active editor has unsaved changes. */
  dirty(): Promise<boolean>;
}

export interface HistoryCheckOptions {
  /** The canvas as the edit left it, which the redo has to bring back. */
  edited: CanvasFacts;
  /** The canvas as the fixture shows it, which the undo has to bring back. */
  original: CanvasFacts;
  /** How many document edits the edit made: the redo and the undo press their key that often. */
  steps: number;
  /** How long the canvas may take to show what a document change did to it. */
  canvasTimeoutMs: number;
  /** How long a key may take to change the view, and the view to settle on what it kept. */
  effectTimeoutMs: number;
  /** How long the view must hold after it matched, since a refit may follow an import. */
  graceMs: number;
  intervalMs: number;
}

export function sameView(a: ViewFacts, b: ViewFacts): boolean {
  return (
    Math.abs(a.scale - b.scale) <= SCALE_TOLERANCE &&
    Math.abs(a.translateX - b.translateX) <= TRANSLATION_TOLERANCE_PX &&
    Math.abs(a.translateY - b.translateY) <= TRANSLATION_TOLERANCE_PX
  );
}

export interface SelectionChange {
  /** Selected before, still drawn, no longer selected. */
  lost: string[];
  /** Selected now, not selected before. */
  gained: string[];
}

/**
 * What a re-import did to the selection. An element the import took away (the undone one) is in
 * neither list: a host keeps what the new document still has, as the modelers' webviews do.
 */
export function selectionChange(before: ViewFacts, after: ViewFacts): SelectionChange {
  const drawn = new Set(after.elements);
  const selectedBefore = new Set(before.selected);
  const selectedAfter = new Set(after.selected);
  return {
    lost: before.selected.filter((id) => drawn.has(id) && !selectedAfter.has(id)),
    gained: after.selected.filter((id) => !selectedBefore.has(id)),
  };
}

/**
 * The selection was something and none of it is drawn any more: an import that gives every element
 * a new id leaves the step nothing to follow, and would pass it whatever happens to the selection.
 */
export function replacedEveryId(before: ViewFacts, after: ViewFacts): boolean {
  const drawn = new Set(after.elements);
  return before.selected.length > 0 && before.selected.every((id) => !drawn.has(id));
}

function summarize(view: ViewFacts): VsCodeSmokeHistoryView {
  return { zoom: Math.round(view.scale * 100), selected: view.selected.length };
}

function describeViewport(view: ViewFacts): string {
  return `zoom ${summarize(view).zoom}% at ${Math.round(view.translateX)}, ${Math.round(view.translateY)}`;
}

function listIds(ids: readonly string[]): string {
  const listed = ids.slice(0, LISTED_IDS).join(", ");
  return ids.length > LISTED_IDS ? `${listed} and ${ids.length - LISTED_IDS} more` : listed;
}

function labelOf(chord: string, steps: number): string {
  return steps > 1 ? `${chord} ${steps} times` : chord;
}

/**
 * Waits for the view and the selection to be what `previous` was, then holds that for `graceMs`
 * and reports what differs. A modeler restores both right after an import, so the first read after
 * the canvas changed already shows them; the wait is for a host that restores late.
 */
async function checkViewKept(
  session: HistorySession,
  options: HistoryCheckOptions,
  previous: ViewFacts,
  label: string,
  failures: string[],
): Promise<ViewFacts> {
  const kept = (view: ViewFacts) => {
    const { lost, gained } = selectionChange(previous, view);
    return (
      sameView(previous, view) &&
      lost.length === 0 &&
      gained.length === 0 &&
      !replacedEveryId(previous, view)
    );
  };
  const settled = await pollUntil(
    () => session.view(),
    kept,
    options.effectTimeoutMs,
    options.intervalMs,
  );
  await delay(options.graceMs);
  const now = settled.met ? await session.view() : settled.value;
  if (!sameView(previous, now)) {
    failures.push(
      `${label} moved the view: ${describeViewport(previous)} before, ${describeViewport(now)} after`,
    );
  }
  if (replacedEveryId(previous, now)) {
    failures.push(
      `${label} gave every selected element a new id (${listIds(previous.selected)} are not on the canvas any more), so the selection cannot be followed`,
    );
  }
  const { lost, gained } = selectionChange(previous, now);
  if (lost.length > 0) {
    failures.push(
      `${label} dropped the selection of ${listIds(lost)}, which ${lost.length === 1 ? "is" : "are"} still on the canvas`,
    );
  }
  if (gained.length > 0) {
    failures.push(
      `${label} selected ${listIds(gained)}, which ${gained.length === 1 ? "was" : "were"} not selected before`,
    );
  }
  return now;
}

/**
 * The history step (0.8): the redo of the edit and the undo that takes it back again leave the
 * view and the selection alone. The host owns the document's history (guide §13.5), so a key
 * reaches VS Code, VS Code changes the text, and the webview imports it; what the user zoomed
 * and selected has to survive that import. To make that count, the step first zooms away from the
 * fit and selects every element, then presses the redo key, then the undo key.
 */
export async function checkHistory(
  session: HistorySession,
  options: HistoryCheckOptions,
): Promise<{ result: VsCodeSmokeHistoryResult; failures: string[] }> {
  const failures: string[] = [];
  const result: VsCodeSmokeHistoryResult = {};
  const { modifier, redo, undo, save } = session.keys;

  if (!(await session.focusCanvas())) {
    failures.push("the canvas <svg> did not take the focus");
    return { result, failures };
  }

  const fitScale = (await session.view()).scale;
  let zoomed = false;
  for (const chord of [`${modifier}+Equal`, `${modifier}+Minus`]) {
    await session.press(chord);
    const moved = await pollUntil(
      () => session.view(),
      (view) => Math.abs(view.scale - fitScale) > SCALE_TOLERANCE,
      options.effectTimeoutMs,
      options.intervalMs,
    );
    if (moved.met) {
      zoomed = true;
      break;
    }
  }
  if (!zoomed) {
    failures.push(
      `${modifier}+Equal and ${modifier}+Minus left the zoom at ${Math.round(fitScale * 100)}%, so the view the history has to keep is the one a refit would restore`,
    );
  }

  const selectAll = `${modifier}+KeyA`;
  await session.press(selectAll);
  const selected = await pollUntil(
    () => session.view(),
    (view) => view.selected.length > 0,
    options.effectTimeoutMs,
    options.intervalMs,
  );
  if (!selected.met) {
    failures.push(
      `${selectAll} selected no element of the canvas, so the history has no selection to keep`,
    );
  }
  await delay(options.graceMs);

  const kept = await session.view();
  result.before = summarize(kept);

  const pressSteps = async (chord: string) => {
    for (let step = 0; step < options.steps; step++) await session.press(chord);
  };

  // An edit that moved no shape by more than the tolerance would let a redo that did nothing pass.
  const showsEdit = similarCanvas(options.original, options.edited) ? sameCanvas : similarCanvas;
  await pressSteps(redo);
  const redone = await pollUntil(
    () => session.canvas(),
    (facts) => showsEdit(facts, options.edited),
    options.canvasTimeoutMs,
    options.intervalMs,
  );
  let previous = kept;
  if (!redone.met) {
    failures.push(
      `${labelOf(redo, options.steps)} did not bring the edit back: the canvas shows ${describeCanvas(redone.value)}, after the edit ${describeCanvas(options.edited)}`,
    );
  } else {
    // A canvas that shows the same shapes before and after the edit cannot tell a redo from none.
    const changedDocument = await pollUntil(
      () => session.dirty(),
      (dirty) => dirty,
      options.effectTimeoutMs,
      options.intervalMs,
    );
    if (!changedDocument.met) {
      failures.push(
        `${labelOf(redo, options.steps)} did not change the document: VS Code does not call it changed, so the canvas did not come from the redo`,
      );
    }
    previous = await checkViewKept(session, options, kept, labelOf(redo, options.steps), failures);
    result.afterRedo = summarize(previous);
  }

  await pressSteps(undo);
  const undone = await pollUntil(
    () => session.canvas(),
    (facts) => sameCanvas(facts, options.original),
    options.canvasTimeoutMs,
    options.intervalMs,
  );
  if (!undone.met) {
    failures.push(
      `${labelOf(undo, options.steps)} after the redo did not bring the canvas back: it shows ${describeCanvas(undone.value)}, before the edit ${describeCanvas(options.original)}`,
    );
  } else {
    const afterUndo = await checkViewKept(
      session,
      options,
      previous,
      labelOf(undo, options.steps),
      failures,
    );
    result.afterUndo = summarize(afterUndo);
  }

  // The undo takes the document back to the text on disk; if VS Code still calls it changed, save,
  // so that closing VS Code does not wait on a prompt.
  const clean = await pollUntil(
    () => session.dirty(),
    (dirty) => !dirty,
    options.effectTimeoutMs,
    options.intervalMs,
  );
  if (!clean.met) {
    await session.press(save);
    await pollUntil(
      () => session.dirty(),
      (dirty) => !dirty,
      options.canvasTimeoutMs,
      options.intervalMs,
    );
  }
  return { result, failures };
}
