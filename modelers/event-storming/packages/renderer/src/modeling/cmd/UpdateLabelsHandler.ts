import type CommandHandler from "diagram-js/lib/command/CommandHandler";
import type { EventStormingShape } from "../../model/di-types.js";

export interface LabelChange {
  element: EventStormingShape;
  label: string;
}

export interface UpdateLabelsContext {
  changes: readonly LabelChange[];
  /** Set by the handler, for the revert. */
  oldLabels?: readonly string[];
}

/**
 * Renames several stickies as one command, so one undo takes the whole rename back. Only the
 * label changes: the box of a fixed-size sticky does not follow its text.
 */
export default class UpdateLabelsHandler implements CommandHandler {
  execute(context: UpdateLabelsContext): EventStormingShape[] {
    context.oldLabels = context.changes.map(({ element }) => element.eventStormingLabel);
    for (const { element, label } of context.changes) element.eventStormingLabel = label;
    return context.changes.map(({ element }) => element);
  }

  revert(context: UpdateLabelsContext): EventStormingShape[] {
    context.changes.forEach(({ element }, index) => {
      const old = context.oldLabels?.[index];
      if (old !== undefined) element.eventStormingLabel = old;
    });
    return context.changes.map(({ element }) => element);
  }
}
