/**
 * The zoom under an armed node, for the arm rules at work (board-arming.ts): what a zoom the board
 * sees coming meets, and the wheel, press and key listeners on the board's own element.
 */
import { type ArmRuleSet, wheelChangesZoom } from "./arm-rules.js";
import { inArmedEditor } from "./armed-editor.js";
import type { ArmingHost, BoardArming, FlowStore } from "./arming-api.js";
import type { ArmMotion } from "./arming-motion.js";
import type { ArmingState } from "./arming-state.js";
import type { ArmTransitions } from "./arming-transitions.js";

export interface ZoomGuards {
  zoomComes(): boolean;
  attach: BoardArming["attach"];
}

export function createZoomGuards(
  host: ArmingHost,
  flowStore: FlowStore,
  state: ArmingState,
  rulesOf: (nodeId: string) => ArmRuleSet,
  finish: ArmMotion["finish"],
  disarmNow: ArmTransitions["disarmNow"],
): ZoomGuards {
  const counters = host.counters.arm;

  // ── the zoom under an armed node ──

  /** the zoom is about to change by a gesture the board sees coming: true when it may */
  const zoomComes = (): boolean => {
    const armedId = host.armedId();
    if (armedId === null) return true;
    const { armedzoom } = rulesOf(armedId);
    if (armedzoom === "free") return true;
    if (armedzoom === "lock" || state.pressHeld) {
      counters.zoomsRefused++;
      return false;
    }
    disarmNow();
    // a disarm by a zoom never goes back
    state.home = null;
    counters.disarmsBeforeZoom++;
    return true;
  };

  const onWheel = (event: WheelEvent): void => {
    const { target } = event;
    // d3-zoom listens on the renderer and passes over what lies in a `nowheel` element: no other wheel is the board's
    if (
      !(target instanceof Element) ||
      !target.closest(".react-flow__renderer") ||
      target.closest(".nowheel")
    )
      return;
    if (state.move) {
      // the person's: the board zooms from where it stands, nothing is armed
      finish("wheel");
      return;
    }
    const { transform, minZoom, maxZoom } = flowStore.getState();
    if (!wheelChangesZoom(transform[2], event.deltaY, minZoom, maxZoom)) return;
    if (zoomComes()) return;
    // refused: not to d3-zoom, and no page zoom for a pinch
    event.preventDefault();
    event.stopPropagation();
  };

  const onBoardPress = (): void => {
    // a press on the board while it moves: the person takes over, the press goes on as what it is
    if (state.move) finish("pointer");
  };

  const onPress = (event: PointerEvent): void => {
    state.pressHeld = host.armedId() !== null && inArmedEditor(event.target);
  };
  const onRelease = (): void => {
    state.pressHeld = false;
  };

  const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);
  const onKey = (event: KeyboardEvent): void => {
    if (!state.move || MODIFIERS.has(event.key)) return;
    const { target } = event;
    // scope "board": a key aimed at a control beside the board is the page's, also while the board moves
    if (
      host.inputScope === "board" &&
      !(target instanceof Node && state.boardElement?.contains(target))
    )
      return;
    // a text field elsewhere on the page keeps its keys
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.matches("input, textarea, select"))
    )
      return;
    if (event.key === "Escape") finish("key");
    // a board that moves takes no key: not the delete key for the node the double-click selected, either
    event.stopPropagation();
  };

  return {
    zoomComes,
    attach(container) {
      const capture = { capture: true } as const;
      state.boardElement = container;
      // not passive: a refused wheel is prevented. Capture on the board's element: before d3-zoom's listener on the renderer
      container.addEventListener("wheel", onWheel, { capture: true, passive: false });
      container.addEventListener("pointerdown", onBoardPress, capture);
      window.addEventListener("pointerdown", onPress, capture);
      window.addEventListener("pointerup", onRelease, capture);
      window.addEventListener("pointercancel", onRelease, capture);
      // a press whose release went to another window
      window.addEventListener("blur", onRelease);
      window.addEventListener("keydown", onKey, capture);
      return () => {
        container.removeEventListener("wheel", onWheel, capture);
        container.removeEventListener("pointerdown", onBoardPress, capture);
        window.removeEventListener("pointerdown", onPress, capture);
        window.removeEventListener("pointerup", onRelease, capture);
        window.removeEventListener("pointercancel", onRelease, capture);
        window.removeEventListener("blur", onRelease);
        window.removeEventListener("keydown", onKey, capture);
        state.boardElement = null;
      };
    },
  };
}
