import type { ModuleDeclaration } from "didi";
import ConnectModule from "diagram-js/lib/features/connect";
import ContextPadModule from "diagram-js/lib/features/context-pad";
import "./contextPad.css";
import C4ContextPad from "./C4ContextPad.js";
import C4ContextPadProvider from "./C4ContextPadProvider.js";

export const contextPadModule: ModuleDeclaration = {
  __depends__: [ContextPadModule, ConnectModule],
  __init__: ["c4ContextPadProvider"],
  contextPad: ["type", C4ContextPad],
  c4ContextPadProvider: ["type", C4ContextPadProvider],
};

export { default as C4ContextPad } from "./C4ContextPad.js";
export { default as C4ContextPadProvider } from "./C4ContextPadProvider.js";
