/**
 * The viewport watch of the arm rules at work (board-arming.ts): a zoom of the board that nobody
 * saw coming, met inside its first tick, and the URL's arm.
 */
import type { ArmRuleSet } from "./arm-rules.js";
import type { ArmingHost, BoardArming, FlowStore } from "./arming-api.js";
import type { ArmingState } from "./arming-state.js";
import type { ArmTransitions } from "./arming-transitions.js";

export function createViewportWatch(
  host: ArmingHost,
  flowStore: FlowStore,
  // The other parts call this `state`. Here the store's listener and tryUrl each have a `state`
  // of their own, React Flow's, so the name is taken
  armingState: ArmingState,
  rulesOf: (nodeId: string) => ArmRuleSet,
  disarmNow: ArmTransitions["disarmNow"],
  armNode: ArmTransitions["armNode"],
): BoardArming["watch"] {
  const { params } = host;
  const counters = host.counters.arm;

  return () => {
    let undoing = false;
    /** the board has its first viewport: the one of the URL, or the first fit */
    let stands = false;
    const off = flowStore.subscribe((state, previous) => {
      if (!stands) {
        // finding that first viewport is the board loading, not a zoom under an armed node (`&arm=` with armzoom=off)
        stands = previous.panZoom !== null && !previous.fitViewQueued;
        if (!stands) return;
      }
      if (state.transform === previous.transform || armingState.writing || undoing) return;
      const before = previous.transform[2];
      // a pan never disarms
      if (state.transform[2] === before) return;
      const armedId = host.armedId();
      if (armedId === null) return;
      const { armedzoom } = rulesOf(armedId);
      if (armedzoom === "free") {
        counters.armedZoomTicks++;
        return;
      }
      if (state.fitViewQueued) {
        // React Flow runs a fit inside a layout effect, where React cannot flush: disarmed, but
        // only with React's next commit. The board's own Fit button never comes by here: it asks
        // first (beforeZoom). Counted as late, so a fit by any other caller shows
        host.setArmedId(null);
        armingState.home = null;
        counters.disarmsAtTick++;
        counters.lateDisarms++;
        return;
      }
      if (armedzoom === "lock" || armingState.pressHeld) {
        // not seen coming, so undone: inside this tick, before a surface hears of it
        undoing = true;
        try {
          void state.panZoom?.setViewport({
            x: previous.transform[0],
            y: previous.transform[1],
            zoom: before,
          });
        } finally {
          undoing = false;
        }
        counters.zoomsRefused++;
        counters.zoomsUndone++;
        return;
      }
      disarmNow();
      armingState.home = null;
      counters.disarmsAtTick++;
    });

    // `&arm=`: through the rule, once the first fit is through and the node's editor is up
    let frame = 0;
    const tryUrl = (): void => {
      const nodeId = params.arm;
      if (!armingState.urlPending || nodeId === null) return;
      const state = flowStore.getState();
      const measured = state.nodeLookup.get(nodeId)?.measured.width !== undefined;
      if (
        !state.panZoom ||
        state.fitViewQueued ||
        !measured ||
        host.mounted(nodeId) === undefined
      ) {
        frame = requestAnimationFrame(tryUrl);
        return;
      }
      void armNode(nodeId, { source: "url" }).finally(() => void (armingState.urlPending = false));
    };
    if (armingState.urlPending) frame = requestAnimationFrame(tryUrl);

    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  };
}
