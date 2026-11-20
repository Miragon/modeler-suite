import type { CollaborativeModeler } from "../index.js";
import type { CaseOutcome, ConformanceCase, ConformanceHarness } from "./harness.js";
import {
  adviseOn,
  errorOf,
  exportOrFail,
  fail,
  importFirstText,
  importOrFail,
  outcomeOf,
  settleOf,
  skip,
} from "./support.js";
import {
  type GestureStarter,
  HELD_IMPORT_BOUND_MS,
  importFromAListener,
  type LegFindings,
  type ListenerImportResult,
  listenForWindowErrors,
  nextMutateAppliesOrFail,
  once,
  oneTextOnly,
  withinTheBound,
} from "./user-input.js";

interface DropLeg {
  what: string;
  /** the text, read inside the listener: an echo imports the drop's own document */
  text(modeler: CollaborativeModeler): string;
  expected?: string;
}

async function importFromTheDrop(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  startGesture: GestureStarter,
  leg: DropLeg,
): Promise<LegFindings> {
  const settle = settleOf(harness);
  const during = `importing ${leg.what} from the change listener of a drop`;
  const findings: string[] = [];
  await importFirstText(harness, modeler);
  // a selection from before the drag: diagram-js restores it once the move has run, on the
  // shapes it held, which an import from the listener removes (#248)
  const selected = modeler.elements?.list()[0]?.id;
  if (selected !== undefined) modeler.elements?.reveal(selected);
  await settle();
  let called:
    | {
        text: string;
        before: string;
        after: string;
        result: Promise<ListenerImportResult>;
      }
    | undefined;
  let settled = false;
  let changesAfterTheImport = 0;
  const unsubscribe = once(
    modeler.onContentChanged(() => {
      if (settled) changesAfterTheImport += 1;
      if (called !== undefined) return;
      const before = modeler.exportText();
      const text = leg.text(modeler);
      const result = importFromAListener(modeler, text, () => {
        settled = true;
      });
      called = { text, before, after: modeler.exportText(), result };
    }),
  );
  const errors = listenForWindowErrors();
  try {
    const held = await startGesture(modeler, "move");
    const thrown = await errorOf(() => held.drop());
    await settle();
    if (called === undefined) {
      fail(
        'the drop of a move gesture fired no onContentChanged — the case proves nothing (startGesture(modeler, "move") and drop() move an element through the modeler\'s own pointer handling)',
      );
    }
    const call = called;
    const result = await withinTheBound(call.result);
    await settle();
    if (thrown !== undefined) findings.push(`the drop threw ${thrown} while ${during}`);
    findings.push(...errors.findings(`while ${during}`));
    if (result.unsettled) {
      findings.push(
        `${during} did not settle within ${HELD_IMPORT_BOUND_MS / 1000} s of the drop — it waits for something the drop never ends`,
      );
      return { findings, stop: true };
    }
    if (call.after !== call.before) {
      findings.push(
        `${during} replaced the document before the drop had ended (exportText() returned the imported document right after the call)`,
      );
    }
    const expected = leg.expected ?? call.text;
    if (result.rejected !== undefined) {
      findings.push(`${during} rejected: ${result.rejected}`);
    } else if (result.exported !== expected) {
      findings.push(
        `when the Promise of ${during} settled, exportText() did not return the imported document — the Promise settled before the import had run`,
      );
    }
    const out = exportOrFail(modeler, `once ${during} had settled`);
    if (result.exported === expected && out !== expected) {
      findings.push(`a step of the drop changed the document after ${during}`);
    }
    if (changesAfterTheImport > 0) {
      findings.push(`onContentChanged fired ${changesAfterTheImport}x once ${during} had settled`);
    }
    if (modeler.interaction?.active()) {
      findings.push(`interaction.active() was still true after the drop and ${during}`);
    }
    if (harness.undo && result.rejected === undefined) {
      await harness.undo(modeler);
      await settle();
      if (exportOrFail(modeler, `after an undo that followed ${during}`) !== out) {
        findings.push(
          `an undo after ${during} changed the document — the drop's command stayed on the fresh undo history (L4)`,
        );
      }
    }
    unsubscribe();
    findings.push(...(await nextMutateAppliesOrFail(harness, modeler, during, during)));
  } finally {
    unsubscribe();
    errors.stop();
  }
  return { findings };
}

/** the import waits until the drop has ended (#248): 1.6 only RECOMMENDS it */
async function importWaitsForTheDrop(harness: ConformanceHarness): Promise<CaseOutcome> {
  if (!harness.startGesture) {
    return skip(
      "startGesture is undefined — that an import from the change listener of a drop waits until the drop has ended (RECOMMENDED since 1.6) was not checked",
    );
  }
  const startGesture = harness.startGesture;
  const second = harness.canonicalTexts[1];
  const findings: string[] = [];
  const modeler = await harness.create();
  try {
    const legs: DropLeg[] = [];
    if (second !== undefined) {
      await importOrFail(modeler, second, "importText(canonicalTexts[1]) rejected");
      legs.push({
        what: "a different document (canonicalTexts[1])",
        text: () => second,
        expected: exportOrFail(modeler, "after importing canonicalTexts[1]"),
      });
    }
    legs.push({
      what: "the drop's own document (an echo)",
      text: (modeler) => modeler.exportText(),
    });
    for (const leg of legs) {
      const outcome = await importFromTheDrop(harness, modeler, startGesture, leg);
      findings.push(...outcome.findings);
      if (outcome.stop) break;
    }
    return outcomeOf(
      adviseOn(
        findings,
        "an import met a running drop",
        "RECOMMENDED (since 1.6): an importText called during a running drop (from onContentChanged, a selection held from before the drag) waits until the drop has ended, so no step of the drop meets a replaced document, and its Promise settles once the import has run",
      ),
      [
        ...oneTextOnly(harness, "an import from the change listener of a drop"),
        ...(modeler.elements
          ? []
          : [
              "the modeler exposes no elements surface (optional) — the drop ran without a selection from before the drag",
            ]),
      ],
    );
  } finally {
    modeler.destroy();
  }
}

export const dropCase: ConformanceCase = {
  name: "drop (recommended, 1.6): an import from the change listener of a drop waits until the drop has ended, and its Promise settles after the import",
  run: importWaitsForTheDrop,
};
