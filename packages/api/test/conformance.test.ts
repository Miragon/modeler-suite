/**
 * The kit's own CI, in three suites: the conforming reference modeler passes EVERY case and
 * advises nothing (here), each deliberately broken variant fails exactly the case set of the law it
 * breaks (saboteurs.conformance.test.ts), and each variant that only misses a RECOMMENDATION fails
 * nothing and advises exactly once (recommendations.conformance.test.ts). This suite also holds the
 * implementation choices the kit must accept, which fail nothing, the skips the kit reports and
 * registerConformance.
 *
 * The three suites run without a DOM, which proves every other case needs none: the keys case
 * needs one and runs in keys.conformance.test.ts (jsdom), which runs every case on a DOM, and so
 * do the colour half of the appearance case (appearance.conformance.test.ts), the delete of the
 * user-action case (user-action.conformance.test.ts) and the window-error findings of the cases
 * that run the user's input (destroy.conformance.test.ts starts a gesture in a pointer handler).
 */
import { describe, expect, test, vi } from "vitest";

import {
  type ConformanceHarness,
  conformanceCases,
  registerConformance,
} from "../src/conformance.js";
import type { CollaborativeModeler } from "../src/index.js";
import { createReferenceModeler, type Flaws, type ReferenceModeler } from "./reference-modeler.js";
import {
  APPEARANCE_WITHOUT_DOM,
  CASE,
  failingCases,
  harness,
  kitOutcome,
  runCase,
  runCases,
  skippedCases,
  skippedWithoutDom,
  USER_ACTION_WITHOUT_DOM,
  withoutBounds,
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

  test("the conforming reference fails NOTHING and advises nothing", async () => {
    const { failing, advisories } = await kitOutcome(harness());
    expect(failing).toEqual([]);
    expect(advisories).toEqual([]);
  });

  test("a diagram-js style enriched view-state readback (scale/inner/outer, rounded) is NOT a violation, and advises nothing either: the pan case follows its numbers through a host's restore", async () => {
    const { failing, advisories } = await kitOutcome(harness({ enrichedViewStateReadback: true }));
    expect(failing).toEqual([]);
    expect(advisories).toEqual([]);
  });

  test("waiting imports run by a microtask queued when the action starts (as Value Chain does) are NOT a violation: nothing fails, skips or advises", async () => {
    const { failing, advisories, skipped } = await kitOutcome(
      harness({ flushQueuedAtTheActionsStart: true }),
    );
    expect(failing).toEqual([]);
    expect(advisories).toEqual([]);
    expect(skipped).toEqual([]);
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
    const { failing, advisories } = await kitOutcome(
      harness(
        { blankNamesReadBackAbsent: true },
        { mutate: (m) => (m as ReferenceModeler).addLine(`~zz-${counter++}`) },
      ),
    );
    expect(failing).toEqual([]);
    expect(advisories).toEqual([]);
  });

  test("an id spelled from identical content is not blamed: the collision check reports a skip instead", async () => {
    const sameElement = {
      mutate: (m: CollaborativeModeler) => (m as ReferenceModeler).addLine("zz"),
    };
    const derived = await runCase(CASE.elementsCollision, harness({}, sameElement));
    expect(derived?.advisories).toBeUndefined();
    expect(derived?.skipped).toMatch(/derived from that name .* inconclusive/);
    // a counter id names nothing of the content: the same advisory as for different elements
    const counter = await runCase(
      CASE.elementsCollision,
      harness({ counterIds: true }, sameElement),
    );
    expect(counter?.skipped).toBeUndefined();
    expect(counter?.advisories).toEqual([
      expect.stringContaining("allocated the same id ('line_1')"),
    ]);
  });

  test("a modeler without elements.bounds (optional) skips the bounds case and the covering half of the content-bounds case", async () => {
    const h = harness({}, { create: withoutBounds() });
    const { failing, skipped } = await kitOutcome(h);
    expect(failing).toEqual([]);
    expect(skipped).toEqual([CASE.bounds, CASE.contentBounds].sort());
    const content = await runCase(CASE.contentBounds, h);
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
    const { failing, advisories, skipped } = await kitOutcome(h);
    expect(failing).toEqual([]);
    expect(advisories).toEqual([]);
    expect(skipped).toEqual([CASE.destroyFromListener, CASE.interaction].sort());
    const destroy = await runCase(CASE.destroyFromListener, h);
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
      runCase(name, harness(flaws, { create: withoutElements(flaws) }));
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
    const userAction = await runCase(CASE.userAction, deaf);
    expect(userAction?.skipped).toMatch(
      /the selection listener heard nothing during an undo of the create of the selected element 'zz-\d+' — that an import from it waits until the action has finished was not checked/,
    );
    const dragStart = await runCase(CASE.dragStart, deaf);
    expect(dragStart?.skipped).toMatch(
      /the selection listener heard nothing at the start of a move with 'alpha' revealed — an import at a drag's start was not checked/,
    );
    const destroy = await runCase(CASE.destroyFromListener, deaf);
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
    const { failing, skipped } = await kitOutcome(h);
    expect(failing).toEqual([]);
    expect(skipped).toEqual([CASE.appearance]);
    const outcome = await runCase(CASE.appearance, h);
    expect(outcome?.skipped).toMatch(
      /^the modeler exposes no appearance surface \(optional, 1\.5\)/,
    );
  });

  test("interaction listeners called newest first, an order the contract leaves open, fail nothing and advise nothing: a listener's call before the destroy or the unsubscribe counts for nothing", async () => {
    const { failing, advisories } = await kitOutcome(
      harness({ interactionDeliversNewestFirst: true }),
    );
    expect(failing).toEqual([]);
    expect(advisories).toEqual([]);
  });

  test("a modeler that lists dark and draws it fails nothing and advises nothing", async () => {
    const { failing, advisories } = await kitOutcome(harness({ listsDark: true }));
    expect(failing).toEqual([]);
    expect(advisories).toEqual([]);
  });

  test("a modeler without contentBounds (optional, 1.3) skips exactly the content-bounds case", async () => {
    const withoutContentBounds = async (): Promise<CollaborativeModeler> => {
      const { contentBounds: _dropped, ...m } = createReferenceModeler();
      return m;
    };
    const { failing, skipped } = await kitOutcome(harness({}, { create: withoutContentBounds }));
    expect(failing).toEqual([]);
    expect(skipped).toEqual([CASE.contentBounds]);
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
    const { failing, skipped } = await kitOutcome(h);
    expect(failing).toEqual([]);
    expect(skipped).toEqual([]);
  });

  test("a content box around a plot the notation always draws (Wardley), a box before the first import and on a document without elements, is NOT a violation", async () => {
    const h = harness({ contentBoundsWithPlot: true });
    const m = createReferenceModeler({ contentBoundsWithPlot: true });
    expect(m.contentBounds?.()).toBeDefined();
    await m.importText("title: Tea\n");
    expect(m.elements?.list()).toEqual([]);
    expect(m.contentBounds?.()).toBeDefined();
    const { failing, skipped } = await kitOutcome(h);
    expect(failing).toEqual([]);
    expect(skipped).toEqual([]);
    const withoutElements = harness(
      { contentBoundsWithPlot: true },
      { canonicalTexts: ["title: Tea\n", "alpha\nbeta\ngamma\n"] },
    );
    await expect(runCase(CASE.contentBounds, withoutElements)).resolves.toBeUndefined();
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
    const skippedWithout = async (overrides: Partial<ConformanceHarness>) =>
      (await kitOutcome(harness({}, overrides))).skipped;
    // undo without redo: the undo half is verified, the redo half reports a skip, and so does the
    // redo of a delete
    expect(await skippedWithout({ redo: undefined })).toEqual(
      [CASE.l3Undo, CASE.userAction].sort(),
    );
    // bounds without a move: the listing, the new element and the view are verified, the move reports a skip;
    // the content box needs no move
    expect(await skippedWithout({ moveElement: undefined })).toEqual([CASE.bounds]);
    // an interaction without its state: the L1 half is verified, the keep-and-reopen half reports a
    // skip; the L5 case checks the keep-open through the commit instead
    expect(await skippedWithout({ interactionState: undefined })).toEqual([CASE.l1Interaction]);
    // an interaction without a commit: the L5 no-commit half is verified, the commit halves report a skip
    expect(await skippedWithout({ commitInteraction: undefined })).toEqual([CASE.l5Interaction]);
    // a view change needs a view to change to: without viewState the L5 interaction case skips too,
    // and both box cases report their view half
    expect(await skippedWithout({ viewState: undefined })).toEqual(
      [CASE.l5RoundTrip, CASE.l5Interaction, CASE.bounds, CASE.contentBounds].sort(),
    );
    // one canonical text (L4 fails it anyway): the interaction case says which leg it could not run
    const single = await runCase(
      CASE.l1Interaction,
      harness({}, { canonicalTexts: ["alpha\nbeta\ngamma\n"] }),
    );
    expect(single?.skipped).toMatch(/one text — importing a DIFFERENT document/);
    // and so do the cases that import over a held gesture, a drop or a pan
    for (const name of [CASE.l1Gesture, CASE.drop, CASE.userAction, CASE.dragStart, CASE.pan]) {
      const held = await runCase(name, harness({}, { canonicalTexts: ["alpha\nbeta\ngamma\n"] }));
      expect(held?.skipped, name).toMatch(
        /^canonicalTexts holds one text — .* of a DIFFERENT document/,
      );
      expect(held?.advisories, name).toBeUndefined();
    }
    // the 1.5 and 1.6 harness fields, one at a time: each skips exactly the cases (or halves) that read it
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
    expect(
      await skippedWithout({
        looseTexts: [],
        invalidTexts: [],
        foreignTexts: [],
        configMutations: [],
        probeTexts: [],
      }),
    ).toEqual([]);
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
