import type { ModuleDeclaration } from "didi";
import EventStormingDrawTool from "./EventStormingDrawTool.js";
import EventStormingDrawingHandles from "./EventStormingDrawingHandles.js";
import EventStormingDrawingHitProvider from "./EventStormingDrawingHitProvider.js";
import { eventStormingGestureModule } from "../gesture/index.js";

export const eventStormingDrawToolModule: ModuleDeclaration = {
  __depends__: [eventStormingGestureModule],
  __init__: [
    "eventStormingDrawTool",
    "eventStormingDrawingHandles",
    "eventStormingDrawingHitProvider",
  ],
  eventStormingDrawTool: ["type", EventStormingDrawTool],
  eventStormingDrawingHandles: ["type", EventStormingDrawingHandles],
  eventStormingDrawingHitProvider: ["type", EventStormingDrawingHitProvider],
};

export {
  default as EventStormingDrawTool,
  DRAW_TOOL_PALETTE_ENTRY,
} from "./EventStormingDrawTool.js";
export { default as EventStormingDrawingHandles } from "./EventStormingDrawingHandles.js";
export { default as EventStormingDrawingHitProvider } from "./EventStormingDrawingHitProvider.js";
