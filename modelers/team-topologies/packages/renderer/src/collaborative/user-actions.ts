import type EventBus from "diagram-js/lib/core/EventBus";

/** Ahead of every other listener, so that every listener of the action finds it marked. */
const FIRST = 100_000;

/**
 * `execute` comes before each command runs, a redo and the commands nested in another included,
 * `revert` before each undo: a selection listener can run inside the command, before `changed`.
 * `drag.start` comes when diagram-js's `Dragging.move` activates a drag, before it deselects: a
 * selection listener runs inside that move, which reads the drag again once the listener returns.
 */
const CALL_EVENTS = [
  "commandStack.execute",
  "commandStack.revert",
  "commandStack.changed",
  "drag.start",
];

export interface UserActionWatch {
  /**
   * Whether a user action runs now: a drop, from its `drag.end` until diagram-js cleans the drag
   * up, or the code that runs a command or starts a drag, from that event until the code has
   * returned.
   */
  running(): boolean;
  /** Settles once no user action runs: at once at rest, after the running ones otherwise. */
  untilNoActionRuns(): Promise<void>;
  /** Lets every waiter go (destroy), so none waits for an action that never ends. */
  stop(): void;
}

interface RunningAction {
  readonly ended: Promise<void>;
  end(): void;
}

function startAction(): RunningAction {
  let end = (): void => undefined;
  const ended = new Promise<void>((resolve) => {
    end = resolve;
  });
  return { ended, end };
}

/**
 * Follows the user's actions that change the diagram and go on with it afterwards. An import a
 * host makes while one runs (from the change listener its command fires, for example) waits for
 * it: the rest of the action still holds the elements the import would already have replaced.
 *
 * - A drop: its later listeners, diagram-js's selection behaviour among them, look up the shapes it
 *   moved or created (#248). It is over from `drag.cleanup` on, the step before `drag.ended` and
 *   `drag.canceled` that diagram-js always takes.
 * - Every other command, from its start: an annotation appended from the context pad, a create
 *   from the palette by keyboard, a label commit (also the one a press on an element or on a
 *   resize handle makes), a delete, an undo. The code that ran it goes on in the same handler and
 *   selects the new element, opens its label editor or starts the press's drag (#285, #305); the
 *   command itself goes on after a selection listener inside it.
 * - The start of a drag: a press moved past the drag threshold, a resize, a palette create or a
 *   connect. diagram-js's `Dragging.move` deselects after `drag.start` and then reads the drag
 *   again, which an import in the selection listener would already have ended (#336). The import
 *   ends the drag afterwards instead, as it ends every running gesture.
 *
 * A command or a drag's start is over once the code that made it has returned, in the microtask
 * after its event. No action of this renderer leaves work on the diagram to a later task, so that
 * microtask comes after all of it. A waiter resumes in a microtask, so only after the rest of the
 * action has run.
 */
export function watchUserActions(eventBus: EventBus): UserActionWatch {
  let drop: RunningAction | undefined;
  /** A command or a drag's start, until the code that made it has returned. */
  let call: RunningAction | undefined;

  const endDrop = (): void => {
    const ending = drop;
    drop = undefined;
    ending?.end();
  };

  const endCall = (ending: RunningAction | undefined): void => {
    if (call === ending) call = undefined;
    ending?.end();
  };

  eventBus.on("drag.end", FIRST, () => {
    drop ??= startAction();
  });
  eventBus.on(["drag.cleanup", "drag.ended", "drag.canceled"], FIRST, endDrop);
  eventBus.on(CALL_EVENTS, FIRST, () => {
    if (call) return;
    const started = startAction();
    call = started;
    queueMicrotask(() => endCall(started));
  });

  return {
    running: () => drop !== undefined || call !== undefined,
    async untilNoActionRuns() {
      for (let action = drop ?? call; action; action = drop ?? call) await action.ended;
    },
    stop() {
      endDrop();
      endCall(call);
    },
  };
}
