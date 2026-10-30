/**
 * The kit's own CI: the conforming reference modeler passes EVERY case, and
 * each deliberately broken variant — one per real-world drift the contract
 * bans, and one per case in the kit — fails exactly the case set that
 * encodes the violated law. This is what makes the kit trustworthy: a law
 * whose case a saboteur passes is a law the kit does not actually enforce.
 * A variant that only misses a RECOMMENDATION fails nothing and advises
 * exactly once — a recommendation must never turn a modeler red.
 *
 * This suite runs without a DOM, which proves every other case needs none;
 * the keys case needs one and runs in keys.conformance.test.ts (jsdom), and so
 * does the colour half of the appearance case (appearance.conformance.test.ts).
 */
import { describe, expect, expectTypeOf, test, vi } from "vitest";

import pkg from "../package.json" with { type: "json" };
import {
  apiVersionsCompatible,
  type ConformanceHarness,
  conformanceCases,
  registerConformance,
} from "../src/conformance.js";
import * as root from "../src/index.js";
import {
  type AppearanceRequest,
  type AppearanceSurface,
  type AppearanceTheme,
  type CollaborativeModeler,
  type CollaborativeModelerOptions,
  type DiagramPoint,
  type FreeAreaInsets,
  type InteractionSurface,
  MODELER_API_VERSION,
} from "../src/index.js";
import { createReferenceModeler, type Flaws, type ReferenceModeler } from "./reference-modeler.js";
import {
  advisories,
  APPEARANCE_WITHOUT_DOM,
  CASE,
  failingCases,
  harness,
  runCases,
  skippedCases,
  skippedWithoutDom,
  USER_ACTION_WITHOUT_DOM,
} from "./support.js";

