import type { CollaborativeModeler } from "../index.js";
import type { CaseOutcome, ConformanceCase, ConformanceHarness } from "./harness.js";
import {
  errorOf,
  fail,
  firstText,
  importFirstText,
  importOrFail,
  settleOf,
  skip,
} from "./support.js";
import {
  GESTURE_KINDS,
  type GestureStarter,
  type InteractionWatch,
  listenForWindowErrors,
  watchInteraction,
} from "./user-input.js";

/** every rule is stated by the contract, so each one fails */
async function interactionFollowsGestures(h: ConformanceHarness): Promise<CaseOutcome | void> {
  const settle = settleOf(h);
  const first = firstText(h);
  const others: CollaborativeModeler[] = [];
  const m = await h.create();
  try {
    const interaction = m.interaction;
    if (!interaction) {
      return skip("the modeler exposes no interaction surface (optional, 1.5) — nothing to verify");
    }
    if (!h.startGesture) {
      return skip(
        "startGesture is undefined — that interaction.active() follows every gesture was not verified",
      );
    }
    const startGesture = h.startGesture;
    if (interaction.active()) fail("interaction.active() is true before the first import");
    await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
    await settle();
    if (interaction.active()) fail("interaction.active() is true at rest after an import");
    const watch = watchInteraction(m);
    if (!watch) fail("the interaction surface went away");
    for (const kind of GESTURE_KINDS) {
      for (const end of ["drop", "cancel"] as const) {
        await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
        await settle();
        const mark = watch.delivered.length;
        const since = (): string => JSON.stringify(watch.delivered.slice(mark));
        const held = await startGesture(m, kind);
        if (!interaction.active()) {
          fail(`interaction.active() is false while a ${kind} gesture is held`);
        }
        if (since() !== "[true]") {
          fail(
            `interaction.onChange delivered ${since()} when a ${kind} gesture started — once true`,
          );
        }
        await held[end]();
        if (interaction.active()) {
          fail(`interaction.active() is still true after the ${end} of a ${kind} gesture`);
        }
        await settle();
        if (since() !== "[true,false]") {
          fail(
            `interaction.onChange delivered ${since()} from the start of a ${kind} gesture to its ${end} — once true, then once false`,
          );
        }
      }
    }
    if (watch.mismatches > 0) {
      fail(
        `inside an interaction.onChange listener active() returned another value than the listener got (${watch.mismatches}x) — it already returns the new value there`,
      );
    }
    const late: boolean[] = [];
    const unsubscribe = interaction.onChange((active) => late.push(active));
    unsubscribe();
    await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
    const held = await startGesture(m, "move");
    await held.cancel();
    await settle();
    if (late.length > 0) fail("interaction.onChange delivered after its unsubscribe");
    const unverified: string[] = [];
    if (h.armTool) {
      await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
      await settle();
      const mark = watch.delivered.length;
      await h.armTool(m);
      await settle();
      if (interaction.active() || watch.delivered.length > mark) {
        fail(
          `a palette tool that is only armed counted as a gesture (active() ${String(interaction.active())}, onChange delivered ${JSON.stringify(watch.delivered.slice(mark))}) — no gesture runs until its press`,
        );
      }
      await importOrFail(m, first, "importText(canonicalTexts[0]) rejected with a tool armed");
      await settle();
      if (interaction.active() || watch.delivered.length > mark) {
        fail(
          `an import with a palette tool armed changed interaction (active() ${String(interaction.active())}, onChange delivered ${JSON.stringify(watch.delivered.slice(mark))})`,
        );
      }
    } else {
      unverified.push(
        "armTool is undefined — that a palette tool that is only armed is no gesture was not verified",
      );
    }
    const destroyed = await h.create();
    let afterDestroy: InteractionWatch | undefined;
    let mark = 0;
    try {
      await importOrFail(destroyed, first, "importText(canonicalTexts[0]) rejected");
      afterDestroy = watchInteraction(destroyed);
      await startGesture(destroyed, "move");
      mark = afterDestroy?.delivered.length ?? 0;
    } finally {
      destroyed.destroy();
    }
    await settle();
    if (afterDestroy && afterDestroy.delivered.length > mark) {
      fail(
        `interaction.onChange delivered ${JSON.stringify(afterDestroy.delivered.slice(mark))} after destroy() — nothing is called after destroy()`,
      );
    }
    const later = await laterListenerAfterADestroy(h, startGesture);
    if (later.length > 0) {
      fail(
        `interaction.onChange delivered ${JSON.stringify(later)} to a later listener once an earlier listener of the same delivery had called destroy() at the start of a move — nothing is called after destroy()`,
      );
    }
    if (h.createReadonly) {
      const viewer = await h.createReadonly();
      others.push(viewer);
      if (viewer.interaction?.active()) {
        fail("the viewer's interaction.active() is true before the first import");
      }
      await importOrFail(viewer, first, "the viewer rejected canonicalTexts[0]");
      if (viewer.interaction?.active()) {
        fail(
          "the viewer's interaction.active() is true after an import — a viewer has no editing gesture",
        );
      }
    }
    if (unverified.length > 0) return skip(unverified.join("; "));
  } finally {
    m.destroy();
    for (const other of others) other.destroy();
  }
}

/**
 * two `interaction.onChange` listeners on a fresh instance, and a move started: the first calls
 * `destroy()` on the start's true. Returns what the second heard after that, which must be nothing:
 * the contract states since 1.5 that nothing is called once `destroy()` has been called, so a
 * delivery that goes on over a copy of its listeners breaks it. The contract orders no delivery, so
 * what the second heard before the destroy counts for nothing
 */
async function laterListenerAfterADestroy(
  h: ConformanceHarness,
  startGesture: GestureStarter,
): Promise<boolean[]> {
  const settle = settleOf(h);
  const later: boolean[] = [];
  let destroyed = false;
  const m = await h.create();
  try {
    await importFirstText(h, m);
    await settle();
    const interaction = m.interaction;
    if (!interaction) return later;
    interaction.onChange((active) => {
      if (!active || destroyed) return;
      destroyed = true;
      m.destroy();
    });
    interaction.onChange((active) => {
      if (destroyed) later.push(active);
    });
    // what the start throws once the modeler is gone is the destroy case's advisory, not this law:
    // a pointer handler throws to the window, where a browser's test runner fails the whole run
    const errors = listenForWindowErrors();
    try {
      await errorOf(async () => {
        await startGesture(m, "move");
      });
      await settle();
    } finally {
      errors.stop();
    }
  } finally {
    if (!destroyed) m.destroy();
  }
  return later;
}

export const interactionCase: ConformanceCase = {
  name: "interaction (when present, 1.5): active() follows every gesture to its drop and its cancel, never an armed tool, and onChange reports each change once",
  run: interactionFollowsGestures,
};
