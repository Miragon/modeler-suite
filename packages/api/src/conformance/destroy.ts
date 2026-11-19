import type { CollaborativeModeler } from "../index.js";
import type { CaseOutcome, ConformanceCase, ConformanceHarness, GestureKind } from "./harness.js";
import { adviseOn, defaultSettle, errorOf, importOrFail, outcomeOf } from "./support.js";
import {
  type ActionLegFindings,
  DRAG_START_KINDS,
  type GestureStarter,
  HELD_IMPORT_BOUND_MS,
  listenForWindowErrors,
  once,
  settledWithin,
} from "./user-input.js";

interface Destroyer {
  readonly called: boolean;
  /** `destroy()`, once, from the listener: a throw stays there and becomes a finding */
  destroy(): void;
  /** a call of a host listener, recorded when it comes after `destroy()` */
  heard(call: string): void;
  note(finding: string): void;
}

interface DestroyLeg {
  where: string;
  /**
   * what reaches the listener, as a finding names it: the user's input or the host's call. Read
   * once `act` has settled, so a leg whose act takes several steps names the one it reached
   */
  readonly input: string;
  /** why the leg proves nothing when the listener never called `destroy()` */
  unheard: string;
  /**
   * whether the leg starts with the first listed element revealed; the leg inside `reveal()`
   * reveals it itself
   */
  startsRevealed: boolean;
  /**
   * subscribes the listener that destroys the modeler, ahead of every other listener of its
   * surface, or returns why the leg cannot run; `selected` is the first listed element
   */
  listen(
    m: CollaborativeModeler,
    destroyer: Destroyer,
    selected: string | undefined,
  ): string | undefined;
  /**
   * the user's input or the host's call that reaches the listener; what it finds of its own
   * goes to `destroyer.note`
   */
  act(
    m: CollaborativeModeler,
    selected: string | undefined,
    destroyer: Destroyer,
  ): Promise<void> | void;
}

/**
 * a listener on every surface the modeler has, behind the destroying one: later listeners of the
 * same delivery, which hear nothing once `destroy()` has been called
 */
function listenBehindTheDestroy(m: CollaborativeModeler, destroyer: Destroyer): void {
  m.onContentChanged(() => destroyer.heard("onContentChanged"));
  m.elements?.onSelection((ids) => destroyer.heard(`elements.onSelection(${JSON.stringify(ids)})`));
  m.interaction?.onChange((active) => destroyer.heard(`interaction.onChange(${String(active)})`));
}

/**
 * `leg` on a fresh import of `canonicalTexts[0]` with its first listed element revealed: a selection
 * the drag's start clears, and its drop or its cancel brings back on a modeler the host destroyed.
 * The leg inside `reveal()` starts from the selection the import left and reveals that element
 * itself. The modeler is not touched after the destroy, apart from a second `destroy()`
 */
async function destroyDuring(h: ConformanceHarness, leg: DestroyLeg): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  const findings: string[] = [];
  const heardAfter: string[] = [];
  let called = false;
  let thrownByDestroy: string | undefined;
  const m = await h.create();
  try {
    await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
    await settle();
    const selected = m.elements?.list()[0]?.id;
    if (selected !== undefined && leg.startsRevealed) m.elements?.reveal(selected);
    await settle();
    const destroyer: Destroyer = {
      get called() {
        return called;
      },
      destroy() {
        if (called) return;
        called = true;
        try {
          m.destroy();
        } catch (e) {
          thrownByDestroy = String(e);
        }
      },
      heard(call) {
        if (called) heardAfter.push(call);
      },
      note(finding) {
        findings.push(finding);
      },
    };
    const unavailable = leg.listen(m, destroyer, selected);
    if (unavailable !== undefined) {
      return { findings, unverified: `${unavailable} — a destroy() ${leg.where} was not checked` };
    }
    listenBehindTheDestroy(m, destroyer);
    const errors = listenForWindowErrors();
    try {
      const thrown = await errorOf(() => leg.act(m, selected, destroyer));
      // the teardown may wait until the input's handler or the host's call has returned, and a
      // step the input scheduled (a create's name editor) runs a task after it
      await settle();
      await settle();
      if (!called) {
        return {
          findings,
          unverified: `${leg.unheard}${thrown === undefined ? "" : `, and ${leg.input} threw ${thrown}`} — a destroy() ${leg.where} was not checked`,
        };
      }
      if (thrownByDestroy !== undefined) {
        findings.push(`destroy() threw ${thrownByDestroy} ${leg.where}`);
      }
      if (thrown !== undefined) {
        findings.push(
          `${leg.input} threw ${thrown} once a listener had called destroy() ${leg.where}`,
        );
      }
      for (const error of errors.errors) {
        findings.push(`an error reached the window after destroy() ${leg.where}: ${error}`);
      }
      if (heardAfter.length > 0) {
        findings.push(
          `${heardAfter.join(", ")} came after destroy() ${leg.where} (no listener of the host is called after it, also not a later listener of the same delivery)`,
        );
      }
    } finally {
      errors.stop();
    }
  } finally {
    const again = await errorOf(() => m.destroy());
    if (called && again !== undefined) {
      findings.push(`a second destroy() after the one ${leg.where} threw ${again}`);
    }
  }
  return { findings };
}

