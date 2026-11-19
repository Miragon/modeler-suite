import type { CollaborativeModeler, ElementsSurface } from "../index.js";
import type { CaseOutcome, ConformanceCase, ConformanceHarness } from "./harness.js";
import { nextHostSerial } from "./hosts.js";
import {
  adviseOn,
  defaultSettle,
  errorOf,
  exportOrFail,
  focusOn,
  importOrFail,
  mountedCanvas,
  outcomeOf,
  same,
} from "./support.js";
import {
  type ActionLegFindings,
  exportedNow,
  HELD_IMPORT_BOUND_MS,
  type ImportedLeg,
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

const USER_ACTION_WITHOUT_DOM =
  "no DOM — a delete and the redo of a delete were not checked (both press Delete on the focused canvas: run the kit in a browser, the modeler mounted into attachedHost())";

const NO_DELETE = "a delete and the redo of a delete were not checked";

function pressOn(canvas: Element, key: string): void {
  const view = canvas.ownerDocument.defaultView ?? window;
  const init = { key, code: key, bubbles: true, cancelable: true, composed: true };
  canvas.dispatchEvent(new view.KeyboardEvent("keydown", init));
  canvas.dispatchEvent(new view.KeyboardEvent("keyup", init));
}

function focusTheCanvas(canvas: Element): string | undefined {
  focusOn(canvas);
  return canvas.ownerDocument.activeElement === canvas
    ? undefined
    : `the canvas did not take the focus — ${NO_DELETE}`;
}

interface ImportedDocument extends ImportedLeg {
  expected: string;
}

/**
 * imports the document a leg imports later, for the oracle: the modeler's OWN export of it (a
 * non-canonical one fails L2). A session's own export is no oracle: a renderer may list an element
 * created in the session elsewhere than the export after importing that text does
 */
async function theDocumentToImport(
  h: ConformanceHarness,
  m: CollaborativeModeler,
): Promise<ImportedDocument> {
  const [leg = { text: h.canonicalTexts[0] ?? "", what: "canonicalTexts[0]" }] = importedLegs(h);
  await importOrFail(m, leg.text, `importText(${leg.what}) rejected`);
  return { ...leg, expected: exportOrFail(m, `after importing ${leg.what}`) };
}

interface ActionLeg {
  what: string;
  imported: ImportedDocument;
  /**
   * the document the action leaves without an import: where it is the imported one, the export
   * right after the action cannot tell an import inside the action from the action itself
   */
  left: string;
  /** runs the action, whose synchronous part has run when it returns */
  act(): Promise<void> | void;
}

async function importFromTheSelectionListener(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  elements: ElementsSurface,
  leg: ActionLeg,
): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  const { text, expected } = leg.imported;
  const during = `importing ${leg.imported.what} from the selection listener during ${leg.what}`;
  const findings: string[] = [];
  let result: Promise<ListenerImportResult> | undefined;
  let replacedInTheListener = false;
  let settled = false;
  let changesAfterTheImport = 0;
  const offSelection = once(
    elements.onSelection(() => {
      if (result !== undefined) return;
      const atTheCall = exportedNow(m);
      result = importFromAListener(m, text, () => {
        settled = true;
      });
      replacedInTheListener = exportedNow(m) !== atTheCall;
    }),
  );
  const offChanges = once(
    m.onContentChanged(() => {
      if (settled) changesAfterTheImport += 1;
    }),
  );
  const errors = listenForWindowErrors();
  try {
    let heardRightAfter = false;
    let exportRightAfter: string | undefined;
    const thrown = await errorOf(async () => {
      const acting = leg.act();
      heardRightAfter = result !== undefined;
      exportRightAfter = exportedNow(m);
      await acting;
    });
    if (result === undefined) {
      return {
        findings,
        unverified: `the selection listener heard nothing during ${leg.what}${thrown === undefined ? "" : `, which threw ${thrown}`} — that an import from it waits until the action has finished was not checked`,
      };
    }
    const outcome = await withinTheBound(result);
    await settle();
    if (thrown !== undefined) {
      findings.push(
        `${leg.what} threw ${thrown} once its selection listener had called importText(${leg.imported.what})`,
      );
    }
    for (const error of errors.errors) {
      findings.push(`an error reached the window around ${during}: ${error}`);
    }
    if (outcome.unsettled) {
      findings.push(
        `${during} had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — it waits for something the action never ends`,
      );
      return { findings, stop: true };
    }
    if (replacedInTheListener) {
      findings.push(
        `${during} ran before the action had finished (the importText call in the listener replaced the document at once)`,
      );
    } else if (heardRightAfter && leg.left !== expected && exportRightAfter === expected) {
      // the listener heard the action while it ran, and the action alone leaves another document,
      // so an export that already shows the imported one means a later step of the action ran it
      findings.push(
        `${during} ran before the action had finished (exportText() returned the imported document as soon as the action had returned)`,
      );
    }
    if (outcome.rejected !== undefined) {
      findings.push(`${during} rejected: ${outcome.rejected}`);
    } else if (outcome.exported !== expected) {
      findings.push(
        `when the Promise of ${during} settled, exportText() did not return the imported document — the Promise settled before the import had run, or the action went on and changed the imported document`,
      );
    }
    const out = exportedNow(m);
    if (out === undefined) {
      findings.push(`exportText() threw once ${during} had settled`);
      return { findings };
    }
    if (outcome.exported === expected && out !== expected) {
      findings.push(`a step of ${leg.what} changed the document after ${during}`);
    }
    if (changesAfterTheImport > 0) {
      findings.push(`onContentChanged fired ${changesAfterTheImport}x once ${during} had settled`);
    }
    offChanges();
    if (outcome.rejected === undefined) {
      findings.push(...(await undoAfterTheImport(h, m, out, during, "the action")));
    }
  } finally {
    offSelection();
    offChanges();
    errors.stop();
  }
  findings.push(...(await nextMutateApplies(h, m, during)));
  return { findings };
}

