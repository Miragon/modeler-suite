import type { ModuleDeclaration } from "didi";
import ElementFactory from "./ElementFactory.js";
import StickyFactory from "./StickyFactory.js";

export const modelModule: ModuleDeclaration = {
  elementFactory: ["type", ElementFactory],
  stickyFactory: ["type", StickyFactory],
};

export { default as StickyFactory } from "./StickyFactory.js";
export { isStickyShape, type StickyShape } from "./di-types.js";
