import type { ModuleDeclaration } from "didi";
import { canvasFrameModule } from "../canvas-frame/index.js";
import ContentBounds from "./ContentBounds.js";
import DocumentRoot from "./DocumentRoot.js";
import Exporter from "./Exporter.js";
import Importer from "./Importer.js";

export const ioModule: ModuleDeclaration = {
  __depends__: [canvasFrameModule],
  __init__: ["documentRoot"],
  documentRoot: ["type", DocumentRoot],
  contentBounds: ["type", ContentBounds],
  importer: ["type", Importer],
  exporter: ["type", Exporter],
};

export { default as ContentBounds } from "./ContentBounds.js";
export { saveSVG } from "./saveSvg.js";
export { documentOf } from "./documentOf.js";
export { layoutOf } from "./layoutOf.js";
export { ROOT_ID, type Bounds, type RootBusinessObject } from "./types.js";
export type { ImportConfig } from "./Importer.js";