/** the selection listener destroys the modeler when a drag's start clears the selection */
function destroyAtTheStart(startGesture: GestureStarter, kind: GestureKind): DestroyLeg {
  return {
    where: `from elements.onSelection at the start of a ${kind}`,
    input: "the input",
    unheard: `the selection listener heard nothing at the start of a ${kind} with an element revealed`,
    startsRevealed: true,
    listen(m, destroyer, selected) {
      const elements = m.elements;
      if (!elements) return "the modeler exposes no elements surface (optional)";
      if (selected === undefined || elements.selection().length === 0) {
        return "elements.list() reports no element of canonicalTexts[0] that reveal() selects";
      }
      elements.onSelection((ids) => {
        if (destroyer.called) {
          destroyer.heard(`the destroying listener again with ${JSON.stringify(ids)}`);
          return;
        }
        if (ids.length > 0) {
          destroyer.note(
            `the selection listener heard ${JSON.stringify(ids)} at the start of a ${kind}, where the start clears the selection ([])`,
          );
        }
        destroyer.destroy();
      });
      return undefined;
    },
    act: async (m) => {
      await startGesture(m, kind);
    },
  };
}

/** the change listener destroys the modeler at the drop of a move, while the drop still runs */
function destroyAtTheDrop(startGesture: GestureStarter): DestroyLeg {
  let dropping = false;
  return {
    where: "from onContentChanged at the drop of a move",
    input: "the input",
    unheard: "the drop of a move fired no onContentChanged",
    startsRevealed: true,
    listen(m, destroyer) {
      m.onContentChanged(() => {
        if (destroyer.called) destroyer.heard("the destroying onContentChanged listener again");
        else if (dropping) destroyer.destroy();
      });
      return undefined;
    },
    act: async (m) => {
      const held = await startGesture(m, "move");
      dropping = true;
      await held.drop();
    },
  };
}

/** the interaction listener destroys the modeler when Escape cancels a move */
function destroyAtEscape(startGesture: GestureStarter): DestroyLeg {
  return {
    where: "from interaction.onChange(false) at the cancel (Escape) of a move",
    input: "the input",
    unheard: "interaction.onChange did not report the end of a move at its cancel (Escape)",
    startsRevealed: true,
    listen(m, destroyer) {
      const interaction = m.interaction;
      if (!interaction) return "the modeler exposes no interaction surface (optional, 1.5)";
      interaction.onChange((active) => {
        if (destroyer.called) {
          destroyer.heard(`the destroying listener again with ${String(active)}`);
        } else if (!active) {
          destroyer.destroy();
        }
      });
      return undefined;
    },
    act: async (m) => {
      const held = await startGesture(m, "move");
      await held.cancel();
    },
  };
}

/**
 * the selection listener destroys the modeler inside the delivery that the host's `reveal()`
 * calls before it returns: diagram-js scrolls to the element after the selection's listeners.
 * The leg sees what reaches the host, not whether that scroll ran before the teardown
 */
function destroyInsideReveal(): DestroyLeg {
  return {
    where: "from elements.onSelection inside reveal()",
    input: "reveal()",
    unheard: "the selection listener heard nothing at reveal() of the first listed element",
    startsRevealed: false,
    listen(m, destroyer, selected) {
      const elements = m.elements;
      if (!elements) return "the modeler exposes no elements surface (optional)";
      if (selected === undefined) {
        return "elements.list() reports no element of canonicalTexts[0] to reveal";
      }
      elements.onSelection((ids) => {
        if (destroyer.called) {
          destroyer.heard(`the destroying listener again with ${JSON.stringify(ids)}`);
        } else {
          destroyer.destroy();
        }
      });
      return undefined;
    },
    act: (m, selected) => {
      if (selected !== undefined) m.elements?.reveal(selected);
    },
  };
}

/**
 * the interaction listener destroys the modeler inside an `importText` of `canonicalTexts[0]` that
 * ends a held move: the import's cancel (L1, RECOMMENDED since 1.5) reports the end before the
 * import's Promise settles. The import then rejects, whatever its error: it ran on a modeler the
 * host destroyed, so its resolve would tell the host a document is shown. What `exportText()`
 * returns afterwards the leg leaves open, as it calls nothing of the modeler after the destroy
 */
