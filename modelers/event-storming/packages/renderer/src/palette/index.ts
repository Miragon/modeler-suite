import type { ModuleDeclaration } from "didi";
import EventStormingPaletteProvider from "./EventStormingPaletteProvider.js";
import EventStormingPaletteToolbar from "./EventStormingPaletteToolbar.js";
import EventStormingPaletteTooltip from "./EventStormingPaletteTooltip.js";
import { eventStormingHoverTooltipTeardownModule } from "./EventStormingHoverTooltipTeardown.js";

/**
 * Tool palette (drag-to-create), and for a host without the modeler shell its toolbar keys and
 * semantics (`eventStormingPaletteToolbar`) and a tooltip below it. `paletteTooltip` overrides the
 * diagram-js service of that name; the shell's `shellModule`, loaded after this one, overrides it
 * again with its own.
 */
export const eventStormingPaletteModule: ModuleDeclaration = {
  __depends__: [eventStormingHoverTooltipTeardownModule],
  __init__: ["eventStormingPaletteProvider", "eventStormingPaletteToolbar", "paletteTooltip"],
  eventStormingPaletteProvider: ["type", EventStormingPaletteProvider],
  eventStormingPaletteToolbar: ["type", EventStormingPaletteToolbar],
  paletteTooltip: ["type", EventStormingPaletteTooltip],
};

export { default as EventStormingPaletteProvider } from "./EventStormingPaletteProvider.js";
export { default as EventStormingPaletteTooltip } from "./EventStormingPaletteTooltip.js";
