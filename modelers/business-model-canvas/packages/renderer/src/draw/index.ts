import type { ModuleDeclaration } from "didi";
import StickyRenderer from "./StickyRenderer.js";
import StickyTooltip from "./StickyTooltip.js";

export const drawModule: ModuleDeclaration = {
  __init__: ["stickyRenderer", "stickyTooltip"],
  stickyRenderer: ["type", StickyRenderer],
  stickyTooltip: ["type", StickyTooltip],
};

export { COLORS, FONT } from "./styles.js";
