import type { CollaborativeModeler } from "../index.js";
import type { CaseOutcome, ConformanceCase, ConformanceHarness, GestureKind } from "./harness.js";
import {
  adviseOn,
  changeEvents,
  errorOf,
  exportOrFail,
  fail,
  firstText,
  importFirstText,
  importOrFail,
  outcomeOf,
  same,
  settleOf,
  skip,
} from "./support.js";
import {
  expectDropApplies,
  GESTURE_KINDS,
  type GestureStarter,
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

async function importDuringGesture(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  startGesture: GestureStarter,
  kind: GestureKind,
  leg: ImportedLeg,
  expected: string,
): Promise<LegFindings> {
  const settle = settleOf(harness);
  const during = `${leg.what} imported during a ${kind} gesture`;
  const findings: string[] = [];
  const watch = watchInteraction(modeler);
  const errors = listenForWindowErrors();
  try {
    const held = await startGesture(modeler, kind);
    const mark = watch?.delivered.length ?? 0;
    let beforeResolve: boolean[] = [];
    const {
      calls,
      importing,
      outcome: imported,
    } = await importWhileHeld(harness, modeler, leg.text, () => {
      beforeResolve = watch?.delivered.slice(mark) ?? [];
    });
    if (calls > 0) {
      fail(
        `importing ${leg.what} during a ${kind} gesture fired onContentChanged ${calls}x before the drop — an import is silent (L1; if every import emits, see the L1 cases first)`,
      );
    }
    if (imported.unsettled) {
      findings.push(
        `importing ${leg.what} during a ${kind} gesture had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — the import waited for the gesture to end instead of cancelling it`,
      );
      const thrown = await errorOf(() => held.drop());
      if (thrown !== undefined) findings.push(`the drop after ${during} threw ${thrown}`);
      const released = await settledWithin(importing);
      if (released.unsettled) {
        findings.push(
          `${during} had not settled ${HELD_IMPORT_BOUND_MS / 1000} s after the drop either`,
        );
      } else if (released.rejected !== undefined) {
        fail(`importText(${leg.what}) rejected during a ${kind} gesture: ${released.rejected}`);
      }
      return { findings, stop: true };
    }
    if (imported.rejected !== undefined) {
      fail(`importText(${leg.what}) rejected during a ${kind} gesture: ${imported.rejected}`);
    }
    if (modeler.interaction?.active()) {
      findings.push(`interaction.active() was still true after ${during}`);
    } else if (watch && !same(beforeResolve, [false])) {
      findings.push(
        `interaction.onChange delivered ${JSON.stringify(beforeResolve)} between the start of a ${kind} gesture and the resolve of an import that ended it (once false)`,
      );
    }
    let thrown: string | undefined;
    const dropped = await changeEvents(harness, modeler, async () => {
      thrown = await errorOf(() => held.drop());
    });
    if (thrown !== undefined) findings.push(`the drop after ${during} threw ${thrown}`);
    findings.push(...errors.findings(`around ${during} and its drop`));
    const out = exportOrFail(modeler, `after the drop that followed ${during}`);
    if (dropped.calls > 0 || out !== expected) {
      findings.push(
        `the drop after ${during} applied the ${kind}${dropped.calls > 0 ? ` (onContentChanged ${dropped.calls}x)` : ""}, so the export is no longer the imported document`,
      );
    }
    if (harness.undo && out === expected) {
      await harness.undo(modeler);
      await settle();
      if (exportOrFail(modeler, `after an undo that followed ${during}`) !== expected) {
        findings.push(
          `an undo after the drop that followed ${during} changed the document — the gesture left a command on the fresh undo history (L4)`,
        );
      }
    }
    findings.push(
      ...(await nextMutateAppliesOrFail(
        harness,
        modeler,
        during,
        `the drop that followed ${during}`,
      )),
    );
  } finally {
    errors.stop();
    watch?.stop();
  }
  return { findings };
}

async function rejectionDuringGesture(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  startGesture: GestureStarter,
  kind: GestureKind,
  invalid: string,
): Promise<LegFindings> {
  const findings: string[] = [];
  await importFirstText(harness, modeler);
  await settleOf(harness)();
  const doc = exportOrFail(modeler, "after importing canonicalTexts[0]");
  const watch = watchInteraction(modeler);
  const errors = listenForWindowErrors();
  try {
    const held = await startGesture(modeler, kind);
    const mark = watch?.delivered.length ?? 0;
    const {
      calls,
      importing,
      outcome: rejection,
    } = await importWhileHeld(harness, modeler, invalid);
    if (rejection.unsettled) {
      findings.push(
        `importing invalidTexts[0] during a ${kind} gesture had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — the import waited for the gesture to end instead of rejecting and leaving it running`,
      );
      await errorOf(() => held.drop());
      const released = await settledWithin(importing);
      if (!released.unsettled && released.rejected === undefined) {
        fail(
          `importText(invalidTexts[0]) resolved after a ${kind} gesture it waited for — a non-importable input REJECTS (L7)`,
        );
      }
      return { findings, stop: true };
    }
    if (rejection.rejected === undefined) {
      fail(
        `importText(invalidTexts[0]) resolved during a ${kind} gesture — a non-importable input REJECTS (L7)`,
      );
    }
    if (calls > 0) {
      fail(`a rejected import during a ${kind} gesture fired onContentChanged ${calls}x (L7)`);
    }
    if (exportOrFail(modeler, `after a rejected import during a ${kind} gesture`) !== doc) {
      fail(`a rejected import during a ${kind} gesture changed the document (L7)`);
    }
    let ended = false;
    if (modeler.interaction && !modeler.interaction.active()) {
      ended = true;
      findings.push(
        `a rejected import ended a ${kind} gesture (interaction.active() turned false)`,
      );
    } else if (watch && watch.delivered.length > mark) {
      findings.push(
        `interaction.onChange delivered ${JSON.stringify(watch.delivered.slice(mark))} during a rejected import while a ${kind} gesture ran`,
      );
    }
    let thrown: string | undefined;
    const dropped = await changeEvents(harness, modeler, async () => {
      thrown = await errorOf(() => held.drop());
    });
    if (thrown !== undefined) {
      findings.push(`the drop of a ${kind} gesture after a rejected import threw ${thrown}`);
    }
    findings.push(
      ...errors.findings(`around a rejected import during a ${kind} gesture and its drop`),
    );
    const applied =
      dropped.calls > 0 && exportOrFail(modeler, `after the drop of a ${kind} gesture`) !== doc;
    if (!applied && !ended) {
      findings.push(
        `the drop of a ${kind} gesture after a rejected import applied nothing — the rejected import ended the gesture`,
      );
    }
  } finally {
    errors.stop();
    watch?.stop();
  }
  return { findings };
}

/**
 * a change event before the drop fails (L1, L7); what the drop does, and what `interaction`
 * reports around the import, is one advisory, since 1.5 only RECOMMENDS the cancel
 */
async function importCancelsGestures(harness: ConformanceHarness): Promise<CaseOutcome> {
  if (!harness.startGesture) {
    return skip(
      "startGesture is undefined — that an import cancels a running gesture (L1, RECOMMENDED since 1.5) was not checked",
    );
  }
  const startGesture = harness.startGesture;
  const first = firstText(harness);
  const invalid = harness.invalidTexts?.[0];
  const findings: string[] = [];
  let stopped = false;
  for (const kind of GESTURE_KINDS) {
    if (stopped) break;
    const modeler = await harness.create();
    try {
      await expectDropApplies(harness, modeler, startGesture, kind);
      for (const leg of importedLegs(harness)) {
        await importOrFail(modeler, leg.text, `importText(${leg.what}) rejected`);
        const expected = exportOrFail(modeler, `after importing ${leg.what}`);
        await importOrFail(modeler, first, "importText(canonicalTexts[0]) rejected");
        await settleOf(harness)();
        const outcome = await importDuringGesture(
          harness,
          modeler,
          startGesture,
          kind,
          leg,
          expected,
        );
        findings.push(...outcome.findings);
        stopped = outcome.stop === true;
        if (stopped) break;
      }
      if (!stopped && invalid !== undefined) {
        const outcome = await rejectionDuringGesture(harness, modeler, startGesture, kind, invalid);
        findings.push(...outcome.findings);
        stopped = outcome.stop === true;
      }
    } finally {
      modeler.destroy();
    }
  }
  return outcomeOf(
    adviseOn(
      findings,
      "a running gesture met an import",
      "RECOMMENDED (L1, since 1.5): an accepted import first cancels a running gesture the way Escape does, with no change event and no exception, the release after the import included, nothing applied to an element the import removed, and interaction.active() false with one onChange(false) before importText resolves; a rejected import leaves the gesture running",
    ),
    [
      ...oneTextOnly(harness, "an import during a gesture"),
      ...(harness.invalidTexts === undefined
        ? [
            "invalidTexts is undefined — that a rejected import leaves a running gesture running was not checked (pass [] if the notation has no non-importable text)",
          ]
        : []),
    ],
  );
}

export const gestureCase: ConformanceCase = {
  name: "L1 (recommended, 1.5): an accepted import cancels a running gesture, its release included, and a rejected one leaves it running",
  run: importCancelsGestures,
};
