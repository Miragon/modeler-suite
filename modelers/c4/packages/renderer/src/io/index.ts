import type { ModuleDeclaration } from "didi";
import ContentBounds from "./ContentBounds.js";
import Importer from "./Importer.js";

export const ioModule: ModuleDeclaration = {
  contentBounds: ["type", ContentBounds],
  importer: ["type", Importer],
};

export { default as ContentBounds } from "./ContentBounds.js";
export { saveSVG } from "./saveSvg.js";
export { ROOT_ID, type Bounds } from "./types.js";
export type { ImportConfig } from "./Importer.js";
