import type EventBus from "diagram-js/lib/core/EventBus";
import type { EditOutcome } from "@miragon/c4-dsl";
import { EDIT_REFUSED_EVENT, type EditRefusedEvent } from "../services.js";

/** Ahead of every app listener: the app turns the event into a toast. */
const BEFORE_THE_APP = 100_000;

export interface FieldEdit {
  readonly outcome: EditOutcome | undefined;
  /** Why the edit layer refused the value; shown at the field, never as a toast (SPEC 1.3). */
  readonly refusal: string | undefined;
}

/**
 * Runs an edit a field commits (the label editor, the inspector, a dialog's form). A refusal
 * stays at the field that caused it: its `c4.edit.refused` stops here, so the app shows no toast
 * for it, and the caller shows the message under the field instead.
 */
export function editAtField(eventBus: EventBus, edit: () => EditOutcome | undefined): FieldEdit {
  let refusal: string | undefined;
  const capture = (event: unknown) => {
    refusal = (event as EditRefusedEvent).message;
    return false;
  };
  eventBus.on(EDIT_REFUSED_EVENT, BEFORE_THE_APP, capture);
  let outcome: EditOutcome | undefined;
  try {
    outcome = edit();
  } finally {
    eventBus.off(EDIT_REFUSED_EVENT, capture);
  }
  if (outcome && !outcome.ok) refusal ??= outcome.message;
  return { outcome, refusal };
}
