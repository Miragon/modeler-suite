import type { ModuleDeclaration } from "didi";
import C4Layouter from "../modeling/C4Layouter.js";
import Reconciler from "./Reconciler.js";

export const reconcileModule: ModuleDeclaration = {
  c4Layouter: ["type", C4Layouter],
  c4Reconciler: ["type", Reconciler],
};

export {
  default as Reconciler,
  boundaryCanvasId,
  relationshipCanvasId,
  type SceneLayers,
} from "./Reconciler.js";
