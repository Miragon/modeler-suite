import type { CollaborativeModeler, InteractionSurface } from "../index.js";
import type { CaseOutcome, ConformanceCase, ConformanceHarness } from "./harness.js";
import { errorOf, fail, importFirstText, settleOf, skip } from "./support.js";
import {
  GESTURE_KINDS,
  type GestureStarter,
  type InteractionWatch,
  listenForWindowErrors,
  watchInteraction,
} from "./user-input.js";

/** every rule is stated by the contract, so each one fails */
async function interactionFollowsGestures(
  harness: ConformanceHarness,
): Promise<CaseOutcome | void> {
  const settle = settleOf(harness);
  const others: CollaborativeModeler[] = [];
  const modeler = await harness.create();
  try {
    const interaction = modeler.interaction;
    if (!interaction) {
      return skip("the modeler exposes no interaction surface (optional, 1.5) — nothing to verify");
    }
    if (!harness.startGesture) {
      return skip(
        "startGesture is undefined — that interaction.active() follows every gesture was not verified",
      );
    }
    const startGesture = harness.startGesture;
    if (interaction.active()) fail("interaction.active() is true before the first import");
    await importFirstText(harness, modeler);
    await settle();
    if (interaction.active()) fail("interaction.active() is true at rest after an import");
    const watch = watchInteraction(modeler);
    if (!watch) fail("the interaction surface went away");
    for (const kind of GESTURE_KINDS) {
      for (const end of ["drop", "cancel"] as const) {
        await importFirstText(harness, modeler);
        await settle();
        const mark = watch.delivered.length;
        const since = (): string => JSON.stringify(watch.delivered.slice(mark));
        const held = await startGesture(modeler, kind);
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
    await importFirstText(harness, modeler);
    const held = await startGesture(modeler, "move");
    await held.cancel();
    await settle();
    if (late.length > 0) fail("interaction.onChange delivered after its unsubscribe");
    const armedToolUnverified = await armedToolIsNoGesture(harness, modeler, interaction, watch);
    await nothingDeliveredAfterADestroy(harness, startGesture);
    const later = await laterListenerAfterADestroy(harness, startGesture);
    if (later.length > 0) {
      fail(
        `interaction.onChange delivered ${JSON.stringify(later)} to a later listener once an earlier listener of the same delivery had called destroy() at the start of a move — nothing is called after destroy()`,
      );
    }
    await viewerHoldsNoGesture(harness, others);
    if (armedToolUnverified !== undefined) return skip(armedToolUnverified);
  } finally {
    modeler.destroy();
    for (const other of others) other.destroy();
  }
}

/**
 * a palette tool that is only armed is no gesture, also across an import; returns why that was not
 * verified
 */
async function armedToolIsNoGesture(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  interaction: InteractionSurface,
  watch: InteractionWatch,
): Promise<string | undefined> {
  if (!harness.armTool) {
    return "armTool is undefined — that a palette tool that is only armed is no gesture was not verified";
  }
  const settle = settleOf(harness);
  await importFirstText(harness, modeler);
  await settle();
  const mark = watch.delivered.length;
  await harness.armTool(modeler);
  await settle();
  if (interaction.active() || watch.delivered.length > mark) {
    fail(
      `a palette tool that is only armed counted as a gesture (active() ${String(interaction.active())}, onChange delivered ${JSON.stringify(watch.delivered.slice(mark))}) — no gesture runs until its press`,
    );
  }
  await importFirstText(
    harness,
    modeler,
    "importText(canonicalTexts[0]) rejected with a tool armed",
  );
  await settle();
  if (interaction.active() || watch.delivered.length > mark) {
    fail(
      `an import with a palette tool armed changed interaction (active() ${String(interaction.active())}, onChange delivered ${JSON.stringify(watch.delivered.slice(mark))})`,
    );
  }
  return undefined;
}

/** a fresh instance destroyed while a move is held delivers nothing after destroy() */
async function nothingDeliveredAfterADestroy(
  harness: ConformanceHarness,
  startGesture: GestureStarter,
): Promise<void> {
  const destroyed = await harness.create();
  let afterDestroy: InteractionWatch | undefined;
  let mark: number;
  try {
    await importFirstText(harness, destroyed);
    afterDestroy = watchInteraction(destroyed);
    await startGesture(destroyed, "move");
    mark = afterDestroy?.delivered.length ?? 0;
  } finally {
    destroyed.destroy();
  }
  await settleOf(harness)();
  if (afterDestroy && afterDestroy.delivered.length > mark) {
    fail(
      `interaction.onChange delivered ${JSON.stringify(afterDestroy.delivered.slice(mark))} after destroy() — nothing is called after destroy()`,
    );
  }
}

/**
 * the viewer's interaction is never active, before or after an import; the viewer joins `others`,
 * which the case destroys after the modeler
 */
async function viewerHoldsNoGesture(
  harness: ConformanceHarness,
  others: CollaborativeModeler[],
): Promise<void> {
  if (!harness.createReadonly) return;
  const viewer = await harness.createReadonly();
  others.push(viewer);
  if (viewer.interaction?.active()) {
    fail("the viewer's interaction.active() is true before the first import");
  }
  await importFirstText(harness, viewer, "the viewer rejected canonicalTexts[0]");
  if (viewer.interaction?.active()) {
    fail(
      "the viewer's interaction.active() is true after an import — a viewer has no editing gesture",
    );
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
  harness: ConformanceHarness,
  startGesture: GestureStarter,
): Promise<boolean[]> {
  const settle = settleOf(harness);
  const later: boolean[] = [];
  let destroyed = false;
  const modeler = await harness.create();
  try {
    await importFirstText(harness, modeler);
    await settle();
    const interaction = modeler.interaction;
    if (!interaction) return later;
    interaction.onChange((active) => {
      if (!active || destroyed) return;
      destroyed = true;
      modeler.destroy();
    });
    interaction.onChange((active) => {
      if (destroyed) later.push(active);
    });
    // what the start throws once the modeler is gone is the destroy case's advisory, not this law:
    // a pointer handler throws to the window, where a browser's test runner fails the whole run
    const errors = listenForWindowErrors();
    try {
      await errorOf(async () => {
        await startGesture(modeler, "move");
      });
      await settle();
    } finally {
      errors.stop();
    }
  } finally {
    if (!destroyed) modeler.destroy();
  }
  return later;
}

export const interactionCase: ConformanceCase = {
  name: "interaction (when present, 1.5): active() follows every gesture to its drop and its cancel, never an armed tool, and onChange reports each change once",
  run: interactionFollowsGestures,
};