describe("the conforming reference modeler", () => {
  registerConformance(harness(), test, {
    onSkip: (name, reason) => {
      if (skippedWithoutDom(name, reason)) return;
      throw new Error(`the full harness must skip nothing — "${name}" skipped: ${reason}`);
    },
    onAdvisory: (name, advice) => {
      throw new Error(
        `the conforming reference follows every recommendation — "${name}" advised: ${advice}`,
      );
    },
  });

  test("every case name the saboteur table pins exists in the kit", () => {
    const names = new Set(conformanceCases().map((c) => c.name));
    for (const name of Object.values(CASE)) expect(names.has(name), name).toBe(true);
    expect(names.size).toBe(Object.keys(CASE).length);
  });

  test("the conforming reference fails NOTHING", async () => {
    expect(await failingCases(harness())).toEqual([]);
  });

  test("a diagram-js style enriched view-state readback (scale/inner/outer, rounded) is NOT a violation", async () => {
    expect(await failingCases(harness({ enrichedViewStateReadback: true }))).toEqual([]);
  });

  test("a diagram-js style enriched view-state readback advises nothing either: the pan case follows its numbers through a host's restore", async () => {
    expect(await advisories(harness({ enrichedViewStateReadback: true }))).toEqual([]);
  });

  test("waiting imports run by a microtask queued when the action starts (as Value Chain does) are NOT a violation: nothing fails, skips or advises", async () => {
    const h = harness({ flushQueuedAtTheActionsStart: true });
    expect(await failingCases(h)).toEqual([]);
    expect(await advisories(h)).toEqual([]);
    expect((await skippedCases(h)).skipped).toEqual([]);
  });

  test("the conforming reference advises nothing", async () => {
    expect(await advisories(harness())).toEqual([]);
  });

  test("without a DOM the keys case, the colour half of the appearance case and the delete of the user-action case report a skip that names it, and nothing else does", async () => {
    expect(typeof document).toBe("undefined");
    const skips = (await runCases(harness())).filter((r) => r.outcome?.skipped !== undefined);
    expect(skips.map((r) => [r.name, r.outcome?.skipped])).toEqual([
      [CASE.userAction, USER_ACTION_WITHOUT_DOM],
      [CASE.appearance, APPEARANCE_WITHOUT_DOM],
      [CASE.keys, expect.stringMatching(/^no DOM — keys need a document/)],
    ]);
  });

  test("a modeler that ignores commands before the first import, with a mutate that waits for its change event, fails nothing", async () => {
    let counter = 0;
    const waitsForItsEvent = (m: CollaborativeModeler) =>
      new Promise<void>((resolve) => {
        const off = m.onContentChanged(() => {
          off();
          resolve();
        });
        (m as ReferenceModeler).addLine(`zz-${counter++}`);
      });
    expect(await failingCases(harness({}, { mutate: waitsForItsEvent }))).toEqual([]);
    expect(
      await failingCases(
        harness({ ignoresCommandsBeforeImport: true }, { mutate: waitsForItsEvent }),
      ),
    ).toEqual([]);
  });

  test("an empty name in the session and an absent one after export → import are the same", async () => {
    let counter = 0;
    const h = harness(
      { blankNamesReadBackAbsent: true },
      { mutate: (m) => (m as ReferenceModeler).addLine(`~zz-${counter++}`) },
    );
    expect(await failingCases(h)).toEqual([]);
    expect(await advisories(h)).toEqual([]);
  });

  test("an id spelled from identical content is not blamed: the collision check reports a skip instead", async () => {
    const collision = conformanceCases().find((c) => c.name === CASE.elementsCollision);
    const sameElement = {
      mutate: (m: CollaborativeModeler) => (m as ReferenceModeler).addLine("zz"),
    };
    const derived = await collision?.run(harness({}, sameElement));
    expect(derived?.advisories).toBeUndefined();
    expect(derived?.skipped).toMatch(/derived from that name .* inconclusive/);
    // a counter id names nothing of the content: the same advisory as for different elements
    const counter = await collision?.run(harness({ counterIds: true }, sameElement));
    expect(counter?.skipped).toBeUndefined();
    expect(counter?.advisories).toEqual([
      expect.stringContaining("allocated the same id ('line_1')"),
    ]);
  });

  test("a modeler without elements.bounds (optional) skips the bounds case and the covering half of the content-bounds case", async () => {
    const withoutBounds = async (): Promise<ReferenceModeler> => {
      const m = createReferenceModeler();
      if (!m.elements) throw new Error("the reference exposes an elements surface");
      const { bounds: _dropped, ...elements } = m.elements;
      return { ...m, elements };
    };
    const h = harness({}, { create: withoutBounds });
    expect(await failingCases(h)).toEqual([]);
    expect((await skippedCases(h)).skipped).toEqual([CASE.bounds, CASE.contentBounds].sort());
    const content = await conformanceCases()
      .find((c) => c.name === CASE.contentBounds)
      ?.run(h);
    expect(content?.skipped).toMatch(
      /no elements\.bounds — that the content box covers every element was not verified/,
    );
  });

  test("a modeler without interaction (optional, 1.5) skips exactly the interaction case and the destroy case's legs that listen to it, and the gesture, drop and pan cases run without it", async () => {
    const withoutInteraction = async (): Promise<CollaborativeModeler> => {
      const { interaction: _dropped, ...m } = createReferenceModeler();
      return m;
    };
    const h = harness({}, { create: withoutInteraction });
    expect(await failingCases(h)).toEqual([]);
    expect(await advisories(h)).toEqual([]);
    expect((await skippedCases(h)).skipped).toEqual(
      [CASE.destroyFromListener, CASE.interaction].sort(),
    );
    const destroy = await conformanceCases()
      .find((c) => c.name === CASE.destroyFromListener)
      ?.run(h);
    expect(destroy?.skipped).toBe(
      "the modeler exposes no interaction surface (optional, 1.5) — a destroy() from interaction.onChange(false) at the cancel (Escape) of a move was not checked; the modeler exposes no interaction surface (optional, 1.5) — a destroy() from interaction.onChange(false) inside an importText() that ends a held move was not checked; the modeler exposes no interaction surface (optional, 1.5) — that a listener unsubscribed during a delivery is not called was not checked",
    );
  });

  test("a modeler without elements (optional) skips the imports from the selection listener, and the user-action case still checks the call order", async () => {
    const withoutElements = (flaws: Flaws) => async (): Promise<CollaborativeModeler> => {
      const { elements: _dropped, ...m } = createReferenceModeler(flaws);
      return m;
    };
    const run = (name: string, flaws: Flaws = {}) =>
      conformanceCases()
        .find((c) => c.name === name)
        ?.run(harness(flaws, { create: withoutElements(flaws) }));
    const userAction = await run(CASE.userAction);
    expect(userAction?.skipped).toBe(
      `${USER_ACTION_WITHOUT_DOM}; the modeler exposes no elements surface (optional) — imports from the selection listener during a delete, an undo and a redo were not checked`,
    );
    expect(userAction?.advisories).toBeUndefined();
    const overtaken = await run(CASE.userAction, { waitingImportsOvertaken: true });
    expect(overtaken?.advisories).toEqual([expect.stringMatching(/did not keep their call order/)]);
    const dragStart = await run(CASE.dragStart);
    expect(dragStart?.skipped).toMatch(
      /the modeler exposes no elements surface \(optional\) — an import from the selection listener at a drag's start was not checked/,
    );
    expect(dragStart?.advisories).toBeUndefined();
    const destroy = await run(CASE.destroyFromListener);
    expect(destroy?.skipped).toBe(
      ["at the start of a move", "at the start of a create", "inside reveal()"]
        .map(
          (where) =>
            `the modeler exposes no elements surface (optional) — a destroy() from elements.onSelection ${where} was not checked`,
        )
        .join("; "),
    );
    expect(destroy?.advisories).toBeUndefined();
  });

  test("a selection listener that hears nothing during the user's action reports a skip, not a pass", async () => {
    const deaf = harness({ deadSelection: true });
    const userAction = await conformanceCases()
      .find((c) => c.name === CASE.userAction)
      ?.run(deaf);
    expect(userAction?.skipped).toMatch(
      /the selection listener heard nothing during an undo of the create of the selected element 'zz-\d+' — that an import from it waits until the action has finished was not checked/,
    );
    const dragStart = await conformanceCases()
      .find((c) => c.name === CASE.dragStart)
      ?.run(deaf);
    expect(dragStart?.skipped).toMatch(
      /the selection listener heard nothing at the start of a move with 'alpha' revealed — an import at a drag's start was not checked/,
    );
    const destroy = await conformanceCases()
      .find((c) => c.name === CASE.destroyFromListener)
      ?.run(deaf);
    expect(destroy?.skipped).toMatch(
      /the selection listener heard nothing at the start of a create with an element revealed — a destroy\(\) from elements\.onSelection at the start of a create was not checked/,
    );
    expect(destroy?.skipped).toMatch(
      /the selection listener heard nothing at reveal\(\) of the first listed element — a destroy\(\) from elements\.onSelection inside reveal\(\) was not checked/,
    );
    expect(destroy?.advisories).toBeUndefined();
  });

  test("a modeler without appearance (optional, 1.5) skips exactly the appearance case", async () => {
    const withoutAppearance = async (): Promise<CollaborativeModeler> => {
      const { appearance: _dropped, ...m } = createReferenceModeler();
      return m;
    };
    const h = harness({}, { create: withoutAppearance });
    expect(await failingCases(h)).toEqual([]);
    expect((await skippedCases(h)).skipped).toEqual([CASE.appearance]);
    const outcome = await conformanceCases()
      .find((c) => c.name === CASE.appearance)
      ?.run(h);
    expect(outcome?.skipped).toMatch(
      /^the modeler exposes no appearance surface \(optional, 1\.5\)/,
    );
  });

  test("interaction listeners called newest first, an order the contract leaves open, fail nothing and advise nothing: a listener's call before the destroy or the unsubscribe counts for nothing", async () => {
    const h = harness({ interactionDeliversNewestFirst: true });
    expect(await failingCases(h)).toEqual([]);
    expect(await advisories(h)).toEqual([]);
  });

  test("a modeler that lists dark and draws it fails nothing and advises nothing", async () => {
    const h = harness({ listsDark: true });
    expect(await failingCases(h)).toEqual([]);
    expect(await advisories(h)).toEqual([]);
  });

  test("a modeler without contentBounds (optional, 1.3) skips exactly the content-bounds case", async () => {
    const withoutContentBounds = async (): Promise<CollaborativeModeler> => {
      const { contentBounds: _dropped, ...m } = createReferenceModeler();
      return m;
    };
    const h = harness({}, { create: withoutContentBounds });
    expect(await failingCases(h)).toEqual([]);
    expect((await skippedCases(h)).skipped).toEqual([CASE.contentBounds]);
  });

  test("a content box measured in float32 on fractional coordinates (getBBox on the live SVG) is NOT a violation", async () => {
    const h = harness({ contentBoundsMeasuredInFloat32: true });
    const m = createReferenceModeler({ contentBoundsMeasuredInFloat32: true });
    await m.importText("alpha\nbeta\ngamma\n");
    m.addLine("zz-0");
    const content = m.contentBounds?.();
    const bottomShortfalls = (m.elements?.list() ?? []).map(({ id }) => {
      const element = m.elements?.bounds?.(id);
      return element && content ? element.y + element.height - (content.y + content.height) : 0;
    });
    // the variant proves the tolerance only where float32 falls short by more than float64 noise
    expect(Math.max(...bottomShortfalls)).toBeGreaterThan(1e-6);
    expect(await failingCases(h)).toEqual([]);
    expect((await skippedCases(h)).skipped).toEqual([]);
  });

  test("a content box around a plot the notation always draws (Wardley), a box before the first import and on a document without elements, is NOT a violation", async () => {
    const h = harness({ contentBoundsWithPlot: true });
    const m = createReferenceModeler({ contentBoundsWithPlot: true });
    expect(m.contentBounds?.()).toBeDefined();
    await m.importText("title: Tea\n");
    expect(m.elements?.list()).toEqual([]);
    expect(m.contentBounds?.()).toBeDefined();
    expect(await failingCases(h)).toEqual([]);
    expect((await skippedCases(h)).skipped).toEqual([]);
    const withoutElements = harness(
      { contentBoundsWithPlot: true },
      { canonicalTexts: ["title: Tea\n", "alpha\nbeta\ngamma\n"] },
    );
    await expect(
      conformanceCases()
        .find((c) => c.name === CASE.contentBounds)
        ?.run(withoutElements),
    ).resolves.toBeUndefined();
  });

  test("the content box is the union of the drawn elements, undefined while nothing is drawn, and follows a move", async () => {
    const m = createReferenceModeler();
    expect(m.contentBounds?.()).toBeUndefined();
    await m.importText("alpha\nbeta\n");
    expect(m.contentBounds?.()).toEqual({ x: 0, y: 0, width: 40, height: 64 });
    m.moveLine("alpha", 40, 24);
    expect(m.contentBounds?.()).toEqual({ x: 0, y: 24, width: 80, height: 40 });
    await m.importText("title: Empty\n");
    expect(m.contentBounds?.()).toBeUndefined();
  });

  test("a moved element's offset is document content: it survives export → import", async () => {
    const m = createReferenceModeler();
    await m.importText("alpha\nbeta\n");
    m.moveLine("alpha", 40, 24);
    expect(m.exportText()).toBe("alpha @40,24\nbeta\n");
    const fresh = createReferenceModeler();
    await fresh.importText(m.exportText());
    expect(fresh.elements?.bounds?.("alpha")).toEqual({ x: 40, y: 24, width: 40, height: 24 });
  });

  test("ids the serializer writes back (a renamed element keeps its id) survive export → import", async () => {
    const m = createReferenceModeler();
    await m.importText("alpha\nbeta\n");
    m.editLabel("alpha", "omega");
    m.commitLabel();
    expect(m.exportText()).toBe("beta\nomega #alpha\n");
    const fresh = createReferenceModeler();
    await fresh.importText(m.exportText());
    expect(fresh.elements?.list()).toEqual([
      { id: "beta", name: "beta" },
      { id: "alpha", name: "omega" },
    ]);
  });

  test("optional harness fields left undefined are reported as SKIPPED, never a silent green", async () => {
    const sparse = await skippedCases(
      harness(
        {},
        {
          createReadonly: undefined,
          looseTexts: undefined,
          invalidTexts: undefined,
          foreignTexts: undefined,
          viewState: undefined,
          configMutations: undefined,
          undo: undefined,
          redo: undefined,
          moveElement: undefined,
          probeTexts: undefined,
          openInteraction: undefined,
          interactionState: undefined,
          commitInteraction: undefined,
          startGesture: undefined,
          armTool: undefined,
          startPan: undefined,
          exportImage: undefined,
        },
      ),
    );
    expect(sparse.ran).toBe(conformanceCases().length);
    expect(sparse.skipped).toEqual(
      [
        CASE.appearance,
        CASE.bounds,
        CASE.contentBounds,
        CASE.destroyFromListener,
        CASE.drop,
        CASE.dragStart,
        CASE.interaction,
        CASE.l1Gesture,
        CASE.pan,
        CASE.userAction,
        CASE.l1Interaction,
        CASE.l2Idempotent,
        CASE.l3Config,
        CASE.l3Undo,
        CASE.l4,
        CASE.l5RoundTrip,
        CASE.l5Interaction,
        CASE.l6Foreign,
        CASE.l7NoTrace,
        CASE.l7Usable,
        CASE.viewer,
      ].sort(),
    );
    // undo without redo: the undo half is verified, the redo half reports a skip, and so does the
    // redo of a delete
    expect((await skippedCases(harness({}, { redo: undefined }))).skipped).toEqual(
      [CASE.l3Undo, CASE.userAction].sort(),
    );
    // bounds without a move: the listing, the new element and the view are verified, the move reports a skip;
    // the content box needs no move
    expect((await skippedCases(harness({}, { moveElement: undefined }))).skipped).toEqual([
      CASE.bounds,
    ]);
    // an interaction without its state: the L1 half is verified, the keep-and-reopen half reports a
    // skip; the L5 case checks the keep-open through the commit instead
    expect((await skippedCases(harness({}, { interactionState: undefined }))).skipped).toEqual([
      CASE.l1Interaction,
    ]);
    // an interaction without a commit: the L5 no-commit half is verified, the commit halves report a skip
    expect((await skippedCases(harness({}, { commitInteraction: undefined }))).skipped).toEqual([
      CASE.l5Interaction,
    ]);
    // a view change needs a view to change to: without viewState the L5 interaction case skips too,
    // and both box cases report their view half
    expect((await skippedCases(harness({}, { viewState: undefined }))).skipped).toEqual(
      [CASE.l5RoundTrip, CASE.l5Interaction, CASE.bounds, CASE.contentBounds].sort(),
    );
    // one canonical text (L4 fails it anyway): the interaction case says which leg it could not run
    const interaction = conformanceCases().find((c) => c.name === CASE.l1Interaction);
    const single = await interaction?.run(
      harness({}, { canonicalTexts: ["alpha\nbeta\ngamma\n"] }),
    );
    expect(single?.skipped).toMatch(/one text — importing a DIFFERENT document/);
    // and so do the cases that import over a held gesture, a drop or a pan
    for (const name of [CASE.l1Gesture, CASE.drop, CASE.userAction, CASE.dragStart, CASE.pan]) {
      const held = await conformanceCases()
        .find((c) => c.name === name)
        ?.run(harness({}, { canonicalTexts: ["alpha\nbeta\ngamma\n"] }));
      expect(held?.skipped, name).toMatch(
        /^canonicalTexts holds one text — .* of a DIFFERENT document/,
      );
      expect(held?.advisories, name).toBeUndefined();
    }
    // the 1.5 and 1.6 harness fields, one at a time: each skips exactly the cases (or halves) that read it
    const skippedWithout = async (overrides: Partial<ConformanceHarness>) =>
      (await skippedCases(harness({}, overrides))).skipped;
    expect(await skippedWithout({ startGesture: undefined })).toEqual(
      [
        CASE.destroyFromListener,
        CASE.drop,
        CASE.dragStart,
        CASE.interaction,
        CASE.l1Gesture,
      ].sort(),
    );
    expect(await skippedWithout({ undo: undefined })).toEqual(
      [CASE.l3Undo, CASE.l4, CASE.userAction].sort(),
    );
    expect(await skippedWithout({ armTool: undefined })).toEqual([CASE.interaction]);
    expect(await skippedWithout({ startPan: undefined })).toEqual([CASE.pan]);
    expect(await skippedWithout({ exportImage: undefined })).toEqual([CASE.appearance]);
    expect(await skippedWithout({ invalidTexts: undefined })).toEqual(
      [CASE.l1Gesture, CASE.l7NoTrace, CASE.l7Usable].sort(),
    );
    expect(await skippedWithout({ openInteraction: undefined })).toEqual(
      [CASE.appearance, CASE.l1Interaction, CASE.l5Interaction].sort(),
    );
    expect(await skippedWithout({ createReadonly: undefined })).toEqual(
      [CASE.appearance, CASE.viewer].sort(),
    );
    // an EXPLICIT empty array is a statement, not an omission — no skip
    const explicit = await skippedCases(
      harness(
        {},
        { looseTexts: [], invalidTexts: [], foreignTexts: [], configMutations: [], probeTexts: [] },
      ),
    );
    expect(explicit.skipped).toEqual([]);
  });

  test("advisories reach onAdvisory once per advice, and console.warn by default", async () => {
    const run = async (options: Parameters<typeof registerConformance>[2]) => {
      const pending: Promise<void>[] = [];
      registerConformance(
        harness({ counterIds: true }),
        (_name, fn) => pending.push(fn()),
        options,
      );
      await Promise.all(pending);
    };
    // the keys case's skip without a DOM would warn too
    const onSkip = (): void => undefined;
    const routed: string[] = [];
    await run({ onSkip, onAdvisory: (name) => routed.push(name) });
    expect(routed).toEqual([CASE.elementsCollision]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await run({ onSkip });
      expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
        expect.stringContaining(`ADVISORY "${CASE.elementsCollision}"`),
      ]);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("broken variants fail exactly their law's case set", () => {
  /** assert the EXACT failure set — a saboteur failing a different case than
   *  its law's would otherwise slip through a mere containment check */
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
  const boundsCase = conformanceCases().find((c) => c.name === CASE.bounds);
  test("a move that re-creates the element under a fresh id → exactly the bounds case, which says the element is gone", async () => {
    await expectFailures({ moveChangesId: true }, [CASE.bounds]);
    await expect(boundsCase?.run(harness({ moveChangesId: true }))).rejects.toThrow(
      /is gone from elements\.list\(\) after moveElement moved it/,
    );
  });
  test("a moveElement that returns an id the modeler never listed → exactly the bounds case, which blames the harness", async () => {
    const neverListed = { moveElement: () => "__never_listed__" };
    await expectFailures({}, [CASE.bounds], neverListed);
    await expect(boundsCase?.run(harness({}, neverListed))).rejects.toThrow(
      /moveElement returned '__never_listed__', an id elements\.list\(\) did not report/,
    );
  });
  // ── the content box hosts fit to (contract 1.3) ───────────────────────────
  const contentCase = conformanceCases().find((c) => c.name === CASE.contentBounds);
  test("a content box measured at the last import (a new element lies outside it) → exactly the content-bounds case", async () => {
    await expectFailures({ contentBoundsOfImportedOnly: true }, [CASE.contentBounds]);
    await expect(contentCase?.run(harness({ contentBoundsOfImportedOnly: true }))).rejects.toThrow(
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
    await expect(contentCase?.run(harness({}, { create: throwsBeforeImport }))).rejects.toThrow(
      /contentBounds\(\) threw before the first import/,
    );
  });
  test("a content box that is undefined while elements are listed → exactly the content-bounds case", () =>
    expectFailures({ contentBoundsAlwaysUndefined: true }, [CASE.contentBounds]));
  test("a content box that is undefined while elements are listed, without elements.bounds → exactly the content-bounds case", async () => {
    const withoutBounds = async (): Promise<ReferenceModeler> => {
      const m = createReferenceModeler({ contentBoundsAlwaysUndefined: true });
      if (!m.elements) throw new Error("the reference exposes an elements surface");
      const { bounds: _dropped, ...elements } = m.elements;
      return { ...m, elements };
    };
    await expect(contentCase?.run(harness({}, { create: withoutBounds }))).rejects.toThrow(
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
  const caseNamed = (name: string) => {
    const found = conformanceCases().find((c) => c.name === name);
    if (!found) throw new Error(`the kit has no case "${name}"`);
    return found;
  };
  test("an import that applies a running move before it replaces the document → exactly the L1 gesture case, as an L1 failure", async () => {
    await expectFailures({ importDuringGestureEmits: true }, [CASE.l1Gesture]);
    await expect(
      caseNamed(CASE.l1Gesture).run(harness({ importDuringGestureEmits: true })),
    ).rejects.toThrow(/during a move gesture fired onContentChanged 1x before the drop/);
  });
  test("a drop that applies nothing → the L1 gesture case, the drop case and the drag-start case, which would prove nothing", async () => {
    await expectFailures({ dropsNothing: true }, [CASE.l1Gesture, CASE.drop, CASE.dragStart]);
    for (const name of [CASE.l1Gesture, CASE.dragStart]) {
      await expect(caseNamed(name).run(harness({ dropsNothing: true }))).rejects.toThrow(
        /and drop\(\) left the document as it was — the case proves nothing/,
      );
    }
    await expect(caseNamed(CASE.drop).run(harness({ dropsNothing: true }))).rejects.toThrow(
      /fired no onContentChanged — the case proves nothing/,
    );
  });
  test("releasing a pan that fires onContentChanged → exactly the pan case, as an L3 failure", async () => {
    await expectFailures({ panEmits: true }, [CASE.pan]);
    await expect(caseNamed(CASE.pan).run(harness({ panEmits: true }))).rejects.toThrow(
      /releasing a pan fired onContentChanged 1x .* \(L3\)/,
    );
  });
  test("a startPan that moves no view → exactly the pan case, which would prove nothing", async () => {
    const still = { startPan: () => ({ move: () => undefined, drop: () => undefined }) };
    await expectFailures({}, [CASE.pan], still);
    await expect(caseNamed(CASE.pan).run(harness({}, still))).rejects.toThrow(
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
    await expect(caseNamed(CASE.interaction).run(harness(flaws))).rejects.toThrow(message);
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
    await expect(caseNamed(CASE.appearance).run(harness(flaws))).rejects.toThrow(message);
  });

  test("the contract version constant IS the package version (one identity)", () => {
    expect(MODELER_API_VERSION).toBe(pkg.version);
  });

  test("apiVersion compatibility: same major; while 0.x, the same minor too", () => {
    expect(root.apiVersionsCompatible("0.3.1", "0.3.9")).toBe(true);
    expect(root.apiVersionsCompatible("0.3.1", "0.4.0")).toBe(false);
    expect(root.apiVersionsCompatible("1.2.0", "1.9.3")).toBe(true);
    expect(root.apiVersionsCompatible("1.2.0", "2.0.0")).toBe(false);
    // an optional surface is a minor: a 1.2 renderer binds to a 1.3 host and the other way round
    expect(root.apiVersionsCompatible("1.2.0", "1.3.0")).toBe(true);
    expect(root.apiVersionsCompatible("1.3.0", "1.2.0")).toBe(true);
  });

  test("hosts bind from the package root: apiVersionsCompatible is there, and /conformance re-exports the same function", () => {
    expect(apiVersionsCompatible).toBe(root.apiVersionsCompatible);
  });

  test("the package root carries no kit code — a host bundle that binds from it stays free of the kit", () => {
    expect(Object.keys(root).sort()).toEqual(["MODELER_API_VERSION", "apiVersionsCompatible"]);
  });
});

describe("variants that miss a RECOMMENDATION fail nothing and advise exactly once", () => {
  /** no failure anywhere, and one advisory — from the case that checks the recommendation */
  const expectAdvisoryOnly = async (
    flaws: Flaws,
    caseName: string,
    overrides: Partial<ConformanceHarness> = {},
  ): Promise<string> => {
    const h = harness(flaws, overrides);
    expect(await failingCases(h)).toEqual([]);
    const advised = await advisories(h);
    expect(advised.map(([name]) => name)).toEqual([caseName]);
    return advised[0]?.[1] ?? "";
  };

  test("per-instance counter ids (event_1 on both peers) → an advisory from the collision case", () =>
    expectAdvisoryOnly({ counterIds: true }, CASE.elementsCollision));
  test("an import that drops the open label editor instead of reopening it → an advisory from the L1 interaction case", () =>
    expectAdvisoryOnly({ dropInteractionOnImport: true }, CASE.l1Interaction));
  test("a host's view change that drops the open label editor → an advisory from the L5 interaction case", () =>
    expectAdvisoryOnly({ dropInteractionOnViewChange: true }, CASE.l5Interaction));
  test("the dropped label editor, seen through interactionState alone (no commitInteraction) → the same advisory", async () => {
    const advice = await expectAdvisoryOnly(
      { dropInteractionOnViewChange: true },
      CASE.l5Interaction,
      {
        commitInteraction: undefined,
      },
    );
    expect(advice).toMatch(/did not survive a host's view change \(setViewState closed it\)/);
  });
  test("an import that leaves a running gesture running → an advisory from the L1 gesture case, naming the drop that applied and the one that threw, and one from the drag-start case", async () => {
    const h = harness({ importKeepsGesture: true });
    expect(await failingCases(h)).toEqual([]);
    const advised = await advisories(h);
    expect(advised.map(([name]) => name).sort()).toEqual([CASE.l1Gesture, CASE.dragStart].sort());
    const atTheStart = advised.find(([name]) => name === CASE.dragStart)?.[1] ?? "";
    expect(atTheStart).toMatch(/interaction\.active\(\) was still true once importing/);
    expect(atTheStart).toMatch(/the import did not end the drag it met at its start/);
    const advice = advised.find(([name]) => name === CASE.l1Gesture)?.[1] ?? "";
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
    const advice = await expectAdvisoryOnly({ rejectedImportEndsGesture: true }, CASE.l1Gesture);
    expect(advice).toMatch(/a rejected import ended a move gesture/);
  });
  // these variants hold an import until the kit's bound of 2 s has passed, once per run of the cases
  const HELD_IMPORT_TIMEOUT_MS = 20_000;
  test(
    "an import that waits for a running gesture to end instead of cancelling it → an advisory from the L1 gesture case, not a hang",
    async () => {
      const advice = await expectAdvisoryOnly({ importWaitsForGesture: true }, CASE.l1Gesture);
      expect(advice).toMatch(
        /importing a different document \(canonicalTexts\[1\]\) during a move gesture had not settled 2 s later — the import waited for the gesture to end instead of cancelling it/,
      );
      expect(advice.match(/had not settled/g)).toHaveLength(1);
    },
    HELD_IMPORT_TIMEOUT_MS,
  );
  test("an import from a drop's change listener that runs at once → an advisory from the drop case: the drop threw on the removed element", async () => {
    const advice = await expectAdvisoryOnly({ importDuringDropRunsAtOnce: true }, CASE.drop);
    expect(advice).toMatch(/the drop threw TypeError: Cannot read properties of undefined/);
    expect(advice).toMatch(/replaced the document before the drop had ended/);
    expect(advice).not.toMatch(/an echo/);
  });
  test("an import from a drop's change listener whose Promise settles before the import → an advisory from the drop case", async () => {
    const advice = await expectAdvisoryOnly({ importDuringDropSettlesEarly: true }, CASE.drop);
    expect(advice).toMatch(/the Promise settled before the import had run/);
  });
  test(
    "an import from a drop's change listener that never settles, later imports queued behind it → an advisory from the drop case, not a hang",
    async () => {
      const advice = await expectAdvisoryOnly({ importDuringDropNeverSettles: true }, CASE.drop);
      expect(advice).toMatch(
        /importing a different document \(canonicalTexts\[1\]\) from the change listener of a drop did not settle within 2 s of the drop/,
      );
      expect(advice.match(/did not settle/g)).toHaveLength(1);
    },
    HELD_IMPORT_TIMEOUT_MS,
  );
  test("an import from a command's listener that runs at once → an advisory from the user-action case: it ran before the undo had finished", async () => {
    const advice = await expectAdvisoryOnly(
      { importDuringCommandRunsAtOnce: true },
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
      { importDuringCommandSettlesEarly: true },
      CASE.userAction,
    );
    expect(advice).toMatch(/the Promise settled before the import had run/);
    expect(advice.split(" — RECOMMENDED")[0]).not.toMatch(/call order|settled in the order/);
  });
  test(
    "an import from a command's listener that never settles, later imports queued behind it → an advisory from the user-action case, not a hang",
    async () => {
      const advice = await expectAdvisoryOnly(
        { importDuringCommandNeverSettles: true },
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
    const advice = await expectAdvisoryOnly({ waitingImportsOvertaken: true }, CASE.userAction);
    expect(advice).toMatch(/settled in the order \["the echo","the document from before"\]/);
    expect(advice).toMatch(
      /did not keep their call order: once both had settled, exportText\(\) returned the document called first/,
    );
  });
  test("an import called after the action that overtakes one still waiting for a flush queued when the action started → an advisory from the user-action case: the second import is called before that flush runs", async () => {
    const advice = await expectAdvisoryOnly(
      { waitingImportsOvertaken: true, flushQueuedAtTheActionsStart: true },
      CASE.userAction,
    );
    expect(advice).toMatch(/settled in the order \["the echo","the document from before"\]/);
    expect(advice).toMatch(/did not keep their call order/);
  });
  test("an import that runs only during a delete at once → nothing without a DOM: the delete presses a key on the canvas", async () => {
    const h = harness({ importDuringDeleteRunsAtOnce: true });
    expect(await failingCases(h)).toEqual([]);
    expect(await advisories(h)).toEqual([]);
  });
  test("an import from the selection listener at a drag's start that runs at once → an advisory from the drag-start case: the activation threw", async () => {
    const advice = await expectAdvisoryOnly({ importAtDragStartRunsAtOnce: true }, CASE.dragStart);
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
        { importAtDragStartWaitsForTheDrop: true },
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
      { destroyTearsDownInsideTheAction: true },
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
      { contentDeliveryIgnoresDestroy: true },
      CASE.destroyFromListener,
    );
    expect(advice).toMatch(
      /onContentChanged came after destroy\(\) from onContentChanged at the drop of a move/,
    );
  });
  test("a selection delivered over a copy of its listeners → an advisory from the destroy case: a later listener heard the start and the reveal", async () => {
    const advice = await expectAdvisoryOnly(
      { selectionDeliveryIgnoresDestroy: true },
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
      { destroyTearsDownInsideReveal: true },
      CASE.destroyFromListener,
    );
    expect(advice).toMatch(
      /^a host's listener destroyed the modeler, or unsubscribed another listener, while the user's input or the host's call ran: reveal\(\) threw TypeError: Cannot read properties of null \(reading 'viewbox'\) once a listener had called destroy\(\) from elements\.onSelection inside reveal\(\) — RECOMMENDED \(since 1\.6\): /,
    );
    const [found] = advice.split(" — RECOMMENDED");
    expect(found).not.toMatch(/at the start of|at the drop|Escape|came after destroy\(\)/);
  });
  test("a harness without startGesture → the destroy case still runs its leg inside reveal(): it skips only the legs at the user's input, and a teardown at once inside reveal() advises", async () => {
    const destroyCase = conformanceCases().find((c) => c.name === CASE.destroyFromListener);
    const withoutStartGesture =
      "startGesture is undefined — that a host may destroy the modeler from a listener while the user's input runs or inside an import that ends a held gesture, and that a listener unsubscribed during a delivery is not called (RECOMMENDED since 1.6), was not checked";
    const conforming = await destroyCase?.run(harness({}, { startGesture: undefined }));
    expect(conforming?.skipped).toBe(withoutStartGesture);
    expect(conforming?.advisories).toBeUndefined();
    const tearsDownAtOnce = await destroyCase?.run(
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
      { destroyedImportResolves: true },
      CASE.destroyFromListener,
    );
    expect(advice).toMatch(
      /^a host's listener destroyed the modeler, or unsubscribed another listener, while the user's input or the host's call ran: importText\(\) resolved after destroy\(\) from interaction\.onChange\(false\) inside an importText\(\) that ends a held move — RECOMMENDED \(since 1\.6\): .* an importText\(\) inside which it was called rejects/,
    );
    const [found] = advice.split(" — RECOMMENDED");
    expect(found).not.toMatch(/at the start of|at the drop|Escape|inside reveal\(\)|came after/);
  });
  test("an onChange delivered over a copy of its listeners → the destroy case advises that a later listener heard the end at the Escape and inside the import", async () => {
    const destroy = await conformanceCases()
      .find((c) => c.name === CASE.destroyFromListener)
      ?.run(harness({ interactionDeliveryIgnoresDestroy: true }));
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
    const destroy = await conformanceCases()
      .find((c) => c.name === CASE.destroyFromListener)
      ?.run(harness({ importKeepsGesture: true }));
    expect(destroy?.skipped).toBe(
      "interaction.onChange did not report the end of a held move inside importText() — a destroy() from interaction.onChange(false) inside an importText() that ends a held move was not checked",
    );
    expect(destroy?.advisories).toBeUndefined();
  });
  test("a harness whose startGesture throws in the leg inside an import → its skip names the start of the held move as what threw, not importText()", async () => {
    let starts = 0;
    const destroy = await conformanceCases()
      .find((c) => c.name === CASE.destroyFromListener)
      ?.run(
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
      { interactionDeliveryIgnoresUnsubscribe: true },
      CASE.destroyFromListener,
    );
    expect(advice).toMatch(
      /interaction\.onChange delivered \[true\] to a listener that an earlier listener of the start's delivery had unsubscribed/,
    );
    expect(advice).not.toMatch(/came after destroy\(\)/);
  });
  test("a pan reported as a gesture → an advisory from the pan case", async () => {
    const advice = await expectAdvisoryOnly({ panIsGesture: true }, CASE.pan);
    expect(advice).toMatch(/interaction\.active\(\) was true during a pan/);
  });
  test("an import that ends a running pan → an advisory from the pan case", async () => {
    const advice = await expectAdvisoryOnly({ importEndsPan: true }, CASE.pan);
    expect(advice).toMatch(/a pan stopped when .* was imported during it/);
  });
  test(
    "an import that waits for a running pan to end → an advisory from the pan case, not a hang",
    async () => {
      const advice = await expectAdvisoryOnly({ importWaitsForPan: true }, CASE.pan);
      expect(advice).toMatch(
        /importing a different document \(canonicalTexts\[1\]\) during a pan had not settled 2 s later — the import waited for the pan to end instead of leaving it running/,
      );
      expect(advice.match(/had not settled/g)).toHaveLength(1);
    },
    HELD_IMPORT_TIMEOUT_MS,
  );
  test("a pan that puts the view from before an import back → an advisory from the pan case, for the same document", async () => {
    const advice = await expectAdvisoryOnly({ panJumpsBack: true }, CASE.pan);
    expect(advice).toMatch(
      /after the same document \(canonicalTexts\[0\]\) was imported during it did not go on from the view the import left/,
    );
  });
  test("a pan that puts back the view an import left after the host restored its own → an advisory from the pan case, for both documents", async () => {
    const advice = await expectAdvisoryOnly({ panIgnoresHostView: true }, CASE.pan);
    expect(advice).toMatch(
      /after a different document \(canonicalTexts\[1\]\) was imported during it did not go on from the view the host restored after the import/,
    );
    expect(advice).toMatch(
      /after the same document \(canonicalTexts\[0\]\) was imported during it did not go on from the view the host restored after the import/,
    );
    expect(advice).not.toMatch(/did not go on from the view the import left/);
  });
  test("a setViewState that does nothing while a pan is held → an advisory from the pan case, for both documents", async () => {
    const advice = await expectAdvisoryOnly({ viewStateIgnoredDuringPan: true }, CASE.pan);
    expect(advice).toMatch(
      /setViewState after a different document \(canonicalTexts\[1\]\) was imported during a pan had no effect/,
    );
    expect(advice).toMatch(
      /setViewState after the same document \(canonicalTexts\[0\]\) was imported during a pan had no effect/,
    );
    expect(advice).not.toMatch(/did not go on from the view/);
  });
  test("a request that closes the open label editor → an advisory from the appearance case", async () => {
    const advice = await expectAdvisoryOnly({ appearanceDropsInteraction: true }, CASE.appearance);
    expect(advice).toMatch(/did not survive appearance\.set\(.*\) \(the request closed it\)/);
  });
  test("the dropped label editor, seen through the commit alone (no interactionState) → an advisory naming both documents", async () => {
    const advice = await expectAdvisoryOnly(
      { dropInteractionOnViewChange: true },
      CASE.l5Interaction,
      {
        interactionState: undefined,
      },
    );
    expect(advice).toMatch(/wrote another document than committing it without one/);
  });
});

describe("the aligned factory options (a type the renderers implement — tsc checks this block)", () => {
  test("the free area takes insets or a centre, never both, next to fitOnImport and undoRedoKeys", () => {
    const insets = (): FreeAreaInsets => ({ top: 88, right: 24, bottom: 64, left: 24 });
    const center = (): DiagramPoint | undefined => ({ x: 400, y: 300 });
    const options: CollaborativeModelerOptions[] = [
      {},
      { freeArea: { insets }, fitOnImport: false, undoRedoKeys: false },
      { freeArea: { center } },
      // @ts-expect-error — one form only: a renderer given both could not tell which one the host means
      { freeArea: { insets, center } },
    ];
    const forms = options.map((o) =>
      o.freeArea ? ("insets" in o.freeArea ? "insets" : "center") : "none",
    );
    expect(forms).toEqual(["none", "insets", "center", "insets"]);
  });
});

describe("the optional 1.5 surfaces (types the renderers implement, checked by tsc)", () => {
  test("interaction reports a held gesture to its listeners and stops after the unsubscribe", () => {
    const listeners = new Set<(active: boolean) => void>();
    let held = false;
    const interaction: InteractionSurface = {
      active: () => held,
      onChange: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const reported: boolean[] = [];
    const unsubscribe = interaction.onChange((active) => reported.push(active));
    const holdGesture = (active: boolean): void => {
      held = active;
      for (const listener of listeners) listener(active);
    };

    holdGesture(true);
    holdGesture(false);
    unsubscribe();
    holdGesture(true);

    expect(reported).toEqual([true, false]);
    expect(interaction.active()).toBe(true);
  });

  test("appearance takes light or dark with a contrast, and a host only reads its themes", () => {
    const requests: AppearanceRequest[] = [];
    const appearance: AppearanceSurface = {
      themes: ["light"],
      set: (request) => {
        requests.push(request);
      },
    };
    const modelers: Array<Pick<CollaborativeModeler, "interaction" | "appearance">> = [
      {},
      { appearance },
    ];

    appearance.set({ theme: "dark" });
    appearance.set({ theme: "dark", contrast: "high" });
    appearance.set({ theme: "light", contrast: "normal" });
    // @ts-expect-error the contract spells high contrast "high"; "hoch" is the guide's attribute value
    appearance.set({ theme: "light", contrast: "hoch" });
    // @ts-expect-error a modeler draws light or dark; following the system is the host's decision
    appearance.set({ theme: "system" });

    expectTypeOf<AppearanceSurface["themes"]>().toEqualTypeOf<readonly AppearanceTheme[]>();
    expect(requests.map((request) => request.theme)).toEqual([
      "dark",
      "dark",
      "light",
      "light",
      "system",
    ]);
    expect(modelers.map((modeler) => modeler.appearance?.themes ?? ["light"])).toEqual([
      ["light"],
      ["light"],
    ]);
  });
});
