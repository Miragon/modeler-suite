/**
 * Arming and disarming for the arm rules at work (board-arming.ts): a node through its rules, the
 * board moved first.
 */
import { flushSync } from "react-dom";

import { type ArmRuleSet, sameViewport } from "./arm-rules.js";
import type { ArmBy, ArmingHost, ArmTransition } from "./arming-api.js";
import type { ArmMotion } from "./arming-motion.js";
import type { armPlacement } from "./arming-placement.js";
import type { ArmingState } from "./arming-state.js";
import type { ArmAnchor, Viewport } from "./types.js";

/** moves in a row for one arming: the first, and two more looks at a box that changed under it */
const MOVES_AT_MOST = 3;

/**
 * Arming and disarming a node. An ArmTransition (arming-api.ts) is something else: the record of
 * one move of the board.
 */
export interface ArmTransitions {
  disarmNow(): void;
  armNode(nodeId: string, by: ArmBy): Promise<void>;
  disarm(by: ArmBy): Promise<void>;
}

export function createArmTransitions(
  host: ArmingHost,
  state: ArmingState,
  rulesOf: (nodeId: string) => ArmRuleSet,
  placement: ReturnType<typeof armPlacement>,
  { viewport, finish, run }: ArmMotion,
): ArmTransitions {
  const counters = host.counters.arm;

  // ── arming and disarming ──

  /** what the page shows of an armed node: its frame's flag, or a host that is still in the overlay layer */
  const STILL_ARMED = '.board-node[data-armed="true"], .board-overlay-layer > .board-engine';
  /** a preview when this returns: React commits inside the call, and with it the surface's own disarm */
  const disarmNow = (): void => {
    flushSync(() => host.setArmedId(null));
    // the check behind counters().arm.lateDisarms: it stays 0 while the commit is synchronous
    if (document.querySelector(STILL_ARMED) !== null) counters.lateDisarms++;
  };

  const armNode = (nodeId: string, by: ArmBy): Promise<void> => {
    if (state.move?.record.purpose === "arm" && state.arming?.nodeId === nodeId)
      return state.arming.settled;
    if (state.move) finish("arm");
    if (host.armedId() === nodeId) return Promise.resolve();
    // fixed here for the whole arming: every look at the target is taken with it
    const anchorKind: ArmAnchor = by.point ? "pointer" : "centre";
    const target =
      rulesOf(nodeId).armzoom === "off" ? null : placement(nodeId, by.point, anchorKind);
    if (target === null || sameViewport(target, viewport())) {
      // nothing to move: armed at once, as before the rules
      state.home = null;
      host.setArmedId(nodeId);
      return Promise.resolve();
    }
    // the node that is armed becomes a preview before the first write, as a pane click makes it one
    if (host.armedId() !== null) disarmNow();
    state.home = { nodeId, viewport: viewport() };
    const settled = new Promise<void>((resolve) => {
      const go = (to: Viewport, moves: number): void => {
        const arrived = (interrupted: boolean, record: ArmTransition): void => {
          if (interrupted) {
            state.home = null;
            resolve();
            return;
          }
          // The box may have changed under the move (a window resize), or the node may be gone.
          // No pointer in this look: the zoom is the rule's already, so no anchor is needed, and
          // the arming's own kind keeps a node the pointer placed where the pointer put it
          const again = host.isModel(nodeId) ? placement(nodeId, undefined, anchorKind) : null;
          if (again === null) {
            record.interrupted = true;
            record.interruptedBy = "gone";
            state.home = null;
            resolve();
            return;
          }
          if (!sameViewport(again, viewport()) && moves < MOVES_AT_MOST) {
            go(again, moves + 1);
            return;
          }
          // in the same task as the last write: the editor mounts its armed layout at this viewport
          flushSync(() => host.setArmedId(nodeId));
          record.armed = true;
          resolve();
        };
        run("arm", nodeId, by.source, to, arrived, anchorKind);
      };
      go(target, 1);
    });
    state.arming = { nodeId, settled };
    return settled;
  };

  const disarm = (by: ArmBy): Promise<void> => {
    if (state.move) finish("disarm");
    const armedId = host.armedId();
    if (armedId === null) return Promise.resolve();
    const back =
      rulesOf(armedId).armreturn === "back" &&
      (by.source === "done" || by.source === "pane" || by.source === "hook") &&
      state.home?.nodeId === armedId
        ? state.home.viewport
        : null;
    state.home = null;
    if (back === null || sameViewport(back, viewport())) {
      host.setArmedId(null);
      return Promise.resolve();
    }
    // a preview first, then the board moves: no editor sees a zoom step
    disarmNow();
    return new Promise((resolve) => run("return", armedId, by.source, back, () => resolve()));
  };

  return { disarmNow, armNode, disarm };
}
