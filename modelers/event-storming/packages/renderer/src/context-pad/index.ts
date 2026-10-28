import type { ModuleDeclaration } from "didi";
import { eventStormingVocabularyModule } from "../vocabulary/index.js";
import EventStormingContextPadProvider from "./EventStormingContextPadProvider.js";

/** Context actions per element. */
export const eventStormingContextPadModule: ModuleDeclaration = {
  __depends__: [eventStormingVocabularyModule],
  __init__: ["eventStormingContextPadProvider"],
  eventStormingContextPadProvider: ["type", EventStormingContextPadProvider],
};

export { default as EventStormingContextPadProvider } from "./EventStormingContextPadProvider.js";
