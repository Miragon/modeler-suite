import type { ModuleDeclaration } from "didi";
import ContextPadModule from "diagram-js/lib/features/context-pad";
import PopupMenuModule from "diagram-js/lib/features/popup-menu";
import ColorPopupProvider from "./ColorPopupProvider.js";
import ContextPadProvider from "./ContextPadProvider.js";
import HostLauncher from "./HostLauncher.js";

export const contextPadModule: ModuleDeclaration = {
  __depends__: [ContextPadModule, PopupMenuModule],
  __init__: ["bmcContextPadProvider", "colorPopupProvider"],
  bmcContextPadProvider: ["type", ContextPadProvider],
  colorPopupProvider: ["type", ColorPopupProvider],
  hostLauncher: ["type", HostLauncher],
};
