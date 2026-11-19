/**
 * Each variant of the reference modeler that only misses a RECOMMENDATION fails nothing and
 * advises exactly once, from the case that checks it: a recommendation must never turn a modeler
 * red. Like conformance.test.ts, this suite runs without a DOM; the variants whose advisory needs
 * one are in the jsdom suites.
 */
import { describe, expect, test } from "vitest";

import type { ReferenceModeler } from "./reference-modeler.js";
import { CASE, expectAdvisoryOnly, harness, kitOutcome, runCase } from "./support.js";

describe("variants that miss a RECOMMENDATION fail nothing and advise exactly once", () => {
  test("per-instance counter ids (event_1 on both peers) → an advisory from the collision case", () =>
    expectAdvisoryOnly(harness({ counterIds: true }), CASE.elementsCollision));
  test("an import that drops the open label editor instead of reopening it → an advisory from the L1 interaction case", () =>
    expectAdvisoryOnly(harness({ dropInteractionOnImport: true }), CASE.l1Interaction));
  test("a host's view change that drops the open label editor → an advisory from the L5 interaction case", () =>
    expectAdvisoryOnly(harness({ dropInteractionOnViewChange: true }), CASE.l5Interaction));
  test("the dropped label editor, seen through interactionState alone (no commitInteraction) → the same advisory", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ dropInteractionOnViewChange: true }, { commitInteraction: undefined }),
      CASE.l5Interaction,
    );
    expect(advice).toMatch(/did not survive a host's view change \(setViewState closed it\)/);
  });
  test("an import that leaves a running gesture running → an advisory from the L1 gesture case, naming the drop that applied and the one that threw, and one from the drag-start case", async () => {
    const { failing, advisories } = await kitOutcome(harness({ importKeepsGesture: true }));
    expect(failing).toEqual([]);
    expect(advisories.map(([name]) => name).sort()).toEqual(
      [CASE.l1Gesture, CASE.dragStart].sort(),
    );
    const atTheStart = advisories.find(([name]) => name === CASE.dragStart)?.[1] ?? "";
    expect(atTheStart).toMatch(/interaction\.active\(\) was still true once importing/);
    expect(atTheStart).toMatch(/the import did not end the drag it met at its start/);
    const advice = advisories.find(([name]) => name === CASE.l1Gesture)?.[1] ?? "";
    expect(advice).toMatch(/^a running gesture met an import: /);
    expect(advice).toMatch(
      /the drop after a different document \(canonicalTexts\[1\]\) imported during a move gesture threw TypeError/,
    );
    expect(advice).toMatch(
      /the drop after the same document \(canonicalTexts\[0\]\) imported during a move gesture applied the move/,
    );
    expect(advice).toMatch(/interaction\.active\(\) was still true after/);
    expect(advice).toMatch(/ — RECOMMENDED \(L1, since 1\.5\): an accepted import first cancels/);
  });
  test("a rejected import that ends a running gesture → an advisory from the L1 gesture case", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ rejectedImportEndsGesture: true }),
      CASE.l1Gesture,
    );
    expect(advice).toMatch(/a rejected import ended a move gesture/);
  });
  // these variants hold an import until the kit's bound of 2 s has passed, once per run of the cases
  const HELD_IMPORT_TIMEOUT_MS = 20_000;
  test(
    "an import that waits for a running gesture to end instead of cancelling it → an advisory from the L1 gesture case, not a hang",
    async () => {
      const advice = await expectAdvisoryOnly(
        harness({ importWaitsForGesture: true }),
        CASE.l1Gesture,
      );
      expect(advice).toMatch(
        /importing a different document \(canonicalTexts\[1\]\) during a move gesture had not settled 2 s later — the import waited for the gesture to end instead of cancelling it/,
      );
      expect(advice.match(/had not settled/g)).toHaveLength(1);
    },
    HELD_IMPORT_TIMEOUT_MS,
  );
  test("an import from a drop's change listener that runs at once → an advisory from the drop case: the drop threw on the removed element", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ importDuringDropRunsAtOnce: true }),
      CASE.drop,
    );
    expect(advice).toMatch(/the drop threw TypeError: Cannot read properties of undefined/);
    expect(advice).toMatch(/replaced the document before the drop had ended/);
    expect(advice).not.toMatch(/an echo/);
  });
  test("an import from a drop's change listener whose Promise settles before the import → an advisory from the drop case", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ importDuringDropSettlesEarly: true }),
      CASE.drop,
    );
    expect(advice).toMatch(/the Promise settled before the import had run/);
  });
  test(
    "an import from a drop's change listener that never settles, later imports queued behind it → an advisory from the drop case, not a hang",
    async () => {
      const advice = await expectAdvisoryOnly(
        harness({ importDuringDropNeverSettles: true }),
        CASE.drop,
      );
      expect(advice).toMatch(
        /importing a different document \(canonicalTexts\[1\]\) from the change listener of a drop did not settle within 2 s of the drop/,
      );
      expect(advice.match(/did not settle/g)).toHaveLength(1);
    },
    HELD_IMPORT_TIMEOUT_MS,
  );
  test("an import from a command's listener that runs at once → an advisory from the user-action case: it ran before the undo had finished", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ importDuringCommandRunsAtOnce: true }),
      CASE.userAction,
    );
    expect(advice).toMatch(/^an import met the user's running command: /);
    expect(advice).toMatch(
      /importing a different document \(canonicalTexts\[1\]\) from the selection listener during an undo of the create of the selected element 'zz-\d+' ran before the action had finished/,
    );
    expect(advice).toMatch(/ — RECOMMENDED \(since 1\.6\): an importText called during a running/);
  });
  test("an import from a command's listener whose Promise settles before the import → an advisory from the user-action case", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ importDuringCommandSettlesEarly: true }),
      CASE.userAction,
    );
    expect(advice).toMatch(/the Promise settled before the import had run/);
    expect(advice.split(" — RECOMMENDED")[0]).not.toMatch(/call order|settled in the order/);
  });
  test(
    "an import from a command's listener that never settles, later imports queued behind it → an advisory from the user-action case, not a hang",
    async () => {
      const advice = await expectAdvisoryOnly(
        harness({ importDuringCommandNeverSettles: true }),
        CASE.userAction,
      );
      expect(advice).toMatch(
        /importing a different document \(canonicalTexts\[1\]\) from the selection listener during an undo of the create of the selected element 'zz-\d+' had not settled 2 s later/,
      );
      expect(advice.match(/had not settled/g)).toHaveLength(1);
    },
    HELD_IMPORT_TIMEOUT_MS,
  );
  test("an import called after the action that overtakes one still waiting for it → an advisory from the user-action case", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ waitingImportsOvertaken: true }),
      CASE.userAction,
    );
    expect(advice).toMatch(/settled in the order \["the echo","the document from before"\]/);
    expect(advice).toMatch(
      /did not keep their call order: once both had settled, exportText\(\) returned the document called first/,
    );
  });
  test("an import called after the action that overtakes one still waiting for a flush queued when the action started → an advisory from the user-action case: the second import is called before that flush runs", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ waitingImportsOvertaken: true, flushQueuedAtTheActionsStart: true }),
      CASE.userAction,
    );
    expect(advice).toMatch(/settled in the order \["the echo","the document from before"\]/);
    expect(advice).toMatch(/did not keep their call order/);
  });
  test("an import that runs only during a delete at once → nothing without a DOM: the delete presses a key on the canvas", async () => {
    const { failing, advisories } = await kitOutcome(
      harness({ importDuringDeleteRunsAtOnce: true }),
    );
    expect(failing).toEqual([]);
    expect(advisories).toEqual([]);
  });
  test("an import from the selection listener at a drag's start that runs at once → an advisory from the drag-start case: the activation threw", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ importAtDragStartRunsAtOnce: true }),
      CASE.dragStart,
    );
    expect(advice).toMatch(/^an import met the start of a drag: /);
    for (const kind of ["move", "create"]) {
      expect(advice).toMatch(
        new RegExp(
          `the start of a ${kind} threw TypeError: Cannot read properties of null \\(reading 'cursor'\\) while importing a different document`,
        ),
      );
    }
  });
  test(
    "an import from the selection listener at a drag's start that waits for the drop → an advisory from the drag-start case, not a hang",
    async () => {
      const advice = await expectAdvisoryOnly(
        harness({ importAtDragStartWaitsForTheDrop: true }),
        CASE.dragStart,
      );
      expect(advice).toMatch(
        /importing a different document \(canonicalTexts\[1\]\) from the selection listener at the start of a move had not settled 2 s later — the import waited for the drag to end/,
      );
      expect(advice.match(/had not settled/g)).toHaveLength(1);
    },
    HELD_IMPORT_TIMEOUT_MS,
  );
  test("a destroy() from a listener that tears the gesture down inside the drag's activation → an advisory from the destroy case: the start threw", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ destroyTearsDownInsideTheAction: true }),
      CASE.destroyFromListener,
    );
    expect(advice).toMatch(
      /^a host's listener destroyed the modeler, or unsubscribed another listener, while the user's input or the host's call ran: /,
    );
    for (const kind of ["move", "create"]) {
      expect(advice).toMatch(
        new RegExp(
          `the input threw TypeError: Cannot read properties of null \\(reading 'cursor'\\) once a listener had called destroy\\(\\) from elements\\.onSelection at the start of a ${kind}`,
        ),
      );
    }
    const [found] = advice.split(" — RECOMMENDED");
    expect(found).not.toMatch(/at the drop|Escape|inside reveal\(\)|unsubscribed had/);
    expect(advice).toMatch(/ — RECOMMENDED \(since 1\.6\): a host may call destroy\(\) from any/);
  });
  test("a change delivered over a copy of its listeners → an advisory from the destroy case: a later listener heard the drop", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ contentDeliveryIgnoresDestroy: true }),
      CASE.destroyFromListener,
    );
    expect(advice).toMatch(
      /onContentChanged came after destroy\(\) from onContentChanged at the drop of a move/,
    );
  });
  test("a selection delivered over a copy of its listeners → an advisory from the destroy case: a later listener heard the start and the reveal", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ selectionDeliveryIgnoresDestroy: true }),
      CASE.destroyFromListener,
    );
    for (const kind of ["move", "create"]) {
      expect(advice).toMatch(
        new RegExp(
          `elements\\.onSelection\\(\\[\\]\\) came after destroy\\(\\) from elements\\.onSelection at the start of a ${kind}`,
        ),
      );
    }
    expect(advice).toMatch(
      /elements\.onSelection\(\["alpha"\]\) came after destroy\(\) from elements\.onSelection inside reveal\(\)/,
    );
  });
  test("a destroy() from the selection listener that reveal() calls, which tears the canvas down at once → an advisory from the destroy case: reveal() threw", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ destroyTearsDownInsideReveal: true }),
      CASE.destroyFromListener,
    );
    expect(advice).toMatch(
      /^a host's listener destroyed the modeler, or unsubscribed another listener, while the user's input or the host's call ran: reveal\(\) threw TypeError: Cannot read properties of null \(reading 'viewbox'\) once a listener had called destroy\(\) from elements\.onSelection inside reveal\(\) — RECOMMENDED \(since 1\.6\): /,
    );
    const [found] = advice.split(" — RECOMMENDED");
    expect(found).not.toMatch(/at the start of|at the drop|Escape|came after destroy\(\)/);
  });
  test("a harness without startGesture → the destroy case still runs its leg inside reveal(): it skips only the legs at the user's input, and a teardown at once inside reveal() advises", async () => {
    const withoutStartGesture =
      "startGesture is undefined — that a host may destroy the modeler from a listener while the user's input runs or inside an import that ends a held gesture, and that a listener unsubscribed during a delivery is not called (RECOMMENDED since 1.6), was not checked";
    const conforming = await runCase(
      CASE.destroyFromListener,
      harness({}, { startGesture: undefined }),
    );
    expect(conforming?.skipped).toBe(withoutStartGesture);
    expect(conforming?.advisories).toBeUndefined();
    const tearsDownAtOnce = await runCase(
      CASE.destroyFromListener,
      harness({ destroyTearsDownInsideReveal: true }, { startGesture: undefined }),
    );
    expect(tearsDownAtOnce?.skipped).toBe(withoutStartGesture);
    expect(tearsDownAtOnce?.advisories).toHaveLength(1);
    expect(tearsDownAtOnce?.advisories?.[0]).toMatch(
      /: reveal\(\) threw TypeError: .* once a listener had called destroy\(\) from elements\.onSelection inside reveal\(\) — RECOMMENDED \(since 1\.6\): /,
    );
  });
  test("an import that resolves although a listener it called destroyed the modeler → an advisory from the destroy case: the import resolved", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ destroyedImportResolves: true }),
      CASE.destroyFromListener,
    );
    expect(advice).toMatch(
      /^a host's listener destroyed the modeler, or unsubscribed another listener, while the user's input or the host's call ran: importText\(\) resolved after destroy\(\) from interaction\.onChange\(false\) inside an importText\(\) that ends a held move — RECOMMENDED \(since 1\.6\): .* an importText\(\) inside which it was called rejects/,
    );
    const [found] = advice.split(" — RECOMMENDED");
    expect(found).not.toMatch(/at the start of|at the drop|Escape|inside reveal\(\)|came after/);
  });
  test("an onChange delivered over a copy of its listeners → the destroy case advises that a later listener heard the end at the Escape and inside the import", async () => {
    const destroy = await runCase(
      CASE.destroyFromListener,
      harness({ interactionDeliveryIgnoresDestroy: true }),
    );
    expect(destroy?.skipped).toBeUndefined();
    expect(destroy?.advisories).toHaveLength(1);
    for (const where of [
      "at the cancel \\(Escape\\) of a move",
      "inside an importText\\(\\) that ends a held move",
    ]) {
      expect(destroy?.advisories?.[0]).toMatch(
        new RegExp(
          `interaction\\.onChange\\(false\\) came after destroy\\(\\) from interaction\\.onChange\\(false\\) ${where}`,
        ),
      );
    }
  });
  test("an import that leaves a running gesture running → the destroy case reports its leg inside the import as a skip, not a pass", async () => {
    const destroy = await runCase(CASE.destroyFromListener, harness({ importKeepsGesture: true }));
    expect(destroy?.skipped).toBe(
      "interaction.onChange did not report the end of a held move inside importText() — a destroy() from interaction.onChange(false) inside an importText() that ends a held move was not checked",
    );
    expect(destroy?.advisories).toBeUndefined();
  });
  test("a harness whose startGesture throws in the leg inside an import → its skip names the start of the held move as what threw, not importText()", async () => {
    let starts = 0;
    const destroy = await runCase(
      CASE.destroyFromListener,
      harness(
        {},
        {
          startGesture: (m, kind) => {
            starts += 1;
            // the legs at the start of a move and of a create, at the drop and at the Escape
            // each start one gesture before it
            if (starts === 5) throw new Error("the harness could not start the move");
            return (m as ReferenceModeler).holdGesture(kind);
          },
        },
      ),
    );
    expect(destroy?.skipped).toContain(
      "interaction.onChange did not report the end of a held move inside importText(), and the start of the held move threw Error: the harness could not start the move — a destroy() from interaction.onChange(false) inside an importText() that ends a held move was not checked",
    );
    expect(destroy?.skipped).not.toMatch(/importText\(\) threw/);
  });
  test("an onChange that still calls a listener an earlier one of the same delivery unsubscribed → an advisory from the destroy case", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ interactionDeliveryIgnoresUnsubscribe: true }),
      CASE.destroyFromListener,
    );
    expect(advice).toMatch(
      /interaction\.onChange delivered \[true\] to a listener that an earlier listener of the start's delivery had unsubscribed/,
    );
    expect(advice).not.toMatch(/came after destroy\(\)/);
  });
  test("a pan reported as a gesture → an advisory from the pan case", async () => {
    const advice = await expectAdvisoryOnly(harness({ panIsGesture: true }), CASE.pan);
    expect(advice).toMatch(/interaction\.active\(\) was true during a pan/);
  });
  test("an import that ends a running pan → an advisory from the pan case", async () => {
    const advice = await expectAdvisoryOnly(harness({ importEndsPan: true }), CASE.pan);
    expect(advice).toMatch(/a pan stopped when .* was imported during it/);
  });
  test(
    "an import that waits for a running pan to end → an advisory from the pan case, not a hang",
    async () => {
      const advice = await expectAdvisoryOnly(harness({ importWaitsForPan: true }), CASE.pan);
      expect(advice).toMatch(
        /importing a different document \(canonicalTexts\[1\]\) during a pan had not settled 2 s later — the import waited for the pan to end instead of leaving it running/,
      );
      expect(advice.match(/had not settled/g)).toHaveLength(1);
    },
    HELD_IMPORT_TIMEOUT_MS,
  );
  test("a pan that puts the view from before an import back → an advisory from the pan case, for the same document", async () => {
    const advice = await expectAdvisoryOnly(harness({ panJumpsBack: true }), CASE.pan);
    expect(advice).toMatch(
      /after the same document \(canonicalTexts\[0\]\) was imported during it did not go on from the view the import left/,
    );
  });
  test("a pan that puts back the view an import left after the host restored its own → an advisory from the pan case, for both documents", async () => {
    const advice = await expectAdvisoryOnly(harness({ panIgnoresHostView: true }), CASE.pan);
    expect(advice).toMatch(
      /after a different document \(canonicalTexts\[1\]\) was imported during it did not go on from the view the host restored after the import/,
    );
    expect(advice).toMatch(
      /after the same document \(canonicalTexts\[0\]\) was imported during it did not go on from the view the host restored after the import/,
    );
    expect(advice).not.toMatch(/did not go on from the view the import left/);
  });
  test("a setViewState that does nothing while a pan is held → an advisory from the pan case, for both documents", async () => {
    const advice = await expectAdvisoryOnly(harness({ viewStateIgnoredDuringPan: true }), CASE.pan);
    expect(advice).toMatch(
      /setViewState after a different document \(canonicalTexts\[1\]\) was imported during a pan had no effect/,
    );
    expect(advice).toMatch(
      /setViewState after the same document \(canonicalTexts\[0\]\) was imported during a pan had no effect/,
    );
    expect(advice).not.toMatch(/did not go on from the view/);
  });
  test("a request that closes the open label editor → an advisory from the appearance case", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ appearanceDropsInteraction: true }),
      CASE.appearance,
    );
    expect(advice).toMatch(/did not survive appearance\.set\(.*\) \(the request closed it\)/);
  });
  test("the dropped label editor, seen through the commit alone (no interactionState) → an advisory naming both documents", async () => {
    const advice = await expectAdvisoryOnly(
      harness({ dropInteractionOnViewChange: true }, { interactionState: undefined }),
      CASE.l5Interaction,
    );
    expect(advice).toMatch(/wrote another document than committing it without one/);
  });
});
