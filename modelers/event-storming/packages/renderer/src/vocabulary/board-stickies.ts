import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import {
  isPlaceholderLabel,
  isVocabularyStickyKind,
  type LabelledSticky,
} from "@miragon/event-storming-schema-model";
import { isEventStormingShape } from "../model/di-types.js";

/**
 * The stickies on the canvas as the vocabulary reads them, in the order of the registry: no
 * blank sticky awaiting its kind, no placeholder name of any kind (also "Domain Event" on a sticky
 * retyped to an aggregate), and not the sticky `excludedId` names (the one being renamed).
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
        !isPlaceholderLabel(shape.eventStormingType, shape.eventStormingLabel),
    )
    .map((shape) => ({
      id: shape.id,
      elementType: shape.eventStormingType,
      label: shape.eventStormingLabel,
    }));
}
