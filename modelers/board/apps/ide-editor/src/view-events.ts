/**
 * When a board's view changes. The board reports its content, never its view: a wheel on the
 * pane, a pan and the move to a model that is armed happen inside it, and the shell's zoom
 * readout has to follow them all the same.
 */
import { sameView, viewOf, type BoardView, type ViewedBoard } from "./zoom-target.js";

export type ViewSubscription = (listener: () => void) => () => void;

/** What the watch asks of the page it runs in; a test hands in its own. */
export interface PageFrames {
  request(callback: () => void): number;
  cancel(handle: number): void;
  visible(): boolean;
  onVisibility(listener: () => void): () => void;
}

const browserFrames = (): PageFrames => ({
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  visible: () => document.visibilityState === "visible",
  onVisibility(listener) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
});

/** The event of a board that has one: every pan and zoom tick, and a view its host set. */
function viewEventOf(modeler: object): ViewSubscription | undefined {
  const handle = (modeler as { board?: { onViewChanged?: unknown } | undefined }).board;
  const offered = handle?.onViewChanged;
  if (typeof offered !== "function") return undefined;
  return (listener) => (offered as ViewSubscription).call(handle, () => listener());
}

/**
 * One look at the view per animation frame, and only while somebody listens and the page is
 * shown: a hidden webview draws no frame, and what its view is by then is seen with the first
 * frame after it is back.
 */
function watchedView(modeler: ViewedBoard, frames: PageFrames): ViewSubscription {
  const listeners = new Set<() => void>();
  /** the view of the last look; read anew when the first listener comes */
  let seen: BoardView = { x: 0, y: 0, zoom: 1 };
  let frame: number | undefined;
  let stopVisibility: (() => void) | undefined;
  const schedule = (): void => {
    if (frame === undefined && listeners.size > 0 && frames.visible()) {
      frame = frames.request(look);
    }
  };
  const halt = (): void => {
    if (frame !== undefined) frames.cancel(frame);
    frame = undefined;
  };
  function look(): void {
    frame = undefined;
    const now = viewOf(modeler);
    if (!sameView(now, seen)) {
      seen = now;
      for (const listener of [...listeners]) listener();
    }
    schedule();
  }
  return (listener) => {
    if (listeners.size === 0) {
      seen = viewOf(modeler);
      stopVisibility = frames.onVisibility(() => (frames.visible() ? schedule() : halt()));
    }
    listeners.add(listener);
    schedule();
    return () => {
      listeners.delete(listener);
      if (listeners.size > 0) return;
      halt();
      stopVisibility?.();
      stopVisibility = undefined;
    };
  };
}

/**
 * Tells a listener that the board's view may have changed. A board that reports its view
 * (`board.onViewChanged`) is listened to; any other is looked at once per animation frame.
 */
export function viewChanges(modeler: ViewedBoard, frames?: PageFrames): ViewSubscription {
  return viewEventOf(modeler) ?? watchedView(modeler, frames ?? browserFrames());
}