async function revealTheFirstElement(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  elements: ElementsSurface,
): Promise<string | ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
  await settle();
  const target = elements.list()[0]?.id;
  if (target === undefined) {
    return {
      findings: [],
      unverified: `elements.list() reports no element after importing canonicalTexts[0] — ${NO_DELETE}`,
    };
  }
  elements.reveal(target);
  await settle();
  return target;
}

/**
 * Delete, or Backspace where Delete does nothing, on the focused canvas with `target` revealed:
 * the key that deleted it and the document the delete left, or why the case cannot delete it
 */
async function deleteWithAKey(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  canvas: Element,
  target: string,
): Promise<{ key: string; left: string } | ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  const unfocused = focusTheCanvas(canvas);
  if (unfocused !== undefined) return { findings: [], unverified: unfocused };
  const before = exportOrFail(m, `with '${target}' revealed`);
  for (const key of ["Delete", "Backspace"]) {
    pressOn(canvas, key);
    await settle();
    const left = exportOrFail(m, `after ${key} on the focused canvas`);
    if (left !== before) return { key, left };
  }
  return {
    findings: [],
    unverified: `Delete and Backspace on the focused canvas left the revealed element '${target}' in place — ${NO_DELETE}`,
  };
}

/**
 * the revealed first element of `canonicalTexts[0]`, deleted with Delete on the focused canvas.
 * A delete on its own comes first: the document it leaves tells an import that ran inside the
 * delete from the delete itself, also where the imported document is what the delete leaves
 */
async function deleteOfASelectedElement(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  elements: ElementsSurface,
  canvas: Element,
): Promise<ActionLegFindings> {
  const imported = await theDocumentToImport(h, m);
  const first = await revealTheFirstElement(h, m, elements);
  if (typeof first !== "string") return first;
  const alone = await deleteWithAKey(h, m, canvas, first);
  if (!("key" in alone)) return alone;
  const target = await revealTheFirstElement(h, m, elements);
  if (typeof target !== "string") return target;
  const unfocused = focusTheCanvas(canvas);
  if (unfocused !== undefined) return { findings: [], unverified: unfocused };
  return importFromTheSelectionListener(h, m, elements, {
    what: `a delete of the selected element '${target}' (${alone.key} on the focused canvas)`,
    imported,
    left: alone.left,
    act: () => {
      pressOn(canvas, alone.key);
    },
  });
}

