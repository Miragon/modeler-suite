/**
 * The first view of a board under the shell. The board is created with `fitOnImport: false`:
 * its own fit is not capped at 100 % and is made at the import, into whatever box the board has
 * then. So the app sets the first view itself, by the shell's rule, and never touches the view
 * again: after that it is the person's.
 *
 * The fit is made in an animation frame, and not at the import. In VS Code 1.146 the webview of
 * a tab that is behind a text editor has a stand-in size of 300 x 150 and gets no animation
 * frame until the tab is shown again (seen there; VS Code 1.96 keeps the size). To whoever asks,
 * 300 x 150 is a size like any other: a board whose first valid text arrives then, a broken
 * file that is repaired in the editor that covers it, was fitted into that box and stayed so.
 * The page says nothing else about being covered: its visibility state stays `visible` and no
 * event tells it. The frame comes when the board is seen, with the size it then has.
 */
import type { Insets } from "@miragon/modeler-shell/core";

import { fittedView, sizeOf, type ViewBox, type ViewedBoard } from "./zoom-target.js";

/** Calls `onSize` whenever the element's size changed; returns the stop function. */
export type SizeWatch = (element: Element, onSize: () => void) => () => void;

/** Runs `run` in the next animation frame of the page; returns the function that gives it up. */
export type NextFrame = (run: () => void) => () => void;

const animationFrame: NextFrame = (run) => {
  const frame = requestAnimationFrame(run);
  return () => cancelAnimationFrame(frame);
};

const observedSize: SizeWatch = (element, onSize) => {
  const observer = new ResizeObserver(onSize);
  observer.observe(element);
  return () => observer.disconnect();
};

export interface FirstFit {
  /** After every text the board accepted. Only the first call does anything. */
  imported(): void;
  /** Gives up a fit that still waits for a frame, or for the slot to get a size. */
  stop(): void;
}

export function createFirstFit(
  modeler: ViewedBoard,
  slot: ViewBox & Element,
  insets: () => Insets,
  watchSize: SizeWatch = observedSize,
  nextFrame: NextFrame = animationFrame,
): FirstFit {
  let started = false;
  let stopWaiting: (() => void) | undefined;
  const stop = (): void => {
    stopWaiting?.();
    stopWaiting = undefined;
  };
  /** true once the slot has a size, with or without anything to fit */
  const fitNow = (): boolean => {
    const size = sizeOf(slot);
    if (!(size.width > 0 && size.height > 0)) return false;
    const fitted = fittedView(modeler.contentBounds(), size, insets());
    if (fitted) modeler.setViewState(fitted);
    return true;
  };
  return {
    imported() {
      if (started) return;
      started = true;
      stopWaiting = nextFrame(() => {
        stopWaiting = undefined;
        if (fitNow()) return;
        stopWaiting = watchSize(slot, () => {
          if (fitNow()) stop();
        });
      });
    },
    stop,
  };
}
