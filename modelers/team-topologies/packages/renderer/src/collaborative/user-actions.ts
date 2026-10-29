import type EventBus from "diagram-js/lib/core/EventBus";

/** Ahead of every other listener, so that every listener of the action finds it marked. */
const FIRST = 100_000;

/**
 * `execute` comes before each command runs, a redo and the commands nested in another included,
 * `revert` before each undo: a selection listener can run inside the command, before `changed`.
 */
const COMMAND_EVENTS = ["commandStack.execute", "commandStack.revert", "commandStack.changed"];

export interface UserActionWatch {
  /**
   * Whether a user action runs now: a drop, from its `drag.end` until diagram-js cleans the drag
   * up, or the code that runs a command, from the command's start until that code has returned.
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
 *   from the palette by keyboard, a label commit (also the one a press on the canvas or the palette
 *   makes), a delete, an undo. The code that ran it goes on in the same handler and selects the new
 *   element, opens its label editor or starts the drag the press began (#285, #305); the command
 *   itself goes on after a selection listener inside it. It is over once that code has returned,
 *   in the microtask after the command started. No action of this renderer leaves work on the
 *   diagram to a later task, so that microtask comes after all of it.
 *
 * A waiter resumes in a microtask, so only after the rest of the action has run.
 */
export function watchUserActions(eventBus: EventBus): UserActionWatch {
  let drop: RunningAction | undefined;
  let command: RunningAction | undefined;

  const endDrop = (): void => {
    const ending = drop;
    drop = undefined;
    ending?.end();
  };

  const endCommand = (ending: RunningAction | undefined): void => {
    if (command === ending) command = undefined;
    ending?.end();
  };

  eventBus.on("drag.end", FIRST, () => {
    drop ??= startAction();
  });
  eventBus.on(["drag.cleanup", "drag.ended", "drag.canceled"], FIRST, endDrop);
  eventBus.on(COMMAND_EVENTS, FIRST, () => {
    if (command) return;
    const started = startAction();
    command = started;
    queueMicrotask(() => endCommand(started));
  });

  return {
    running: () => drop !== undefined || command !== undefined,
    async untilNoActionRuns() {
      for (let action = drop ?? command; action; action = drop ?? command) await action.ended;
    },
    stop() {
      endDrop();
      endCommand(command);
    },
  };
}
