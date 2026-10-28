import type { ModuleDeclaration } from "didi";
import OverlaysModule from "diagram-js/lib/features/overlays";
import SelectionModule from "diagram-js/lib/features/selection";
import { eventStormingModelingModule } from "../modeling/index.js";
import { eventStormingReadOnlyModule } from "../read-only/index.js";
import EventStormingSpellingVariants from "./EventStormingSpellingVariants.js";

/** The board's vocabulary on the canvas: spelling variants marked, and unified in one step. */
export const eventStormingVocabularyModule: ModuleDeclaration = {
  __depends__: [
    OverlaysModule,
    SelectionModule,
    eventStormingModelingModule,
    eventStormingReadOnlyModule,
  ],
  __init__: ["eventStormingSpellingVariants"],
  eventStormingSpellingVariants: ["type", EventStormingSpellingVariants],
};

export {
  default as EventStormingSpellingVariants,
  SPELLING_VARIANT_OVERLAY,
} from "./EventStormingSpellingVariants.js";
export { LabelSuggestionList } from "./LabelSuggestionList.js";
export { boardStickies, isPlaceholderLabel } from "./board-stickies.js";