async function undoOfASelectedCreate(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  elements: ElementsSurface,
  undo: NonNullable<ConformanceHarness["undo"]>,
): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  const imported = await theDocumentToImport(h, m);
  await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
  await settle();
  const left = exportOrFail(m, "before mutate");
  const listed = new Set(elements.list().map((element) => element.id));
  await h.mutate(m);
  await settle();
  const created = elements.list().find((element) => !listed.has(element.id))?.id;
  if (created === undefined || !elements.reveal(created)) {
    return {
      findings: [],
      unverified:
        "elements.list() reports no new element after mutate that reveal() selects — an undo was not checked",
    };
  }
  await settle();
  return importFromTheSelectionListener(h, m, elements, {
    what: `an undo of the create of the selected element '${created}'`,
    imported,
    left,
    act: () => undo(m),
  });
}

async function redoOfADelete(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  elements: ElementsSurface,
  canvas: Element,
  undo: NonNullable<ConformanceHarness["undo"]>,
  redo: NonNullable<ConformanceHarness["redo"]>,
): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  const imported = await theDocumentToImport(h, m);
  const target = await revealTheFirstElement(h, m, elements);
  if (typeof target !== "string") return target;
  const deleted = await deleteWithAKey(h, m, canvas, target);
  if (!("key" in deleted)) return deleted;
  await undo(m);
  await settle();
  // the element back under its id is all the redo needs: the contract leaves the undone document's
  // bytes to the modeler (an element may come back elsewhere in the text)
  if (!elements.reveal(target)) {
    return {
      findings: [],
      unverified: `an undo of the delete of '${target}' did not bring it back for reveal() — the redo of a delete was not checked`,
    };
  }
  await settle();
  return importFromTheSelectionListener(h, m, elements, {
    what: `a redo of the delete of the selected element '${target}'`,
    imported,
    left: deleted.left,
    act: () => redo(m),
  });
}

/**
 * two imports: the first from the change listener of `mutate`'s command, with the document from
 * before the command, and the second with an echo of the command's document, called as soon as
 * `mutate` has returned (or a microtask after that listener, where `mutate` returns before its
 * command has run). The export tells whether the first still waits when the second is called, and
 * in which order they ran
 */
async function importsKeepTheirCallOrder(
  h: ConformanceHarness,
  m: CollaborativeModeler,
): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
  await settle();
  const text = exportOrFail(m, "before mutate");
  const during =
    "two imports, the document from before mutate from the change listener of its command and an echo of the command's document called once the command had returned";
  const findings: string[] = [];
  const settledInOrder: string[] = [];
  let echo: string | undefined;
  let first: Promise<ListenerImportResult> | undefined;
  let second: Promise<ListenerImportResult> | undefined;
  let replacedInTheListener = false;
  let firstHadRun = false;
  let settled = false;
  let changesAfterTheImports = 0;
  const callTheSecond = (): void => {
    if (echo === undefined || first === undefined || second !== undefined) return;
    firstHadRun = exportedNow(m) === text;
    second = importFromAListener(m, echo, () => settledInOrder.push("the echo"));
  };
  const offChanges = once(
    m.onContentChanged(() => {
      if (settled) changesAfterTheImports += 1;
      if (first !== undefined) return;
      const now = exportedNow(m);
      if (now === undefined || now === text) return;
      echo = now;
      first = importFromAListener(m, text, () => settledInOrder.push("the document from before"));
      replacedInTheListener = exportedNow(m) !== now;
      void Promise.resolve().then(callTheSecond);
    }),
  );
  const errors = listenForWindowErrors();
  try {
    const mutating = errorOf(() => h.mutate(m));
    callTheSecond();
    const thrown = await mutating;
    await settle();
    if (first === undefined || second === undefined) {
      return {
        findings,
        unverified:
          "mutate fired no onContentChanged whose export differed from the document before it — the call order of two imports was not checked",
      };
    }
    const both = await withinTheBound(
      Promise.all([first, second]).then(([a, b]) => ({ rejected: a.rejected ?? b.rejected })),
    );
    settled = true;
    await settle();
    if (thrown !== undefined) findings.push(`mutate threw ${thrown} during ${during}`);
    for (const error of errors.errors) {
      findings.push(`an error reached the window around ${during}: ${error}`);
    }
    if (both.unsettled) {
      findings.push(
        `${during} had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — they wait for something the command never ends`,
      );
      return { findings, stop: true };
    }
    if (replacedInTheListener) {
      findings.push(
        `${during}: the first ran before the command had finished (the importText call in the change listener replaced the document at once)`,
      );
    }
    if (both.rejected !== undefined) findings.push(`${during}: one rejected: ${both.rejected}`);
    if (!same(settledInOrder, ["the document from before", "the echo"])) {
      findings.push(
        `${during} settled in the order ${JSON.stringify(settledInOrder)}, not in the order they were called`,
      );
    }
    const out = exportedNow(m);
    if (out === undefined) {
      findings.push(`exportText() threw once ${during} had settled`);
      return { findings };
    }
    if (both.rejected === undefined && out === text) {
      findings.push(
        `${during} did not keep their call order: once both had settled, exportText() returned the document called first, so the echo called second ran before it or not at all`,
      );
    }
    if (changesAfterTheImports > 0) {
      findings.push(`onContentChanged fired ${changesAfterTheImports}x once ${during} had settled`);
    }
    offChanges();
    if (both.rejected === undefined) {
      findings.push(...(await undoAfterTheImport(h, m, out, during, "the command")));
    }
  } finally {
    offChanges();
    errors.stop();
  }
  findings.push(...(await nextMutateApplies(h, m, during)));
  return {
    findings,
    ...(firstHadRun && !replacedInTheListener
      ? {
          unverified:
            "the import from the change listener of mutate had already run when the second import was called — that imports keep their call order while the first still waits was not checked",
        }
      : {}),
  };
}

