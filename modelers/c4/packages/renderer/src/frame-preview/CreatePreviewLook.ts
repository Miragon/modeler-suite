import type EventBus from "diagram-js/lib/core/EventBus";

/** After diagram-js's CreatePreview (750) drew the preview of a create. */
const AFTER_CREATE_PREVIEW = 500;

export const CREATE_PREVIEW_CLASS = "c4-create-preview";
const DRAGGER_CLASS = "djs-dragger";

interface CreateMoveEvent {
  context?: { dragGroup?: SVGElement };
}

/**
 * A palette create shows the element it drops, in its look: diagram-js paints every dragger as an
 * outline in the interaction colour, which would show a C4-coloured system as an empty frame. The
 * preview keeps its own paint and is see-through (`feedback.css`), so what lies under it stays
 * visible. A moved element keeps diagram-js's outline next to its faded original.
 */
export default class CreatePreviewLook {
  static $inject = ["eventBus"];

  constructor(eventBus: EventBus) {
    eventBus.on("create.move", AFTER_CREATE_PREVIEW, (event: CreateMoveEvent) => {
      const group = event.context?.dragGroup;
      if (!group) return;
      for (const dragger of group.querySelectorAll(`:scope > .${DRAGGER_CLASS}`)) {
        dragger.classList.replace(DRAGGER_CLASS, CREATE_PREVIEW_CLASS);
      }
    });
  }
}
