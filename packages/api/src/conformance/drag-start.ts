import type { CollaborativeModeler, ElementsSurface } from "../index.js";
import type {
  CaseOutcome,
  ConformanceCase,
  ConformanceHarness,
  GestureKind,
  HeldGesture,
} from "./harness.js";
import {
  adviseOn,
  errorOf,
  exportOrFail,
  importFirstText,
  importOrFail,
  outcomeOf,
  settleOf,
  skip,
} from "./support.js";
import {
  type ActionLegFindings,
  DRAG_START_KINDS,
  expectDropApplies,
  exportedNow,
  type GestureStarter,
  HELD_IMPORT_BOUND_MS,
  importedLegs,
  importFromAListener,
  type ListenerImportResult,
  listenForWindowErrors,
  nextMutateApplies,
  once,
  oneTextOnly,
  undoAfterTheImport,
  withinTheBound,
} from "./user-input.js";

async function importAtTheStart(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  elements: ElementsSurface,
  startGesture: GestureStarter,
  kind: GestureKind,
): Promise<ActionLegFindings> {
  const settle = settleOf(harness);
  const [leg] = importedLegs(harness);
  if (leg === undefined) return { findings: [] };
  await importOrFail(modeler, leg.text, `importText(${leg.what}) rejected`);
  const expected = exportOrFail(modeler, `after importing ${leg.what}`);
  await importFirstText(harness, modeler);
  await settle();
  // a selection the drag's start clears: diagram-js's Dragging.move empties it while it activates
  // the drag, and reads the drag again once the selection listeners have run (#336)
  const selected = elements.list()[0]?.id;
  if (selected === undefined || !elements.reveal(selected)) {
    return {
      findings: [],
      unverified: `elements.list() reports no element of canonicalTexts[0] that reveal() selects — an import at the start of a ${kind} was not checked`,
    };
  }
  await settle();
  const during = `importing ${leg.what} from the selection listener at the start of a ${kind}`;
  const findings: string[] = [];
  let result: Promise<ListenerImportResult> | undefined;
  let changes = 0;
  const offSelection = once(
    elements.onSelection(() => {
      if (result === undefined) result = importFromAListener(modeler, leg.text);
    }),
  );
  const offChanges = once(
    modeler.onContentChanged(() => {
      changes += 1;
    }),
  );
  const errors = listenForWindowErrors();
  try {
    let held: HeldGesture | undefined;
    const thrown = await errorOf(async () => {
      held = await startGesture(modeler, kind);
    });
    if (result === undefined) {
      if (held) await errorOf(() => held?.cancel());
      return {
        findings,
        unverified: `the selection listener heard nothing at the start of a ${kind} with '${selected}' revealed${thrown === undefined ? "" : `, and startGesture threw ${thrown}`} — an import at a drag's start was not checked`,
      };
    }
    const outcome = await withinTheBound(result);
    if (thrown !== undefined)
      findings.push(`the start of a ${kind} threw ${thrown} while ${during}`);
    if (outcome.unsettled) {
      findings.push(
        `${during} had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — the import waited for the drag to end instead of ending it once the drag had started`,
      );
      if (held) {
        const dropThrown = await errorOf(() => held?.drop());
        if (dropThrown !== undefined) findings.push(`the drop after ${during} threw ${dropThrown}`);
      }
      if ((await withinTheBound(result)).unsettled) {
        findings.push(
          `${during} had not settled ${HELD_IMPORT_BOUND_MS / 1000} s after the drop either`,
        );
      }
      findings.push(...errors.findings(`around ${during}`));
      return { findings, stop: true };
    }
    if (outcome.rejected !== undefined) {
      findings.push(`${during} rejected: ${outcome.rejected}`);
    } else if (outcome.exported !== expected) {
      findings.push(
        `when the Promise of ${during} settled, exportText() did not return the imported document`,
      );
    }
    if (modeler.interaction?.active()) {
      findings.push(
        `interaction.active() was still true once ${during} had settled — the import did not end the drag`,
      );
    }
    const beforeTheDrop = changes;
    if (beforeTheDrop > 0) {
      findings.push(
        `onContentChanged fired ${beforeTheDrop}x between the start of a ${kind} and its drop while ${during}`,
      );
    }
    if (held) {
      const dropThrown = await errorOf(() => held?.drop());
      if (dropThrown !== undefined) findings.push(`the drop after ${during} threw ${dropThrown}`);
    }
    await settle();
    const dropped = changes - beforeTheDrop;
    findings.push(...errors.findings(`around ${during}`));
    const out = exportedNow(modeler);
    if (out === undefined) {
      findings.push(`exportText() threw after the drop that followed ${during}`);
      return { findings };
    }
    if (outcome.rejected === undefined && (dropped > 0 || out !== expected)) {
      findings.push(
        `the drop after ${during} applied the ${kind}${dropped > 0 ? ` (onContentChanged ${dropped}x)` : ""} — the import did not end the drag it met at its start`,
      );
    }
    offChanges();
    if (out === expected) {
      findings.push(...(await undoAfterTheImport(harness, modeler, out, during, "the drag")));
    }
  } finally {
    offSelection();
    offChanges();
    errors.stop();
  }
  findings.push(...(await nextMutateApplies(harness, modeler, during)));
  return { findings };
}

/**
 * the drag's start empties the selection while diagram-js activates the drag (#336). Per kind
 * the case first proves that a drop applies; 1.6 only RECOMMENDS the rest
 */
async function importAtADragsStart(harness: ConformanceHarness): Promise<CaseOutcome> {
  if (!harness.startGesture) {
    return skip(
      "startGesture is undefined — that an import from the selection listener at a drag's start runs once the drag has started and then ends it (RECOMMENDED since 1.6) was not checked",
    );
  }
  const startGesture = harness.startGesture;
  const findings: string[] = [];
  const unverified = oneTextOnly(harness, "an import at a drag's start");
  for (const kind of DRAG_START_KINDS) {
    const modeler = await harness.create();
    try {
      const elements = modeler.elements;
      if (!elements) {
        unverified.push(
          "the modeler exposes no elements surface (optional) — an import from the selection listener at a drag's start was not checked",
        );
        break;
      }
      await expectDropApplies(harness, modeler, startGesture, kind);
      const outcome = await importAtTheStart(harness, modeler, elements, startGesture, kind);
      findings.push(...outcome.findings);
      if (outcome.unverified !== undefined) unverified.push(outcome.unverified);
      if (outcome.stop) break;
    } finally {
      modeler.destroy();
    }
  }
  return outcomeOf(
    adviseOn(
      findings,
      "an import met the start of a drag",
      "RECOMMENDED (since 1.6): an importText called while a drag starts (from the selection listener diagram-js calls as it activates a move or a palette create) waits until the drag has started and then ends it as it ends any running gesture: nothing throws, the import applies and settles, interaction.active() is false, and the drop applies nothing",
    ),
    unverified,
  );
}

export const dragStartCase: ConformanceCase = {
  name: "drag start (recommended, 1.6): an import from the selection listener at the start of a move or a palette create runs once the drag has started, and then ends it",
  run: importAtADragsStart,
};
