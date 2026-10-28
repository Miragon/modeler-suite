import type { ModuleDeclaration } from "didi";
import ConnectModule from "diagram-js/lib/features/connect";
import OverlaysModule from "diagram-js/lib/features/overlays";
import SelectionModule from "diagram-js/lib/features/selection";
import { cmReadOnlyModule } from "../read-only/index.js";
import { cmGestureCancelModule } from "../gesture-cancel/index.js";
import CmConnectHandles from "./CmConnectHandles.js";

/** Four outward connect arrows around a selected context (top/right/bottom/left). */
export const cmConnectHandlesModule: ModuleDeclaration = {
  __depends__: [
    ConnectModule,
    OverlaysModule,
    SelectionModule,
    cmReadOnlyModule,
    cmGestureCancelModule,
  ],
  __init__: ["cmConnectHandles"],
  cmConnectHandles: ["type", CmConnectHandles],
};

export { default as CmConnectHandles } from "./CmConnectHandles.js";
