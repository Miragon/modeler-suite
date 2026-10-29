import type EventBus from "diagram-js/lib/core/EventBus";

/** Ahead of every other listener of the drop, so that the drop's own command finds it marked. */
const FIRST = 100_000;

export interface DropWatch {
  /** Whether a drop runs now, from its `drag.end` until diagram-js cleans the drag up. */
  running(): boolean;
  /** Settles once no drop runs: at once at rest, after the running drop's end otherwise. */
  untilNoDropRuns(): Promise<void>;
  /** Lets every waiter go (destroy), so none waits for a drop that never ends. */
  stop(): void;
}

/**
 * Follows diagram-js's drops, from `drag.end` until the drag is cleaned up. An import a host makes
 * while one runs (from the change listener its command fires, for example) waits for it: the drop's
 * later listeners, diagram-js's selection behaviour among them, still hold the shapes it moved or
 * created, and an import would already have replaced them (#248).
 *
 * The drop is over from `drag.cleanup` on, the step before `drag.ended` and `drag.canceled` that
 * diagram-js always takes. A waiter resumes in a microtask, so only after the rest of the drop,
 * those two events included, has run.
 */
export function watchDrops(eventBus: EventBus): DropWatch {
  let running: { ended: Promise<void>; end(): void } | undefined;

  const endDrop = (): void => {
    const drop = running;
    running = undefined;
    drop?.end();
  };

  eventBus.on("drag.end", FIRST, () => {
    if (running) return;
    let end = (): void => undefined;
    const ended = new Promise<void>((resolve) => {
      end = resolve;
    });
    running = { ended, end };
  });
  eventBus.on(["drag.cleanup", "drag.ended", "drag.canceled"], FIRST, endDrop);

  return {
    running: () => running !== undefined,
    async untilNoDropRuns() {
      while (running) await running.ended;
    },
    stop: endDrop,
  };
}
