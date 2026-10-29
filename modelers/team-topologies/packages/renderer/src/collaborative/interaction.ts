import type { InteractionSurface } from "@miragon/modeler-api";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import { isGesture, type DragContext } from "../gestures.js";

/** Ahead of every other listener of these drag events, so each of them reads the new value. */
const FIRST = 100_000;

/**
 * diagram-js marks a drag active right before its first `drag.move`, and has dropped it before
 * `drag.ended` and `drag.canceled`. `drag.init` corrects a value a failed cleanup left behind.
 */
const CHANGING_EVENTS = ["drag.init", "drag.move", "drag.ended", "drag.canceled"];

export interface TrackedInteraction {
  readonly surface: InteractionSurface;
  /** Ends every delivery, also the one diagram-js's own cancel on destroy would make. */
  stop(): void;
}

/**
 * The contract's `interaction` surface, read from diagram-js's dragging service: true from a
 * gesture's start until its drop or cancel. A viewer has no dragging service and stays false.
 */
export function trackInteraction(
  eventBus: EventBus,
  dragging: Dragging | null,
): TrackedInteraction {
  const listeners = new Set<(active: boolean) => void>();
  let stopped = false;
  let reported = false;

  const active = (): boolean => !stopped && isGesture(dragging?.context() as DragContext);

  const report = (): void => {
    const now = active();
    if (stopped || now === reported) return;
    reported = now;
    for (const listener of [...listeners]) deliver(listener, now);
  };

  if (dragging) eventBus.on(CHANGING_EVENTS, FIRST, report);

  return {
    surface: {
      active,
      onChange(listener) {
        if (stopped) return () => undefined;
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    stop() {
      stopped = true;
      listeners.clear();
    },
  };
}

/**
 * A host's listener runs inside diagram-js's drag or inside an import's cancel: an error it throws
 * would abort that half-way, so it surfaces on its own instead.
 */
function deliver(listener: (active: boolean) => void, active: boolean): void {
  try {
    listener(active);
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}
