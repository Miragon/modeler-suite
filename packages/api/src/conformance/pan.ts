import type { CollaborativeModeler } from "../index.js";
import type { CaseOutcome, ConformanceCase, ConformanceHarness } from "./harness.js";
import {
  adviseOn,
  changeEvents,
  errorOf,
  exportOrFail,
  fail,
  importFirstText,
  importOrFail,
  outcomeOf,
  same,
  settleOf,
  skip,
} from "./support.js";
import {
  HELD_IMPORT_BOUND_MS,
  type ImportedLeg,
  importedLegs,
  importWhileHeld,
  type LegFindings,
  listenForWindowErrors,
  nextMutateAppliesOrFail,
  oneTextOnly,
  settledWithin,
  watchInteraction,
} from "./user-input.js";

/**
 * two view states alike up to float noise: the same JSON shape, each number within a millionth of
 * its size. A pan computes the same view along another path of float operations after an import
 */
function closeTo(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => closeTo(value, b[index]));
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const keys = Object.keys(a).sort();
    if (!same(keys, Object.keys(b).sort())) return false;
    return keys.every((key) =>
      closeTo((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }
  return a === b;
}

const UNFOLLOWED = Symbol("unfollowed");

/**
 * `base` moved as one step moved the view from `from` to `to`: each number shifted by what the step
 * changed in it, everything else as `base` holds it. The view state stays opaque to the kit, but a
 * pan moves its numbers by the same amount on every step. `UNFOLLOWED` where the three readbacks
 * differ in shape, or where the step changed something that is no number
 */
function shiftedBy(base: unknown, from: unknown, to: unknown): unknown {
  if (typeof base === "number" && typeof from === "number" && typeof to === "number") {
    return base + (to - from);
  }
  if (Array.isArray(base) && Array.isArray(from) && Array.isArray(to)) {
    if (base.length !== from.length || base.length !== to.length) return UNFOLLOWED;
    const items = base.map((value: unknown, index) => shiftedBy(value, from[index], to[index]));
    return items.includes(UNFOLLOWED) ? UNFOLLOWED : items;
  }
  if (
    base !== null &&
    from !== null &&
    to !== null &&
    typeof base === "object" &&
    typeof from === "object" &&
    typeof to === "object"
  ) {
    const keys = Object.keys(base).sort();
    if (!same(keys, Object.keys(from).sort()) || !same(keys, Object.keys(to).sort())) {
      return UNFOLLOWED;
    }
    const shifted: Record<string, unknown> = {};
    for (const key of keys) {
      const value = shiftedBy(
        (base as Record<string, unknown>)[key],
        (from as Record<string, unknown>)[key],
        (to as Record<string, unknown>)[key],
      );
      if (value === UNFOLLOWED) return UNFOLLOWED;
      shifted[key] = value;
    }
    return shifted;
  }
  return from === to ? base : UNFOLLOWED;
}

type PanStarter = NonNullable<ConformanceHarness["startPan"]>;

/**
 * one pan held on a fresh import of `canonicalTexts[0]` over an accepted import of `leg`, then
 * moved one step and released; what the recommendation finds. With `hostRestoresView` the host
 * takes `getViewState()` during the pan, before the import, and calls `setViewState` with it after
 * the import, as a host that keeps the user's viewport does (L5): the restore must take while the
 * pan is held, and the pan's next step must go on from that view as it went on from the view before
 * the import
 */
async function panOverAnImport(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  startPan: PanStarter,
  leg: ImportedLeg,
  hostRestoresView: boolean,
): Promise<LegFindings> {
  const findings: string[] = [];
  await importOrFail(m, leg.text, `importText(${leg.what}) rejected`);
  const expected = exportOrFail(m, `after importing ${leg.what}`);
  await importFirstText(h, m);
  await settleOf(h)();
  const atRest = m.getViewState();
  const watch = watchInteraction(m);
  const errors = listenForWindowErrors();
  try {
    const pan = await startPan(m);
    const panned = m.getViewState();
    if (closeTo(panned, atRest)) {
      fail(
        "startPan left the view as the import had fitted it — the case proves nothing (startPan presses on the canvas and moves past the drag threshold, so the view pans)",
      );
    }
    let activeDuringPan = m.interaction?.active() === true;
    const { calls, importing, outcome } = await importWhileHeld(h, m, leg.text);
    if (calls > 0) {
      fail(
        `importing ${leg.what} during a pan fired onContentChanged ${calls}x — an import is silent (L1; if every import emits, see the L1 cases first)`,
      );
    }
    if (outcome.unsettled) {
      findings.push(
        `importing ${leg.what} during a pan had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — the import waited for the pan to end instead of leaving it running`,
      );
      await errorOf(() => pan.drop());
      const released = await settledWithin(importing);
      if (released.unsettled) {
        findings.push(
          `importing ${leg.what} during a pan had not settled ${HELD_IMPORT_BOUND_MS / 1000} s after the pan's release either`,
        );
      } else if (released.rejected !== undefined) {
        fail(`importText(${leg.what}) rejected during a pan: ${released.rejected}`);
      }
      return { findings, stop: true };
    }
    if (outcome.rejected !== undefined) {
      fail(`importText(${leg.what}) rejected during a pan: ${outcome.rejected}`);
    }
    const imported = m.getViewState();
    if (hostRestoresView) m.setViewState(panned);
    const current = m.getViewState();
    const moveThrown = await errorOf(() => pan.move());
    const after = m.getViewState();
    activeDuringPan ||= m.interaction?.active() === true;
    if (hostRestoresView) {
      const stepped = shiftedBy(current, atRest, panned);
      if (closeTo(current, imported) && !closeTo(imported, panned)) {
        findings.push(
          `setViewState after ${leg.what} was imported during a pan had no effect: getViewState() still read back the view the import left, so the pan went on from that view instead of the one the host restored (L5)`,
        );
      } else if (stepped === UNFOLLOWED ? closeTo(after, current) : !closeTo(after, stepped)) {
        findings.push(
          `a pan's next step after ${leg.what} was imported during it did not go on from the view the host restored after the import (setViewState with the view from before the import, L5): the step did not move that view as the pan's first step had moved the view before it`,
        );
      }
    } else if (closeTo(after, imported)) {
      findings.push(
        `a pan stopped when ${leg.what} was imported during it (its next step left the view where the import had put it)`,
      );
    } else if (closeTo(imported, atRest) && !closeTo(after, panned)) {
      findings.push(
        `a pan's next step after ${leg.what} was imported during it did not go on from the view the import left: it put the view where the pan would have brought the view from before the import`,
      );
    }
    if (moveThrown !== undefined) {
      findings.push(`a pan's next step after an import of ${leg.what} threw ${moveThrown}`);
    }
    let dropThrown: string | undefined;
    const dropped = await changeEvents(h, m, async () => {
      dropThrown = await errorOf(() => pan.drop());
    });
    if (dropped.calls > 0) {
      fail(
        `releasing a pan fired onContentChanged ${dropped.calls}x — a pan changes the view, never the document (L3)`,
      );
    }
    if (dropThrown !== undefined) {
      findings.push(`releasing a pan after an import of ${leg.what} threw ${dropThrown}`);
    }
    findings.push(...errors.findings(`during a pan over an import of ${leg.what}`));
    if (activeDuringPan) findings.push("interaction.active() was true during a pan");
    else if (watch && watch.delivered.length > 0) {
      findings.push(
        `interaction.onChange delivered ${JSON.stringify(watch.delivered)} during a pan`,
      );
    }
    if (exportOrFail(m, `after a pan over an import of ${leg.what}`) !== expected) {
      findings.push(`a pan over an import of ${leg.what} changed the document`);
    }
    findings.push(
      ...(await nextMutateAppliesOrFail(h, m, "a pan", `a pan over an import of ${leg.what}`)),
    );
  } finally {
    errors.stop();
    watch?.stop();
  }
  return { findings };
}

/** a change event fails (L1, L3); the rest only 1.6 RECOMMENDS */
async function panRunsOnThroughAnImport(h: ConformanceHarness): Promise<CaseOutcome> {
  if (!h.startPan) {
    return skip(
      "startPan is undefined — that a pan is no gesture and runs on through an import (RECOMMENDED since 1.6) was not checked",
    );
  }
  const startPan = h.startPan;
  const findings: string[] = [];
  const runs = importedLegs(h).flatMap((leg) =>
    [false, true].map((hostRestoresView) => ({ leg, hostRestoresView })),
  );
  const m = await h.create();
  try {
    for (const { leg, hostRestoresView } of runs) {
      const found = await panOverAnImport(h, m, startPan, leg, hostRestoresView);
      findings.push(...found.findings);
      if (found.stop) break;
    }
  } finally {
    m.destroy();
  }
  return outcomeOf(
    adviseOn(
      findings,
      "a pan met an import",
      "RECOMMENDED (since 1.6): a pan is no gesture (interaction.active() stays false and onChange is not called), and an import leaves it running: it goes on from the current view (the one the import left, or one the host sets after it) and never puts a view from before back",
    ),
    oneTextOnly(h, "an import during a pan"),
  );
}

export const panCase: ConformanceCase = {
  name: "pan (recommended, 1.6): a pan is no gesture, and it runs on through an import from the current view, the one the import left or the one the host restores",
  run: panRunsOnThroughAnImport,
};