function destroyInsideAnImport(startGesture: GestureStarter, text: string): DestroyLeg {
  const where = "from interaction.onChange(false) inside an importText() that ends a held move";
  // what the harness's start of the move throws is no throw of the import
  let reached = "the start of the held move";
  return {
    where,
    get input() {
      return reached;
    },
    unheard: "interaction.onChange did not report the end of a held move inside importText()",
    startsRevealed: true,
    listen(m, destroyer) {
      const interaction = m.interaction;
      if (!interaction) return "the modeler exposes no interaction surface (optional, 1.5)";
      interaction.onChange((active) => {
        if (destroyer.called) {
          destroyer.heard(`the destroying listener again with ${String(active)}`);
        } else if (!active) {
          destroyer.destroy();
        }
      });
      return undefined;
    },
    act: async (m, _selected, destroyer) => {
      await startGesture(m, "move");
      reached = "importText()";
      const outcome = await settledWithin(m.importText(text), HELD_IMPORT_BOUND_MS);
      if (!destroyer.called) return;
      if (outcome.unsettled) {
        destroyer.note(
          `importText() had not settled ${HELD_IMPORT_BOUND_MS / 1000} s after destroy() ${where}`,
        );
      } else if (outcome.rejected === undefined) {
        destroyer.note(`importText() resolved after destroy() ${where}`);
      }
    },
  };
}

/**
 * a move held and cancelled while the first `interaction.onChange` listener unsubscribes the
 * second on the start's true: the second hears nothing after that, as with a DOM `EventTarget`.
 * The contract orders no delivery, so what the second heard before the unsubscribe counts for
 * nothing
 */
async function unsubscribeDuringADelivery(
  h: ConformanceHarness,
  startGesture: GestureStarter,
): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  const m = await h.create();
  try {
    await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
    await settle();
    const interaction = m.interaction;
    if (!interaction) {
      return {
        findings: [],
        unverified:
          "the modeler exposes no interaction surface (optional, 1.5) — that a listener unsubscribed during a delivery is not called was not checked",
      };
    }
    let started = false;
    let unsubscribeTheLaterOne: (() => void) | undefined;
    const heard: boolean[] = [];
    interaction.onChange((active) => {
      if (!active || started) return;
      started = true;
      unsubscribeTheLaterOne?.();
    });
    unsubscribeTheLaterOne = once(
      interaction.onChange((active) => {
        if (started) heard.push(active);
      }),
    );
    const held = await startGesture(m, "move");
    await held.cancel();
    await settle();
    if (!started) {
      return {
        findings: [],
        unverified:
          "interaction.onChange did not report the start of a move — that a listener unsubscribed during a delivery is not called was not checked",
      };
    }
    return {
      findings:
        heard.length === 0
          ? []
          : [
              `interaction.onChange delivered ${JSON.stringify(heard)} to a listener that an earlier listener of the start's delivery had unsubscribed`,
            ],
    };
  } finally {
    m.destroy();
  }
}

async function destroyFromAListener(h: ConformanceHarness): Promise<CaseOutcome> {
  const startGesture = h.startGesture;
  const findings: string[] = [];
  const unverified: string[] = [];
  const legs: DestroyLeg[] = [];
  if (startGesture) {
    legs.push(
      ...DRAG_START_KINDS.map((kind) => destroyAtTheStart(startGesture, kind)),
      destroyAtTheDrop(startGesture),
      destroyAtEscape(startGesture),
      destroyInsideAnImport(startGesture, h.canonicalTexts[0] ?? ""),
    );
  } else {
    unverified.push(
      "startGesture is undefined — that a host may destroy the modeler from a listener while the user's input runs or inside an import that ends a held gesture, and that a listener unsubscribed during a delivery is not called (RECOMMENDED since 1.6), was not checked",
    );
  }
  legs.push(destroyInsideReveal());
  const outcomes: ActionLegFindings[] = [];
  for (const leg of legs) outcomes.push(await destroyDuring(h, leg));
  if (startGesture) outcomes.push(await unsubscribeDuringADelivery(h, startGesture));
  for (const outcome of outcomes) {
    findings.push(...outcome.findings);
    if (outcome.unverified !== undefined && !unverified.includes(outcome.unverified)) {
      unverified.push(outcome.unverified);
    }
  }
  return outcomeOf(
    adviseOn(
      findings,
      "a host's listener destroyed the modeler, or unsubscribed another listener, while the user's input or the host's call ran",
      "RECOMMENDED (since 1.6): a host may call destroy() from any listener the modeler calls, also while a drag starts, drops or is cancelled and inside reveal() or importText(); neither destroy() nor the input, reveal() or importText() throws there, no listener of the host is called after it, also not a later listener of the same delivery, an importText() inside which it was called rejects, a listener that an earlier listener of the same delivery unsubscribed is not called, and the modeler may finish its teardown once the input's handler, reveal() or importText() has returned",
    ),
    unverified,
  );
}

export const destroyFromAListenerCase: ConformanceCase = {
  name: "destroy from a listener (recommended, 1.6): a host may destroy the modeler from its listener at a drag's start, a drop, an Escape, a reveal() or an import, nothing throws, no listener is called afterwards and that import rejects, and a listener unsubscribed during a delivery is not called",
  run: destroyFromAListener,
};

export const destroyTwiceCase: ConformanceCase = {
  name: "destroy is safe to call twice",
  async run(h) {
    const m = await h.create();
    m.destroy();
    m.destroy();
  },
};
