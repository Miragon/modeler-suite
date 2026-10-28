import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { isVocabularyStickyKind, type LabelledSticky } from "@miragon/event-storming-schema-model";
import { STICKY_STYLES } from "../draw/styles.js";
import { isEventStormingShape, isStickyKind, type EventStormingShape } from "../model/di-types.js";

/**
 * "Domain Event", "Domain Event 2": the name the palette and the keys give a new sticky until it
 * is renamed. It says nothing about the domain, so the vocabulary leaves it out.
 */
export function isPlaceholderLabel(shape: EventStormingShape): boolean {
  const kind = shape.eventStormingType;
  if (!isStickyKind(kind)) return false;
  const placeholder = STICKY_STYLES[kind].label;
  const label = shape.eventStormingLabel;
  if (label === placeholder) return true;
  return label.startsWith(`${placeholder} `) && /^\d+$/.test(label.slice(placeholder.length + 1));
}

/**
 * The stickies on the canvas as the vocabulary reads them, in the order of the registry: no
 * blank sticky awaiting its kind, no placeholder name, and not the sticky `excludedId` names (the
 * one being renamed).
 */
export function boardStickies(
  elementRegistry: ElementRegistry,
  excludedId?: string,
): LabelledSticky[] {
  return elementRegistry
    .getAll()
    .filter(isEventStormingShape)
    .filter(
      (shape) =>
        shape.id !== excludedId &&
        !shape.provisional &&
        isVocabularyStickyKind(shape.eventStormingType) &&
        !isPlaceholderLabel(shape),
    )
    .map((shape) => ({
      id: shape.id,
      elementType: shape.eventStormingType,
      label: shape.eventStormingLabel,
    }));
}
