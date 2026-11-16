/**
 * The arm rules at work (arm-rules.ts decides, this module moves the board and guards the zoom).
 * Board behaviour, the same for every strategy: nothing here knows how an editor is embedded.
 *
 * ARMING (armzoom). `arm(nodeId)` computes the viewport the node is armed at. When the board
 * stands there already, the node is armed at once, as before the rules. Otherwise the board moves
 * FIRST, while the node is still a preview (scaled by the board's CSS transform, exact and cheap),
 * and the node is armed in the same task as the last viewport write: an armed editor never exists
 * at a board zoom other than the one it ends at. A node that is armed when another one is asked
 * for becomes a preview before the first write.
 *
 * THE MOVE is this module's own loop: one `panZoom.setViewport()` per animation frame, eased by
 * the design tokens. Not React Flow's animated setViewport: measured on 12.12.1, its promise
 * resolves at the end of an undisturbed transition and NEVER settles once a wheel, a pan drag or
 * another viewport call interrupts it, and onMoveEnd comes once for two overlapping moves. The
 * loop knows what it wrote last, so anything else that moves the board shows in the next frame.
 *
 * WHILE THE BOARD MOVES no node is armed. What ends the move early, leaving the board where it
 * stands and nothing armed: a wheel over the board (it zooms from there), a press anywhere on the
 * board (it goes on as the pan, drag or click it is), Escape, arming another node (which starts
 * its own move from there), a disarm, and anything else that moves the viewport. Any other key
 * does nothing: it reaches neither the board nor an editor. A second request for the same node
 * joins the running move. After the last write the target is computed again (the window may have
 * been resized): when the node is not in place, one more move follows, three at most.
 *
 * THE ANCHOR'S KIND TRAVELS WITH THE ARMING. A request with a pointer (`ArmBy.point`, the
 * double-click) is anchored at the pointer, any other (Edit, the keyboard, the hook, the URL) at
 * the node's centre. The kind decides where a node that is longer than the board's box ends up
 * (arm-rules.ts: the pointer keeps the double-clicked point, the centre puts the node's start at
 * the margin), and it is fixed when the arming begins: the look after the last write has no
 * pointer to anchor at and needs none (the zoom is the rule's by then), but it is taken with the
 * kind of the request, so it starts no second move for a node the pointer placed and still
 * repairs a resize. A request that joins a running move takes that move's kind. Every move of
 * an arming carries the kind in its record (`anchor`).
 *
 * AN ARMED NODE AND THE BOARD ZOOM (armedzoom). A pan never matters. A zoom the board can see
 * coming is asked about BEFORE its first tick: a wheel or pinch on the board (a capture listener
 * on the board's element, ahead of d3-zoom's own on `.react-flow__renderer`) and the toolbar's
 * four buttons (`beforeZoom`). React Flow binds no key that zooms. A zoom it cannot see coming (a
 * script's setViewport) is met inside its first tick, in a listener on React Flow's store that
 * was subscribed before any surface's.
 *   free    nothing is done (the board as it was before the rules).
 *   disarm  the node is disarmed first, synchronously (flushSync), so the surface's own disarm has
 *           run when the zoom goes on: an open label editor is completed by `engine.release()`,
 *           which calls the same `directEditing.complete()` its focusout handler calls on a pane
 *           click, a popup closes, the host is a preview. While a press that began in the armed
 *           editor is held, the zoom is refused instead and the node stays armed.
 *   lock    the zoom is refused: the wheel event is stopped, a zoom not seen coming is undone
 *           inside its tick.
 * A wheel inside the armed editor, its popups or the overlay layer never comes by here: d3-zoom
 * does not get it either (`nowheel`, or outside the renderer).
 *
 * GOING BACK (armreturn=back). Done, a pane click and the hook's arm(null) bring the board back to
 * where it stood before the arming moved it: the node is a preview first, then the board moves.
 */
import { ARM_MARGIN, ARM_ZOOM_TOLERANCE, resolveRules } from "./arm-rules.js";
import type { ArmingHost, BoardArming, FlowStore } from "./arming-api.js";
import { createArmMotion } from "./arming-motion.js";
import { armPlacement } from "./arming-placement.js";
import { createArmingState } from "./arming-state.js";
import { createArmTransitions } from "./arming-transitions.js";
import { createViewportWatch } from "./viewport-watch.js";
import { createZoomGuards } from "./zoom-guards.js";

export function createBoardArming(host: ArmingHost, flowStore: FlowStore): BoardArming {
  const { params } = host;
  const given = {
    armzoom: params.armzoom,
    armedzoom: params.armedzoom,
    armreturn: params.armreturn,
  };
  const rulesOf = (_nodeId: string) => resolveRules(given);

  const state = createArmingState(host);
  const armMotion = createArmMotion(host, flowStore, state);
  const { motion, viewport, finish } = armMotion;
  const placement = armPlacement(flowStore, viewport, rulesOf);
  const { disarmNow, armNode, disarm } = createArmTransitions(
    host,
    state,
    rulesOf,
    placement,
    armMotion,
  );
  const { zoomComes, attach } = createZoomGuards(
    host,
    flowStore,
    state,
    rulesOf,
    finish,
    disarmNow,
  );
  const watch = createViewportWatch(host, flowStore, state, rulesOf, disarmNow, armNode);

  return {
    policy(nodeId) {
      const rules = rulesOf(nodeId);
      const fromUrl = (["armzoom", "armedzoom", "armreturn"] as const).filter(
        (name) => given[name] !== null,
      );
      return { ...rules, fromUrl, ...motion(), margin: ARM_MARGIN, tolerance: ARM_ZOOM_TOLERANCE };
    },

    arm(nodeId, by = { source: "other" }) {
      if (nodeId === null) return disarm(by);
      return host.isModel(nodeId) ? armNode(nodeId, by) : Promise.resolve();
    },

    beforeZoom(changes) {
      if (state.move) finish("zoom");
      return changes ? zoomComes() : true;
    },

    state: () => ({
      armed: host.armedId(),
      moving: state.move !== null,
      target: state.move?.record.purpose === "arm" ? state.move.record.nodeId : null,
      urlPending: state.urlPending,
    }),
    lastTransition: () => {
      const last = state.records[state.records.length - 1];
      return last ? { ...last } : null;
    },
    transitions: () => state.records.map((record) => ({ ...record })),
    whenRest: () =>
      new Promise((resolve) => {
        const look = (): void =>
          void requestAnimationFrame(state.move || state.urlPending ? look : () => resolve());
        look();
      }),

    watch,
    attach,
  };
}