async function importWaitsForTheUsersCommand(h: ConformanceHarness): Promise<CaseOutcome> {
  const findings: string[] = [];
  const unverified = oneTextOnly(h, "an import from the selection listener during a command");
  let stopped = false;
  /** each leg on an instance of its own: one whose import ran inside the action may be left broken */
  const onAFreshInstance = async (
    leg: (m: CollaborativeModeler, firstSerial: number) => Promise<ActionLegFindings>,
  ): Promise<void> => {
    if (stopped) return;
    const firstSerial = nextHostSerial();
    const m = await h.create();
    try {
      const outcome = await leg(m, firstSerial);
      findings.push(...outcome.findings);
      if (outcome.unverified !== undefined) unverified.push(outcome.unverified);
      stopped = outcome.stop === true;
    } finally {
      m.destroy();
    }
  };
  const noElements: ActionLegFindings = {
    findings: [],
    unverified:
      "the modeler exposes no elements surface (optional) — imports from the selection listener during a delete, an undo and a redo were not checked",
  };
  const onTheCanvas =
    (
      leg: (
        m: CollaborativeModeler,
        elements: ElementsSurface,
        canvas: Element,
      ) => Promise<ActionLegFindings>,
    ) =>
    async (m: CollaborativeModeler, firstSerial: number): Promise<ActionLegFindings> => {
      const elements = m.elements;
      if (!elements) return noElements;
      await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
      const mount = mountedCanvas(h, m, "modeler", firstSerial, NO_DELETE);
      if (typeof mount === "string") return { findings: [], unverified: mount };
      return leg(m, elements, mount.canvas);
    };
  const { undo, redo } = h;
  const withoutDom = typeof document === "undefined";
  if (withoutDom) unverified.push(USER_ACTION_WITHOUT_DOM);
  else {
    await onAFreshInstance(
      onTheCanvas((m, elements, canvas) => deleteOfASelectedElement(h, m, elements, canvas)),
    );
  }
  if (undo) {
    await onAFreshInstance((m) =>
      m.elements ? undoOfASelectedCreate(h, m, m.elements, undo) : Promise.resolve(noElements),
    );
  } else {
    unverified.push("undo is undefined — an undo and the redo of a delete were not checked");
  }
  if (undo && redo && !withoutDom) {
    await onAFreshInstance(
      onTheCanvas((m, elements, canvas) => redoOfADelete(h, m, elements, canvas, undo, redo)),
    );
  } else if (undo && !redo) {
    unverified.push("redo is undefined — the redo of a delete was not checked");
  }
  await onAFreshInstance((m) => importsKeepTheirCallOrder(h, m));
  return outcomeOf(
    adviseOn(
      findings,
      "an import met the user's running command",
      "RECOMMENDED (since 1.6): an importText called during a running user action (from the selection listener of a delete, an undo or a redo, from the change listener of a command) waits until the action has finished and settles after that import, and imports keep their call order, also one called once the action has returned while an earlier one still waits",
    ),
    [...new Set(unverified)],
  );
}

export const userActionCase: ConformanceCase = {
  name: "user action (recommended, 1.6): an import from the selection listener of a delete, an undo or a redo waits until the command has finished, and imports keep their call order",
  run: importWaitsForTheUsersCommand,
};
