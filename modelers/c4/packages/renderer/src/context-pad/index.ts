import type { ModuleDeclaration } from "didi";
import ConnectModule from "diagram-js/lib/features/connect";
import ConnectionPreviewModule from "diagram-js/lib/features/connection-preview";
import ContextPadModule from "diagram-js/lib/features/context-pad";
import CreateModule from "diagram-js/lib/features/create";
import "./contextPad.css";
import C4Append from "./C4Append.js";
import C4ContextPad from "./C4ContextPad.js";
import C4ContextPadProvider from "./C4ContextPadProvider.js";
import PadKeyboard from "./PadKeyboard.js";

export const contextPadModule: ModuleDeclaration = {
  __depends__: [ContextPadModule, ConnectModule, ConnectionPreviewModule, CreateModule],
  __init__: ["c4ContextPadProvider", "c4Append", "c4PadKeyboard"],
  contextPad: ["type", C4ContextPad],
  c4ContextPadProvider: ["type", C4ContextPadProvider],
  c4Append: ["type", C4Append],
  c4PadKeyboard: ["type", PadKeyboard],
};

export { default as C4Append } from "./C4Append.js";
export { default as C4ContextPad } from "./C4ContextPad.js";
export { default as C4ContextPadProvider } from "./C4ContextPadProvider.js";
