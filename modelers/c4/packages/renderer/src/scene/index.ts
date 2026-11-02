import type { ModuleDeclaration } from "didi";
import { schemaModelNotation } from "./notation.js";
import SceneService from "./SceneService.js";

export const sceneModule: ModuleDeclaration = {
  c4Notation: ["value", schemaModelNotation],
  c4Scene: ["type", SceneService],
};

export { default as SceneService } from "./SceneService.js";
export { buildSceneWith, DRAFT_AUTO_LAYOUT, TITLE_HEIGHT, unionOf } from "./build.js";
export { buildScene } from "./buildScene.js";
export { schemaModelNotation, type SceneNotation } from "./notation.js";
