import type { EditRefusal } from "@miragon/c4-dsl";
import type { EditRefusedEvent, RefusalLevel } from "../services.js";

/**
 * Every refusal names a rule (of C4, of Structurizr, of what the canvas can write) and the way
 * around it, except a splice that failed its own verification: the edit layer wrote text that no
 * longer imports, added an error diagnostic or changed more than asked, so something went wrong.
 * `read-only` explains why a gesture did nothing; the invalid file itself is the status box's
 * alarm (guide §13.5), so the refusal does not raise a second one.
 */
const REFUSAL_LEVELS: Readonly<Record<EditRefusal, RefusalLevel>> = {
  "read-only": "info",
  "view-not-editable": "info",
  "field-not-editable": "info",
  "unrepresentable-value": "info",
  "name-taken": "info",
  "identifier-invalid": "info",
  "identifier-taken": "info",
  "referenced-by-opaque": "info",
  "view-in-use": "info",
  "not-allowed": "info",
  "relationship-exists": "info",
  "verification-failed": "danger",
};

/** How the apps show a refusal of `reason`; a reason this renderer does not know is a failure. */
export function refusalLevel(reason: EditRefusal): RefusalLevel {
  return Object.hasOwn(REFUSAL_LEVELS, reason) ? REFUSAL_LEVELS[reason] : "danger";
}

/** `c4.edit.refused` for a refusal, with the level its reason calls for. */
export function refusedEvent(reason: EditRefusal, message: string): EditRefusedEvent {
  return { reason, message, level: refusalLevel(reason) };
}
