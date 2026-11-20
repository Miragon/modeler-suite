/**
 * Each deliberately broken variant of the reference modeler, one per real-world drift the contract
 * bans and one per case in the kit, fails exactly the case set that encodes the violated law. This
 * is what makes the kit trustworthy: a law whose case a saboteur passes is a law the kit does not
 * actually enforce. The sections say where a drift was found. Like conformance.test.ts, this suite
 * runs without a DOM.
 */
import { describe, expect, test } from "vitest";

import type { ConformanceHarness } from "../src/conformance.js";
import type { CollaborativeModeler } from "../src/index.js";
import { createReferenceModeler, type Flaws, type ReferenceModeler } from "./reference-modeler.js";
import { CASE, failingCases, harness, runCase, withoutBounds } from "./support.js";

describe("broken variants fail exactly their law's case set", () => {
  /**
   * assert the EXACT failure set — a saboteur failing a different case than
   * its law's would otherwise slip through a mere containment check
   */
  const expectFailures = async (
    flaws: Flaws,
    caseNames: string[],
    overrides: Partial<ConformanceHarness> = {},
  ) => {
    expect((await failingCases(harness(flaws, overrides))).sort()).toEqual([...caseNames].sort());
  };

  // ── the historical drifts ──────────────────────────────────────────────────
  test("import echo (the wardley importDSL drift) → every L1 case, the import during a pan, the echo inside both L7 rejection cases, the viewer", () =>
    expectFailures({ echoImport: true }, [
      CASE.l1Fresh,
      CASE.l1History,
      CASE.l1Interaction,
      CASE.l1Gesture,
      CASE.pan,
      CASE.l7NoTrace,
      CASE.l7Probes,
      CASE.viewer,
    ]));
  test("import echo only over existing history → the L1 history case and both L7 rejection cases (they import over history)", () =>
    expectFailures({ echoOnHistoryOnly: true }, [CASE.l1History, CASE.l7NoTrace, CASE.l7Probes]));
  test("import echo only on foreign content → the L1 fresh case and the viewer's foreign import", () =>
    expectFailures({ echoOnForeignOnly: true }, [CASE.l1Fresh, CASE.viewer]));
  test("non-fixpoint serializer (grows the file per round-trip) → both L2 cases, L6 foreign, L7 usable, the viewer", () =>
    expectFailures({ nonCanonicalExport: true }, [
      CASE.l2Fixpoint,
      CASE.l2Idempotent,
      CASE.l6Foreign,
      CASE.l7Usable,
      CASE.viewer,
    ]));
  test("stale snapshot undo across imports (the tt drift) → exactly L4", () =>
    expectFailures({ staleUndo: true }, [CASE.l4]));
  test("stale DELTA undo across imports (the diagram-js form: revert removes by id) → exactly L4", () =>
    expectFailures({ staleUndoDelta: true }, [CASE.l4]));
  test("undo on an empty post-import stack that emits → exactly L4", () =>
    expectFailures({ undoOnEmptyEmits: true }, [CASE.l4]));
  test("leaky unsubscribe → exactly the unsubscribe case", () =>
    expectFailures({ leakyUnsubscribe: true }, [CASE.l3Unsubscribe]));

  // ── one saboteur per kit case ──────────────────────────────────────────────
  test("incompatible apiVersion → exactly the meta case", () =>
    expectFailures({ incompatibleApiVersion: true }, [CASE.meta]));
  test("dropping foreign content (a stripping schema) → L6 foreign and the viewer", () =>
    expectFailures({ dropForeign: true }, [CASE.l6Foreign, CASE.viewer]));
  test("blank + wedged after a rejected import → every L7 case, the rejected import during a gesture and the viewer", () =>
    expectFailures({ wedgeAfterReject: true }, [
      CASE.l1Gesture,
      CASE.l7NoTrace,
      CASE.l7Usable,
      CASE.l7Probes,
      CASE.viewer,
    ]));
  test("a rejected import that erases the undo history → L7 no-trace and the L7 probes (a rejecting probe)", () =>
    expectFailures({ rejectClearsUndo: true }, [CASE.l7NoTrace, CASE.l7Probes]));
  test("silent undo → exactly the L3 undo/redo case", () =>
    expectFailures({ silentUndo: true }, [CASE.l3Undo]));
  test("silent redo → exactly the L3 undo/redo case", () =>
    expectFailures({ silentRedo: true }, [CASE.l3Undo]));
  test("no-op setViewState → both L5 view cases (nothing to prove without a view change) and the viewer", () =>
    expectFailures({ noopViewState: true }, [CASE.l5RoundTrip, CASE.l5Interaction, CASE.viewer]));
  test("an import that keeps the viewport instead of fitting → L5 round-trip and the viewer", () =>
    expectFailures({ noFitOnImport: true }, [CASE.l5RoundTrip, CASE.viewer]));
  test("a readback that setViewState does not accept → L5 round-trip and the viewer", () =>
    expectFailures({ readbackNotSettable: true }, [CASE.l5RoundTrip, CASE.viewer]));
  test("getViewState that throws before the first import → the L5 fresh case and the viewer", () =>
    expectFailures({ viewStateThrowsBeforeImport: true }, [CASE.l5Fresh, CASE.viewer]));
  test("a getViewState with a non-finite number before the first import → the L5 fresh case and the viewer, neither of which calls it a throw", async () => {
    const unmeasuredBeforeImport =
      (editable: boolean) => async (): Promise<CollaborativeModeler> => {
        const modeler = createReferenceModeler({}, editable);
        let imported = false;
        return {
          ...modeler,
          importText: async (text) => {
            const result = await modeler.importText(text);
            imported = true;
            return result;
          },
          getViewState: () => (imported ? modeler.getViewState() : { zoom: Number.NaN }),
        };
      };
    const unmeasured = {
      create: unmeasuredBeforeImport(true),
      createReadonly: unmeasuredBeforeImport(false),
    };
    await expectFailures({}, [CASE.l5Fresh, CASE.viewer], unmeasured);
    await expect(runCase(CASE.l5Fresh, harness({}, unmeasured))).rejects.toThrow(
      /^modeler-api conformance: getViewState\(\) before the first import contains a non-finite number/,
    );
    await expect(runCase(CASE.viewer, harness({}, unmeasured))).rejects.toThrow(
      /^modeler-api conformance: getViewState\(\) on the viewer before the first import contains a non-finite number/,
    );
  });
  test("dead selection surface → the elements case and the viewer", () =>
    expectFailures({ deadSelection: true }, [CASE.elements, CASE.viewer]));
  test("leaky selection unsubscribe → exactly the elements case", () =>
    expectFailures({ leakySelectionUnsubscribe: true }, [CASE.elements]));
  test("config edit outside the command stack that never emits → exactly the L3 config case", () =>
    expectFailures({ configEditSilent: true }, [CASE.l3Config]));
  test("emit before apply → exactly the L3 mutation case", () =>
    expectFailures({ emitBeforeApply: true }, [CASE.l3Mutation]));
  test("silent element command → the L3 mutation case, L7 usable and the pre-import case (looks wedged)", () =>
    expectFailures({ silentMutation: true }, [CASE.l3Mutation, CASE.l7Usable, CASE.preImport]));
  test("setViewState emits → both L5 view cases and the viewer", () =>
    expectFailures({ viewStateEmits: true }, [CASE.l5RoundTrip, CASE.l5Interaction, CASE.viewer]));
  test("invalid input resolves instead of rejecting → both L7 cases, the rejected import during a gesture and the viewer", () =>
    expectFailures({ rejectResolves: true }, [
      CASE.l1Gesture,
      CASE.l7NoTrace,
      CASE.l7Usable,
      CASE.viewer,
    ]));
  test("rejected import clears the document → L7 no-trace, the L7 probes (a rejecting probe), the rejected import during a gesture and the viewer", () =>
    expectFailures({ rejectMutatesDoc: true }, [
      CASE.l1Gesture,
      CASE.l7NoTrace,
      CASE.l7Probes,
      CASE.viewer,
    ]));
  test("reveal(unknown id) returns true → the elements case and the viewer", () =>
    expectFailures({ revealUnknownTrue: true }, [CASE.elements, CASE.viewer]));
  test("exportText throws after a command → every case that exports after a mutation", () =>
    expectFailures({ exportThrowsAfterMutate: true }, [
      CASE.preImport,
      CASE.l1Gesture,
      CASE.drop,
      CASE.dragStart,
      CASE.pan,
      CASE.appearance,
      CASE.l3Mutation,
      CASE.l3Undo,
      CASE.l4,
      CASE.elementsRoundTrip,
      CASE.l6Total,
      CASE.l7NoTrace,
      CASE.l7Usable,
      CASE.l7Probes,
    ]));
  test("positional element ids (renumbered on every edit) → exactly the elements case", () =>
    expectFailures({ positionalIds: true }, [CASE.elements]));
  test("a second destroy() that throws → the destroy case and the viewer", () =>
    expectFailures({ destroyThrowsTwice: true }, [CASE.destroy, CASE.viewer]));
  test("a viewer that emits on import → exactly the viewer case", () =>
    expectFailures({ viewerEmits: true }, [CASE.viewer]));
  test("a viewer whose importText throws (no command stack) → the viewer case and the viewer legs of the id round-trip, both box cases and the interaction case", () =>
    expectFailures({ viewerImportThrows: true }, [
      CASE.viewer,
      CASE.interaction,
      CASE.elementsRoundTrip,
      CASE.bounds,
      CASE.contentBounds,
    ]));
  test("a viewer that cannot reveal (no selection service) → exactly the viewer case", () =>
    expectFailures({ viewerCannotReveal: true }, [CASE.viewer]));
  test("a viewer whose import keeps the viewport → exactly the viewer case", () =>
    expectFailures({ viewerKeepsView: true }, [CASE.viewer]));
  test("a viewer that drops foreign content → exactly the viewer case", () =>
    expectFailures({ viewerDropsForeign: true }, [CASE.viewer]));
  test("a viewer that selects without delivering onSelection → exactly the viewer case", () =>
    expectFailures({ viewerDeadSelectionEvents: true }, [CASE.viewer]));

  // ── the Event Storming pilot's findings ────────────────────────────────────
  test("in-memory ids the serializer never writes back → exactly the id round-trip case", () =>
    expectFailures({ idsChangeOnExport: true }, [CASE.elementsRoundTrip]));
  test("exportText() or a command before the first import wedges the parser → exactly the pre-import case", () =>
    expectFailures({ wedgeOnPreImportCall: true }, [CASE.preImport]));
  test("a truncated text rejects but blanks the document, with invalidTexts [] → exactly the L7 probe case", () =>
    expectFailures({ probeRejectionLeavesTrace: true }, [CASE.l7Probes], { invalidTexts: [] }));
  test("an import that commits the open label editor → exactly the L1 interaction case", () =>
    expectFailures({ commitInteractionOnImport: true }, [CASE.l1Interaction]));

  // ── the Design IQ host's findings (contract 1.2) ───────────────────────────
  test("bounds answered from the last import (a new element has none) → exactly the bounds case", () =>
    expectFailures({ boundsOfImportedOnly: true }, [CASE.bounds]));
  test("bounds answered from the last import, with neither a move nor a view change to give it away → exactly the bounds case (the new element alone)", () =>
    expectFailures({ boundsOfImportedOnly: true }, [CASE.bounds], {
      moveElement: undefined,
      viewState: undefined,
    }));
  test("bounds frozen at the first read (a moved element stays where it was) → exactly the bounds case", () =>
    expectFailures({ boundsFrozenAtFirstRead: true }, [CASE.bounds]));
  test("bounds that answer a box for an unknown id → exactly the bounds case", () =>
    expectFailures({ boundsForUnknownIds: true }, [CASE.bounds]));
  test("bounds that answer a box for an unknown id on the modeler only → exactly the bounds case", () =>
    expectFailures({ boundsForUnknownIds: true }, [CASE.bounds], {
      createReadonly: async () => createReferenceModeler({}, false),
    }));
  test("bounds that answer a box for an unknown id on the viewer only → exactly the bounds case", () =>
    expectFailures({}, [CASE.bounds], {
      createReadonly: async () => createReferenceModeler({ boundsForUnknownIds: true }, false),
    }));
  test("bounds in screen coordinates (they move with zoom and scroll) → exactly the bounds case", () =>
    expectFailures({ boundsInViewCoordinates: true }, [CASE.bounds]));
  test("bounds of imported elements read before their layout placed them (a NaN position) → exactly the bounds case", () =>
    expectFailures({ boundsUnplacedOnImport: true }, [CASE.bounds]));
  test("bounds with a negative width (spanned from the right edge) → exactly the bounds case", () =>
    expectFailures({ boundsSignedSize: true }, [CASE.bounds]));
  test("bounds of the viewer's imported elements read before their layout placed them → exactly the bounds case", () =>
    expectFailures({}, [CASE.bounds], {
      createReadonly: async () => createReferenceModeler({ boundsUnplacedOnImport: true }, false),
    }));
  // the kit names the cause here instead of tripping over an undefined box
  test("a move that re-creates the element under a fresh id → exactly the bounds case, which says the element is gone", async () => {
    await expectFailures({ moveChangesId: true }, [CASE.bounds]);
    await expect(runCase(CASE.bounds, harness({ moveChangesId: true }))).rejects.toThrow(
      /is gone from elements\.list\(\) after moveElement moved it/,
    );
  });
  test("a moveElement that returns an id the modeler never listed → exactly the bounds case, which blames the harness", async () => {
    const neverListed = { moveElement: () => "__never_listed__" };
    await expectFailures({}, [CASE.bounds], neverListed);
    await expect(runCase(CASE.bounds, harness({}, neverListed))).rejects.toThrow(
      /moveElement returned '__never_listed__', an id elements\.list\(\) did not report/,
    );
  });
  // ── the content box hosts fit to (contract 1.3) ───────────────────────────
  test("a content box measured at the last import (a new element lies outside it) → exactly the content-bounds case", async () => {
    await expectFailures({ contentBoundsOfImportedOnly: true }, [CASE.contentBounds]);
    await expect(
      runCase(CASE.contentBounds, harness({ contentBoundsOfImportedOnly: true })),
    ).rejects.toThrow(
      /after a user mutation added an element .* does not cover elements\.bounds\('zz-\d+'\)/,
    );
  });
  test("a content box in screen coordinates (it moves with zoom and scroll) → exactly the content-bounds case", () =>
    expectFailures({ contentBoundsInViewCoordinates: true }, [CASE.contentBounds]));
  test("a content box of the elements' positions, not their sizes → exactly the content-bounds case", () =>
    expectFailures({ contentBoundsOfPositionsOnly: true }, [CASE.contentBounds]));
  test("a NaN content box before the first import → exactly the content-bounds case", () =>
    expectFailures({ contentBoundsUnmeasuredBeforeImport: true }, [CASE.contentBounds]));
  test("a content box that throws before the first import → exactly the content-bounds case", async () => {
    const throwsBeforeImport = async (): Promise<CollaborativeModeler> => {
      const m = createReferenceModeler();
      let imported = false;
      return {
        ...m,
        importText: async (text) => {
          const result = await m.importText(text);
          imported = true;
          return result;
        },
        contentBounds: () => {
          if (!imported) throw new Error("no root element yet");
          return m.contentBounds?.();
        },
      };
    };
    await expectFailures({}, [CASE.contentBounds], { create: throwsBeforeImport });
    await expect(
      runCase(CASE.contentBounds, harness({}, { create: throwsBeforeImport })),
    ).rejects.toThrow(/contentBounds\(\) threw before the first import/);
  });
  test("a content box that is undefined while elements are listed → exactly the content-bounds case", () =>
    expectFailures({ contentBoundsAlwaysUndefined: true }, [CASE.contentBounds]));
  test("a content box that is undefined while elements are listed, without elements.bounds → exactly the content-bounds case", async () => {
    const create = withoutBounds({ contentBoundsAlwaysUndefined: true });
    await expect(runCase(CASE.contentBounds, harness({}, { create }))).rejects.toThrow(
      /undefined while elements\.list\(\) reports \d+ element/,
    );
  });
  test("a viewer whose content box misses the elements' sizes → exactly the content-bounds case", () =>
    expectFailures({}, [CASE.contentBounds], {
      createReadonly: async () =>
        createReferenceModeler({ contentBoundsOfPositionsOnly: true }, false),
    }));

  test("a host's view change that commits the open label editor (the drift of every renderer built against 1.1) → exactly the L5 interaction case", () =>
    expectFailures({ commitInteractionOnViewChange: true }, [CASE.l5Interaction]));
  test("a host's view change that commits the open label editor with its change events muted → exactly the L5 interaction case", () =>
    expectFailures({ silentCommitInteractionOnViewChange: true }, [CASE.l5Interaction]));
  test("a commit that writes nothing (Enter does not commit, or the harness misses the editor) → exactly the L5 interaction case: it would prove nothing", () =>
    expectFailures({}, [CASE.l5Interaction], { commitInteraction: () => undefined }));
  test("a commit that writes nothing, with no interactionState to name the typed input → exactly the L5 interaction case", () =>
    expectFailures({}, [CASE.l5Interaction], {
      commitInteraction: () => undefined,
      interactionState: undefined,
    }));
  test("a commit that changes the document but not by the typed input → exactly the L5 interaction case: it would prove nothing", () =>
    expectFailures({}, [CASE.l5Interaction], {
      commitInteraction: (m) => (m as ReferenceModeler).setTitle("Elsewhere"),
    }));
  test("an openInteraction that opens nothing → both interaction cases: neither would prove anything", () =>
    expectFailures({}, [CASE.l1Interaction, CASE.l5Interaction], {
      openInteraction: () => undefined,
      commitInteraction: undefined,
    }));

  // ── a gesture, a drop and a pan across an import (contracts 1.5 and 1.6) ────
  test("an import that applies a running move before it replaces the document → exactly the L1 gesture case, as an L1 failure", async () => {
    await expectFailures({ importDuringGestureEmits: true }, [CASE.l1Gesture]);
    await expect(
      runCase(CASE.l1Gesture, harness({ importDuringGestureEmits: true })),
    ).rejects.toThrow(/during a move gesture fired onContentChanged 1x before the drop/);
  });
  test("a drop that applies nothing → the L1 gesture case, the drop case and the drag-start case, which would prove nothing", async () => {
    await expectFailures({ dropsNothing: true }, [CASE.l1Gesture, CASE.drop, CASE.dragStart]);
    for (const name of [CASE.l1Gesture, CASE.dragStart]) {
      await expect(runCase(name, harness({ dropsNothing: true }))).rejects.toThrow(
        /and drop\(\) left the document as it was — the case proves nothing/,
      );
    }
    await expect(runCase(CASE.drop, harness({ dropsNothing: true }))).rejects.toThrow(
      /fired no onContentChanged — the case proves nothing/,
    );
  });
  test("releasing a pan that fires onContentChanged → exactly the pan case, as an L3 failure", async () => {
    await expectFailures({ panEmits: true }, [CASE.pan]);
    await expect(runCase(CASE.pan, harness({ panEmits: true }))).rejects.toThrow(
      /releasing a pan fired onContentChanged 1x .* \(L3\)/,
    );
  });
  test("a startPan that moves no view → exactly the pan case, which would prove nothing", async () => {
    const still = { startPan: () => ({ move: () => undefined, drop: () => undefined }) };
    await expectFailures({}, [CASE.pan], still);
    await expect(runCase(CASE.pan, harness({}, still))).rejects.toThrow(
      /startPan left the view as the import had fitted it — the case proves nothing/,
    );
  });

  // ── interaction (1.5) ──────────────────────────────────────────────────────
  test.each<[string, Flaws, RegExp]>([
    [
      "an active() that is never true",
      { interactionNeverActive: true },
      /active\(\) is false while a move gesture is held/,
    ],
    [
      "onChange(true) twice at a gesture's start",
      { interactionReportsTwice: true },
      /delivered \[true,true\] when a move gesture started/,
    ],
    [
      "an onChange that runs before active() has changed",
      { interactionStaleInListener: true },
      /returned another value than the listener got/,
    ],
    [
      "an onChange unsubscribe that is ignored",
      { leakyInteractionUnsubscribe: true },
      /delivered after its unsubscribe/,
    ],
    [
      "an armed palette tool reported as a gesture",
      { armedToolIsGesture: true },
      /a palette tool that is only armed counted as a gesture/,
    ],
    [
      "an active() that is true before the first import",
      { activeBeforeImport: true },
      /true before the first import/,
    ],
    [
      "an Escape that ends the gesture without telling onChange",
      { cancelNotReported: true },
      /still true after the cancel of a move gesture/,
    ],
    [
      "an onChange(false) from destroy()",
      { reportsAfterDestroy: true },
      /delivered \[false\] after destroy\(\)/,
    ],
    [
      "an onChange delivered over a copy of its listeners, without a destroyed check",
      { interactionDeliveryIgnoresDestroy: true },
      /delivered \[true\] to a later listener once an earlier listener of the same delivery had called destroy\(\) at the start of a move/,
    ],
    [
      "a viewer that reports a gesture",
      { viewerReportsGesture: true },
      /the viewer's interaction\.active\(\) is true before the first import/,
    ],
  ])("%s → exactly the interaction case", async (_variant, flaws, message) => {
    await expectFailures(flaws, [CASE.interaction]);
    await expect(runCase(CASE.interaction, harness(flaws))).rejects.toThrow(message);
  });

  // ── appearance (1.5): the rules that need no DOM; the colours are checked in jsdom ──
  test.each<[string, Flaws, RegExp]>([
    ["no themes", { themesEmpty: true }, /appearance\.themes is \[\] — .* a non-empty list/],
    ["a theme listed twice", { themesDuplicated: true }, /lists a theme twice/],
    ["a theme the contract does not know", { themesUnknown: true }, /lists \["sepia"\]/],
    ["themes that change between reads", { themesVaryByRead: true }, /changed between two reads/],
    ["a viewer with other themes", { viewerThemesDiffer: true }, /the viewer reports other/],
    [
      "a set that throws for a theme no modeler knows",
      { appearanceThrowsOnUnknown: true },
      /appearance\.set\(\{ theme: "sepia" \}\) threw/,
    ],
    [
      "a set that throws before the first import",
      { appearanceThrowsBeforeImport: true },
      /threw before the first import/,
    ],
    ["a set that emits", { appearanceEmits: true }, /fired onContentChanged 1x .* \(L3\)/],
    [
      "a set that writes the appearance into the document",
      { appearanceInExport: true },
      /changed exportText\(\)/,
    ],
    [
      "a set that writes the appearance into the image export",
      { appearanceInImage: true },
      /changed the image export/,
    ],
    ["a set that zooms the view", { appearanceMovesView: true }, /changed the view state/],
    [
      "a set that clears the selection",
      { appearanceClearsSelection: true },
      /changed the selection/,
    ],
    [
      "a set that erases the undo history",
      { appearanceClearsUndo: true },
      /the requests changed the undo history/,
    ],
    [
      "a set that commits the open label editor",
      { appearanceCommitsInteraction: true },
      /over an open interaction committed it/,
    ],
  ])("%s → exactly the appearance case", async (_variant, flaws, message) => {
    await expectFailures(flaws, [CASE.appearance]);
    await expect(runCase(CASE.appearance, harness(flaws))).rejects.toThrow(message);
  });
});
